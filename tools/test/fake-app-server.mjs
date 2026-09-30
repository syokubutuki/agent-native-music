#!/usr/bin/env node
// Minimal stand-in for `codex app-server` used by codex-worker tests.
// Invoked as `node fake-app-server.mjs app-server`. Speaks the same JSONL
// JSON-RPC shapes as codex-cli 0.159.2 for the methods codex-worker uses.

import { createInterface } from "node:readline";
import fs from "node:fs";
import path from "node:path";

const send = (m) => process.stdout.write(JSON.stringify(m) + "\n");
let initialized = false;
let serverReqId = 1000;
const waiting = new Map();
const threads = new Set(JSON.parse(process.env.FAKE_KNOWN_THREADS ?? "[]"));

function serverRequest(method, params) {
  const id = serverReqId++;
  send({ id, method, params });
  return new Promise((r) => waiting.set(id, r));
}

async function runTurn(threadId, turnId, text, cwd) {
  send({ method: "turn/started", params: { threadId, turn: { id: turnId, status: "inProgress", items: [] } } });
  const approval = await serverRequest("item/commandExecution/requestApproval", { threadId, turnId, itemId: "c1", command: "npm test" });
  send({ method: "item/completed", params: { threadId, turnId, completedAtMs: 0, item: { type: "commandExecution", id: "c1", command: "npm test", exitCode: 1, status: "completed" } } });
  const file = path.join(cwd, "out.txt");
  fs.writeFileSync(file, text);
  send({ method: "item/completed", params: { threadId, turnId, completedAtMs: 0, item: { type: "fileChange", id: "f1", status: "completed", changes: [{ path: file, kind: { type: "add" }, diff: "" }] } } });
  send({ method: "error", params: { threadId, turnId, willRetry: true, error: { message: "Reconnecting... 1/5" } } });
  send({ method: "thread/tokenUsage/updated", params: { threadId, turnId, tokenUsage: { total: { totalTokens: 42, inputTokens: 30, cachedInputTokens: 10, outputTokens: 12, reasoningOutputTokens: 5 } } } });
  send({ method: "item/completed", params: { threadId, turnId, completedAtMs: 0, item: { type: "agentMessage", id: "a1", text: `done: ${text} (approval=${approval.decision})` } } });
  send({ method: "turn/completed", params: { threadId, turn: { id: turnId, status: "completed", items: [], error: null } } });
}

createInterface({ input: process.stdin }).on("line", (line) => {
  const msg = JSON.parse(line);
  if (msg.id !== undefined && msg.method === undefined) return waiting.get(msg.id)?.(msg.result);
  const reply = (result) => send({ id: msg.id, result });
  const fail = (message) => send({ id: msg.id, error: { code: -32600, message } });
  switch (msg.method) {
    case "initialize":
      return reply({ userAgent: "fake/0.0.0", codexHome: "/tmp", platformFamily: "unix", platformOs: "linux" });
    case "initialized":
      initialized = true;
      return;
    case "thread/start": {
      if (!initialized) return fail("not initialized");
      const id = `thread-${Date.now()}`;
      threads.add(id);
      return reply({ thread: { id }, model: msg.params.model ?? "fake-model", cwd: msg.params.cwd, sandbox: { type: "dangerFullAccess" } });
    }
    case "thread/resume":
      if (!msg.params.threadId) return fail("threadId required");
      return reply({ thread: { id: msg.params.threadId }, model: msg.params.model ?? "fake-model", cwd: msg.params.cwd });
    case "turn/start": {
      const turnId = `turn-${Date.now()}`;
      reply({ turn: { id: turnId, status: "inProgress", items: [] } });
      const text = msg.params.input[0].text;
      if (text === "HANG") return;
      return runTurn(msg.params.threadId, turnId, `${text} effort=${msg.params.effort}`, process.cwd());
    }
    case "model/list":
      return reply({ data: [{ id: "fake-model", model: "fake-model", isDefault: true, supportedReasoningEfforts: [{ reasoningEffort: "low" }, { reasoningEffort: "high" }] }], nextCursor: null });
    case "turn/interrupt":
      reply({});
      return send({ method: "turn/completed", params: { threadId: msg.params.threadId, turn: { id: msg.params.turnId, status: "interrupted", items: [] } } });
    default:
      return fail(`unknown method ${msg.method}`);
  }
});
