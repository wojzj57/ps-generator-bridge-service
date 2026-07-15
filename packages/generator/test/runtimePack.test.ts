import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { auditBundleRequires } from "../scripts/runtimePack";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function writeMetafile(imports: Array<{ external: boolean; path: string }>): string {
  const root = mkdtempSync(join(tmpdir(), "ps-bridge-metafile-"));
  roots.push(root);
  mkdirSync(root, { recursive: true });
  writeFileSync(
    join(root, "metafile-cjs.json"),
    JSON.stringify({ outputs: { "dist/index.js": { imports } } })
  );
  return root;
}

describe("auditBundleRequires", () => {
  it("rejects metafiles without bundle outputs", () => {
    const root = mkdtempSync(join(tmpdir(), "ps-bridge-metafile-"));
    roots.push(root);
    writeFileSync(join(root, "metafile-cjs.json"), JSON.stringify({ outputs: {} }));

    expect(() => auditBundleRequires(root)).toThrow("Tsup metafile contains no bundle outputs");
  });

  it("allows Node built-ins and bundled imports", () => {
    const dist = writeMetafile([
      { external: true, path: "node:path" },
      { external: true, path: "events" },
      { external: false, path: "fastify" },
    ]);

    expect(() => auditBundleRequires(dist)).not.toThrow();
  });

  it("rejects third-party external imports", () => {
    const dist = writeMetafile([{ external: true, path: "fastify" }]);

    expect(() => auditBundleRequires(dist)).toThrow(
      "Standalone bundle contains external runtime imports: fastify"
    );
  });
});
