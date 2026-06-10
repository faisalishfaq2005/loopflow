import path from "node:path";
import spawn from "cross-spawn";
import { LOOPFLOW_DIR } from "../config/loader.js";

export interface Worktree {
  path: string;
  branch: string;
}

/**
 * Worktree isolation: parallel loops (or a loop and the human) never collide
 * on the same files. Each run gets its own checkout and branch; clean
 * worktrees are removed afterwards, dirty ones are kept for review.
 */

export function isGitRepo(cwd: string): boolean {
  return git(["rev-parse", "--is-inside-work-tree"], cwd).ok;
}

export function createWorktree(root: string, loopName: string): Worktree {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const branch = `loopflow/${loopName}-${stamp}`;
  const worktreePath = path.join(root, LOOPFLOW_DIR, "worktrees", `${loopName}-${stamp}`);
  const result = git(["worktree", "add", worktreePath, "-b", branch], root);
  if (!result.ok) {
    throw new Error(`failed to create worktree: ${result.stderr}`);
  }
  return { path: worktreePath, branch };
}

/**
 * Remove the worktree if the loop left no changes behind; keep it (and report
 * that) when there is work for the human to review.
 */
export function removeWorktreeIfClean(root: string, worktree: Worktree): boolean {
  const status = git(["status", "--porcelain"], worktree.path);
  const committedAhead = git(["log", "--oneline", `${defaultRef(root)}..HEAD`], worktree.path);
  const dirty = status.stdout.trim() !== "" || committedAhead.stdout.trim() !== "";
  if (dirty) return false;

  git(["worktree", "remove", worktree.path, "--force"], root);
  git(["branch", "-D", worktree.branch], root);
  return true;
}

function defaultRef(root: string): string {
  const head = git(["symbolic-ref", "--quiet", "--short", "HEAD"], root);
  return head.ok && head.stdout.trim() ? head.stdout.trim() : "HEAD";
}

function git(args: string[], cwd: string): { ok: boolean; stdout: string; stderr: string } {
  const result = spawn.sync("git", args, { cwd, encoding: "utf8" });
  return {
    ok: result.status === 0,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}
