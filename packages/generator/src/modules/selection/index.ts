import { MainEvent, ProtocolMethod } from "@ps-generator-bridge/sdk";
import { api, subscribable, ws } from "@ps-generator-bridge/sdk/plugin";
import { BaseModule } from "../base";
import type { PsBridgeHost } from "../../plugin";
import type { PsRect } from "../../types/ps";
import type { SubscribableContext } from "@ps-generator-bridge/sdk/plugin";
import { optionalNumber, queryParams, type ApiRequestLike } from "../apiParams";

const SELECTION_ACTION_EVENTS = ["setd", "SbtF", "AddT", "move"] as const;
const CHANGE_COOLDOWN_MS = 500;

type SelectionActionEvent = (typeof SELECTION_ACTION_EVENTS)[number];

type SubPathItem =
  | {
      kind: "C";
      in?: { x: number; y: number };
      out?: { x: number; y: number };
      x: number;
      y: number;
    }
  | {
      kind: "P";
      x: number;
      y: number;
    };

type PathItem = SubPathItem[][];

interface SelectionPathResult {
  path?: PathItem;
}

export interface SelectionPathData {
  svg: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PhotoshopMessageBus {
  on(event: "message", listener: (messageId: number, value: unknown) => void): void;
  off?(event: "message", listener: (messageId: number, value: unknown) => void): void;
  removeListener?(event: "message", listener: (messageId: number, value: unknown) => void): void;
}

export interface SelectionModuleApi {
  watchSelection(): Promise<{ ok: true }>;
  getArea(): Promise<PsRect | null>;
  getPath(params?: { expand?: number }): Promise<SelectionPathData | null>;
}

/**
 * Selection-domain feature module. It exposes request methods for the current
 * selection and publishes the main event `selection:changed` when Photoshop
 * reports selection-tool action events.
 */
export class SelectionModule extends BaseModule implements SelectionModuleApi {
  private messageBus: PhotoshopMessageBus | undefined;
  private activeWatchDisposer: (() => void) | undefined;
  private cooldown = false;

  constructor(plugin: PsBridgeHost) {
    super("selection", plugin);
  }

  dispose(): void {
    this.activeWatchDisposer?.();
    this.activeWatchDisposer = undefined;
    this.messageBus = undefined;
    this.cooldown = false;
  }

  @ws(ProtocolMethod.SelectionWatch)
  async watchSelection(): Promise<{ ok: true }> {
    await this.plugin.events.ensureSubscribable(MainEvent.SelectionChanged);
    return { ok: true };
  }

  @api("/selection/area")
  @ws(ProtocolMethod.SelectionGetArea)
  async getArea(): Promise<PsRect | null> {
    try {
      const selection = await this.jsx.execute<string | unknown[] | null>("Layer/getSelection");
      return parseSelectionBounds(selection);
    } catch {
      return null;
    }
  }

  @ws(ProtocolMethod.SelectionGetPath)
  async getPath(params?: { expand?: number }): Promise<SelectionPathData | null> {
    const selectionArea = await this.getArea();
    if (!selectionArea) return null;

    const expand = Math.max(0, params?.expand ?? 0);
    const raw = await this.jsx.execute<string | SelectionPathResult>("Selection/getSelectionPath", {
      expand,
    });
    const result = parseSelectionPathResult(raw);
    if (!result?.path) return null;
    return this.pathToSvg(result.path);
  }

  @api("/selection/path")
  async getPathApi(request: ApiRequestLike): Promise<SelectionPathData | null> {
    const query = queryParams(request);
    return this.getPath({ expand: optionalNumber(query.expand, "expand") });
  }

  @subscribable(MainEvent.SelectionChanged)
  private async selectionChangedProducer(
    context: SubscribableContext<PsRect | null>
  ): Promise<() => void> {
    await this.jsx.execute("Selection/registerEvent", {
      events: [...SELECTION_ACTION_EVENTS],
    });
    const messageBus = getPhotoshopMessageBus(this.plugin.generator);
    this.messageBus = messageBus;
    const onPhotoshopMessage = (messageId: number, value: unknown): void => {
      void messageId;
      this.handlePhotoshopMessage(value, context.emit);
    };
    messageBus?.on("message", onPhotoshopMessage);

    let disposed = false;
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      if (messageBus?.off) {
        messageBus.off("message", onPhotoshopMessage);
      } else {
        messageBus?.removeListener?.("message", onPhotoshopMessage);
      }
      if (this.messageBus === messageBus) this.messageBus = undefined;
      if (this.activeWatchDisposer === dispose) this.activeWatchDisposer = undefined;
      this.cooldown = false;
    };
    this.activeWatchDisposer = dispose;
    return dispose;
  }

  private handlePhotoshopMessage(value: unknown, emit: (payload: PsRect | null) => void): void {
    if (typeof value !== "string") return;
    if (value !== "" && !isSelectionActionEvent(value)) return;
    if (this.cooldown) return;

    this.cooldown = true;
    void this.emitSelectionChanged(emit);
    setTimeout(() => {
      this.cooldown = false;
    }, CHANGE_COOLDOWN_MS);
  }

