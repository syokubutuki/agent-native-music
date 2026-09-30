#!/usr/bin/env node
// Codex App Server worker CLI.
//
// Spawns `codex app-server` as a child process and speaks its JSON-RPC
// protocol over stdio (one JSON object per line). Claude Code calls this CLI
// to delegate implementation work to Codex and gets back a compact summary.
//
// Protocol reference: `codex app-server generate-json-schema --out <dir>`
// (verified against codex-cli 0.159.2).
//
// Usage:
//   node tools/codex-worker.mjs run      --task-file specs/foo.md [--effort high]
//   node tools/codex-worker.mjs continue --task "Fix review findings: ..."
//   node tools/codex-worker.mjs status
//   node tools/codex-worker.mjs log [--thread <id>]
//   node tools/codex-worker.mjs models

import { spawn, execFileSync } from "node:child_process";
import { createInterface } from "node:readline";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_INFO = { name: "codex-worker", title: "Claude Code Codex worker", version: "1.0.0" };
const EFFORTS = ["low", "medium", "high", "xhigh", "max", "ultra"];

// ---------------------------------------------------------------------------
// Config / state

function repoRoot(cwd) {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8" }).trim();
  } catch {
    return cwd;
  }
}

function loadConfig(root) {
  const defaults = {
    model: null,
    effort: "medium",
    timeoutSec: 1800,
    sandbox: "danger-full-access",
    approvalPolicy: "never",
    developerInstructions: null,
  };
  for (const p of [path.join(TOOL_DIR, "codex-worker.config.json"), path.join(root, ".codex-worker", "config.local.json")]) {
    if (fs.existsSync(p)) Object.assign(defaults, JSON.parse(fs.readFileSync(p, "utf8")));
  }
  return defaults;
}

class State {
  constructor(root) {
    this.dir = path.join(root, ".codex-worker");
    this.file = path.join(this.dir, "state.json");
    this.logDir = path.join(this.dir, "logs");
    fs.mkdirSync(this.logDir, { recursive: true });
    this.data = fs.existsSync(this.file) ? JSON.parse(fs.readFileSync(this.file, "utf8")) : { lastThreadId: null, threads: {} };
  }
  save() {
    fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2) + "\n");
  }
  recordTurn(threadId, entry) {
    const t = (this.data.threads[threadId] ??= { createdAt: new Date().toISOString(), turns: [] });
    t.turns.push(entry);
    this.data.lastThreadId = threadId;
    this.save();
  }
}

// ---------------------------------------------------------------------------
// App Server client

class AppServer {
  constructor({ cwd, logStream, onNotification, onServerRequest }) {
    this.cwd = cwd;
    this.log = logStream;
    this.onNotification = onNotification;
    this.onServerRequest = onServerRequest;
    this.nextId = 1;
    this.pending = new Map();
    this.exited = false;
  }

  start() {
    const bin = process.env.CODEX_WORKER_BIN || "codex";
    const extra = process.env.CODEX_WORKER_BIN_ARGS ? JSON.parse(process.env.CODEX_WORKER_BIN_ARGS) : [];
    // On Windows npm installs `codex` as a .cmd shim, which Node can only launch through a shell.
    this.useShell = process.platform === "win32" && !/\.exe$/i.test(bin) && bin !== "node";
    const args = [...extra, "app-server"].map((a) => (this.useShell && /\s/.test(a) ? `"${a}"` : a));
    this.proc = spawn(bin, args, { cwd: this.cwd, stdio: ["pipe", "pipe", "pipe"], shell: this.useShell, windowsHide: true });
    this.exitPromise = new Promise((resolve) => {
      this.proc.on("exit", (code, signal) => {
        this.exited = true;
        const err = new Error(`codex app-server exited (code=${code}, signal=${signal})`);
        for (const { reject } of this.pending.values()) reject(err);
        this.pending.clear();
        resolve({ code, signal });
      });
    });
    this.proc.on("error", (err) => {
      process.stderr.write(`[codex-worker] failed to spawn ${bin}: ${err.message}\n`);
    });
    this.proc.stderr.on("data", (d) => this.log.write(JSON.stringify({ dir: "stderr", text: d.toString() }) + "\n"));
    createInterface({ input: this.proc.stdout }).on("line", (line) => this.#onLine(line));
  }

  #send(msg) {
    this.log.write(JSON.stringify({ dir: "out", msg }) + "\n");
    this.proc.stdin.write(JSON.stringify(msg) + "\n");
  }

