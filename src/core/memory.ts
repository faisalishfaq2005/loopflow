import fs from "node:fs";
import path from "node:path";
import { LOOPFLOW_DIR } from "../config/loader.js";

/**
 * Memory is a plain Markdown file: human-readable, diffable, and committable.
 * The agent forgets between runs — the repo doesn't.
 */

export interface RunRecord {
  loopName: string;
  timestamp: string;
  outcome: string;
  iterationsUsed: number;
  costUsd: number;
  /** One line per step, e.g. "fix ✓". */
  stepSummaries: string[];
  /** Closing output of the run (final step or failing gate), persisted for the next run. */
  notes: string;
}

/** Only the most recent history is injected into prompts. */
const MAX_MEMORY_CHARS = 12_000;
const MAX_NOTES_CHARS = 2_000;

export function defaultMemoryPath(loopName: string): string {
  return path.join(LOOPFLOW_DIR, "memory", `${loopName}.md`);
}

/** Read the tail of a memory file; empty string when it doesn't exist yet. */
export function readMemory(file: string): string {
  if (!fs.existsSync(file)) return "";
  const content = fs.readFileSync(file, "utf8");
  if (content.length <= MAX_MEMORY_CHARS) return content;
  return content.slice(-MAX_MEMORY_CHARS);
}

export function appendRunRecord(file: string, record: RunRecord): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, `# Loop memory: ${record.loopName}\n`, "utf8");
  }
  fs.appendFileSync(file, formatRecord(record), "utf8");
}

function formatRecord(record: RunRecord): string {
  const notes = record.notes.trim();
  const clipped =
    notes.length > MAX_NOTES_CHARS ? `${notes.slice(0, MAX_NOTES_CHARS)}\n[…truncated]` : notes;
  return [
    "",
    `## Run ${record.timestamp}`,
    `- Outcome: ${record.outcome} (iterations used: ${record.iterationsUsed})`,
    `- Cost: $${record.costUsd.toFixed(2)}`,
    `- Steps: ${record.stepSummaries.join(", ")}`,
    ...(clipped ? ["", "### Notes", clipped] : []),
    "",
  ].join("\n");
}
