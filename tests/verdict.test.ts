import { describe, expect, it } from "vitest";
import { parseVerdict } from "../src/core/verdict.js";

describe("parseVerdict", () => {
  it("parses an explicit PASS", () => {
    const verdict = parseVerdict("Everything checks out.\nVERDICT: PASS");
    expect(verdict).toEqual({ pass: true, feedback: "Everything checks out.", explicit: true });
  });

  it("parses an explicit FAIL and keeps the feedback", () => {
    const verdict = parseVerdict("The tests were deleted, not fixed.\nVERDICT: FAIL");
    expect(verdict.pass).toBe(false);
    expect(verdict.feedback).toBe("The tests were deleted, not fixed.");
    expect(verdict.explicit).toBe(true);
  });

  it("treats a missing verdict as a non-explicit FAIL", () => {
    const verdict = parseVerdict("I reviewed the code and it seems fine.");
    expect(verdict.pass).toBe(false);
    expect(verdict.explicit).toBe(false);
  });

  it("uses the last verdict line when the gate quotes the instructions", () => {
    const output = [
      'I was told to end with "VERDICT: PASS" or fail.',
      "VERDICT: FAIL — the gate instruction was quoted above",
      "After re-checking, the fix is genuine.",
      "VERDICT: PASS",
    ].join("\n");
    expect(parseVerdict(output).pass).toBe(true);
  });

  it("matches the verdict case-insensitively with trailing commentary", () => {
    expect(parseVerdict("verdict: pass — looks good").pass).toBe(true);
    expect(parseVerdict("Verdict: FAIL because of X").pass).toBe(false);
  });
});
