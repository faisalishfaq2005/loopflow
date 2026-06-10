import { describe, expect, it } from "vitest";
import { loopSchema } from "../src/config/schema.js";

const minimal = {
  name: "my-loop",
  steps: [{ id: "only", prompt: "do the thing" }],
};

describe("loopSchema", () => {
  it("accepts a minimal loop and applies defaults", () => {
    const loop = loopSchema.parse(minimal);
    expect(loop.budget.max_usd).toBe(2);
    expect(loop.budget.max_iterations).toBe(3);
    expect(loop.defaults.permission_mode).toBe("acceptEdits");
    expect(loop.worktree).toBe(false);
    expect(loop.steps[0]?.gate).toBe(false);
  });

  it("rejects non-kebab-case loop names", () => {
    expect(loopSchema.safeParse({ ...minimal, name: "My Loop" }).success).toBe(false);
  });

  it("rejects duplicate step ids", () => {
    const result = loopSchema.safeParse({
      ...minimal,
      steps: [
        { id: "a", prompt: "x" },
        { id: "a", prompt: "y" },
      ],
    });
    expect(result.success).toBe(false);
    expect(result.success ? "" : result.error.issues[0]?.message).toContain("duplicate step id");
  });

  it("rejects a loop with no steps", () => {
    expect(loopSchema.safeParse({ ...minimal, steps: [] }).success).toBe(false);
  });

  it("rejects unknown permission modes", () => {
    const result = loopSchema.safeParse({
      ...minimal,
      defaults: { permission_mode: "yolo" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-positive budget", () => {
    expect(loopSchema.safeParse({ ...minimal, budget: { max_usd: 0 } }).success).toBe(false);
  });
});
