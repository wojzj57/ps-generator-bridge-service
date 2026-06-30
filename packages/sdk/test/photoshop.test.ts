import { describe, it, expect } from "vitest";
import {
  PsPhotoshopProxy,
  BlendMode,
  SaveOptions,
  AnchorPosition,
  ElementPlacement,
  SelectionType,
  type PsJsxRunner,
} from "../src/photoshop";

/**
 * A fake JSX runner. It records every script it receives and replies with the
 * value chosen by `route`, serialized the way ExtendScript's `JSON.stringify`
 * would on the host — which is exactly what the real runner returns verbatim.
 * For value reads the proxy wraps its expression in `JSON.stringify(...)`, so
 * returning `JSON.stringify(routeValue)` reproduces the real round-trip.
 */
function fakeRunner(route: (script: string) => unknown) {
  const scripts: string[] = [];
  const jsx: PsJsxRunner = {
    run<T>(script: string): Promise<T> {
      scripts.push(script);
      return Promise.resolve(JSON.stringify(route(script)) as unknown as T);
    },
  };
  return { jsx, scripts };
}

/** A runner that replies with a single value to every call. */
function constRunner(value: unknown) {
  return fakeRunner(() => value);
}

describe("PsPhotoshopProxy paths", () => {
  it("roots app at 'app' and activeDocument at 'app.activeDocument'", async () => {
    const { jsx, scripts } = constRunner("X");
    const ps = new PsPhotoshopProxy(jsx);
    await ps.app.version;
    await ps.activeDocument.name;
    expect(scripts[0]).toBe("JSON.stringify(String(app.version))");
    expect(scripts[1]).toBe("JSON.stringify(String(app.activeDocument.name))");
  });
});

describe("value normalization", () => {
  it("coerces numeric reads to a real number, not a string", async () => {
    const { jsx, scripts } = constRunner(1920);
    const width = await new PsPhotoshopProxy(jsx).activeDocument.width;
    expect(scripts[0]).toBe("JSON.stringify(Number(app.activeDocument.width))");
    expect(width).toBe(1920);
    expect(typeof width).toBe("number");
  });

  it("coerces boolean reads to a real boolean", async () => {
    const { jsx } = constRunner(true);
    const saved = await new PsPhotoshopProxy(jsx).activeDocument.saved;
    expect(saved).toBe(true);
    expect(typeof saved).toBe("boolean");
  });

  it("returns string reads unquoted", async () => {
    const { jsx } = constRunner("Untitled-1");
    const name = await new PsPhotoshopProxy(jsx).activeDocument.name;
    expect(name).toBe("Untitled-1");
  });

  it("parses a bounds tuple as an array", async () => {
    const { jsx, scripts } = constRunner([0, 0, 100, 200]);
    const bounds = await new PsPhotoshopProxy(jsx).activeDocument.activeLayer.bounds;
    expect(bounds).toEqual([0, 0, 100, 200]);
    expect(scripts[0]).toContain("JSON.stringify((function(){");
  });

  it("parses the foreground color object", async () => {
    const { jsx } = constRunner({
      model: "rgb",
      rgb: { red: 255, green: 0, blue: 0, hexValue: "ff0000" },
    });
    const color = await new PsPhotoshopProxy(jsx).app.foregroundColor;
    expect(color.model).toBe("rgb");
    expect(color.rgb).toEqual({ red: 255, green: 0, blue: 0, hexValue: "ff0000" });
  });
});

describe("enum mapping", () => {
  it("maps a blend-mode code to its enum name", async () => {
    const { jsx, scripts } = constRunner(5);
    const mode = await new PsPhotoshopProxy(jsx).activeDocument.activeLayer.blendMode;
    expect(scripts[0]).toBe("JSON.stringify(Number(app.activeDocument.activeLayer.blendMode))");
    expect(mode).toBe("MULTIPLY");
  });

  it("maps a layer-kind code to its enum name", async () => {
    const { jsx } = constRunner(2);
    const kind = await new PsPhotoshopProxy(jsx).activeDocument.activeLayer.kind;
    expect(kind).toBe("TEXT");
  });

  it("falls back to UNKNOWN_<code> for an unmapped code", async () => {
    const { jsx } = constRunner(999);
    const mode = await new PsPhotoshopProxy(jsx).activeDocument.activeLayer.blendMode;
    expect(mode).toBe("BlendMode.UNKNOWN_999");
  });
});

