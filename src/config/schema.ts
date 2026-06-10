import { z } from "zod";

const KEBAB_CASE = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Permission modes accepted by `claude -p --permission-mode`.
 * `acceptEdits` is the recommended default for loops: file edits proceed
 * automatically while genuinely dangerous actions still require allowlisting.
 */
export const PERMISSION_MODES = [
  "default",
  "acceptEdits",
  "dontAsk",
  "plan",
  "bypassPermissions",
] as const;

const stepSchema = z.object({
  /** Unique identifier for the step, used in logs, memory, and prompt context. */
  id: z.string().regex(KEBAB_CASE, "step id must be kebab-case (a-z, 0-9, -)"),
  /** Persona appended to Claude's system prompt for this step. */
  role: z.string().optional(),
  /** The task given to Claude for this step. */
  prompt: z.string().min(1, "step prompt must not be empty"),
  /**
   * Gate steps verify the work of previous steps. A gate must end its output
   * with `VERDICT: PASS` or `VERDICT: FAIL`. On FAIL the loop starts a new
   * iteration with the gate's feedback injected into every step's context.
   */
  gate: z.boolean().default(false),
  /** Per-step model override (alias like "sonnet" or a full model name). */
  model: z.string().optional(),
  /** Per-step tool allowlist override, e.g. ["Bash(npm test:*)", "Edit"]. */
  allowed_tools: z.array(z.string()).optional(),
});

const defaultsSchema = z.object({
  model: z.string().optional(),
  permission_mode: z.enum(PERMISSION_MODES).default("acceptEdits"),
  allowed_tools: z.array(z.string()).optional(),
});

const budgetSchema = z.object({
  /** Hard cost ceiling (USD) for one full run of the loop, across all steps and iterations. */
  max_usd: z.number().positive().default(2),
  /** How many times the loop may re-run its steps after a gate FAIL. */
  max_iterations: z.number().int().min(1).max(20).default(3),
});

export const loopSchema = z
  .object({
    name: z.string().regex(KEBAB_CASE, "loop name must be kebab-case (a-z, 0-9, -)"),
    description: z.string().optional(),
    /** Path to the loop's memory file, relative to the project root. */
    memory: z.string().optional(),
    /** Run steps inside an isolated git worktree instead of the main checkout. */
    worktree: z.boolean().default(false),
    defaults: defaultsSchema.default({}),
    budget: budgetSchema.default({}),
    steps: z.array(stepSchema).min(1, "a loop needs at least one step"),
  })
  .superRefine((loop, ctx) => {
    const seen = new Set<string>();
    for (const step of loop.steps) {
      if (seen.has(step.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate step id "${step.id}"`,
          path: ["steps"],
        });
      }
      seen.add(step.id);
    }
  });

export type LoopConfig = z.infer<typeof loopSchema>;
export type StepConfig = z.infer<typeof stepSchema>;
export type PermissionMode = (typeof PERMISSION_MODES)[number];
