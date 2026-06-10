import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LOOPFLOW_DIR, LOOPS_DIR } from "../config/loader.js";
import { log } from "../ui/log.js";

const TEMPLATES_DIR = fileURLToPath(new URL("../../templates", import.meta.url));

/** Scaffold `.loopflow/` with starter loops and a memory directory. */
export function init(root: string, options: { force?: boolean }): void {
  const loopsDir = path.join(root, LOOPS_DIR);
  fs.mkdirSync(loopsDir, { recursive: true });
  fs.mkdirSync(path.join(root, LOOPFLOW_DIR, "memory"), { recursive: true });

  const copied: string[] = [];
  const skipped: string[] = [];
  for (const template of fs.readdirSync(TEMPLATES_DIR)) {
    const target = path.join(loopsDir, template);
    if (fs.existsSync(target) && !options.force) {
      skipped.push(template);
      continue;
    }
    fs.copyFileSync(path.join(TEMPLATES_DIR, template), target);
    copied.push(template);
  }

  log.header("LoopFlow initialized");
  for (const file of copied) log.success(`  created ${path.join(LOOPS_DIR, file)}`);
  for (const file of skipped) log.dim(`  kept existing ${path.join(LOOPS_DIR, file)} (use --force to overwrite)`);
  log.info("");
  log.info("Next steps:");
  log.info("  1. Review the starter loops and adapt the prompts to your project.");
  log.info('  2. Add ".loopflow/worktrees/" to your .gitignore.');
  log.info("  3. Run one: loopflow run test-and-fix --dry-run");
}