describe("script generation for writes and calls", () => {
  it("builds an assignment for setName with an escaped string", async () => {
    const { jsx, scripts } = constRunner(undefined);
    await new PsPhotoshopProxy(jsx).activeDocument.activeLayer.setName('a "b"');
    expect(scripts[0]).toBe('app.activeDocument.activeLayer.name = "a \\"b\\""');
  });

  it("passes an enum through verbatim in setBlendMode", async () => {
    const { jsx, scripts } = constRunner(undefined);
    await new PsPhotoshopProxy(jsx).activeDocument.activeLayer.setBlendMode(BlendMode.MULTIPLY);
    expect(scripts[0]).toBe("app.activeDocument.activeLayer.blendMode = BlendMode.MULTIPLY");
  });

  it("defaults close() to DONOTSAVECHANGES", async () => {
    const { jsx, scripts } = constRunner(undefined);
    await new PsPhotoshopProxy(jsx).activeDocument.close();
    expect(scripts[0]).toBe(`app.activeDocument.close(${SaveOptions.DONOTSAVECHANGES})`);
  });

  it("wraps a file path in new File(...) for open", async () => {
    const { jsx, scripts } = constRunner(undefined);
    await new PsPhotoshopProxy(jsx).app.open("/tmp/a.psd");
    expect(scripts[0]).toBe('app.open(new File("/tmp/a.psd"))');
  });

  it("serializes crop bounds as a numeric array", async () => {
    const { jsx, scripts } = constRunner(undefined);
    await new PsPhotoshopProxy(jsx).activeDocument.crop([0, 0, 50, 60]);
    expect(scripts[0]).toBe("app.activeDocument.crop([0,0,50,60])");
  });
});

describe("layers collection paths", () => {
  it("indexes with [n] and looks up by escaped name", async () => {
    const { jsx, scripts } = constRunner("L");
    const layers = new PsPhotoshopProxy(jsx).activeDocument.layers;
    await layers.at(2).name;
    await layers.getByName("Background").name;
    expect(scripts[0]).toBe("JSON.stringify(String(app.activeDocument.layers[2].name))");
    expect(scripts[1]).toBe(
      'JSON.stringify(String(app.activeDocument.layers.getByName("Background").name))'
    );
  });
});

/** Run one proxy call against a fresh runner and return the script it emitted. */
async function scriptFor(call: (ps: PsPhotoshopProxy) => Promise<unknown>): Promise<string> {
  const { jsx, scripts } = constRunner(0);
  await call(new PsPhotoshopProxy(jsx));
  const [first] = scripts;
  if (first === undefined) throw new Error("no script emitted");
  return first;
}

const D = "app.activeDocument";
const L = "app.activeDocument.activeLayer";
const S = "app.activeDocument.selection";

