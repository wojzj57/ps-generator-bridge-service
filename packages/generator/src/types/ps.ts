// Photoshop data shapes shared across the generator and re-exported to plugins
// through the contract barrel (src/contract.ts). These are explicit exports
// (not ambient `declare global` types) so the SDK can import and inline them
// into its published `.d.ts` without injecting names into a consumer's global
// scope. PS-typed bytes use `Buffer` here (server-side); the plugin-facing
// contract widens them to `Uint8Array` so the SDK stays Node-free.

export type PsBounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type PsRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PsPixmap = {
  format: number;
  width: number;
  height: number;
  rowBytes: number;
  colorMode: number;
  channelCount: number;
  bitsPerChannel: number;
  pixels: Buffer;
  bytesPerPixel: number;
  padding: number;
  bounds: PsBounds;
  resolution: number;

  getPixel: (n: number) => any;
  readChannel: (n?: number) => any;
};

export interface PsRawOptions {
  width: number;
  height: number;
  channels: 4 | 3;
  hasAlpha?: boolean;
  space?: "srgb" | string;
}

export interface PsDocumentInfo {
  version: string;
  timeStamp: number;
  count: number;
  id: number;
  file: string;
  bounds: PsBounds;
  selection: number[];
  resolution: number;
  globalLight: { angle: number; altitude: number };
  generatorSettings?: any;
  profile: string;
  mode: string;
  depth: number;
  layers: any[];
}

export interface PsHSBCColor {
  hue: number;
  saturation: number;
  brightness: number;
}
