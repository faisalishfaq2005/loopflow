export interface Verdict {
  pass: boolean;
  /** Everything the gate wrote before its verdict line — fed back into the next iteration on FAIL. */
  feedback: string;
  /** False when the gate never emitted a verdict line (treated as FAIL). */
  explicit: boolean;
}

const VERDICT_LINE = /^\s*VERDICT:\s*(PASS|FAIL)\b.*$/gim;

/** Instruction appended to every gate step's prompt. */
export const GATE_INSTRUCTION = [
  "You are acting as a verification gate.",
  "After your review, end your response with exactly one line:",
  "VERDICT: PASS — if the work meets the requirements, or",
  "VERDICT: FAIL — if it does not.",
  "If you fail the work, everything you write before the verdict line will be",
  "handed back as feedback for the next attempt, so be specific about what to fix.",
].join("\n");

/**
 * Extract the gate's decision from its output. The last verdict line wins,
 * so a gate quoting the instructions earlier in its response is harmless.
 * A missing verdict is treated as FAIL: an unverified pass is not a pass.
 */
export function parseVerdict(output: string): Verdict {
  const matches = [...output.matchAll(VERDICT_LINE)];
  const last = matches.at(-1);
  if (!last) {
    return { pass: false, feedback: output.trim(), explicit: false };
  }
  const feedback = output.slice(0, last.index).trim();
  return { pass: last[1]?.toUpperCase() === "PASS", feedback, explicit: true };
}
