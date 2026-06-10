#!/usr/bin/env node
import { createRequire } from "node:module";
import { Command } from "commander";
import { ConfigError } from "./config/loader.js";
import { init } from "./commands/init.js";
import { list } from "./commands/list.js";
import { run } from "./commands/run.js";
import { validate } from "./commands/validate.js";
import { log } from "./ui/log.js";

const pkg = createRequire(import.meta.url)("../package.json") as { version: string };

const program = new Command()
  .name("loopflow")
  .description("Design loops that prompt your coding agent.")
  .version(pkg.version);

program
  .command("init")
  .description("scaffold .loopflow/ with starter loops")
  .option("-f, --force", "overwrite existing loop files")
  .action((options: { force?: boolean }) => {
    init(process.cwd(), options);
  });

program
  .command("list")
  .description("list loops defined in this project")
  .action(() => {
    list(process.cwd());
  });

program
  .command("validate")
  .description("validate loop definitions")
  .argument("[name]", "loop to validate (defaults to all)")
  .action((name?: string) => {
    process.exitCode = validate(process.cwd(), name);
  });

program
  .command("run")
  .description("run a loop")
  .argument("<name>", "loop to run")
  .option("--dry-run", "print composed prompts without invoking Claude")
  .option("-i, --iterations <n>", "override max iterations", parsePositiveInt)
  .option("-b, --budget <usd>", "override budget in USD", parsePositiveFloat)
  .option("-v, --verbose", "print full step outputs")
  .action(async (name: string, options: Parameters<typeof run>[2]) => {
    process.exitCode = await run(process.cwd(), name, options);
  });

function parsePositiveInt(value: string): number {
  const n = Number.parseInt(value, 10);
  if (!Number.isInteger(n) || n < 1) throw new ConfigError(`expected a positive integer, got "${value}"`);
  return n;
}

function parsePositiveFloat(value: string): number {
  const n = Number.parseFloat(value);
  if (!Number.isFinite(n) || n <= 0) throw new ConfigError(`expected a positive number, got "${value}"`);
  return n;
}

program.parseAsync().catch((err: unknown) => {
  if (err instanceof ConfigError) {
    log.error(err.message);
    process.exitCode = 2;
  } else {
    log.error((err as Error).stack ?? String(err));
    process.exitCode = 1;
  }
});
