import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { loopSchema, type LoopConfig } from "./schema.js";

export const LOOPFLOW_DIR = ".loopflow";
export const LOOPS_DIR = path.join(LOOPFLOW_DIR, "loops");

/** Raised for any user-fixable configuration problem. */
export class ConfigError extends Error {}

/** Names of all loops defined under `.loopflow/loops/`, sorted alphabetically. */
export function listLoops(root: string): string[] {
  const dir = path.join(root, LOOPS_DIR);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    .map((f) => f.replace(/\.ya?ml$/, ""))
    .sort();
}

/** Load and validate a loop definition by name. */
export function loadLoop(root: string, name: string): LoopConfig {
  const file = resolveLoopFile(root, name);
  let raw: unknown;
  try {
    raw = parseYaml(fs.readFileSync(file, "utf8"));
  } catch (err) {
    throw new ConfigError(`${file} is not valid YAML: ${(err as Error).message}`);
  }

  const result = loopSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new ConfigError(`${file} failed validation:\n${issues}`);
  }
  if (result.data.name !== name) {
    throw new ConfigError(
      `${file}: loop name "${result.data.name}" must match its file name "${name}"`,
    );
  }
  return result.data;
}

function resolveLoopFile(root: string, name: string): string {
  for (const ext of [".yaml", ".yml"]) {
    const candidate = path.join(root, LOOPS_DIR, `${name}${ext}`);
    if (fs.existsSync(candidate)) return candidate;
  }
  const available = listLoops(root);
  const hint = available.length
    ? `Available loops: ${available.join(", ")}`
    : `No loops found — run "loopflow init" to create starter loops.`;
  throw new ConfigError(`Loop "${name}" not found in ${LOOPS_DIR}/. ${hint}`);
}
