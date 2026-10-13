import { spawn } from "node:child_process";
import {
  copyFile,
  mkdir,
  access,
  mkdtemp,
  rm,
  open,
  rename,
} from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";
import { randomUUID } from "node:crypto";

export function demoDatabasePath(env = process.env, now = new Date()) {
  if (env.DATABASE_PATH) return env.DATABASE_PATH;
  const pad = (value) => String(value).padStart(2, "0");
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `.runtime/demo-${date}-${time}-${randomUUID().slice(0, 8)}.sqlite`;
}

export async function ensureEnv(root) {
  try {
    await copyFile(
      path.join(root, ".env.example"),
      path.join(root, ".env"),
      constants.COPYFILE_EXCL,
    );
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
}
export async function assertFreePort(port) {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", () =>
      reject(
        new Error(
          `Port ${port} is occupied. Stop that server or set PORT in .env. No existing process was stopped.`,
        ),
      ),
    );
    server.listen(port, "127.0.0.1", () => server.close(resolve));
  });
}
export function parseOptions(args) {
  if (args.some((arg) => !["--skip-ollama", "--no-open"].includes(arg)))
    throw new Error("Unknown option. Use --skip-ollama and/or --no-open.");
  return {
    skipOllama: args.includes("--skip-ollama"),
    open: !args.includes("--no-open"),
  };
}
export async function reachable(url) {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(2000) })).ok;
  } catch {
    return false;
  }
}
export async function ensureOllamaModel(host, model, pull, fetcher = fetch) {
  let models;
  try {
    const response = await fetcher(`${host}/api/tags`, {
      signal: AbortSignal.timeout(5000),
      redirect: "error",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json();
    if (!Array.isArray(body?.models)) throw new Error("Invalid model list");
    models = body.models;
  } catch {
    throw new Error(
      "Could not check installed Ollama models. Check the service and OLLAMA_HOST, then rerun setup.",
    );
  }
  const canonical = (name) => (name.includes(":") ? name : `${name}:latest`);
  const installed = models.some((entry) => {
    const name = entry?.name || entry?.model;
    return typeof name === "string" && canonical(name) === canonical(model);
  });
  if (installed) return "installed";
  try {
    await pull();
  } catch (error) {
    throw new Error(
      `Could not download ${model}: ${error.message}. Check the download error above for registry, network/proxy or disk problems, then rerun setup. --skip-ollama starts Relay without preparing a local model.`,
    );
  }
  return "downloaded";
}
export async function waitFor(url, child, milliseconds = 60000) {
  const deadline = Date.now() + milliseconds;
  while (Date.now() < deadline) {
    if (child && (child.exitCode !== null || child.signalCode !== null))
      throw new Error(
        "Started process exited before becoming ready. Check its log in .runtime.",
      );
    if (await reachable(url)) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(
    `Service did not become ready at ${url}. Check .runtime logs and rerun.`,
  );
}
async function exists(file) {
  try {
    await access(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
async function main() {
  const options = parseOptions(process.argv.slice(2));
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  process.chdir(root);
  process.env.PATH = `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH || ""}`;
  const owned = new Set();
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await Promise.all(
      [...owned].map(
        (child) =>
          new Promise((resolve) => {
            if (
              !child.pid ||
              child.exitCode !== null ||
              child.signalCode !== null
            )
              return resolve();
            const kill = (signal) => {
              try {
                process.kill(
                  process.platform === "win32" ? child.pid : -child.pid,
                  signal,
                );
              } catch (error) {
                if (error.code !== "ESRCH") throw error;
              }
            };
            child.once("exit", resolve);
            kill("SIGTERM");
            const timer = setTimeout(() => kill("SIGKILL"), 5000);
            timer.unref();
            child.once("exit", () => clearTimeout(timer));
          }),
      ),
    );
  };
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, async () => {
      await stop();
      process.exit(signal === "SIGINT" ? 130 : 143);
    });
  function launch(command, args, options = {}) {
    const child = spawn(command, args, {
      stdio: "inherit",
      detached: process.platform !== "win32",
      ...options,
    });
    owned.add(child);
    child.once("exit", () => owned.delete(child));
    return child;
  }
  async function run(command, args) {
    const child = launch(command, args);
    await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) =>
        code === 0
          ? resolve()
          : reject(
              new Error(
                `${command} ${args[0] || ""} failed (${signal || code}). Setup stopped.`,
              ),
            ),
      );
    });
  }
  let temp;
  try {
    await ensureEnv(root);
    // Set before loading .env so its persistent default cannot reuse a demo inbox.
    // An explicit shell override still allows resuming a selected saved session.
    process.env.DATABASE_PATH = demoDatabasePath();
    process.loadEnvFile(".env");
    const port = Number(process.env.PORT || 3003);
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw new Error("PORT must be between 1 and 65535.");
    await assertFreePort(port);
    console.log(`\nMailbox database: ${process.env.DATABASE_PATH}`);
    console.log("\nInstalling dependencies from package-lock.json...");
    await run("npm", ["ci", "--include=dev"]);
    console.log("\nRunning tests and building the application...");
    await run("npm", ["test"]);
    await run(process.execPath, ["--test", "scripts/demo-checks.mjs"]);
    await run("npm", ["run", "build"]);
    // Reuse the application's validation and model allowlist, without printing keys.
    const { loadSettings } =
      await import("../dist/server/src/server/config.js");
    const settings = loadSettings();
    if (!options.skipOllama) {
      const host = settings.ollamaHost;
      let cli;
      for (const candidate of [
        "/Applications/Ollama.app/Contents/Resources/ollama",
        path.join(root, ".runtime/tools/Ollama.app/Contents/Resources/ollama"),
        path.join(root, ".runtime/tools/ollama/bin/ollama"),
      ]) {
        if (await exists(candidate)) {
          cli = candidate;
          break;
        }
      }
      if (!cli) {
        for (const dir of process.env.PATH.split(path.delimiter)) {
          const candidate = path.join(dir, "ollama");
          if (await exists(candidate)) {
            cli = candidate;
            break;
          }
        }
      }
      if (!cli) {
        console.log(
          "\nDownloading Ollama into .runtime/tools (no administrator password)...",
        );
        await mkdir(".runtime/tools", { recursive: true });
        temp = await mkdtemp(
          path.join(root, ".runtime/tools/ollama-download-"),
        );
        if (process.platform === "darwin") {
          const archive = path.join(temp, "ollama.zip");
          await run("curl", [
            "-fL",
            "--retry",
            "2",
            "--connect-timeout",
            "20",
            "-o",
            archive,
            "https://ollama.com/download/Ollama-darwin.zip",
          ]);
          await run("unzip", ["-q", archive, "-d", temp]);
          await rm(path.join(root, ".runtime/tools/Ollama.app"), {
            recursive: true,
            force: true,
          });
          await rename(
            path.join(temp, "Ollama.app"),
            path.join(root, ".runtime/tools/Ollama.app"),
          );
          cli = path.join(
            root,
            ".runtime/tools/Ollama.app/Contents/Resources/ollama",
          );
        } else if (
          process.platform === "linux" &&
          ["x64", "arm64"].includes(process.arch)
        ) {
          const archive = path.join(temp, "ollama.tar.zst");
          const arch = process.arch === "x64" ? "amd64" : "arm64";
          await run("curl", [
            "-fL",
            "--retry",
            "2",
            "--connect-timeout",
            "20",
            "-o",
            archive,
            `https://ollama.com/download/ollama-linux-${arch}.tar.zst`,
          ]);
          const extracted = path.join(temp, "extracted");
          await mkdir(extracted);
          await run("tar", ["--zstd", "-xf", archive, "-C", extracted]);
          await rm(path.join(root, ".runtime/tools/ollama"), {
            recursive: true,
            force: true,
          });
          await rename(extracted, path.join(root, ".runtime/tools/ollama"));
          cli = path.join(root, ".runtime/tools/ollama/bin/ollama");
        } else
          throw new Error(
            "Automatic Ollama installation supports macOS and Linux x64/arm64. Use --skip-ollama on other platforms.",
          );
      }
      if (!(await exists(cli)))
        throw new Error(
          "Ollama CLI is missing after installation. Rerun setup or use --skip-ollama.",
        );
      process.env.OLLAMA_HOST = host;
      if (!(await reachable(`${host}/api/tags`))) {
        console.log("\nStarting local Ollama...");
        const log = await open(".runtime/ollama-demo.log", "a", 0o600);
        const service = launch(cli, ["serve"], {
          stdio: ["ignore", log.fd, log.fd],
        });
        service.on("error", (error) =>
          console.error("Could not start Ollama:", error.message),
        );
        await log.close();
        await waitFor(`${host}/api/tags`, service);
      } else console.log("\nReusing the running Ollama service.");
      const model = settings.providers.find(
        (provider) => provider.id === "ollama",
      ).models[0];
      if (!model)
        throw new Error("OLLAMA_MODELS must contain at least one model.");
      console.log(`\nChecking whether ${model} is already installed...`);
      const preparation = await ensureOllamaModel(host, model, async () => {
        console.log(
          `\nDownloading ${model}. The first download may take several minutes...`,
        );
        await run(cli, ["pull", model]);
      });
      if (preparation === "installed")
        console.log(`Reusing installed ${model}; no model download needed.`);
      console.log("\nLocal AI is ready. Ollama is preselected in the UI.");
    } else
      console.log(
        "\nSkipping Ollama preparation. Configure a cloud provider or start Ollama yourself to analyze emails.",
      );
    await assertFreePort(settings.port);
    console.log(
      "\nStarting the demo. Press Ctrl+C to stop this server and any Ollama process started by this command.",
    );
    const server = launch(process.execPath, [
      "--env-file-if-exists=.env",
      "dist/server/src/server/index.js",
    ]);
    server.on("error", (error) => console.error(error.message));
    const url = `http://127.0.0.1:${settings.port}`;
    await waitFor(`${url}/api/health`, server, 30000);
    console.log(
      `\nDemo ready: ${url}\nMailbox database: ${process.env.DATABASE_PATH}\nPrevious session databases, .env and model files remain saved.`,
    );
    if (options.open && process.platform === "darwin") {
      try {
        await run("open", [url]);
      } catch {
        console.log(
          `Browser opening failed. Open ${url} manually; the demo is still running.`,
        );
      }
    }
    // Remain attached to the actual application process, without an orphaned npm wrapper.
    await new Promise((resolve) => {
      if (server.exitCode !== null || server.signalCode !== null)
        return resolve();
      server.once("exit", resolve);
    });
    if (server.exitCode) process.exitCode = server.exitCode;
  } catch (error) {
    console.error(
      `\nSetup failed: ${error.message}\nResolve the issue and rerun the same command. To skip local model preparation, use --skip-ollama.`,
    );
    process.exitCode = 1;
  } finally {
    await stop();
    if (temp) await rm(temp, { recursive: true, force: true });
  }
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await main();
