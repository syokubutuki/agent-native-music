// Run: node --test tools/test/
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = path.join(here, "..", "codex-worker.mjs");
const fake = path.join(here, "fake-app-server.mjs");

function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-worker-"));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "i"], { cwd: dir });
  fs.writeFileSync(path.join(dir, ".gitignore"), ".codex-worker/\n");
  return dir;
}

function run(cwd, ...args) {
  const r = spawnSync("node", [worker, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, CODEX_WORKER_BIN: "node", CODEX_WORKER_BIN_ARGS: JSON.stringify([fake]) },
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

test("run completes a turn, auto-approves, and summarizes", () => {
  const dir = repo();
  const r = run(dir, "run", "--task", "hello", "--effort", "high");
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /^status: completed/m);
  assert.match(r.out, /done: hello effort=high \(approval=acceptForSession\)/);
  assert.match(r.out, /add out\.txt/);
  assert.match(r.out, /\[exit 1\] npm test/);
  assert.match(r.out, /tokens: total=42/);
  assert.match(r.out, /transient retries: 1/);
  assert.doesNotMatch(r.out, /stream error/);
  const state = JSON.parse(fs.readFileSync(path.join(dir, ".codex-worker/state.json"), "utf8"));
  assert.ok(state.lastThreadId);
});

test("continue resumes the last thread", () => {
  const dir = repo();
  run(dir, "run", "--task", "first");
  const state = JSON.parse(fs.readFileSync(path.join(dir, ".codex-worker/state.json"), "utf8"));
  const r = run(dir, "continue", "--task", "second");
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, new RegExp(`thread: ${state.lastThreadId}`));
  assert.match(r.err, /resumed thread/);
  const after = JSON.parse(fs.readFileSync(path.join(dir, ".codex-worker/state.json"), "utf8"));
  assert.equal(after.threads[state.lastThreadId].turns.length, 2);
});

test("task file input and timeout interrupts the turn", () => {
  const dir = repo();
  const spec = path.join(dir, "spec.md");
  fs.writeFileSync(spec, "HANG");
  const r = run(dir, "run", "--task-file", spec, "--timeout", "1", "--quiet");
  assert.equal(r.code, 2);
  assert.match(r.out, /^status: timeout/m);
  assert.equal(r.err, "");
});

test("continue without a prior thread fails clearly", () => {
  const r = run(repo(), "continue", "--task", "x");
  assert.equal(r.code, 1);
  assert.match(r.err, /no previous thread/);
});

test("unavailable model or effort fails before starting a turn", () => {
  const dir = repo();
  let r = run(dir, "run", "--task", "x", "--model", "gpt-nope");
  assert.equal(r.code, 1);
  assert.match(r.out, /model "gpt-nope" is not available.*Available: fake-model/);
  assert.match(r.out, /turn: -/);
  r = run(dir, "run", "--task", "x", "--model", "fake-model", "--effort", "ultra");
  assert.match(r.out, /effort "ultra" is not supported by fake-model/);
  r = run(dir, "run", "--task", "ok", "--model", "fake-model", "--effort", "high");
  assert.equal(r.code, 0, r.err);
});
