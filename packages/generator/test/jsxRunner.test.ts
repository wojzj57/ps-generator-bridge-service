import { join } from "node:path";
import { rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { describe, it, expect, afterEach } from "vitest";
import { JsxRunner } from "../src/utils/jsxRunner";
import type { Logger } from "@ps-generator-bridge/sdk/plugin";
import { fakeGenerator } from "./fakeGenerator";

const silentLogger: Logger = { debug() {}, info() {}, warn() {}, error() {} };

// Real source polyfills tree (packages/generator/jsx/polyfills). Vitest runs
// the source file directly, so __dirname-based resolution can't reach the
// package-root runtime tree — point at source.
const SOURCE_POLYFILLS = join(__dirname, "..", "jsx", "polyfills");

// Per-test scratch dir for init() edge-case tests (missing/empty/corrupt).
const SCRATCH = join(tmpdir(), "jsxrunner-init");
let scratchCounter = 0;
const nextScratch = () => join(SCRATCH, String(++scratchCounter));

afterEach(async () => {
  await rm(SCRATCH, { recursive: true, force: true });
});

describe("JsxRunner.run", () => {
  it("returns the jsx value verbatim without JSON.parse", async () => {
    const generator = fakeGenerator();
    const json = '{"id":1,"name":"layer"}';
    generator.onEvaluateJSXString = () => json;
    const runner = new JsxRunner(generator, silentLogger);

    const result = await runner.execute("Document/getDocumentInfo");
    // Still a string — the seam never parses for the caller.
    expect(result).toBe(json);
  });

  it("passes through non-Error objects unchanged", async () => {
    const generator = fakeGenerator();
    const value = { bounds: [0, 0, 10, 10] };
    generator.onEvaluateJSXString = () => value;
    const runner = new JsxRunner(generator, silentLogger);

    expect(await runner.execute("Document/getDocumentInfo")).toBe(value);
  });

  it("throws with the message after the Error: prefix", async () => {
    const generator = fakeGenerator();
    generator.onEvaluateJSXString = () => "Error:boom";
    const runner = new JsxRunner(generator, silentLogger);

    await expect(runner.execute("Document/getDocumentInfo")).rejects.toThrow("boom");
  });

  it("does not treat a value merely containing 'Error:' as a failure", async () => {
    const generator = fakeGenerator();
    generator.onEvaluateJSXString = () => "note: Error:not-a-prefix";
    const runner = new JsxRunner(generator, silentLogger);

    expect(await runner.execute("Document/getDocumentInfo")).toBe("note: Error:not-a-prefix");
  });

  it("loads a named file and injects params into the safe script", async () => {
    const generator = fakeGenerator();
    generator.onEvaluateJSXString = () => undefined;
    const runner = new JsxRunner(generator, silentLogger);

    await runner.execute("Document/getDocumentInfo", { id: 1 }, true);

    expect(generator.jsxStringCalls).toHaveLength(1);
    expect(generator.jsxStringCalls[0]?.script).toContain('var params = {"id":1};');
    expect(generator.jsxStringCalls[0]?.script).toContain("JSON.stringify");
  });

  it("resolves to undefined when the hook is absent", async () => {
    const generator = fakeGenerator();
    const runner = new JsxRunner(generator, silentLogger);

    expect(await runner.execute("Document/getDocumentInfo")).toBeUndefined();
    expect(generator.jsxStringCalls[0]?.script).toContain("var params = {};");
  });
});

describe("JsxRunner.forPlugin (scoped jsx)", () => {
  const PLUGIN_DIR = join(tmpdir(), "plugin-jsx");

  it("execute resolves '<name>' under the plugin dir and forwards params + sharedEngineSafe", async () => {
    const generator = fakeGenerator();
    const dir = nextScratch();
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "landSingle.jsx"), "true;", { encoding: "utf8" });
    const scopedFromScratch = new JsxRunner(generator, silentLogger).forPlugin(dir);
    await scopedFromScratch.execute("landSingle", { id: 1 }, true);

    expect(generator.jsxStringCalls[0]?.script).toContain('var params = {"id":1};');
    expect(generator.jsxStringCalls[0]?.script).toContain("true;");
  });

  it("execute resolves nested names under the plugin dir", async () => {
    const generator = fakeGenerator();
    const dir = nextScratch();
    await mkdir(join(dir, "sub"), { recursive: true });
    await writeFile(join(dir, "sub", "deep.jsx"), "7;", { encoding: "utf8" });
    const scoped = new JsxRunner(generator, silentLogger).forPlugin(dir);

    await scoped.execute("sub/deep");

    expect(generator.jsxStringCalls[0]?.script).toContain("7;");
  });

  it("executeBuiltin resolves under the built-in jsx tree, not the plugin dir", async () => {
    const generator = fakeGenerator();
    generator.onEvaluateJSXString = () => undefined;
    const scoped = new JsxRunner(generator, silentLogger).forPlugin(PLUGIN_DIR);

    await scoped.executeBuiltin("Document/getDocumentInfo", { id: 2 });

    expect(generator.jsxStringCalls[0]?.script).toContain('var params = {"id":2};');
    expect(generator.jsxStringCalls[0]?.script).toContain("documentID");
  });

  it("run delegates to the root (raw script in the default engine)", async () => {
    const generator = fakeGenerator();
    generator.onEvaluateJSXString = () => 7;
    const scoped = new JsxRunner(generator, silentLogger).forPlugin(PLUGIN_DIR);

    expect(await scoped.run("3 + 4")).toBe(7);
    expect(generator.jsxStringCalls[0]?.script).toBe("3 + 4");
  });

  it("normalizes 'Error:'-prefixed results like the root execute", async () => {
    const generator = fakeGenerator();
    generator.onEvaluateJSXString = () => "Error:scoped boom";
    const dir = nextScratch();
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "x.jsx"), "true;", { encoding: "utf8" });
    const scoped = new JsxRunner(generator, silentLogger).forPlugin(dir);

    await expect(scoped.execute("x")).rejects.toThrow("scoped boom");
  });
});

