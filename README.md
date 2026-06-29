
<p align="center">
  
<img width="1983" height="793" alt="ChatGPT Image Jun 29, 2026, 05_55_12 PM" src="https://github.com/user-attachments/assets/ee9ad956-8256-479f-adf0-882b3c7937e2" />

  
</p>

<p align="center">
    <a href="https://www.npmjs.com/package/@loopflow/cli">
        <img alt="npm" src="https://img.shields.io/npm/v/@loopflow/cli?color=cb3837">
    </a>
    <a href="https://github.com/faisalishfaq2005/loopflow/actions/workflows/ci.yml">
        <img alt="CI" src="https://github.com/faisalishfaq2005/loopflow/actions/workflows/ci.yml/badge.svg">
    </a>
    <a href="https://github.com/faisalishfaq2005/loopflow/stargazers">
        <img alt="GitHub stars" src="https://img.shields.io/github/stars/faisalishfaq2005/loopflow?style=social">
    </a>
    <a href="https://github.com/faisalishfaq2005/loopflow/blob/main/LICENSE">
        <img alt="License" src="https://img.shields.io/badge/License-MIT-blue.svg">
    </a>
</p>



  

# LoopFlow

**Stop prompting your coding agent. Design the loop that prompts it.**

LoopFlow turns Claude Code into a system that runs itself: you declare a goal, a pipeline of agents, and a verification gate in one YAML file — LoopFlow iterates until the gate passes, the budget runs out, or the attempt limit is hit. One agent writes, a *different* agent checks, and a memory file makes every run smarter than the last.

```
$ loopflow run test-and-fix

Iteration 1/3
  ▸ fix …
    done · $0.31 · resume: claude --resume 072f1abb…
  ▸ review (gate) …
    gate FAIL · $0.12
    │ The date parser fix only handles ISO strings; the failing test
    │ also feeds epoch millis. Root cause not addressed.

Iteration 2/3
  ▸ fix …
    done · $0.28
  ▸ review (gate) …
    done · $0.11

✓ success · 2 iteration(s) · $0.82
```
## 📺 Demo video

<p align="center">
  <img src="https://github.com/user-attachments/assets/8be10c47-b7fb-4252-982b-ee1a5dca725c"
       width="800"
       alt="LoopFlow demo — release-check loop, 2 iterations">
</p>

<p align="center">
  <em>LoopFlow demo — release-check loop, 2 iterations</em>
</p>

---

## Why loops?

For two years the workflow was: write a prompt, read the output, write the next prompt. You held the tool the whole time.

That's changing. As Boris Cherny (creator of Claude Code) put it: *"I don't prompt Claude anymore. I have loops running that prompt Claude."*

A loop is a **recursive goal**: you define what "done" looks like, and the agent iterates until it gets there. But doing this raw has three sharp edges:

1. **Agents grade their own homework.** The model that wrote the fix will happily declare it works.
2. **Unattended loops burn money.** A loop running itself is also a loop making mistakes — and spending tokens — unattended.
3. **The agent forgets everything between runs.** Every run re-derives what the last run already learned.

LoopFlow is a small, sharp tool built around exactly those three problems:

| Problem | LoopFlow answer |
|---|---|
| Self-grading | **Gates** — a separate agent, with a separate persona, must output `VERDICT: PASS` before the loop ends |
| Runaway cost | **Budgets** — a hard USD ceiling enforced twice: by the runner *and* by Claude Code's own `--max-budget-usd` on every step |
| Amnesia | **Memory** — a plain Markdown file per loop, appended after every run, injected into every prompt. The agent forgets; the repo doesn't |
| Collisions | **Worktrees** — opt-in git worktree isolation, so loops never fight you (or each other) for the working tree |
| Auditability | Every step logs a **session id** — `claude --resume <id>` drops you into the full transcript of any step, any time |

No API keys, no daemon, no cloud. If `claude` works in your terminal, `loopflow` works.

## Quickstart

```bash
npm install -g @loopflow/cli   # or: npx @loopflow/cli

cd your-project
loopflow init             # scaffolds .loopflow/ with three starter loops
loopflow run test-and-fix --dry-run   # see exactly what each agent will be told
loopflow run test-and-fix             # run it for real
```

