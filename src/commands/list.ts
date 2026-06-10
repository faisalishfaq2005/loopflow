import { listLoops, loadLoop, ConfigError, LOOPS_DIR } from "../config/loader.js";
import { log } from "../ui/log.js";

export function list(root: string): void {
  const names = listLoops(root);
  if (names.length === 0) {
    log.warn(`No loops found in ${LOOPS_DIR}/ — run "loopflow init" to create starter loops.`);
    return;
  }
  log.header(`Loops in ${LOOPS_DIR}/`);
  for (const name of names) {
    try {
      const loop = loadLoop(root, name);
      const gates = loop.steps.filter((s) => s.gate).length;
      log.info(
        `  ${name} — ${loop.steps.length} step(s), ${gates} gate(s), ` +
          `budget $${loop.budget.max_usd.toFixed(2)} × ${loop.budget.max_iterations} iteration(s)` +
          (loop.description ? `\n    ${loop.description}` : ""),
      );
    } catch (err) {
      if (err instanceof ConfigError) {
        log.error(`  ${name} — invalid (run "loopflow validate ${name}")`);
      } else {
        throw err;
      }
    }
  }
}
