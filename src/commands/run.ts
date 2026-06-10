import path from "node:path";
import pc from "picocolors";
import { loadLoop } from "../config/loader.js";
import type { StepConfig } from "../config/schema.js";
import type { ClaudeStreamEvent } from "../core/claude.js";
import { runLoop, type RunnerEvents, type RunResult, type StepRun } from "../core/runner.js";
import { log } from "../ui/log.js";

export interface RunCommandOptions {
  dryRun?: boolean;
  iterations?: number;
  budget?: number;
  verbose?: boolean;
}

/** Run a loop and report progress. Returns process exit code. */
export async function run(root: string, name: string, options: RunCommandOptions): Promise<number> {
  const loop = loadLoop(root, name);
  log.header(`Running loop "${loop.name}"${options.dryRun ? " (dry run)" : ""}`);
  if (loop.description) log.dim(loop.description);

  const result = await runLoop(loop, {
    root,
    dryRun: options.dryRun,
    maxIterationsOverride: options.iterations,
    budgetUsdOverride: options.budget,
    events: reporter(options),
  });

  return report(result);
}

function reporter(options: RunCommandOptions): RunnerEvents {
  let lastTool = "";
  let currentIteration = 0;

  return {
    onIterationStart(iteration, maxIterations) {
      currentIteration = iteration;
      if (iteration > 1 || maxIterations > 1) {
        const bar = pc.bold(pc.cyan("━".repeat(44)));
        console.log(`\n${bar}`);
        console.log(pc.bold(pc.cyan(`  Iteration ${iteration} / ${maxIterations}`)));
        console.log(bar);
      }
    },

    onStepStart(step: StepConfig) {
      lastTool = "";
      const gateTag = step.gate ? ` ${pc.dim("← gate")}` : "";
      console.log(`\n  ${pc.bold(`▸ ${step.id}`)}${shortPersona(step.role)}${gateTag}`);
    },

    onClaudeEvent(_stepId: string, event: ClaudeStreamEvent) {
      switch (event.type) {
        case "text": {
          for (const line of event.text.split("\n")) {
            if (!line.trim()) continue;
            if (/^\s*VERDICT:\s*PASS\b/i.test(line)) {
              console.log(`  ${pc.dim("│")} ${pc.bold(pc.green(line.trim()))}`);
            } else if (/^\s*VERDICT:\s*FAIL\b/i.test(line)) {
              console.log(`  ${pc.dim("│")} ${pc.bold(pc.red(line.trim()))}`);
            } else {
              console.log(`  ${pc.dim("│")} ${pc.dim(line)}`);
            }
          }
          break;
        }
        case "tool_use": {
          lastTool = event.tool;
          if (event.tool === "Bash") {
            const cmd =
              typeof event.input["command"] === "string"
                ? (event.input["command"] as string).split("\n")[0]
                : "";
            if (cmd) {
              console.log(pc.dim("  │"));
              console.log(`  ${pc.dim("│")} ${pc.cyan("$")} ${pc.bold(cmd)}`);
            }
          } else if (event.tool === "Write" || event.tool === "Edit") {
            const filePath =
              typeof event.input["file_path"] === "string"
                ? (event.input["file_path"] as string)
                : "";
            if (filePath) {
              console.log(`  ${pc.dim("│")}   ${pc.yellow("edit:")} ${path.basename(filePath)}`);
            }
          }
          break;
        }
        case "tool_result": {
          if (lastTool !== "Bash") break;
          const lines = event.output.trimEnd().split("\n");
          const limit = options.verbose ? lines.length : 50;
          const half = Math.floor(limit / 2);
          const display =
            lines.length > limit
              ? [
                  ...lines.slice(0, half),
                  pc.dim(`  … ${lines.length - limit} lines omitted …`),
                  ...lines.slice(-half),
                ]
              : lines;
          for (const line of display) {
            console.log(`  ${pc.dim("│")} ${pc.dim(line)}`);
          }
          console.log(pc.dim("  │"));
          break;
        }
      }
    },

    onStepFinish(run: StepRun) {
      const passed = run.ok && run.gatePassed !== false;
      const icon = passed ? pc.green("✓") : pc.red("✗");
      const status = run.ok
        ? run.gatePassed === false
          ? pc.red("gate FAIL")
          : pc.green("done")
        : pc.red("ERROR");
      const resume = run.sessionId ? pc.dim(` · resume: claude --resume ${run.sessionId}`) : "";
      console.log(`  ${icon} ${status} · ${pc.dim(`$${run.costUsd.toFixed(2)}`)}${resume}`);
    },

    onGateFail(_stepId: string, feedback: string) {
      if (!feedback.trim()) return;
      console.log(
        `\n  ${pc.bold(pc.yellow(`↩ Gate feedback — injected into iteration ${currentIteration + 1}:`))}`,
      );
      for (const line of feedback.trim().split("\n")) {
        console.log(`  ${pc.dim("│")} ${pc.yellow(line)}`);
      }
    },

    onDryRunPrompt(stepId: string, prompt: string) {
      log.header(`Prompt for step "${stepId}"`);
      log.info(prompt);
    },
  };
}

function report(result: RunResult): number {
  console.log("");
  if (result.worktreeKept) {
    log.info(`Worktree kept for review: ${result.worktreeKept.path}`);
    log.info(`  branch: ${result.worktreeKept.branch}`);
  }
  const summary = `${result.outcome} · ${result.iterationsUsed} iteration(s) · $${result.costUsd.toFixed(2)}`;
  switch (result.outcome) {
    case "success":
      log.success(`✓ ${summary}`);
      return 0;
    case "gate-exhausted":
      log.warn(`✗ ${summary} — gate never passed; see the loop's memory file for the last feedback`);
      return 1;
    case "budget-exceeded":
      log.warn(`✗ ${summary} — ${result.errorMessage ?? "budget exceeded"}`);
      return 1;
    case "error":
      log.error(`✗ ${summary} — ${result.errorMessage ?? "unknown error"}`);
      return 1;
  }
}

function shortPersona(role: string | undefined): string {
  if (!role?.trim()) return "";
  const first = role.trim().split(/[.!?\n]/)[0] ?? "";
  const clean = first.replace(/^You are (a |an |the )?/i, "").trim();
  return clean ? ` ${pc.dim(`[${clean.slice(0, 55)}]`)}` : "";
}