  #onLine(line) {
    if (!line.trim()) return;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      this.log.write(JSON.stringify({ dir: "in-unparsed", line }) + "\n");
      return;
    }
    this.log.write(JSON.stringify({ dir: "in", msg }) + "\n");
    if (msg.method !== undefined && msg.id !== undefined) {
      // Server -> client request (approvals, user input, ...).
      Promise.resolve(this.onServerRequest(msg.method, msg.params))
        .then((result) => this.#send({ id: msg.id, result }))
        .catch((e) => this.#send({ id: msg.id, error: { code: -32601, message: String(e?.message ?? e) } }));
    } else if (msg.method !== undefined) {
      this.onNotification(msg.method, msg.params ?? {});
    } else if (msg.id !== undefined) {
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      if (msg.error) p.reject(Object.assign(new Error(`${p.method}: ${msg.error.message}`), { rpc: msg.error }));
      else p.resolve(msg.result);
    }
  }

  request(method, params) {
    if (this.exited) return Promise.reject(new Error("codex app-server is not running"));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      this.#send({ id, method, params });
    });
  }

  notify(method, params) {
    this.#send(params === undefined ? { method } : { method, params });
  }

  async initialize() {
    const res = await this.request("initialize", { clientInfo: CLIENT_INFO });
    this.notify("initialized");
    return res;
  }

  #kill(force) {
    if (process.platform === "win32") {
      // Kill the whole tree: with a .cmd shim the direct child is cmd.exe, not codex.
      try {
        execFileSync("taskkill", ["/pid", String(this.proc.pid), "/T", ...(force ? ["/F"] : [])], { stdio: "ignore" });
      } catch {}
    } else {
      this.proc.kill(force ? "SIGKILL" : "SIGTERM");
    }
  }

  async close() {
    if (this.exited) return;
    this.proc.stdin.end();
    const timer = (ms) => new Promise((r) => setTimeout(r, ms));
    if (await Promise.race([this.exitPromise.then(() => true), timer(3000).then(() => false)])) return;
    this.#kill(false);
    if (await Promise.race([this.exitPromise.then(() => true), timer(3000).then(() => false)])) return;
    this.#kill(true);
    await this.exitPromise;
  }
}

// ---------------------------------------------------------------------------
// Auto-responses for server requests. The worker runs Codex with full access,
// so every approval is granted; there is no human on the other end.

function answerServerRequest(method, params, emit) {
  switch (method) {
    case "item/commandExecution/requestApproval":
    case "item/fileChange/requestApproval":
      return { decision: "acceptForSession" };
    case "item/permissions/requestApproval":
      return { permissions: params.permissions ?? {}, scope: "session" };
    case "execCommandApproval":
    case "applyPatchApproval":
      return { decision: "approved_for_session" };
    case "item/tool/requestUserInput": {
      const answers = {};
      for (const q of params.questions ?? []) {
        emit(`codex asked: ${q.question}`);
        answers[q.id] = { answers: ["No human is available. Use your best judgement, follow the spec, and note the assumption in your final message."] };
      }
      return { answers };
    }
    case "mcpServer/elicitation/request":
      return { action: "decline", content: null };
    default:
      throw new Error(`codex-worker does not handle server request ${method}`);
  }
}

// ---------------------------------------------------------------------------
// Turn runner

function gitDiffStat(cwd) {
  try {
    const tracked = execFileSync("git", ["diff", "--stat", "HEAD"], { cwd, encoding: "utf8" }).trim();
    const untracked = execFileSync("git", ["ls-files", "--others", "--exclude-standard"], { cwd, encoding: "utf8" }).trim();
    return [tracked, untracked && `untracked:\n${untracked.split("\n").map((f) => "  " + f).join("\n")}`].filter(Boolean).join("\n");
  } catch {
    return "(git diff unavailable)";
  }
}

function truncate(s, n) {
  s = String(s ?? "");
  return s.length > n ? s.slice(0, n) + `… (+${s.length - n} chars)` : s;
}

