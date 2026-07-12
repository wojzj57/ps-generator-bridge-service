import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

const require = createRequire(import.meta.url);
const GENERATOR_PACKAGE = "@ps-generator-bridge/generator";
const DEFAULT_INSTALL_DIR = "generator-bridge";
const RUNTIME_FILES = [
  "dist",
  "jsx",
  "main.js",
  ".env.example",
  "CHANGELOG.md",
  "README.md",
  "README_zh.md",
] as const;
const MANAGED_ENTRIES = [...RUNTIME_FILES, "node_modules"] as const;

export interface SetupOptions {
  dir?: string;
  overwriteUnmanaged?: boolean;
}

export interface RuntimeInstallResult {
  targetDir: string;
  version: string;
}

export type RuntimeTargetState = "missing" | "empty" | "managed" | "unmanaged";

interface GeneratorPackageJson {
  name: string;
  version: string;
  description?: string;
  license?: string;
  homepage?: string;
  repository?: unknown;
  bugs?: unknown;
  keywords?: string[];
  main?: string;
  types?: string;
  exports?: unknown;
  dependencies?: Record<string, string>;
  "generator-core-version"?: string;
}

export function setupGeneratorRuntime(options: SetupOptions = {}): RuntimeInstallResult {
  const sourceDir = resolveGeneratorPackageDir();
  const sourcePackage = readPackageJson(join(sourceDir, "package.json"));
  const targetDir = resolve(options.dir ?? DEFAULT_INSTALL_DIR);

  validateRuntimeFiles(sourceDir);
  prepareRuntimeTarget(targetDir, options.overwriteUnmanaged ?? false);
  copyRuntimeFiles(sourceDir, targetDir, sourcePackage);
  installProductionDependencies(targetDir);

  return { targetDir, version: sourcePackage.version };
}

function resolveGeneratorPackageDir(): string {
  return resolve(require.resolve(`${GENERATOR_PACKAGE}/package.json`), "..");
}

function readPackageJson(path: string): GeneratorPackageJson {
  return JSON.parse(readFileSync(path, "utf8")) as GeneratorPackageJson;
}

export function inspectRuntimeTarget(targetDir: string): RuntimeTargetState {
  if (!existsSync(targetDir)) return "missing";
  if (readdirSync(targetDir).length === 0) return "empty";
  return isManagedGeneratorDir(targetDir) ? "managed" : "unmanaged";
}

export function prepareRuntimeTarget(targetDir: string, overwriteUnmanaged = false): void {
  const state = inspectRuntimeTarget(targetDir);
  if (state === "missing") {
    mkdirSync(targetDir, { recursive: true });
    return;
  }
  if (state === "empty") return;
  if (state === "managed") {
    for (const name of MANAGED_ENTRIES) {
      rmSync(join(targetDir, name), { recursive: true, force: true });
    }
    return;
  }
  if (overwriteUnmanaged) {
    rmSync(targetDir, { recursive: true, force: true });
    mkdirSync(targetDir, { recursive: true });
    return;
  }

  throw new Error(
    `Refusing to overwrite a non-empty directory that is not a generator runtime: ${targetDir}`
  );
}

function isManagedGeneratorDir(targetDir: string): boolean {
  const packageJson = join(targetDir, "package.json");
  if (!existsSync(packageJson)) return false;
  try {
    const pkg = JSON.parse(readFileSync(packageJson, "utf8")) as { name?: unknown };
    return pkg.name === GENERATOR_PACKAGE;
  } catch {
    return false;
  }
}

function validateRuntimeFiles(sourceDir: string): void {
  for (const name of RUNTIME_FILES) {
    const source = join(sourceDir, name);
    if (!existsSync(source)) {
      throw new Error(`Generator package is missing required runtime file: ${source}`);
    }
  }
}

function copyRuntimeFiles(
  sourceDir: string,
  targetDir: string,
  sourcePackage: GeneratorPackageJson
): void {
  for (const name of RUNTIME_FILES) {
    const source = join(sourceDir, name);
    cpSync(source, join(targetDir, name), { recursive: true });
  }

  const runtimePackage: GeneratorPackageJson = {
    name: sourcePackage.name,
    version: sourcePackage.version,
    description: sourcePackage.description,
    license: sourcePackage.license,
    homepage: sourcePackage.homepage,
    repository: sourcePackage.repository,
    bugs: sourcePackage.bugs,
    keywords: sourcePackage.keywords,
    main: sourcePackage.main ?? "main.js",
    types: sourcePackage.types,
    exports: sourcePackage.exports,
    dependencies: sourcePackage.dependencies ?? {},
    "generator-core-version": sourcePackage["generator-core-version"],
  };
  writeFileSync(join(targetDir, "package.json"), `${JSON.stringify(runtimePackage, null, 2)}\n`);
}

function installProductionDependencies(targetDir: string): void {
  const npmCli = resolveNpmCli();
  if (npmCli) {
    execFileSync(
      process.execPath,
      [npmCli, "install", "--omit=dev", "--package-lock=false", "--no-audit", "--no-fund"],
      {
        cwd: targetDir,
        stdio: "inherit",
      }
    );
    return;
  }

  execFileSync(
    "npm",
    ["install", "--omit=dev", "--package-lock=false", "--no-audit", "--no-fund"],
    {
      cwd: targetDir,
      stdio: "inherit",
    }
  );
}

function resolveNpmCli(): string | undefined {
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath && /npm-cli\.js$/i.test(npmExecPath) && existsSync(npmExecPath)) {
    return npmExecPath;
  }

  const nodeDir = dirname(process.execPath);
  const bundledNpm = join(nodeDir, "node_modules", "npm", "bin", "npm-cli.js");
  if (existsSync(bundledNpm)) return bundledNpm;

  try {
    return require.resolve("npm/bin/npm-cli.js");
  } catch {
    return undefined;
  }
}
