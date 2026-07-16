import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import { Connection, type PluginInfo } from "@ps-generator-bridge/sdk";
import WebSocketImpl from "ws";
import {
  assertGeneratorCoreCompatibility,
  cleanManagedCache,
  ensureGeneratorCore,
  generatorCoreDir,
} from "./generatorCore";
import { ensurePhotoshopRunning } from "./photoshop";
import {
  cleanupPluginSource,
  countPluginCandidates,
  parsePluginPaths,
  preparePluginSource,
} from "./pluginDirs";
import { resolveRemotePassword } from "./remotePassword";
import { ensureGeneratorRuntime } from "./runtimeManager";

const DEFAULT_PORT = 7700;
const DEFAULT_TIMEOUT_MS = 60_000;

export interface HarnessOptions {
  plugin?: string;
  pluginCwd?: boolean;
  pluginsDir?: string;
  runtimeVersion?: string;
  port?: number;
  timeoutMs?: number;
  updateCore?: boolean;
  password?: string;
}

export async function setupGeneratorCore(options: { update?: boolean } = {}): Promise<void> {
  await ensureGeneratorCore({ update: options.update ?? false });
}

export async function runClean(): Promise<void> {
  cleanManagedCache();
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
  const password = resolveRemotePassword(options.password);
  const runtime = ensureGeneratorRuntime({ version: options.runtimeVersion });
  await ensureGeneratorCore({ update: options.updateCore ?? false });
  assertGeneratorCoreCompatibility(runtime, generatorCoreDir());

  const port = options.port ?? DEFAULT_PORT;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pluginSource = await preparePluginSource(options);
  const minimumExpectedCount = countPluginCandidates(
    pluginSource.pluginsDir,
    parsePluginPaths(process.env.PS_BRIDGE_PLUGINS)
  );
  let child: ChildProcess | undefined;

  try {
    child = startGeneratorCore({
      port,
      pluginsDir: pluginSource.pluginsDir,
      hostPluginDir: runtime.packageDir,
      password,
    });
    await waitForHealth(port, timeoutMs);
    const plugins = await readPlugins(port);
    assertMinimumPlugins({ plugins, minimumExpectedCount });
    const info = await smokeServerInfo(port, timeoutMs, runtime.version);
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
    throw new Error("ps-generator-bridge only supports Windows for run/dev in this version.");
  }
}

function startGeneratorCore(options: {
  port: number;
  pluginsDir: string;
  hostPluginDir: string;
  password: string;
}): ChildProcess {
  const app = join(generatorCoreDir(), "app.js");
  console.log(`Starting generator-core: ${app}`);
  const child = spawn(
    process.execPath,
    generatorCoreArguments(app, options.hostPluginDir, options.password),
    {
      cwd: generatorCoreDir(),
      env: {
        ...process.env,
        PS_BRIDGE_PLUGINS_DIR: options.pluginsDir,
        PS_BRIDGE_PORT: String(options.port),
      },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  child.stdout?.on("data", (chunk) => process.stdout.write(chunk));
  child.stderr?.on("data", (chunk) => process.stderr.write(chunk));
  child.on("exit", (code, signal) => {
    if (code !== null && code !== 0) console.error(`generator-core exited with code ${code}`);
    if (signal) console.error(`generator-core exited with signal ${signal}`);
  });
  return child;
}

export function generatorCoreArguments(
  app: string,
  hostPluginDir: string,
  password: string
): string[] {
  return [app, "-f", hostPluginDir, "-P", password];
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

async function smokeServerInfo(port: number, timeoutMs: number, runtimeVersion: string) {
  const connection = new Connection({
    url: `ws://127.0.0.1:${port}`,
    WebSocket: WebSocketImpl as unknown as typeof WebSocket,
    timeoutMs,
    maxRetries: 0,
  });
  try {
    return await connection.getServerInfo();
  } catch (error) {
    throw sdkCompatibilityError(runtimeVersion, error);
  } finally {
    connection.close();
  }
}

export function sdkCompatibilityError(runtimeVersion: string, cause: unknown): Error {
  return new Error(
    `SDK getServerInfo failed against generator runtime ${runtimeVersion}. The runtime may be incompatible with this CLI; upgrade @ps-generator-bridge/cli and retry. ${cause instanceof Error ? cause.message : String(cause)}`
  );
}

export function assertMinimumPlugins(options: {
  plugins: PluginInfo[];
  minimumExpectedCount: number;
}): void {
  if (options.plugins.length < options.minimumExpectedCount) {
    throw new Error(
      `Expected at least ${options.minimumExpectedCount} plugin(s), but host loaded ${options.plugins.length}: ${formatPlugins(options.plugins)}`
    );
  }
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
