import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendRunRecord, readMemory } from "../src/core/memory.js";

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "loopflow-memory-"));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("memory", () => {
  it("returns empty string for a missing file", () => {
    expect(readMemory(path.join(dir, "nope.md"))).toBe("");
  });

  it("creates the file with a header and appends a structured record", () => {
    const file = path.join(dir, "nested", "demo.md");
    appendRunRecord(file, {
      loopName: "demo",
      timestamp: "2026-06-10T00:00:00Z",
      outcome: "success",
      iterationsUsed: 2,
      costUsd: 0.5,
      stepSummaries: ["fix ✓", "review ✓"],
      notes: "fixed the date parser",
    });

    const content = fs.readFileSync(file, "utf8");
    expect(content).toContain("# Loop memory: demo");
    expect(content).toContain("## Run 2026-06-10T00:00:00Z");
    expect(content).toContain("Outcome: success (iterations used: 2)");
    expect(content).toContain("fix ✓, review ✓");
    expect(content).toContain("fixed the date parser");
  });

  it("accumulates records across runs", () => {
    const file = path.join(dir, "demo.md");
    for (const outcome of ["success", "gate-exhausted"]) {
      appendRunRecord(file, {
        loopName: "demo",
        timestamp: "t",
        outcome,
        iterationsUsed: 1,
        costUsd: 0,
        stepSummaries: [],
        notes: "",
      });
    }
    const content = fs.readFileSync(file, "utf8");
    expect(content).toContain("success");
    expect(content).toContain("gate-exhausted");
  });

  it("reads only the tail of an oversized memory file", () => {
    const file = path.join(dir, "big.md");
    fs.writeFileSync(file, `${"old ".repeat(10_000)}NEWEST`, "utf8");
    const memory = readMemory(file);
    expect(memory.endsWith("NEWEST")).toBe(true);
    expect(memory.length).toBeLessThanOrEqual(12_000);
  });
});
