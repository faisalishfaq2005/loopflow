import { listLoops, loadLoop, ConfigError, LOOPS_DIR } from "../config/loader.js";
import { log } from "../ui/log.js";

/** Validate one loop, or every loop when no name is given. Returns process exit code. */
export function validate(root: string, name?: string): number {
  const names = name ? [name] : listLoops(root);
  if (names.length === 0) {
    log.warn(`No loops found in ${LOOPS_DIR}/ — run "loopflow init" to create starter loops.`);
    return 0;
  }

  let failures = 0;
  for (const loopName of names) {
    try {
      loadLoop(root, loopName);
      log.success(`  ✓ ${loopName}`);
    } catch (err) {
      if (!(err instanceof ConfigError)) throw err;
      failures++;
      log.error(`  ✗ ${loopName}`);
      log.error(indent(err.message));
    }
  }
  return failures === 0 ? 0 : 2;
}

function indent(text: string): string {
  return text
    .split("\n")
    .map((line) => `    ${line}`)
    .join("\n");
}
