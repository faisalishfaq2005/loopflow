import { describe, expect, it } from "vitest";
import { composeStepPrompt, type PromptInput } from "../src/core/prompt.js";
import { GATE_INSTRUCTION } from "../src/core/verdict.js";

function input(overrides: Partial<PromptInput> = {}): PromptInput {
  return {
    loopName: "demo",
    step: { id: "work", prompt: "Do the work.", gate: false },
    iteration: 1,
    maxIterations: 3,
    memory: "",
    priorOutputs: [],
    ...overrides,
  };
}

describe("composeStepPrompt", () => {
  it("names the loop, step, and iteration", () => {
    const prompt = composeStepPrompt(input());
    expect(prompt).toContain('step "work"');
    expect(prompt).toContain('loop "demo"');
    expect(prompt).toContain("iteration 1 of 3");
    expect(prompt).toContain("Do the work.");
  });

  it("omits empty sections", () => {
    const prompt = composeStepPrompt(input());
    expect(prompt).not.toContain("<loop-memory>");
    expect(prompt).not.toContain("<reviewer-feedback>");
    expect(prompt).not.toContain(GATE_INSTRUCTION);
  });

  it("includes memory when present", () => {
    const prompt = composeStepPrompt(input({ memory: "## Run 1\nfixed the parser" }));
    expect(prompt).toContain("<loop-memory>");
    expect(prompt).toContain("fixed the parser");
  });

  it("includes prior step outputs in order", () => {
    const prompt = composeStepPrompt(
      input({
        priorOutputs: [
          { stepId: "fix", output: "changed foo.ts" },
          { stepId: "test", output: "all green" },
        ],
      }),
    );
    expect(prompt.indexOf("output-of-step-fix")).toBeLessThan(prompt.indexOf("output-of-step-test"));
    expect(prompt).toContain("changed foo.ts");
  });

  it("includes gate feedback on retry iterations", () => {
    const prompt = composeStepPrompt(input({ iteration: 2, gateFeedback: "you deleted a test" }));
    expect(prompt).toContain("<reviewer-feedback>");
    expect(prompt).toContain("you deleted a test");
  });

  it("appends the verdict protocol only to gate steps", () => {
    const prompt = composeStepPrompt(input({ step: { id: "check", prompt: "Verify.", gate: true } }));
    expect(prompt).toContain(GATE_INSTRUCTION);
  });

  it("truncates oversized sections, keeping the tail", () => {
    const memory = `${"x".repeat(20_000)}RECENT_MARKER`;
    const prompt = composeStepPrompt(input({ memory }));
    expect(prompt).toContain("RECENT_MARKER");
    expect(prompt).toContain("truncated");
    expect(prompt.length).toBeLessThan(15_000);
  });
});
