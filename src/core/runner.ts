import path from "node:path";
import type { LoopConfig, StepConfig } from "../config/schema.js";
import { BudgetTracker } from "./budget.js";
import { runClaude, type ClaudeInvoker, type ClaudeStreamEvent } from "./claude.js";
import { appendRunRecord, defaultMemoryPath, readMemory } from "./memory.js";
import { composeStepPrompt, type PriorOutput } from "./prompt.js";
import { parseVerdict } from "./verdict.js";
import { createWorktree, isGitRepo, removeWorktreeIfClean, type Worktree } from "./worktree.js";

export type RunOutcome = "success" | "gate-exhausted" | "budget-exceeded" | "error";

export interface StepRun {
  stepId: string;
  iteration: number;
  ok: boolean;
  gatePassed?: boolean;
  costUsd: number;
  sessionId: string | undefined;
  durationMs?: number;
}

export interface RunResult {
  outcome: RunOutcome;
  iterationsUsed: number;
  costUsd: number;
  steps: StepRun[];
  /** Set when the loop ran in a worktree that was kept for human review. */
  worktreeKept?: Worktree;
  errorMessage?: string;
}

export interface RunOptions {
  /** Project root (where `.loopflow/` lives). */
  root: string;
  /** Print composed prompts instead of invoking Claude. */
  dryRun?: boolean;
  maxIterationsOverride?: number;
  budgetUsdOverride?: number;
  /** Injection point for tests; defaults to the real headless adapter. */
  invoke?: ClaudeInvoker;
  /** Observer for progress reporting; the runner itself never writes to stdout. */
  events?: RunnerEvents;
}

export interface RunnerEvents {
  onIterationStart?(iteration: number, maxIterations: number): void;
  onStepStart?(step: StepConfig, iteration: number): void;
  onStepFinish?(run: StepRun, output: string): void;
  onGateFail?(stepId: string, feedback: string): void;
  onDryRunPrompt?(stepId: string, prompt: string): void;
  onClaudeEvent?(stepId: string, event: ClaudeStreamEvent): void;
}

/** Execute one full run of a loop: iterate steps until every gate passes. */
export async function runLoop(loop: LoopConfig, options: RunOptions): Promise<RunResult> {
  const invoke = options.invoke ?? runClaude;
  const events = options.events ?? {};
  const maxIterations = options.maxIterationsOverride ?? loop.budget.max_iterations;
  const budget = new BudgetTracker(options.budgetUsdOverride ?? loop.budget.max_usd);

  // Memory lives at the project root so it persists across worktrees.
  const memoryFile = path.resolve(options.root, loop.memory ?? defaultMemoryPath(loop.name));
  const memory = readMemory(memoryFile);

  let worktree: Worktree | undefined;
  if (loop.worktree && !options.dryRun) {
    if (!isGitRepo(options.root)) {
      return failure("error", `loop "${loop.name}" sets worktree: true but ${options.root} is not a git repository`);
    }
    worktree = createWorktree(options.root, loop.name);
  }
  const cwd = worktree?.path ?? options.root;

  const steps: StepRun[] = [];
  let outcome: RunOutcome = "gate-exhausted";
  let errorMessage: string | undefined;
  let gateFeedback: string | undefined;
  // What the next run should know: the last work step's summary on success,
  // the gate's feedback on failure — never a bare "VERDICT: PASS".
  let memoryNotes = "";
  let iterationsUsed = 0;

  iterations: for (let iteration = 1; iteration <= maxIterations; iteration++) {
    iterationsUsed = iteration;
    events.onIterationStart?.(iteration, maxIterations);
    const priorOutputs: PriorOutput[] = [];
    let gateFailed = false;

    for (const step of loop.steps) {
      const prompt = composeStepPrompt({
        loopName: loop.name,
        step,
        iteration,
        maxIterations,
        memory,
        priorOutputs,
        gateFeedback,
      });

      if (options.dryRun) {
        events.onDryRunPrompt?.(step.id, prompt);
        priorOutputs.push({ stepId: step.id, output: `[dry-run placeholder for "${step.id}"]` });
        continue;
      }

      if (budget.exhausted) {
        outcome = "budget-exceeded";
        errorMessage = `budget of $${budget.maxUsd.toFixed(2)} exhausted before step "${step.id}"`;
        break iterations;
      }

      events.onStepStart?.(step, iteration);
      const { onClaudeEvent } = events;
      const result = await invoke({
        prompt,
        appendSystemPrompt: step.role,
        model: step.model ?? loop.defaults.model,
        allowedTools: step.allowed_tools ?? loop.defaults.allowed_tools,
        permissionMode: loop.defaults.permission_mode,
        maxBudgetUsd: budget.remainingUsd,
        cwd,
        onEvent: onClaudeEvent ? (e) => onClaudeEvent(step.id, e) : undefined,
      });
      budget.add(result.costUsd);

      const stepRun: StepRun = {
        stepId: step.id,
        iteration,
        ok: result.ok,
        costUsd: result.costUsd,
        sessionId: result.sessionId,
        durationMs: result.durationMs,
      };

      if (!result.ok) {
        steps.push(stepRun);
        events.onStepFinish?.(stepRun, result.output);
        outcome = "error";
        errorMessage = `step "${step.id}" failed: ${result.errorMessage ?? "unknown error"}`;
        memoryNotes = errorMessage;
        break iterations;
      }

      if (step.gate) {
        const verdict = parseVerdict(result.output);
        stepRun.gatePassed = verdict.pass;
        if (!verdict.pass) {
          gateFeedback = verdict.explicit
            ? verdict.feedback
            : `${verdict.feedback}\n\n(The gate did not emit an explicit verdict; treating as FAIL.)`;
          gateFailed = true;
        }
      } else {
        memoryNotes = result.output;
      }

      steps.push(stepRun);
      events.onStepFinish?.(stepRun, result.output);
      priorOutputs.push({ stepId: step.id, output: result.output });

      if (gateFailed) {
        events.onGateFail?.(step.id, gateFeedback ?? "");
        memoryNotes = gateFeedback ?? memoryNotes;
        break; // start the next iteration with the gate's feedback
      }
    }

    if (!gateFailed) {
      outcome = "success";
      break;
    }
  }

  if (!options.dryRun) {
    appendRunRecord(memoryFile, {
      loopName: loop.name,
      timestamp: new Date().toISOString(),
      outcome,
      iterationsUsed,
      costUsd: budget.spentUsd,
      stepSummaries: steps.map((s) => `${s.stepId} ${stepMark(s)}`),
      notes: memoryNotes,
    });
  }

  let worktreeKept: Worktree | undefined;
  if (worktree && !removeWorktreeIfClean(options.root, worktree)) {
    worktreeKept = worktree;
  }

  return {
    outcome,
    iterationsUsed,
    costUsd: budget.spentUsd,
    steps,
    ...(worktreeKept && { worktreeKept }),
    ...(errorMessage && { errorMessage }),
  };

  function failure(kind: RunOutcome, message: string): RunResult {
    return { outcome: kind, iterationsUsed: 0, costUsd: 0, steps: [], errorMessage: message };
  }
}

function stepMark(run: StepRun): string {
  if (!run.ok) return "✗ (error)";
  if (run.gatePassed === false) return "✗ (gate failed)";
  return "✓";
}