describe("JsxRunner.executeBuiltin (root)", () => {
  it("coincides with execute on the root runner (built-in tree)", async () => {
    const generator = fakeGenerator();
    generator.onEvaluateJSXString = () => undefined;
    const runner = new JsxRunner(generator, silentLogger);

    await runner.executeBuiltin("Layer/getLayerInfo", { id: 3 }, true);

    expect(generator.jsxStringCalls[0]?.script).toContain('var params = {"id":3};');
    expect(generator.jsxStringCalls[0]?.script).toContain("getLayerInfoByID");
  });

  it("includes background-aware selection handling in Layer/getLayerInfo", async () => {
    const generator = fakeGenerator();
    generator.onEvaluateJSXString = () => undefined;
    const runner = new JsxRunner(generator, silentLogger);

    await runner.executeBuiltin("Layer/getLayerInfo", { selection: 1 }, true);

    expect(generator.jsxStringCalls[0]?.script).toContain('var params = {"selection":1};');
    expect(generator.jsxStringCalls[0]?.script).toContain("function hasBackgroundLayer");
    expect(generator.jsxStringCalls[0]?.script).toContain(
      "layerIndex = hasBackgroundLayer() ? selection : selection + 1;"
    );
  });
});

describe("JsxRunner.execute", () => {
  it("evaluates a jsx string via evaluateJSXString in the default engine", async () => {
    const generator = fakeGenerator();
    generator.onEvaluateJSXString = () => 42;
    const runner = new JsxRunner(generator, silentLogger);

    expect(await runner.run("1 + 41")).toBe(42);
    expect(generator.jsxStringCalls).toHaveLength(1);
    expect(generator.jsxStringCalls[0]?.script).toBe("1 + 41");
    // Default engine only — sharedEngineSafe is never forwarded.
    expect(generator.jsxStringCalls[0]?.sharedEngineSafe).toBeUndefined();
  });

  it("returns the jsx value verbatim without JSON.parse", async () => {
    const generator = fakeGenerator();
    const json = '{"id":1,"name":"layer"}';
    generator.onEvaluateJSXString = () => json;
    const runner = new JsxRunner(generator, silentLogger);

    expect(await runner.run("JSON.stringify(...)")).toBe(json);
  });

  it("passes through non-Error objects unchanged", async () => {
    const generator = fakeGenerator();
    const value = { ok: true };
    generator.onEvaluateJSXString = () => value;
    const runner = new JsxRunner(generator, silentLogger);

    expect(await runner.run("({ok:true})")).toBe(value);
  });

  it("throws with the message after the Error: prefix", async () => {
    const generator = fakeGenerator();
    generator.onEvaluateJSXString = () => "Error:boom";
    const runner = new JsxRunner(generator, silentLogger);

    await expect(runner.run("bad()")).rejects.toThrow("boom");
  });

  it("does not treat a value merely containing 'Error:' as a failure", async () => {
    const generator = fakeGenerator();
    generator.onEvaluateJSXString = () => "note: Error:not-a-prefix";
    const runner = new JsxRunner(generator, silentLogger);

    expect(await runner.run("'note: Error:not-a-prefix'")).toBe("note: Error:not-a-prefix");
  });
});