describe("emitted script per method", () => {
  it.each<[string, (ps: PsPhotoshopProxy) => Promise<unknown>, string]>([
    // Application
    ["app.locale", (ps) => ps.app.locale, "JSON.stringify(String(app.locale))"],
    ["app.name", (ps) => ps.app.name, "JSON.stringify(String(app.name))"],
    ["app.build", (ps) => ps.app.build, "JSON.stringify(String(app.build))"],
    ["app.path", (ps) => ps.app.path, "JSON.stringify(String(app.path.fsName))"],
    ["app.beep", (ps) => ps.app.beep(), "app.beep()"],
    // Document reads
    ["doc.id", (ps) => ps.activeDocument.id, `JSON.stringify(Number(${D}.id))`],
    ["doc.height", (ps) => ps.activeDocument.height, `JSON.stringify(Number(${D}.height))`],
    [
      "doc.resolution",
      (ps) => ps.activeDocument.resolution,
      `JSON.stringify(Number(${D}.resolution))`,
    ],
    [
      "doc.fullName",
      (ps) => ps.activeDocument.fullName,
      `JSON.stringify(String(${D}.fullName.fsName))`,
    ],
    ["doc.path", (ps) => ps.activeDocument.path, `JSON.stringify(String(${D}.path.fsName))`],
    // Document methods
    ["doc.save", (ps) => ps.activeDocument.save(), `${D}.save()`],
    ["doc.saveAs", (ps) => ps.activeDocument.saveAs("/o.psd"), `${D}.saveAs(new File("/o.psd"))`],
    [
      "doc.saveAs copy",
      (ps) => ps.activeDocument.saveAs("/o.psd", true),
      `${D}.saveAs(new File("/o.psd"), undefined, true)`,
    ],
    ["doc.flatten", (ps) => ps.activeDocument.flatten(), `${D}.flatten()`],
    [
      "doc.mergeVisibleLayers",
      (ps) => ps.activeDocument.mergeVisibleLayers(),
      `${D}.mergeVisibleLayers()`,
    ],
    [
      "doc.rasterizeAllLayers",
      (ps) => ps.activeDocument.rasterizeAllLayers(),
      `${D}.rasterizeAllLayers()`,
    ],
    ["doc.duplicate named", (ps) => ps.activeDocument.duplicate("c"), `${D}.duplicate("c")`],
    ["doc.duplicate", (ps) => ps.activeDocument.duplicate(), `${D}.duplicate()`],
    [
      "doc.resizeCanvas",
      (ps) => ps.activeDocument.resizeCanvas(10, 20),
      `${D}.resizeCanvas(10, 20)`,
    ],
    [
      "doc.resizeCanvas anchor",
      (ps) => ps.activeDocument.resizeCanvas(10, 20, AnchorPosition.MIDDLECENTER),
      `${D}.resizeCanvas(10, 20, AnchorPosition.MIDDLECENTER)`,
    ],
    [
      "doc.resizeImage",
      (ps) => ps.activeDocument.resizeImage(10),
      `${D}.resizeImage(10, undefined, undefined)`,
    ],
    ["doc.rotateCanvas", (ps) => ps.activeDocument.rotateCanvas(90), `${D}.rotateCanvas(90)`],
    // Layer reads
    ["layer.id", (ps) => ps.activeDocument.activeLayer.id, `JSON.stringify(Number(${L}.id))`],
    [
      "layer.visible",
      (ps) => ps.activeDocument.activeLayer.visible,
      `JSON.stringify(Boolean(${L}.visible))`,
    ],
    [
      "layer.opacity",
      (ps) => ps.activeDocument.activeLayer.opacity,
      `JSON.stringify(Number(${L}.opacity))`,
    ],
    [
      "layer.allLocked",
      (ps) => ps.activeDocument.activeLayer.allLocked,
      `JSON.stringify(Boolean(${L}.allLocked))`,
    ],
    [
      "layer.typename",
      (ps) => ps.activeDocument.activeLayer.typename,
      `JSON.stringify(String(${L}.typename))`,
    ],
    // Layer writes & methods
    [
      "layer.setVisible",
      (ps) => ps.activeDocument.activeLayer.setVisible(false),
      `${L}.visible = false`,
    ],
    ["layer.setOpacity", (ps) => ps.activeDocument.activeLayer.setOpacity(50), `${L}.opacity = 50`],
    [
      "layer.setAllLocked",
      (ps) => ps.activeDocument.activeLayer.setAllLocked(true),
      `${L}.allLocked = true`,
    ],
    ["layer.remove", (ps) => ps.activeDocument.activeLayer.remove(), `${L}.remove()`],
    ["layer.duplicate", (ps) => ps.activeDocument.activeLayer.duplicate(), `${L}.duplicate()`],
    [
      "layer.move",
      (ps) => ps.activeDocument.activeLayer.move(`${D}.layers[0]`, ElementPlacement.PLACEBEFORE),
      `${L}.move(${D}.layers[0], ElementPlacement.PLACEBEFORE)`,
    ],
    [
      "layer.translate",
      (ps) => ps.activeDocument.activeLayer.translate(1, 2),
      `${L}.translate(1, 2)`,
    ],
    [
      "layer.resize",
      (ps) => ps.activeDocument.activeLayer.resize(150, 150),
      `${L}.resize(150, 150)`,
    ],
    [
      "layer.resize anchor",
      (ps) => ps.activeDocument.activeLayer.resize(150, 150, AnchorPosition.TOPLEFT),
      `${L}.resize(150, 150, AnchorPosition.TOPLEFT)`,
    ],
    ["layer.rotate", (ps) => ps.activeDocument.activeLayer.rotate(90), `${L}.rotate(90)`],
    ["layer.moveToEnd", (ps) => ps.activeDocument.activeLayer.moveToEnd(), `${L}.moveToEnd()`],
    // Layers collection
    [
      "layers.length",
      (ps) => ps.activeDocument.layers.length,
      `JSON.stringify(Number(${D}.layers.length))`,
    ],
    // Selection
    ["sel.solid", (ps) => ps.activeDocument.selection.solid, `JSON.stringify(Boolean(${S}.solid))`],
    ["sel.selectAll", (ps) => ps.activeDocument.selection.selectAll(), `${S}.selectAll()`],
    ["sel.deselect", (ps) => ps.activeDocument.selection.deselect(), `${S}.deselect()`],
    ["sel.invert", (ps) => ps.activeDocument.selection.invert(), `${S}.invert()`],
    [
      "sel.select",
      (ps) =>
        ps.activeDocument.selection.select([
          [0, 0],
          [1, 1],
        ]),
      `${S}.select([[0,0],[1,1]])`,
    ],
    [
      "sel.select typed",
      (ps) => ps.activeDocument.selection.select([[0, 0]], SelectionType.REPLACE, 2, true),
      `${S}.select([[0,0]], SelectionType.REPLACE, 2, true)`,
    ],
    ["sel.expand", (ps) => ps.activeDocument.selection.expand(5), `${S}.expand(5)`],
    ["sel.contract", (ps) => ps.activeDocument.selection.contract(5), `${S}.contract(5)`],
    ["sel.feather", (ps) => ps.activeDocument.selection.feather(5), `${S}.feather(5)`],
    [
      "sel.translateBoundary",
      (ps) => ps.activeDocument.selection.translateBoundary(1, 2),
      `${S}.translateBoundary(1, 2)`,
    ],
  ])("%s", async (_name, call, expected) => {
    expect(await scriptFor(call)).toBe(expected);
  });

  it("wraps the document mode read in an IIFE", async () => {
    expect(await scriptFor((ps) => ps.activeDocument.mode)).toContain(
      "JSON.stringify((function(){"
    );
  });

  it("wraps the selection bounds read in an IIFE", async () => {
    expect(await scriptFor((ps) => ps.activeDocument.selection.bounds)).toContain(
      "JSON.stringify((function(){"
    );
  });
});
