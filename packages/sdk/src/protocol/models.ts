/**
 * A layer spec: either a layer id, or an index range plus the indices of layers
 * to hide (the form Photoshop's `getLayerPixmap.jsx` accepts). Modeled here as a
 * wire type (RFC 0008) so the protocol is self-contained; the generator's image
 * module re-exports it for its plugin-facing API.
 */
export type LayerSpec =
  | number
  | { firstLayerIndex: number; lastLayerIndex: number; hidden: number[] };

export interface PsRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PsLayer {
  id: number;
  index: number;
  name: string;
  type: number;
  visible: boolean;
  bounds: PsBounds;
  rect: PsRect;
  clip: boolean;
  children?: PsLayer[];
}

export type LayerPreviewPayload = {
  id: number;
  name: string;
  index: number;
  width: number;
  height: number;
  data: string;
} | null;

export type LayerSelectionChangePayload = PsLayer[] | null;

export interface PsDocument {
  id: number;
  name: string;
  width: number;
  height: number;
  resolution: number;
  isDirty: boolean;
  filePath?: string;
}

/**
 * The result of an image `@ws` method (RFC 0008). `data` is an out-of-the-box
 * image string the client can drop straight into an `<img src>`:
 * `data:image/png;base64,...` when inlined, or `https://...` when a `CosService`
 * uploaded it. The client tells them apart by the `data`/`http` prefix; there
 * is deliberately no separate discriminator field. `bounds`/`width`/`height`
 * carry the same geometry as the module-internal `ImageResult`.
 */
export interface WsImageResult {
  data: string;
  bounds: PsBounds;
  width: number;
  height: number;
}

export interface SelectionPathData {
  svg: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PsBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface ServerInfo {
  name: string;
  version: string;
  /** Photoshop version, when the server is connected to PS; omitted otherwise. */
  psVersion?: string;
  plugins?: PluginInfo[];
}

export interface PluginInfo {
  id: string;
}

export interface Bounds {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

export interface ImageChangedLayer {
  id: number;
  pixels?: boolean;
  removed?: boolean;
  bounds?: Bounds;
}

export interface ImageChangedEvent {
  version: string;
  timeStamp: number;
  count: number;
  id: number;
  active?: boolean;
  file?: string;
  closed?: boolean;
  metaDataOnly?: boolean;
  selection?: number[];
  layers?: ImageChangedLayer[];
}