Requirements: Node 18+, [Claude Code](https://claude.com/claude-code) installed and authenticated.

## Anatomy of a loop

```yaml
# .loopflow/loops/test-and-fix.yaml
name: test-and-fix
description: Run the test suite, fix failures, verify the fix.

budget:
  max_usd: 2.00        # hard ceiling for the whole run, all iterations included
  max_iterations: 3    # how many attempts the gate may reject

worktree: false        # set true to run in an isolated git worktree

defaults:
  permission_mode: acceptEdits

steps:
  - id: fix
    role: >            # persona — appended to Claude's system prompt
      You are a careful maintainer. You make the smallest change that fixes
      the problem, and you never weaken a test to make it pass.
    prompt: |
      Run this project's test suite. Diagnose and fix the root cause of any
      failure. Re-run to confirm. Summarize what you changed and why.

  - id: review
    gate: true         # ← the loop cannot succeed until this step says PASS
    role: >
      You are a skeptical senior engineer reviewing a change you did not
      write. You trust nothing without evidence.
    prompt: |
      A previous agent claims to have fixed failing tests. Inspect the diff,
      re-run the suite yourself, and check no test was weakened or deleted.
```

### What happens when you run it

```
            ┌──────────────────────────────────────────────┐
            │              iteration (≤ max)               │
            │                                              │
 memory ──▶ │  step: fix ──▶ step: review (gate) ──┐       │
   ▲        │      ▲                               │       │
   │        │      └── reviewer feedback ◀── FAIL ─┤       │
   │        └──────────────────────────────────────┼───────┘
   │                                               │ PASS
   └──────────────── run record ◀──────────────────┘
```

- Each step is one headless Claude Code run (`claude -p`). Steps see the loop's **memory**, the **outputs of earlier steps** in the iteration, and — on retries — the **gate's feedback**.
- A gate must end with `VERDICT: PASS` or `VERDICT: FAIL`. No verdict counts as FAIL: *an unverified pass is not a pass.*
- On FAIL, the loop starts over with the reviewer's feedback injected into every prompt.
- Every run appends a record to `.loopflow/memory/<loop>.md` — outcome, cost, and the final summary — which the next run reads.

### Here's what that looks like in a real run — a release-check loop catching a debug artifact the fix step missed:

<img width="1145" alt="Loop retries after gate rejects iteration 1"
src="https://github.com/user-attachments/assets/67dc7ceb-7e3a-4037-ab62-4b0e9c26cbca">

<img width="1200" alt="Gate passes all tests but catches a leftover console.log — feedback injected into the next iteration"
src="https://github.com/user-attachments/assets/b7c247d4-ce99-4f95-9fea-eca0eab7b4bf">

<img width="1200" alt="Gate confirms the artifact is gone — VERDICT: PASS, 3 iterations, $0.61"
src="https://github.com/user-attachments/assets/af37322b-da17-4d70-ac91-9a0c7b6dbda9">

## The starter loops

`loopflow init` gives you three loops designed to be stolen from:

- **`test-and-fix`** — fixer + skeptical reviewer gate. The canonical write/verify pair.
- **`debt-audit`** — a discovery loop. Maintains `.loopflow/reports/debt-audit.md` and uses memory to track what got fixed, what's new, and what keeps being ignored.
- **`docs-sync`** — finds documentation that drifted from the code, fixes it in an isolated worktree, and a gate verifies every claim against the source.

Got a loop of your own? [Contribute it to the cookbook](CONTRIBUTING.md) — community loops live in [`loops/`](loops/).

## Scheduling — the heartbeat

LoopFlow deliberately ships no daemon. Use the scheduler you already have:

```bash
# cron (Linux/macOS) — audit debt every Monday at 9am
0 9 * * 1  cd /path/to/project && loopflow run debt-audit

# Windows Task Scheduler
schtasks /create /tn "debt-audit" /sc weekly /d MON /st 09:00 ^
  /tr "cmd /c cd /d C:\path\to\project && loopflow run debt-audit"
```

CI works too — a GitHub Action that runs `loopflow run docs-sync` weekly and opens a PR from the kept worktree branch is ~20 lines.

## Staying the engineer

A loop changes the work — it doesn't delete you from it. LoopFlow's design assumes three things stay true:

- **Verification is still on you.** Gates catch the obvious failures, but `--verbose` and `claude --resume <session-id>` exist so you can read what the loop actually did. Read it.
- **Comprehension debt is real.** The faster a loop ships code you didn't write, the faster the gap grows between what exists and what you understand. Memory files and kept worktrees are designed to be *read by humans*, not just machines.
- **The comfortable posture is the dangerous one.** When the loop runs itself, it's tempting to stop having an opinion. Design the loop with judgment — then keep judging the output.

Build the loop. But build it like someone who intends to stay the engineer, not just the person who presses go.

## CLI reference

| Command | What it does |
|---|---|
| `loopflow init [--force]` | Scaffold `.loopflow/` with starter loops |
| `loopflow list` | List loops with steps, gates, and budgets |
| `loopflow validate [name]` | Validate loop definitions (all by default) |
| `loopflow run <name>` | Run a loop |
| `  --dry-run` | Print every composed prompt; invoke nothing |
| `  -i, --iterations <n>` | Override `budget.max_iterations` |
| `  -b, --budget <usd>` | Override `budget.max_usd` |
| `  -v, --verbose` | Print full step outputs |

Exit codes: `0` success · `1` loop failed (gate exhausted, budget, error) · `2` configuration error. Cron- and CI-friendly.

## Programmatic API

Everything the CLI does is exported:

```ts
import { loadLoop, runLoop } from "@loopflow/cli";

const loop = loadLoop(process.cwd(), "test-and-fix");
const result = await runLoop(loop, { root: process.cwd() });
console.log(result.outcome, result.costUsd);
```

## Roadmap

- [ ] `loopflow daemon` — built-in scheduler with cron expressions in `loop.yaml`
- [ ] Parallel steps (fan-out across worktrees)
- [ ] Structured gate verdicts via `--json-schema`
- [ ] Loop run history & `loopflow logs`
- [ ] Adapters for other headless agents (Codex CLI, …)

## Contributing

The most valuable contribution is a **loop that solved a real problem for you** — see [CONTRIBUTING.md](CONTRIBUTING.md). Code contributions: the engine is ~600 lines of typed, tested TypeScript; `npm test` runs in under a second.

## License

[MIT](LICENSE)
