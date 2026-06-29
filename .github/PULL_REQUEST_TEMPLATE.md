<!--
  Thanks for contributing to LoopFlow! Keep the core small: LoopFlow is a thin
  orchestrator around `claude -p`. Features that can be a loop should be a loop,
  not engine code.
-->

## What does this change?

<!-- A short description, and the issue it closes (e.g. "Closes #12"). -->

## Type of change

- [ ] Bug fix
- [ ] New feature / enhancement
- [ ] Cookbook loop (`loops/<name>.yaml`)
- [ ] Docs only

## Checklist

- [ ] `npm test` passes (vitest, runs in <1s).
- [ ] `npm run typecheck` and `npm run build` pass.
- [ ] Every behavior change comes with a test (the runner is testable without
      invoking Claude — inject a fake via `RunOptions.invoke`).
- [ ] No new runtime dependencies (or I opened an issue to discuss it first).
- [ ] Pure functions (prompt composition, verdict parsing, validation) stayed pure.

<!-- For a cookbook loop instead: confirm it has a gate, is generalized, and passes `loopflow validate`. -->
