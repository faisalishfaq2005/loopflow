# Contributing to LoopFlow

The fastest way to make LoopFlow better is to share a loop that solved a real problem for you. Code contributions are welcome too.

## Contributing a loop (the cookbook)

Community loops live in [`loops/`](loops/). To add one:

1. Create `loops/<your-loop-name>.yaml`. The file name must match the loop's `name`.
2. Make it self-documenting: a clear `description`, a comment at the top explaining when to use it, and prompts that explain *why*, not just *what*.
3. Generalize it — strip anything specific to your project (paths, tool names, team jargon) or call it out clearly as a placeholder.
4. Validate it: copy it into a scratch project's `.loopflow/loops/` and run `loopflow validate`.
5. Open a PR titled `loop: <name>` and include in the description:
   - the problem it solves,
   - roughly what one run costs you (USD),
   - anything you learned tuning the prompts.

Loops with a verification gate are strongly preferred — the write/verify split is the whole point.

## Contributing code

```bash
git clone https://github.com/<you>/loopflow   # replace <you> with your GitHub username
cd loopflow
npm install
npm test         # vitest, runs in <1s
npm run build    # tsc → dist/
```

Ground rules:

- **Keep the core small.** LoopFlow is deliberately a thin orchestrator around `claude -p`. Features that can be a loop should be a loop, not engine code.
- **Pure where possible.** Prompt composition, verdict parsing, and validation are pure functions — keep them that way so they stay trivially testable.
- **Every behavior change comes with a test.** The runner is fully testable without invoking Claude (inject a fake via `RunOptions.invoke`).
- **No new dependencies without discussion.** The current runtime footprint is five small packages.

### Project layout

```
src/
├── cli.ts          # commander wiring, exit codes
├── config/         # loop.yaml schema (zod) + loader
├── core/
│   ├── claude.ts   # headless Claude Code adapter (the only place that spawns)
│   ├── runner.ts   # iteration/gate/budget orchestration
│   ├── prompt.ts   # pure prompt composition
│   ├── verdict.ts  # gate protocol
│   ├── memory.ts   # markdown memory files
│   ├── budget.ts   # cumulative cost tracking
│   └── worktree.ts # git worktree isolation
├── commands/       # thin CLI command handlers
└── ui/             # console output
```

## Reporting bugs

Include your OS, Node version, `claude --version`, the loop YAML (redacted as needed), and the command you ran. If a step behaved strangely, the `claude --resume <session-id>` transcript is the single most useful thing you can look at — and quote from.
