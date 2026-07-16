import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { builtinModules, createRequire } from "node:module";
import { basename, dirname, extname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SHARP_VERSION = "0.32.6";
const SIZE_WARNING_BYTES = 35 * 1024 * 1024;
const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const nativeDir = join(packageDir, "native");
const legacyVendorDir = join(packageDir, "vendor");
const packageRequire = createRequire(join(packageDir, "package.json"));

interface PackageManifest {
  name: string;
  version: string;
}

interface ResolvedPackage {
  manifest: PackageManifest;
  packageDir: string;
}

export function prepareRuntimePack(): void {
  assertWindowsX64();
  cleanRuntimePack();
  mkdirSync(nativeDir, { recursive: true });

  const sharpPackage = resolvePackage("sharp", packageRequire);
  if (sharpPackage.manifest.version !== SHARP_VERSION) {
    throw new Error(
      `Expected sharp ${SHARP_VERSION}, found ${sharpPackage.manifest.version} at ${sharpPackage.packageDir}`
    );
  }

  copySharpNativeRuntime(sharpPackage.packageDir);
  assertSharpNativeFiles();
  auditBundleRequires(join(packageDir, "dist"));
  verifyIsolatedRuntime();

  const bytes = runtimeSizeBytes();
  if (bytes > SIZE_WARNING_BYTES) {
    console.warn(
      `[generator-pack] runtime is ${(bytes / 1024 / 1024).toFixed(2)} MiB, above the 35 MiB warning threshold`
    );
  }
}

export function cleanRuntimePack(): void {
  rmSync(nativeDir, { recursive: true, force: true });
  rmSync(legacyVendorDir, { recursive: true, force: true });
}

export function auditBundleRequires(distDir: string): void {
  const builtins = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)]);
  const disallowed = new Set<string>();
  const metafilePath = join(distDir, "metafile-cjs.json");
  if (!existsSync(metafilePath)) {
    throw new Error(`Missing tsup metafile: ${metafilePath}`);
  }
  const metafile = JSON.parse(readFileSync(metafilePath, "utf8")) as {
    outputs?: Record<string, { imports?: Array<{ external?: boolean; path: string }> }>;
  };
  const outputs = Object.values(metafile.outputs ?? {});
  if (outputs.length === 0) {
    throw new Error(`Tsup metafile contains no bundle outputs: ${metafilePath}`);
  }

  for (const output of outputs) {
    for (const imported of output.imports ?? []) {
      if (imported.external && !builtins.has(imported.path)) disallowed.add(imported.path);
    }
  }

  if (disallowed.size > 0) {
    throw new Error(
      `Standalone bundle contains external runtime imports: ${[...disallowed].sort().join(", ")}`
    );
  }
}

function assertWindowsX64(): void {
  if (process.platform !== "win32" || process.arch !== "x64") {
    throw new Error(
      `Generator runtime packs must be built on win32-x64, received ${process.platform}-${process.arch}`
    );
  }
}

function resolvePackage(name: string, from: NodeJS.Require): ResolvedPackage {
  const entry = realpathSync(from.resolve(name));
  let current = dirname(entry);
  while (true) {
    const packageJson = join(current, "package.json");
    if (existsSync(packageJson)) {
      const manifest = JSON.parse(readFileSync(packageJson, "utf8")) as PackageManifest;
      if (manifest.name === name) {
        return { manifest, packageDir: current };
      }
    }
    const parent = dirname(current);
    if (parent === current) throw new Error(`Unable to find package root for ${name}`);
    current = parent;
  }
}

function copySharpNativeRuntime(source: string): void {
  const releaseDir = join(source, "build", "Release");
  const nativeFiles = readdirSync(releaseDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && [".dll", ".node"].includes(extname(entry.name)))
    .map((entry) => entry.name);
  if (nativeFiles.length === 0) {
    throw new Error(`Sharp native runtime is empty: ${releaseDir}`);
  }
  for (const file of nativeFiles) cpSync(join(releaseDir, file), join(nativeDir, file));

  const manifest = JSON.parse(readFileSync(join(source, "package.json"), "utf8")) as {
    config?: { libvips?: string };
  };
  const libvips = manifest.config?.libvips;
  if (!libvips) throw new Error("sharp package does not declare config.libvips");
  const sourcePlatform = join(source, "vendor", libvips, "win32-x64");
  for (const file of ["platform.json", "versions.json", "THIRD-PARTY-NOTICES.md"]) {
    cpSync(join(sourcePlatform, file), join(nativeDir, file));
  }
  cpSync(join(source, "LICENSE"), join(nativeDir, "SHARP-LICENSE"));
}

function assertSharpNativeFiles(): void {
  const required = [
    join(nativeDir, "sharp-win32-x64.node"),
    join(nativeDir, "libvips-42.dll"),
    join(nativeDir, "versions.json"),
  ];
  for (const path of required) {
    if (!existsSync(path)) throw new Error(`Missing sharp runtime file: ${path}`);
  }
}

function verifyIsolatedRuntime(): void {
  const root = mkdtempSync(join(tmpdir(), "ps-bridge-packed-runtime-"));
  try {
    for (const name of ["dist", "jsx", "native", "main.js", "package.json"]) {
      cpSync(join(packageDir, name), join(root, name), { recursive: true });
    }
    execFileSync(process.execPath, [join(packageDir, "scripts", "verifyPackedRuntime.mjs"), root], {
      cwd: root,
      env: { ...process.env, NODE_PATH: "" },
      stdio: "inherit",
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runtimeSizeBytes(): number {
  return ["dist", "jsx", "native", "main.js", "package.json"]
    .flatMap((name) => walkFiles(join(packageDir, name)))
    .reduce((total, path) => total + statSync(path).size, 0);
}

function walkFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  if (!statSync(root).isDirectory()) return [root];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? walkFiles(path) : [path];
  });
}

const command = process.argv[2];
if (command === "prepare") {
  prepareRuntimePack();
} else if (command === "clean") {
  cleanRuntimePack();
} else if (basename(process.argv[1] ?? "") === basename(fileURLToPath(import.meta.url))) {
  throw new Error("Usage: tsx scripts/runtimePack.ts <prepare|clean>");
}
