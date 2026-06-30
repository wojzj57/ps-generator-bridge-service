import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { Connection, type PluginInfo } from "@ps-generator-bridge/sdk";
import WebSocketImpl from "ws";
import { ensureGeneratorCore, generatorCoreDir } from "./generatorCore";
import { ensurePhotoshopRunning } from "./photoshop";
import { cleanupPluginSource, preparePluginSource, scanPluginCandidates } from "./pluginDirs";

const DEFAULT_PORT = 7700;
const DEFAULT_TIMEOUT_MS = 60_000;
const require = createRequire(import.meta.url);

export interface HarnessOptions {
  plugin?: string;
  pluginsDir?: string;
  expectPlugins: string[];
  port?: number;
  timeoutMs?: number;
  updateCore?: boolean;
}

export async function setupGeneratorCore(options: { update?: boolean } = {}): Promise<void> {
  await ensureGeneratorCore({ update: options.update ?? false });
}

export async function runHarness(options: HarnessOptions): Promise<void> {
  await withHarness(options, async (ctx) => {
    console.log(`PS Generator Bridge server ready: http://127.0.0.1:${ctx.port}`);
    console.log(`Loaded plugins: ${formatPlugins(ctx.plugins)}`);
  });
}

export async function runDev(options: HarnessOptions): Promise<void> {
  await withHarness(options, async (ctx) => {
    console.log(`PS Generator Bridge dev server ready: http://127.0.0.1:${ctx.port}`);
    console.log(`WebSocket: ws://127.0.0.1:${ctx.port}/ws`);
    console.log(`Loaded plugins: ${formatPlugins(ctx.plugins)}`);
    console.log("Press Ctrl+C to stop generator-core.");
    await waitForInterrupt();
  });
}

async function withHarness(
  options: HarnessOptions,
  body: (ctx: { port: number; plugins: PluginInfo[] }) => Promise<void>
): Promise<void> {
  ensureWindows();
  ensurePhotoshopRunning();
  await ensureGeneratorCore({ update: options.updateCore ?? false });

  const port = options.port ?? DEFAULT_PORT;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pluginSource = await preparePluginSource(options);
  const expectedCount = scanPluginCandidates(pluginSource.pluginsDir).length;
  let child: ChildProcess | undefined;

  try {
    child = startGeneratorCore({
      port,
      pluginsDir: pluginSource.pluginsDir,
      hostPluginDir: resolveHostGeneratorDir(),
    });
    await waitForHealth(port, timeoutMs);
    const plugins = await readPlugins(port);
    assertPlugins({ plugins, expectedCount, expectPlugins: options.expectPlugins });
    const info = await smokeServerInfo(port, timeoutMs);
    console.log(
      `Server info: ${info.name} ${info.version}${info.psVersion ? `, Photoshop ${info.psVersion}` : ""}`
    );
    await body({ port, plugins });
  } finally {
    if (child) stopProcessTree(child);
    await cleanupPluginSource(pluginSource);
  }
}

function ensureWindows(): void {
  if (process.platform !== "win32") {
    throw new Error("ps-bridge-test only supports Windows in this version.");
  }
}

function startGeneratorCore(options: {
  port: number;
  pluginsDir: string;
  hostPluginDir: string;
}): ChildProcess {
  const app = join(generatorCoreDir(), "app.js");
  console.log(`Starting generator-core: ${app}`);
  const child = spawn(process.execPath, [app, "-f", options.hostPluginDir], {
    cwd: generatorCoreDir(),
    env: {
      ...process.env,
      PS_BRIDGE_PLUGINS_DIR: options.pluginsDir,
      PS_BRIDGE_PORT: String(options.port),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (chunk) => process.stdout.write(chunk));
  child.stderr?.on("data", (chunk) => process.stderr.write(chunk));
  child.on("exit", (code, signal) => {
    if (code !== null && code !== 0) console.error(`generator-core exited with code ${code}`);
    if (signal) console.error(`generator-core exited with signal ${signal}`);
  });
  return child;
}

async function waitForHealth(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const url = `http://127.0.0.1:${port}/health`;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Keep polling until timeout.
    }
    await delay(500);
  }
  throw new Error(
    "Photoshop is running, but PS Generator Bridge server did not become ready. Verify Generator and Remote Connections are enabled."
  );
}

async function readPlugins(port: number): Promise<PluginInfo[]> {
  const response = await fetch(`http://127.0.0.1:${port}/plugins`);
  if (!response.ok) throw new Error(`GET /plugins failed with HTTP ${response.status}`);
  const body = (await response.json()) as { plugins?: PluginInfo[] };
  return Array.isArray(body.plugins) ? body.plugins : [];
}

async function smokeServerInfo(port: number, timeoutMs: number) {
  const connection = new Connection({
    url: `ws://127.0.0.1:${port}/ws`,
    WebSocket: WebSocketImpl as unknown as typeof WebSocket,
    timeoutMs,
    maxRetries: 0,
  });
  try {
    return await connection.getServerInfo();
  } finally {
    connection.close();
  }
}

function assertPlugins(options: {
  plugins: PluginInfo[];
  expectedCount: number;
  expectPlugins: string[];
}): void {
  const ids = new Set(options.plugins.map((plugin) => plugin.id));
  if (options.plugins.length !== options.expectedCount) {
    throw new Error(
      `Expected ${options.expectedCount} plugin(s), but host loaded ${options.plugins.length}: ${formatPlugins(options.plugins)}`
    );
  }
  for (const id of options.expectPlugins) {
    if (!ids.has(id)) throw new Error(`Expected plugin '${id}' was not loaded.`);
  }
}

function resolveHostGeneratorDir(): string {
  return dirname(require.resolve("@ps-generator-bridge/generator"));
}

function stopProcessTree(child: ChildProcess): void {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform === "win32") {
    execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  child.kill();
}

function formatPlugins(plugins: PluginInfo[]): string {
  return plugins.length > 0 ? plugins.map((plugin) => plugin.id).join(", ") : "(none)";
}

function waitForInterrupt(): Promise<void> {
  return new Promise((resolve) => {
    process.once("SIGINT", resolve);
    process.once("SIGTERM", resolve);
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