describe("JsxRunner safe execution", () => {
  it("passes through the raw JSX completion value on success", async () => {
    const generator = fakeGenerator();
    generator.onEvaluateJSXString = () => ({ ok: 1 });
    const runner = new JsxRunner(generator, silentLogger);

    await expect(runner.runSafe("1 + 1")).resolves.toEqual({ ok: 1 });
  });

  it("keeps backward compatibility with an old ok:true envelope", async () => {
    const generator = fakeGenerator();
    generator.onEvaluateJSXString = () => JSON.stringify({ ok: true, result: { ok: 1 } });
    const runner = new JsxRunner(generator, silentLogger);

    await expect(runner.runSafe("1 + 1")).resolves.toEqual({ ok: 1 });
  });

  it("turns a safe failure envelope into JSX_FAILED", async () => {
    const generator = fakeGenerator();
    generator.onEvaluateJSXString = () =>
      JSON.stringify({ ok: false, error: { code: "JSX_FAILED", message: "bad" } });
    const runner = new JsxRunner(generator, silentLogger);

    await expect(runner.runSafe("bad()")).rejects.toMatchObject({
      code: "JSX_FAILED",
      source: "jsx",
      message: "bad",
    });
  });

  it("preserves safe failure details", async () => {
    const generator = fakeGenerator();
    generator.onEvaluateJSXString = () =>
      JSON.stringify({
        ok: false,
        error: { code: "JSX_FAILED", message: "bad", details: { line: 12 } },
      });
    const runner = new JsxRunner(generator, silentLogger);

    await expect(runner.runSafe("bad()")).rejects.toMatchObject({
      code: "JSX_FAILED",
      details: { line: 12 },
    });
  });

  it("passes through a non-envelope string result", async () => {
    const generator = fakeGenerator();
    generator.onEvaluateJSXString = () => "not json";
    const runner = new JsxRunner(generator, silentLogger);

    await expect(runner.runSafe("stringResult()")).resolves.toBe("not json");
  });

  it("times out safe execution with PHOTOSHOP_BUSY", async () => {
    const generator = fakeGenerator();
    generator.onEvaluateJSXString = () => new Promise(() => {});
    const runner = new JsxRunner(generator, silentLogger);

    await expect(runner.runSafe("while(true){}", { timeoutMs: 1 })).rejects.toMatchObject({
      code: "PHOTOSHOP_BUSY",
      retryable: true,
      source: "jsx",
    });
  });
});

