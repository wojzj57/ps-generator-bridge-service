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
import {
  ensureGeneratorRuntime,
  GENERATOR_PACKAGE,
  type RuntimePackageJson,
} from "./runtimeManager";

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
  runtimeVersion?: string;
}

export interface RuntimeInstallResult {
  targetDir: string;
  version: string;
}

export type RuntimeTargetState = "missing" | "empty" | "managed" | "unmanaged";

type GeneratorPackageJson = RuntimePackageJson;

export function setupGeneratorRuntime(options: SetupOptions = {}): RuntimeInstallResult {
  const sourceDir = ensureGeneratorRuntime({ version: options.runtimeVersion }).packageDir;
  const sourcePackage = readPackageJson(join(sourceDir, "package.json"));
  const targetDir = resolve(options.dir ?? DEFAULT_INSTALL_DIR);

  validateRuntimeFiles(sourceDir);
  prepareRuntimeTarget(targetDir, options.overwriteUnmanaged ?? false);
  copyRuntimeFiles(sourceDir, targetDir, sourcePackage);
  copyRuntimeDependencies(sourceDir, targetDir);

  return { targetDir, version: sourcePackage.version };
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

export function copyRuntimeDependencies(sourceDir: string, targetDir: string): void {
  const runtimeRoot = dirname(dirname(dirname(sourceDir)));
  const sourceNodeModules = join(runtimeRoot, "node_modules");
  if (!existsSync(sourceNodeModules)) {
    throw new Error(`Generator runtime cache has no installed dependencies: ${sourceNodeModules}`);
  }

  const targetNodeModules = join(targetDir, "node_modules");
  cpSync(sourceNodeModules, targetNodeModules, { recursive: true });
  rmSync(join(targetNodeModules, "@ps-generator-bridge", "generator"), {
    recursive: true,
    force: true,
  });

  const nestedDependencies = join(sourceDir, "node_modules");
  if (existsSync(nestedDependencies)) {
    cpSync(nestedDependencies, targetNodeModules, { recursive: true });
  }
}