  private async emitSelectionChanged(emit: (payload: PsRect | null) => void): Promise<void> {
    const area = await this.getArea();
    emit(area);
  }

  private pathToSvg(pathCollection: PathItem): SelectionPathData | null {
    if (pathCollection.length === 0) return null;

    const svg: string[] = [];
    const bbox = new BBox();
    for (const subpaths of pathCollection) {
      if (subpaths.length === 0) continue;
      const d = formSvgPath(subpaths, bbox);
      svg.push(`<path fill-rule="evenodd" d="${d}"/>`);
    }
    if (!bbox.hasPoints) return null;

    const width = bbox.MX - bbox.mx;
    const height = bbox.MY - bbox.my;
    const strokeColor = "#25b048";
    const strokeWidth = 4;
    const header = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth}" width="${width}" height="${height}" viewBox="${[
      bbox.mx,
      bbox.my,
      width,
      height,
    ].join(" ")}">`;
    return {
      svg: [header, ...svg, "</svg>"].join("\n"),
      x: bbox.mx,
      y: bbox.my,
      width,
      height,
    };
  }
}

function formSvgPath(subPaths: SubPathItem[], bbox: BBox): string {
  const first = subPaths[0];
  if (!first) return "";

  let p0 = first;
  bbox.grow(p0);
  let path: Array<string | number> = ["M", p0.x, p0.y];
  const points: SubPathItem[] = [...subPaths.slice(1), first];
  for (const p of points) {
    bbox.grow(p);
    if (p0.kind === "P" && p.kind === "P") {
      path = path.concat(["L", p.x, p.y]);
    } else if (p0.kind === "P" && p.kind === "C") {
      const pin = inPoint(p);
      path = path.concat(["C", p0.x, p0.y, pin.x, pin.y, p.x, p.y]);
    } else if (p0.kind === "C" && p.kind === "P") {
      const p0out = outPoint(p0);
      path = path.concat(["C", p0out.x, p0out.y, p.x, p.y, p.x, p.y]);
    } else if (p0.kind === "C" && p.kind === "C") {
      const p0out = outPoint(p0);
      const pin = inPoint(p);
      path = path.concat(["C", p0out.x, p0out.y, pin.x, pin.y, p.x, p.y]);
    }
    p0 = p;
  }
  path.push("z");
  return path.join(" ");
}

function inPoint(p: Extract<SubPathItem, { kind: "C" }>): { x: number; y: number } {
  return p.in ?? { x: p.x, y: p.y };
}

function outPoint(p: Extract<SubPathItem, { kind: "C" }>): { x: number; y: number } {
  return p.out ?? { x: p.x, y: p.y };
}

function parseSelectionBounds(value: string | unknown[] | null | undefined): PsRect | null {
  if (!value) return null;
  const parts = Array.isArray(value) ? value : String(value).split(",");
  if (parts.length < 4) return null;

  const bounds = parts.slice(0, 4).map(parseCssPixel);
  if (bounds.some((n) => !Number.isFinite(n))) return null;
  const left = bounds[0]!;
  const top = bounds[1]!;
  const right = bounds[2]!;
  const bottom = bounds[3]!;
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

function parseCssPixel(value: unknown): number {
  if (typeof value === "number") return value;
  if (value && typeof value === "object" && "value" in value) {
    return Number((value as { value: unknown }).value);
  }
  return Number.parseFloat(String(value).replace("px", "").trim());
}

function parseSelectionPathResult(value: string | SelectionPathResult): SelectionPathResult | null {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as SelectionPathResult;
  } catch {
    return null;
  }
}

function isSelectionActionEvent(value: string): value is SelectionActionEvent {
  return SELECTION_ACTION_EVENTS.includes(value as SelectionActionEvent);
}

function getPhotoshopMessageBus(generator: unknown): PhotoshopMessageBus | undefined {
  const bus = (generator as { _photoshop?: unknown })._photoshop;
  if (!bus || typeof bus !== "object" || typeof (bus as PhotoshopMessageBus).on !== "function") {
    return undefined;
  }
  return bus as PhotoshopMessageBus;
}

class BBox {
  public mx = 9999999;
  public my = 9999999;
  public MX = -9999999;
  public MY = -9999999;
  public hasPoints = false;

  grow(p: SubPathItem | { x?: number; y?: number } | undefined): void {
    if (!p || typeof p.x !== "number" || typeof p.y !== "number") return;
    this.hasPoints = true;
    if (p.x < this.mx) this.mx = p.x;
    if (p.y < this.my) this.my = p.y;
    if (p.x > this.MX) this.MX = p.x;
    if (p.y > this.MY) this.MY = p.y;
    this.grow("in" in p ? p.in : undefined);
    this.grow("out" in p ? p.out : undefined);
  }
}
