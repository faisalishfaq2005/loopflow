/**
 * Tracks cumulative spend across all steps and iterations of one loop run.
 *
 * Defense in depth: the remaining budget is also passed to each Claude
 * invocation as `--max-budget-usd`, so a single runaway step is capped by
 * Claude Code itself even before the runner sees the cost.
 */
export class BudgetTracker {
  #spentUsd = 0;

  constructor(readonly maxUsd: number) {}

  add(costUsd: number): void {
    this.#spentUsd += costUsd;
  }

  get spentUsd(): number {
    return this.#spentUsd;
  }

  get remainingUsd(): number {
    return Math.max(0, this.maxUsd - this.#spentUsd);
  }

  get exhausted(): boolean {
    return this.#spentUsd >= this.maxUsd;
  }
}
