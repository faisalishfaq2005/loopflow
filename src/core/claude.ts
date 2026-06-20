import spawn from "cross-spawn";

export interface ClaudeInvocation {
  prompt: string;
  /** Appended to Claude Code's default system prompt (`--append-system-prompt`). */
  appendSystemPrompt?: string;
  model?: string;
  allowedTools?: string[];
  permissionMode?: string;
  /** Hard cost ceiling for this invocation (`--max-budget-usd`). */
  maxBudgetUsd?: number;
  /** Working directory for the run (a worktree when isolation is enabled). */
  cwd?: string;
  /** Called for each meaningful event as Claude streams its work. */
  onEvent?: (event: ClaudeStreamEvent) => void;
}

export type ClaudeStreamEvent =
  | { type: "text"; text: string }
  | { type: "tool_use"; tool: string; input: Record<string, unknown> }
  | { type: "tool_result"; output: string };

export interface ClaudeResult {
  ok: boolean;
  /** Claude's final text output. */
  output: string;
  costUsd: number;
  numTurns: number;
  /** Session id — resumable later via `claude --resume <id>` for auditing. */
  sessionId: string | undefined;
  durationMs: number;
  errorMessage?: string;
}

export type ClaudeInvoker = (inv: ClaudeInvocation) => Promise<ClaudeResult>;

/** Override the binary in tests or non-standard installs. */
const CLAUDE_BIN = process.env.LOOPFLOW_CLAUDE_BIN ?? "claude";

/**
 * Run Claude Code headless (`claude -p --output-format stream-json`).
 *
 * The prompt is delivered over stdin rather than argv: it routinely embeds
 * memory files and previous step outputs, which would exceed Windows' command
 * line limit and create quoting hazards.
 */
export async function runClaude(inv: ClaudeInvocation): Promise<ClaudeResult> {
  const args = ["-p", "--verbose", "--output-format", "stream-json"];
  if (inv.model) args.push("--model", inv.model);
  if (inv.permissionMode) args.push("--permission-mode", inv.permissionMode);
  if (inv.maxBudgetUsd !== undefined) {
    args.push("--max-budget-usd", inv.maxBudgetUsd.toFixed(2));
  }
  if (inv.appendSystemPrompt) args.push("--append-system-prompt", inv.appendSystemPrompt);
  if (inv.allowedTools?.length) args.push("--allowed-tools", inv.allowedTools.join(","));

  let resultEvent: RawResultEvent | undefined;

  const { exitCode, stderr } = await execute(CLAUDE_BIN, args, inv.prompt, inv.cwd, (line) => {
    const event = parseJsonLine(line);
    if (!event) return;

    if (event.type === "result") {
      resultEvent = event as RawResultEvent;
      return;
    }

    if (inv.onEvent) emitStreamEvents(event, inv.onEvent);
  });

  if (!resultEvent) {
    return {
      ok: false,
      output: "",
      costUsd: 0,
      numTurns: 0,
      sessionId: undefined,
      durationMs: 0,
      errorMessage:
        exitCode === 0
          ? "claude produced no result event"
          : `claude exited with code ${exitCode}: ${stderr.trim() || "no output"}`,
    };
  }

  const failed = exitCode !== 0 || resultEvent.is_error === true;
  return {
    ok: !failed,
    output: typeof resultEvent.result === "string" ? resultEvent.result : "",
    costUsd: typeof resultEvent.total_cost_usd === "number" ? resultEvent.total_cost_usd : 0,
    numTurns: typeof resultEvent.num_turns === "number" ? resultEvent.num_turns : 0,
    sessionId: typeof resultEvent.session_id === "string" ? resultEvent.session_id : undefined,
    durationMs: typeof resultEvent.duration_ms === "number" ? resultEvent.duration_ms : 0,
    ...(failed && {
      errorMessage: `claude reported an error${stderr.trim() ? `: ${stderr.trim()}` : ""}`,
    }),
  };
}

// ── stream event extraction ───────────────────────────────────────────────────

interface RawEvent {
  type: string;
  message?: { content?: RawBlock[] };
}

interface RawBlock {
  type: string;
  text?: string;
  name?: string;
  input?: unknown;
  content?: unknown;
}

interface RawResultEvent {
  type: string;
  result?: unknown;
  total_cost_usd?: unknown;
  num_turns?: unknown;
  session_id?: unknown;
  duration_ms?: unknown;
  is_error?: unknown;
}

function emitStreamEvents(raw: RawEvent, emit: (e: ClaudeStreamEvent) => void): void {
  if (raw.type === "assistant") {
    for (const block of raw.message?.content ?? []) {
      if (block.type === "text" && typeof block.text === "string" && block.text.trim()) {
        emit({ type: "text", text: block.text });
      } else if (block.type === "tool_use" && typeof block.name === "string") {
        emit({
          type: "tool_use",
          tool: block.name,
          input: (block.input as Record<string, unknown>) ?? {},
        });
      }
    }
  } else if (raw.type === "user") {
    for (const block of raw.message?.content ?? []) {
      if (block.type === "tool_result") {
        const output = flattenContent(block.content);
        if (output) emit({ type: "tool_result", output });
      }
    }
  }
}

function flattenContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((b) =>
        typeof b === "object" && b !== null && "text" in b ? String((b as { text: unknown }).text) : "",
      )
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function parseJsonLine(line: string): (RawEvent & { type: string }) | undefined {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{")) return undefined;
  try {
    return JSON.parse(trimmed) as RawEvent & { type: string };
  } catch {
    return undefined;
  }
}

// ── subprocess ────────────────────────────────────────────────────────────────

function execute(
  bin: string,
  args: string[],
  stdin: string,
  cwd: string | undefined,
  onLine: (line: string) => void,
): Promise<{ exitCode: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd, stdio: ["pipe", "pipe", "pipe"] });
    let buffer = "";
    let stderr = "";

    child.stdout?.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim()) onLine(line);
      }
    });

    child.stderr?.on("data", (chunk: Buffer) => (stderr += chunk.toString()));

    child.on("error", (err) =>
      reject(new Error(`failed to start "${bin}" — is Claude Code installed? (${err.message})`)),
    );

    child.on("close", (code) => {
      if (buffer.trim()) onLine(buffer);
      resolve({ exitCode: code ?? 1, stderr });
    });

    child.stdin?.end(stdin);
  });
}
