import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import net from "node:net";
import { execFileSync } from "node:child_process";
import {
  ensureEnv,
  assertFreePort,
  parseOptions,
  waitFor,
  ensureOllamaModel,
  demoDatabasePath,
} from "./demo.mjs";

test("fresh demo paths are unique even for starts in the same second", () => {
  const now = new Date(2026, 9, 13, 19, 20, 21);
  const first = demoDatabasePath({}, now);
  const second = demoDatabasePath({}, now);
  assert.match(first, /^\.runtime\/demo-20261013-192021-[a-f0-9]{8}\.sqlite$/);
  assert.notEqual(first, second);
  assert.equal(
    demoDatabasePath({ DATABASE_PATH: ".runtime/saved.sqlite" }, now),
    ".runtime/saved.sqlite",
  );
});
test("session database overrides .env defaults and propagates to child processes", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "relay-session-"));
  const file = path.join(dir, ".env");
  try {
    const content = "DATABASE_PATH=.runtime/relay.sqlite\n";
    await writeFile(file, content);
    const selected = demoDatabasePath({});
    const result = execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        "process.loadEnvFile(process.argv[1]); console.log(process.env.DATABASE_PATH)",
        file,
      ],
      { env: { ...process.env, DATABASE_PATH: selected }, encoding: "utf8" },
    );
    assert.equal(result.trim(), selected);
    assert.equal(await readFile(file, "utf8"), content);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("creates .env once and preserves existing user configuration", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "relay-setup-"));
  try {
    await writeFile(path.join(dir, ".env.example"), "PORT=3003\n");
    await ensureEnv(dir);
    assert.equal(await readFile(path.join(dir, ".env"), "utf8"), "PORT=3003\n");
    await writeFile(path.join(dir, ".env"), "PORT=3999\n");
    await ensureEnv(dir);
    assert.equal(await readFile(path.join(dir, ".env"), "utf8"), "PORT=3999\n");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("rejects an occupied port without stopping its owner", async () => {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  try {
    await assert.rejects(assertFreePort(port), /occupied/);
    assert.equal(server.listening, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  await assertFreePort(port);
});
test("validates options and detects process failure instead of waiting a minute", async () => {
  assert.deepEqual(parseOptions(["--skip-ollama", "--no-open"]), {
    skipOllama: true,
    open: false,
  });
  assert.throws(() => parseOptions(["--skip-tests"]), /Unknown/);
  await assert.rejects(
    waitFor("http://127.0.0.1:1", { exitCode: 1 }, 1000),
    /exited/,
  );
});
test("reuses the installed model without contacting the download registry", async () => {
  for (const [requested, installed] of [
    ["qwen2.5:7b", "qwen2.5:7b"],
    ["qwen2.5", "qwen2.5:latest"],
    ["qwen2.5:latest", "qwen2.5"],
  ]) {
    const result = await ensureOllamaModel(
      "http://127.0.0.1:11434",
      requested,
      async () => assert.fail("Installed models must not be pulled"),
      async (url) => {
        assert.equal(url, "http://127.0.0.1:11434/api/tags");
        return Response.json({ models: [{ name: installed }] });
      },
    );
    assert.equal(result, "installed");
  }
});
test("downloads a missing exact model even when a different tag is installed", async () => {
  let pulls = 0;
  assert.equal(
    await ensureOllamaModel(
      "http://127.0.0.1:11434",
      "qwen2.5:7b",
      async () => {
        pulls++;
      },
      async () => Response.json({ models: [{ name: "qwen2.5:3b" }] }),
    ),
    "downloaded",
  );
  assert.equal(pulls, 1);
});
test("reports download failure and does not silently claim readiness", async () => {
  await assert.rejects(
    ensureOllamaModel(
      "http://127.0.0.1:11434",
      "qwen2.5:7b",
      async () => {
        throw new Error("503 upstream connection terminated");
      },
      async () => Response.json({ models: [] }),
    ),
    /Could not download qwen2\.5:7b: 503.*--skip-ollama/,
  );
});
test("an unavailable or invalid model list stops preparation without pulling", async () => {
  for (const fetcher of [
    async () => {
      throw new Error("offline");
    },
    async () => new Response("unavailable", { status: 503 }),
    async () => Response.json({ models: null }),
  ]) {
    await assert.rejects(
      ensureOllamaModel(
        "http://127.0.0.1:11434",
        "qwen2.5:7b",
        async () => assert.fail("Must not pull when the model list is unknown"),
        fetcher,
      ),
      /Could not check installed Ollama models/,
    );
  }
});