describe("JsxRunner.init", () => {
  it("reads, concatenates (sorted), and injects the polyfill bundle once", async () => {
    const generator = fakeGenerator();
    generator.onEvaluateJSXString = () => undefined;
    const runner = new JsxRunner(generator, silentLogger, SOURCE_POLYFILLS);

    await runner.init();

    // Exactly one evaluateJSXString call carrying the concatenated bundle.
    expect(generator.jsxStringCalls).toHaveLength(1);
    const script = generator.jsxStringCalls[0]?.script ?? "";
    // Sorted order means Array.js precedes Function.js precedes JSON.js …
    const arrayIdx = script.indexOf("Array Polyfills");
    const functionIdx = script.indexOf("Function Polyfills");
    expect(arrayIdx).toBeGreaterThan(-1);
    expect(functionIdx).toBeGreaterThan(-1);
    expect(arrayIdx).toBeLessThan(functionIdx);
    // All six polyfill files are present.
    for (const marker of ["Array", "Function", "JSON", "Number", "Object", "String"]) {
      expect(script).toContain(marker);
    }
  });

  it("throws when the polyfills dir is missing", async () => {
    const generator = fakeGenerator();
    const runner = new JsxRunner(generator, silentLogger, join(nextScratch(), "missing"));

    await expect(runner.init()).rejects.toThrow(/polyfills dir not found/);
    expect(generator.jsxStringCalls).toHaveLength(0);
  });

  it("skips injection when the polyfills dir is empty (no-op)", async () => {
    const dir = nextScratch();
    await mkdir(dir, { recursive: true });
    const generator = fakeGenerator();
    const runner = new JsxRunner(generator, silentLogger, dir);

    await runner.init();

    expect(generator.jsxStringCalls).toHaveLength(0);
  });

  it("throws when injection returns an Error: prefix", async () => {
    const generator = fakeGenerator();
    generator.onEvaluateJSXString = () => "Error:syntax boom";
    const runner = new JsxRunner(generator, silentLogger, SOURCE_POLYFILLS);

    await expect(runner.init()).rejects.toThrow("syntax boom");
  });

  it("walks nested subdirectories and keeps order stable", async () => {
    const dir = nextScratch();
    await mkdir(join(dir, "z"), { recursive: true });
    await mkdir(join(dir, "a"), { recursive: true });
    await writeFile(join(dir, "z", "z.js"), "// z\n", "utf8");
    await writeFile(join(dir, "a", "a.js"), "// a\n", "utf8");
    await writeFile(join(dir, "root.js"), "// root\n", "utf8");
    const generator = fakeGenerator();
    generator.onEvaluateJSXString = () => undefined;
    const runner = new JsxRunner(generator, silentLogger, dir);

    await runner.init();

    const script = generator.jsxStringCalls[0]?.script ?? "";
    // a/a.js < root.js < z/z.js by relative POSIX path.
    expect(script.indexOf("// a")).toBeLessThan(script.indexOf("// root"));
    expect(script.indexOf("// root")).toBeLessThan(script.indexOf("// z"));
  });
});

describe("JsxRunner engine persistence", () => {
  it("a global set during one execute() is visible to a later execute() call", async () => {
    // Simulates ExtendScript keeping globals across evaluateJSXString calls:
    // the fake engine holds a global map shared by every call, so a value
    // stored in one execute() is observable in the next — the assumption that
    // lets `init()` inject polyfills once instead of per-call.
    const engineGlobals = new Map<string, unknown>();
    const generator = fakeGenerator();
    generator.onEvaluateJSXString = (script) => {
      if (script.includes("__lbPolyfilled = true")) {
        engineGlobals.set("__lbPolyfilled", true);
        return undefined;
      }
      if (script.includes("__lbPolyfilled")) {
        return engineGlobals.get("__lbPolyfilled");
      }
      return undefined;
    };
    const runner = new JsxRunner(generator, silentLogger, SOURCE_POLYFILLS);

    // init() primes the engine with the real polyfill bundle (returns fine).
    await runner.init();
    // A later execute() stores a marker global in the same engine.
    await runner.run("globalThis.__lbPolyfilled = true");
    // A still-later execute() observes it — the engine persisted the global.
    expect(await runner.run("globalThis.__lbPolyfilled")).toBe(true);
  });
});