async function runTurn({ mode, task, threadId, opts, cfg, root, state }) {
  const startedAt = Date.now();
  const logPath = path.join(state.logDir, `${new Date().toISOString().replace(/[:.]/g, "-")}-${mode}.jsonl`);
  const logStream = fs.createWriteStream(logPath);
  const quiet = opts.quiet;
  const emit = (s) => !quiet && process.stderr.write(`[codex] ${s}\n`);

  const turn = { id: null, done: null, agentMessages: [], commands: [], files: new Map(), errors: [], retries: 0, usage: null };
  let resolveDone;
  const donePromise = new Promise((r) => (resolveDone = r));

  const server = new AppServer({
    cwd: root,
    logStream,
    onServerRequest: (method, params) => answerServerRequest(method, params, emit),
    onNotification: (method, p) => {
      if (turn.id && p.turnId && p.turnId !== turn.id) return;
      switch (method) {
        case "item/completed": {
          const it = p.item;
          if (it.type === "agentMessage") turn.agentMessages.push(it.text);
          else if (it.type === "commandExecution") {
            turn.commands.push({ command: it.command, exitCode: it.exitCode, status: it.status });
            emit(`$ ${truncate(it.command, 120)} -> ${it.exitCode ?? it.status}`);
          } else if (it.type === "fileChange") {
            for (const c of it.changes ?? []) turn.files.set(c.path, typeof c.kind === "object" ? c.kind.type : c.kind);
            emit(`edit ${(it.changes ?? []).map((c) => c.path).join(", ")}`);
          }
          break;
        }
        case "thread/tokenUsage/updated":
          turn.usage = p.tokenUsage;
          break;
        case "error":
          if (p.willRetry) {
            turn.retries++;
            if (turn.retries === 1) emit(`transient error, codex is retrying: ${p.error?.message}`);
          } else {
            turn.errors.push(p.error?.message ?? JSON.stringify(p.error));
            emit(`error: ${p.error?.message}`);
          }
          break;
        case "turn/completed":
          if (!turn.id || p.turn.id === turn.id) resolveDone(p.turn);
          break;
      }
    },
  });

  server.start();
  const onSignal = async () => {
    emit("interrupted by signal, stopping codex…");
    if (turn.id) await server.request("turn/interrupt", { threadId, turnId: turn.id }).catch(() => {});
    await server.close();
    process.exit(130);
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);

  let result;
  try {
    const init = await server.initialize();
    emit(`app-server ready (${init.userAgent})`);

    const threadParams = {
      cwd: root,
      sandbox: cfg.sandbox,
      approvalPolicy: cfg.approvalPolicy,
      ...(opts.model ?? cfg.model ? { model: opts.model ?? cfg.model } : {}),
      ...(cfg.developerInstructions ? { developerInstructions: cfg.developerInstructions } : {}),
    };
    const thread =
      mode === "run"
        ? await server.request("thread/start", threadParams)
        : await server.request("thread/resume", { ...threadParams, threadId, excludeTurns: true });
    threadId = thread.thread.id;
    emit(`${mode === "run" ? "started" : "resumed"} thread ${threadId} (model=${thread.model}, sandbox=${cfg.sandbox})`);

    const effort = opts.effort ?? cfg.effort;
    const started = await server.request("turn/start", {
      threadId,
      input: [{ type: "text", text: task }],
      ...(effort ? { effort } : {}),
      ...(opts.model ? { model: opts.model } : {}),
    });
    turn.id = started.turn.id;
    emit(`turn ${turn.id} started (effort=${effort ?? "default"})`);

    const timeoutSec = Number(opts.timeout ?? cfg.timeoutSec);
    let timer;
    const timeout = new Promise((r) => (timer = setTimeout(() => r("timeout"), timeoutSec * 1000)));
    const outcome = await Promise.race([donePromise, timeout, server.exitPromise.then(() => "exited")]);
    clearTimeout(timer);

    if (outcome === "timeout") {
      emit(`timeout after ${timeoutSec}s, interrupting turn`);
      await server.request("turn/interrupt", { threadId, turnId: turn.id }).catch(() => {});
      const late = await Promise.race([donePromise, new Promise((r) => setTimeout(() => r(null), 10000))]);
      result = { status: "timeout", turn: late };
    } else if (outcome === "exited") {
      result = { status: "server-exited", turn: null };
    } else {
      result = { status: outcome.status, turn: outcome };
    }
  } catch (e) {
    result = { status: "error", error: e.message };
  } finally {
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
    await server.close();
    logStream.end();
  }

  const durationSec = Math.round((Date.now() - startedAt) / 1000);
  if (threadId) {
    state.recordTurn(threadId, {
      at: new Date(startedAt).toISOString(),
      mode,
      turnId: turn.id,
      status: result.status,
      effort: opts.effort ?? cfg.effort,
      durationSec,
      log: path.relative(root, logPath),
      task: truncate(task, 300),
    });
  }

  // Compact summary for Claude Code (stdout).
  const out = [];
  out.push(`status: ${result.status}`);
  out.push(`thread: ${threadId ?? "-"}   turn: ${turn.id ?? "-"}   duration: ${durationSec}s`);
  if (turn.usage?.total) out.push(`tokens: total=${turn.usage.total.totalTokens} (in=${turn.usage.total.inputTokens}, cached=${turn.usage.total.cachedInputTokens}, out=${turn.usage.total.outputTokens}, reasoning=${turn.usage.total.reasoningOutputTokens})`);
  if (result.error) out.push(`error: ${result.error}`);
  if (result.turn?.error) out.push(`turn error: ${result.turn.error.message}`);
  if (turn.retries) out.push(`transient retries: ${turn.retries}`);
  for (const e of turn.errors) out.push(`stream error: ${truncate(e, 300)}`);
  if (turn.files.size) out.push("files changed by codex:\n" + [...turn.files].map(([f, k]) => `  ${k} ${path.relative(root, f) || f}`).join("\n"));
  const failed = turn.commands.filter((c) => c.exitCode !== 0 && c.exitCode !== null && c.exitCode !== undefined);
  out.push(`commands: ${turn.commands.length} run, ${failed.length} non-zero exit`);
  for (const c of failed.slice(-10)) out.push(`  [exit ${c.exitCode}] ${truncate(c.command, 160)}`);
  out.push("git diff --stat:\n" + (gitDiffStat(root) || "  (no changes)"));
  out.push("codex final message:\n" + (turn.agentMessages.at(-1) ?? "(none)"));
  out.push(`log: ${path.relative(root, logPath)}`);
  process.stdout.write(out.join("\n") + "\n");

  return result.status === "completed" ? 0 : result.status === "timeout" ? 2 : 1;
}

