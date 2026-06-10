/**
 * LoopFlow public API — use loops programmatically instead of via the CLI.
 */
export { loopSchema, type LoopConfig, type StepConfig } from "./config/schema.js";
export { listLoops, loadLoop, ConfigError } from "./config/loader.js";
export { runLoop, type RunResult, type RunOptions, type RunnerEvents } from "./core/runner.js";
export { runClaude, type ClaudeInvocation, type ClaudeResult, type ClaudeInvoker, type ClaudeStreamEvent } from "./core/claude.js";
export { composeStepPrompt, type PromptInput } from "./core/prompt.js";
export { parseVerdict, GATE_INSTRUCTION, type Verdict } from "./core/verdict.js";
