import type { StepConfig } from "../config/schema.js";
import { GATE_INSTRUCTION } from "./verdict.js";

/** Output of an earlier step in the current iteration, given to later steps as context. */
export interface PriorOutput {
  stepId: string;
  output: string;
}

export interface PromptInput {
  loopName: string;
  step: StepConfig;
  iteration: number;
  maxIterations: number;
  /** Contents of the loop's memory file (may be empty on first run). */
  memory: string;
  priorOutputs: PriorOutput[];
  /** Feedback from the gate that failed the previous iteration, if any. */
  gateFeedback?: string;
}

/** Caps each context section so a chatty step can't blow up later prompts. */
const MAX_SECTION_CHARS = 12_000;

/**
 * Compose the full prompt for one step. Pure function — all loop state
 * arrives as input, which keeps prompt assembly directly testable.
 */
export function composeStepPrompt(input: PromptInput): string {
  const { loopName, step, iteration, maxIterations } = input;
  const parts: string[] = [
    `You are executing step "${step.id}" of the automated loop "${loopName}"` +
      ` (iteration ${iteration} of ${maxIterations}). Work autonomously; no human` +
      ` is available to answer questions.`,
  ];

  if (input.memory.trim()) {
    parts.push(section("loop-memory", truncate(input.memory.trim()), "Notes persisted from previous runs of this loop:"));
  }

  for (const prior of input.priorOutputs) {
    parts.push(
      section(
        `output-of-step-${prior.stepId}`,
        truncate(prior.output.trim()),
        `Output of the earlier step "${prior.stepId}" in this iteration:`,
      ),
    );
  }

  if (input.gateFeedback?.trim()) {
    parts.push(
      section(
        "reviewer-feedback",
        truncate(input.gateFeedback.trim()),
        "The previous iteration was rejected by the verification gate. Address this feedback:",
      ),
    );
  }

  parts.push(`# Your task\n\n${step.prompt.trim()}`);

  if (step.gate) {
    parts.push(GATE_INSTRUCTION);
  }

  return parts.join("\n\n");
}

function section(tag: string, body: string, intro: string): string {
  return `${intro}\n<${tag}>\n${body}\n</${tag}>`;
}

function truncate(text: string): string {
  if (text.length <= MAX_SECTION_CHARS) return text;
  return `[…truncated, showing the most recent ${MAX_SECTION_CHARS} characters]\n${text.slice(-MAX_SECTION_CHARS)}`;
}
