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
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { builtinModules, createRequire } from "node:module";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SHARP_VERSION = "0.32.6";
const SIZE_WARNING_BYTES = 35 * 1024 * 1024;
const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vendorDir = join(packageDir, "vendor");
const vendorNodeModules = join(vendorDir, "node_modules");
const packageRequire = createRequire(join(packageDir, "package.json"));

interface PackageManifest {
  name: string;
  version: string;
  dependencies?: Record<string, string>;
}

interface ResolvedPackage {
  manifest: PackageManifest;
  packageDir: string;
  packageJson: string;
}

export function prepareRuntimePack(): void {
  assertWindowsX64();
  cleanRuntimePack();
  mkdirSync(vendorNodeModules, { recursive: true });
  writeFileSync(join(vendorDir, "package.json"), '{"private":true}\n');

  const sharpPackage = resolvePackage("sharp", packageRequire);
  if (sharpPackage.manifest.version !== SHARP_VERSION) {
    throw new Error(
      `Expected sharp ${SHARP_VERSION}, found ${sharpPackage.manifest.version} at ${sharpPackage.packageDir}`
    );
  }

  copySharpRuntime(sharpPackage.packageDir, join(vendorNodeModules, "sharp"));
  copyRuntimeDependencyClosure(sharpPackage, ["color", "detect-libc", "semver"]);
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
  rmSync(vendorDir, { recursive: true, force: true });
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
        return { manifest, packageDir: current, packageJson };
      }
    }
    const parent = dirname(current);
    if (parent === current) throw new Error(`Unable to find package root for ${name}`);
    current = parent;
  }
}

function copyRuntimeDependencyClosure(root: ResolvedPackage, directDependencies: string[]): void {
  const queue = directDependencies.map((name) => ({
    name,
    from: createRequire(root.packageJson),
  }));
  const copied = new Map<string, string>();

  while (queue.length > 0) {
    const next = queue.shift() as { name: string; from: NodeJS.Require };
    const dependency = resolvePackage(next.name, next.from);
    const copiedVersion = copied.get(dependency.manifest.name);
    if (copiedVersion) {
      if (copiedVersion !== dependency.manifest.version) {
        throw new Error(
          `Vendor dependency conflict for ${dependency.manifest.name}: ${copiedVersion} and ${dependency.manifest.version}`
        );
      }
      continue;
    }

    copyPackage(dependency.packageDir, packageTarget(dependency.manifest.name));
    copied.set(dependency.manifest.name, dependency.manifest.version);
    const dependencyRequire = createRequire(dependency.packageJson);
    for (const name of Object.keys(dependency.manifest.dependencies ?? {})) {
      queue.push({ name, from: dependencyRequire });
    }
  }
}

function packageTarget(name: string): string {
  return join(vendorNodeModules, ...name.split("/"));
}

function copyPackage(source: string, target: string): void {
  mkdirSync(dirname(target), { recursive: true });
  cpSync(source, target, {
    recursive: true,
    dereference: true,
    filter(path) {
      const part = relative(source, path).split(sep)[0];
      return part !== "node_modules";
    },
  });
}

function copySharpRuntime(source: string, target: string): void {
  mkdirSync(target, { recursive: true });
  const files = ["LICENSE", "README.md", "package.json"];
  const directories = ["lib", join("build", "Release")];
  for (const file of files) cpSync(join(source, file), join(target, file), { recursive: true });
  for (const directory of directories) {
    cpSync(join(source, directory), join(target, directory), { recursive: true });
  }

  const manifest = JSON.parse(readFileSync(join(source, "package.json"), "utf8")) as {
    config?: { libvips?: string };
  };
  const libvips = manifest.config?.libvips;
  if (!libvips) throw new Error("sharp package does not declare config.libvips");
  const sourcePlatform = join(source, "vendor", libvips, "win32-x64");
  const targetPlatform = join(target, "vendor", libvips, "win32-x64");
  mkdirSync(targetPlatform, { recursive: true });
  for (const file of ["platform.json", "versions.json", "THIRD-PARTY-NOTICES.md"]) {
    cpSync(join(sourcePlatform, file), join(targetPlatform, file));
  }
}

function assertSharpNativeFiles(): void {
  const sharpDir = join(vendorNodeModules, "sharp");
  const required = [
    join(sharpDir, "build", "Release", "sharp-win32-x64.node"),
    join(sharpDir, "build", "Release", "libvips-42.dll"),
    join(sharpDir, "vendor", "8.14.5", "win32-x64", "versions.json"),
  ];
  for (const path of required) {
    if (!existsSync(path)) throw new Error(`Missing sharp runtime file: ${path}`);
  }
}

function verifyIsolatedRuntime(): void {
  const root = mkdtempSync(join(tmpdir(), "ps-bridge-packed-runtime-"));
  try {
    for (const name of ["dist", "jsx", "vendor", "main.js", "package.json"]) {
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
  return ["dist", "jsx", "vendor", "main.js", "package.json"]
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
