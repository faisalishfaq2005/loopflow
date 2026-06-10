import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loopSchema, type LoopConfig } from "../src/config/schema.js";
import type { ClaudeInvocation, ClaudeResult } from "../src/core/claude.js";
import { runLoop } from "../src/core/runner.js";

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "loopflow-runner-"));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function loop(overrides: Record<string, unknown> = {}): LoopConfig {
  return loopSchema.parse({
    name: "demo",
    steps: [
      { id: "fix", prompt: "Fix it." },
      { id: "review", prompt: "Review it.", gate: true },
    ],
    ...overrides,
  });
}

/** Returns canned results in order, recording every invocation. */
function fakeInvoker(outputs: Array<Partial<ClaudeResult>>) {
  const calls: ClaudeInvocation[] = [];
  let i = 0;
  const invoke = async (inv: ClaudeInvocation): Promise<ClaudeResult> => {
    calls.push(inv);
    const next = outputs[Math.min(i++, outputs.length - 1)] ?? {};
    return {
      ok: true,
      output: "",
      costUsd: 0.1,
      numTurns: 1,
      sessionId: `s${i}`,
      durationMs: 1,
      ...next,
    };
  };
  return { invoke, calls };
}

describe("runLoop", () => {
  it("succeeds in one iteration when the gate passes", async () => {
    const { invoke, calls } = fakeInvoker([
      { output: "fixed the bug" },
      { output: "verified\nVERDICT: PASS" },
    ]);
    const result = await runLoop(loop(), { root, invoke });

    expect(result.outcome).toBe("success");
    expect(result.iterationsUsed).toBe(1);
    expect(result.steps).toHaveLength(2);
    expect(calls).toHaveLength(2);
    // The reviewer sees the fixer's output.
    expect(calls[1]?.prompt).toContain("fixed the bug");
  });

  it("retries with gate feedback and succeeds on the second iteration", async () => {
    const { invoke, calls } = fakeInvoker([
      { output: "attempt one" },
      { output: "you only masked the symptom\nVERDICT: FAIL" },
      { output: "attempt two, root cause fixed" },
      { output: "confirmed\nVERDICT: PASS" },
    ]);
    const result = await runLoop(loop(), { root, invoke });

    expect(result.outcome).toBe("success");
    expect(result.iterationsUsed).toBe(2);
    // Iteration 2's fixer receives the gate's feedback.
    expect(calls[2]?.prompt).toContain("you only masked the symptom");
    expect(calls[2]?.prompt).toContain("<reviewer-feedback>");
  });

  it("stops with gate-exhausted when the gate never passes", async () => {
    const { invoke } = fakeInvoker([{ output: "VERDICT: FAIL" }]);
    const result = await runLoop(loop({ budget: { max_iterations: 2 } }), { root, invoke });

    expect(result.outcome).toBe("gate-exhausted");
    expect(result.iterationsUsed).toBe(2);
  });

  it("treats a gate without an explicit verdict as a failure", async () => {
    const { invoke, calls } = fakeInvoker([
      { output: "work" },
      { output: "looks plausible to me" }, // no VERDICT line
      { output: "work again" },
      { output: "VERDICT: PASS" },
    ]);
    const result = await runLoop(loop(), { root, invoke });

    expect(result.outcome).toBe("success");
    expect(calls[2]?.prompt).toContain("did not emit an explicit verdict");
  });

  it("aborts when the budget is exhausted", async () => {
    const { invoke } = fakeInvoker([
      { output: "expensive work", costUsd: 5 },
      { output: "VERDICT: FAIL" },
    ]);
    const result = await runLoop(loop({ budget: { max_usd: 1 } }), { root, invoke });

    expect(result.outcome).toBe("budget-exceeded");
    expect(result.costUsd).toBeGreaterThanOrEqual(1);
  });

  it("passes the remaining budget down to each invocation", async () => {
    const { invoke, calls } = fakeInvoker([
      { output: "step one", costUsd: 0.75 },
      { output: "VERDICT: PASS", costUsd: 0.1 },
    ]);
    await runLoop(loop({ budget: { max_usd: 2 } }), { root, invoke });

    expect(calls[0]?.maxBudgetUsd).toBe(2);
    expect(calls[1]?.maxBudgetUsd).toBeCloseTo(1.25);
  });

  it("stops with an error when a step fails", async () => {
    const { invoke } = fakeInvoker([{ ok: false, errorMessage: "claude crashed" }]);
    const result = await runLoop(loop(), { root, invoke });

    expect(result.outcome).toBe("error");
    expect(result.errorMessage).toContain("claude crashed");
  });

  it("appends a run record to the memory file", async () => {
    const { invoke } = fakeInvoker([{ output: "done" }, { output: "VERDICT: PASS" }]);
    await runLoop(loop(), { root, invoke });

    const memoryFile = path.join(root, ".loopflow", "memory", "demo.md");
    const content = fs.readFileSync(memoryFile, "utf8");
    expect(content).toContain("# Loop memory: demo");
    expect(content).toContain("Outcome: success");
  });

  it("feeds previous runs' memory into the next run's prompts", async () => {
    const first = fakeInvoker([{ output: "learned something important" }, { output: "VERDICT: PASS" }]);
    await runLoop(loop(), { root, invoke: first.invoke });

    const second = fakeInvoker([{ output: "again" }, { output: "VERDICT: PASS" }]);
    await runLoop(loop(), { root, invoke: second.invoke });

    expect(second.calls[0]?.prompt).toContain("<loop-memory>");
    expect(second.calls[0]?.prompt).toContain("learned something important");
  });

  it("does not invoke Claude or write memory on a dry run", async () => {
    const { invoke, calls } = fakeInvoker([]);
    const prompts: string[] = [];
    const result = await runLoop(loop(), {
      root,
      invoke,
      dryRun: true,
      events: { onDryRunPrompt: (_id, prompt) => prompts.push(prompt) },
    });

    expect(calls).toHaveLength(0);
    expect(prompts).toHaveLength(2);
    expect(result.costUsd).toBe(0);
    expect(fs.existsSync(path.join(root, ".loopflow", "memory", "demo.md"))).toBe(false);
  });

  it("errors cleanly when worktree is requested outside a git repo", async () => {
    const { invoke } = fakeInvoker([]);
    const result = await runLoop(loop({ worktree: true }), { root, invoke });

    expect(result.outcome).toBe("error");
    expect(result.errorMessage).toContain("not a git repository");
  });
});