// ---------------------------------------------------------------------------
// Commands

async function listModels(root) {
  const logStream = fs.createWriteStream(os.devNull);
  const server = new AppServer({ cwd: root, logStream, onNotification: () => {}, onServerRequest: (m) => { throw new Error(m); } });
  server.start();
  try {
    await server.initialize();
    let cursor = null;
    do {
      const res = await server.request("model/list", { cursor, limit: 100 });
      for (const m of res.data ?? []) {
        const efforts = (m.supportedReasoningEfforts ?? []).map((e) => e.reasoningEffort ?? e).join(",");
        process.stdout.write(`${m.id}${m.isDefault ? " (default)" : ""}  efforts=[${efforts}] default=${m.defaultReasoningEffort}  ${m.displayName ?? ""}\n`);
      }
      cursor = res.nextCursor ?? null;
    } while (cursor);
  } finally {
    await server.close();
  }
}

function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  const opts = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith("--")) throw new Error(`unexpected argument: ${a}`);
    const key = a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (key === "quiet") opts.quiet = true;
    else opts[key] = rest[++i];
  }
  return { cmd, opts };
}

function readTask(opts) {
  if (opts.taskFile) return fs.readFileSync(opts.taskFile, "utf8");
  if (opts.task) return opts.task;
  if (!process.stdin.isTTY) return fs.readFileSync(0, "utf8");
  throw new Error("provide --task, --task-file, or pipe the task on stdin");
}

const HELP = `codex-worker: delegate implementation to Codex via codex app-server

  run       --task <text> | --task-file <path>   start a new Codex thread
  continue  --task <text> | --task-file <path>   send a follow-up turn to a thread
            [--thread <id>]                       (default: last thread)
  status                                          list recent threads/turns
  log       [--thread <id>]                       print the latest log path
  models                                          list models and supported efforts

options: --effort ${EFFORTS.join("|")}  --model <id>  --timeout <sec>  --quiet
`;

async function main() {
  const { cmd, opts } = parseArgs(process.argv.slice(2));
  const root = repoRoot(process.cwd());
  const cfg = loadConfig(root);
  if (opts.effort && !EFFORTS.includes(opts.effort)) process.stderr.write(`[codex-worker] warning: unusual effort "${opts.effort}", passing through\n`);

  switch (cmd) {
    case "run":
      return runTurn({ mode: "run", task: readTask(opts), threadId: null, opts, cfg, root, state: new State(root) });
    case "continue": {
      const state = new State(root);
      const threadId = opts.thread ?? state.data.lastThreadId;
      if (!threadId) throw new Error("no previous thread; use `run` first or pass --thread");
      return runTurn({ mode: "continue", task: readTask(opts), threadId, opts, cfg, root, state });
    }
    case "status": {
      const state = new State(root);
      const entries = Object.entries(state.data.threads).slice(-10);
      if (!entries.length) console.log("no threads yet");
      for (const [id, t] of entries) {
        console.log(`${id}${id === state.data.lastThreadId ? "  (last)" : ""}`);
        for (const turn of t.turns) console.log(`  ${turn.at} ${turn.mode} ${turn.status} effort=${turn.effort} ${turn.durationSec}s  ${turn.log}\n    ${turn.task.split("\n")[0]}`);
      }
      return 0;
    }
    case "log": {
      const state = new State(root);
      const id = opts.thread ?? state.data.lastThreadId;
      const last = id && state.data.threads[id]?.turns.at(-1);
      console.log(last ? last.log : "no log");
      return 0;
    }
    case "models":
      await listModels(root);
      return 0;
    default:
      process.stdout.write(HELP);
      return cmd ? 64 : 0;
  }
}

main().then(
  (code) => process.exit(code ?? 0),
  (e) => {
    process.stderr.write(`[codex-worker] ${e.message}\n`);
    process.exit(1);
  },
);
