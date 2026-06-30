/**
 * The plugin's contract with generator-core, typed faithfully from
 * `generator-core/lib/generator.js` (every public method, the low-level
 * `_sendJSX*` transport, and the underscore-prefixed internals). Public
 * thenable methods are typed as `Promise<T>` (consumers `await` them); the
 * `_sendJSX*` methods return a `Deferred<T>` — generator-core's Q deferred,
 * which streams progress messages for pixmap/shape protocols.
 *
 * This is an interface (not a class): the plugin never `instanceof`-checks the
 * generator and only depends on the surface. A test fake cannot satisfy the
 * full required surface, so tests build one via the `fakeGenerator()` factory
 * (a single `as unknown as FakeGenerator & PsGenerator` cast) — see
 * `test/fakeGenerator.ts`.
 */
import type { Stream } from "node:stream";
import type { PsBounds, PsPixmap, PsDocumentInfo } from "./ps";

/** Payload of Photoshop's `generatorMenuChanged` event (only the fields used). */
export interface GeneratorMenuChangedEvent {
  generatorMenuChanged?: { name: string };
}

/**
 * generator-core's Q `Deferred` shape — the return of `_sendJSXString` /
 * `_sendJSXFile`. The promise streams `progress` / `fail` notifications (used
 * by the pixmap/shape protocols) and settles via `resolve` / `reject`. Only the
 * members the plugin reaches are modelled.
 */
export interface Deferred<T> {
  promise: {
    then<TResult>(
      onFulfilled?: (value: T) => TResult | PromiseLike<TResult>,
      onRejected?: (reason: unknown) => TResult | PromiseLike<TResult>
    ): Promise<TResult>;
    progress(fn: (message: { type: string; value: unknown }) => void): void;
    fail(fn: (reason: unknown) => void): void;
    finally(fn: () => void): void;
  };
  resolve(value?: T): void;
  reject(reason?: unknown): void;
  notify(message: unknown): void;
}

declare namespace PsGenerator {
  /** Settings for `getPixmap` / `getDocumentPixmap` (generator.js:1201-1208). */
  export interface GetPixmapSettings {
    boundsOnly?: boolean;
    inputRect?: PsBounds;
    outputRect?: PsBounds;
    scaleX?: number;
    scaleY?: number;
    clipBounds?: PsBounds;
    useJPGEncoding?: string;
    useSmartScaling?: boolean;
    convertToWorkingRGBProfile?: boolean;
    useICCProfile?: string;
    getICCProfileData?: boolean;
    allowDither?: boolean;
    useColorSettingsDither?: boolean;
    interpolationType?: string;
    forceSmartPSDPixelScaling?: boolean;
    clipToDocumentBounds?: boolean;
    maxDimension?: number;
    compId?: number;
    compIndex?: number;
    includeAncestorMasks?: boolean;
    includeAdjustors?: boolean;
    includeChildren?: boolean;
    includeClipBase?: boolean;
    includeClipped?: boolean;
  }

  /** Settings for `savePixmap` / `streamPixmap` (generator.js:1959-1977). */
  export interface SavePixmapSettings {
    format: string;
    quality?: number;
    lossless?: boolean;
    ppi?: number;
    padding?: PsBounds;
    extract?: { x: number; y: number; width: number; height: number };
    background?: [number, number, number, number];
    _scale?: number;
    usePngquant?: boolean;
    useFlite?: boolean;
    useJPGEncoding?: boolean;
  }

  /** Flags overriding `getDocumentInfo` defaults (generator.js:720-748). */
  export interface DocumentInfoFlags {
    compInfo?: boolean;
    imageInfo?: boolean;
    layerInfo?: boolean;
    expandSmartObjects?: boolean;
    getTextStyles?: boolean;
    getFullTextStyles?: boolean;
    selectedLayers?: boolean;
    getCompLayerSettings?: boolean;
    getDefaultLayerFX?: boolean;
    getPathData?: boolean;
  }

  /** A layer spec: a layer id, or an index range with optional hidden indices. */
  export type LayerSpec =
    | number
    | { firstLayerIndex: number; lastLayerIndex: number; hidden?: number[] };

  /** Result of `getGuides` (generator.js:2047). */
  export interface Guides {
    horizontal: number[];
    vertical: number[];
  }

  /** Result of `getMenuState` / `checkPluginCompatibility`. */
  export interface MenuState {
    enabled: boolean;
    checked: boolean;
  }

  export interface PluginCompatibility {
    compatible: boolean;
    message: string | null;
  }

  /** Scaling settings for `getPixmapParams` (generator.js:1566-1574). */
  export interface PixmapParamsSettings {
    width?: number;
    height?: number;
    scaleX?: number;
    scaleY?: number;
    scale?: number;
  }
}

export interface PsGenerator {
  // --- lifecycle -----------------------------------------------------------

  /** Launch the generator: connect to Photoshop, resolve with self. */
  start(options?: Record<string, any>): Promise<PsGenerator>;

  /** Disconnect from Photoshop. */
  shutdown(): void;

  /** Whether the Photoshop connection is currently live. */
  isConnected(): boolean;

  /** Send a keep-alive; resolves true when Photoshop acknowledges. */
  checkConnection(): Promise<boolean>;

  // --- jsx evaluation ------------------------------------------------------

  /** Evaluate a local jsx file with optional params; resolves `message.value`. */
  evaluateJSXFile(
    path: string,
    params?: Record<string, any>,
    sharedEngineSafe?: boolean
  ): Promise<any>;

  /** `evaluateJSXFile` forced into the shared script engine. */
  evaluateJSXFileSharedSafe(path: string, params?: Record<string, any>): Promise<any>;

  /** Evaluate a jsx string; resolves `message.value`. */
  evaluateJSXString(s: string, sharedEngineSafe?: boolean): Promise<any>;

  /** `evaluateJSXString` forced into the shared script engine. */
  evaluateJSXStringSharedSafe(s: string): Promise<any>;

  /** Low-level jsx-string transport (private in generator-core). Returns the
   *  raw deferred so callers can subscribe to the progress stream. */
  _sendJSXString(s: string, deferred?: Deferred<any>, sharedEngineSafe?: boolean): Deferred<any>;

  /** Low-level jsx-file transport (private in generator-core). Returns the raw
   *  deferred; the pixmap/shape protocols subscribe to its progress messages. */
  _sendJSXFile(
    path: string,
    params?: Record<string, any>,
    sharedEngineSafe?: boolean
  ): Deferred<any>;

  // --- UI / clipboard ------------------------------------------------------

  /** Show a Photoshop alert dialog. */
  alert(message: string, stringReplacements?: string): void;

  /** Copy a string to the system clipboard. */
  copyToClipboard(str: string): void;

  // --- Photoshop environment ----------------------------------------------

  /** Resolve to the Photoshop install directory path. */
  getPhotoshopPath(): Promise<string>;

  /** Resolve to the Photoshop executable directory (inside the .app on Mac). */
  getPhotoshopExecutableLocation(): Promise<string>;

  /** Resolve to the Photoshop locale string. */
  getPhotoshopLocale(): Promise<string>;

  /** Resolve to the Photoshop version, e.g. "19.0.0". */
  getPhotoshopVersion(): Promise<string>;

  // --- menus ---------------------------------------------------------------

  /** Register a menu item; resolves once Photoshop has rebuilt the menu. */
  addMenuItem(name: string, displayName: string, enabled: boolean, checked: boolean): Promise<void>;

  /** Toggle (and optionally rename) an existing menu item. */
  toggleMenu(name: string, enabled: boolean, checked: boolean, displayName?: string): Promise<void>;

  /** Read the enabled/checked state of a menu item, or null if absent. */
  getMenuState(name: string): PsGenerator.MenuState | null;

  // --- documents -----------------------------------------------------------

  /** Resolve to the ids of all open documents. */
  getOpenDocumentIDs(): Promise<number[]>;

  /** Resolve to a document's info (layers, comps, image, …); rejects with
   *  "No Open Document" when none is open. */
  getDocumentInfo(
    documentId?: number,
    flags?: PsGenerator.DocumentInfoFlags
  ): Promise<PsDocumentInfo>;

  // --- generator settings --------------------------------------------------

  /** Get a layer's generator settings for a plugin. */
  getLayerSettingsForPlugin(documentId: number, layerId: number, pluginId: string): Promise<any>;

  /** Set a layer's generator settings for a plugin. */
  setLayerSettingsForPlugin(
    settings: Record<string, any>,
    layerId: number,
    pluginId: string
  ): Promise<any>;

  /** Get document-wide generator settings for a plugin. */
  getDocumentSettingsForPlugin(documentId: number, pluginId: string): Promise<any>;

  /** Set document-wide generator settings for a plugin. */
  setDocumentSettingsForPlugin(
    settings: Record<string, any>,
    documentId: number,
    pluginId: string
  ): Promise<any>;

  /** Extract and parse generator settings from a document object. */
  extractDocumentSettings(document: Record<string, any>, pluginId?: string): any;

  // --- Photoshop events ----------------------------------------------------

  /** Subscribe to one or more Photoshop events over the connection. */
  subscribeToPhotoshopEvents(events: string | string[]): Promise<boolean>;

  /** Register a listener for a Photoshop event. */
  onPhotoshopEvent(event: string, listener: (event: any) => void): void;

  /** Register a one-shot listener for a Photoshop event. */
  oncePhotoshopEvent(event: string, listener: (event: any) => void): void;

  /** Remove a Photoshop event listener. */
  removePhotoshopEventListener(event: string, listener: (event: any) => void): void;

  /** List current listeners for a Photoshop event. */
  photoshopEventListeners(event: string): Array<(event: any) => void>;

  /** Emit a Photoshop event to its listeners. */
  emitPhotoshopEvent(event: string, data?: any): void;

  // --- pixmaps -------------------------------------------------------------

  /** Get a pixmap (or bounds) for a layer id. */
  getPixmap(
    documentId: number,
    layerSpec: number,
    settings: PsGenerator.GetPixmapSettings
  ): Promise<PsPixmap>;

  /** Get a pixmap (or bounds) for an index range of layers. */
  getPixmap(
    documentId: number,
    layerSpec: {
      firstLayerIndex: number;
      lastLayerIndex: number;
      hidden?: number[];
    },
    settings: PsGenerator.GetPixmapSettings
  ): Promise<PsPixmap>;

  /** Get a pixmap of the whole document in its current visibility state. */
  getDocumentPixmap(documentId: number, settings: PsGenerator.GetPixmapSettings): Promise<PsPixmap>;

  /** Compute the `getPixmap` settings for a target scaling/padding. */
  getPixmapParams(
    settings: PsGenerator.PixmapParamsSettings,
    staticInputBounds: PsBounds,
    visibleInputBounds: PsBounds,
    paddedInputBounds: PsBounds,
    clipToBounds?: PsBounds
  ): PsGenerator.GetPixmapSettings;

  /** Write a pixmap to `path` via ImageMagick; resolves to the written path. */
  savePixmap(
    pixmap: PsPixmap,
    path: string,
    settings: PsGenerator.SavePixmapSettings
  ): Promise<string>;

  /** Stream a pixmap's converted bytes to `outputStream`. */
  streamPixmap(
    pixmap: PsPixmap,
    outputStream: Stream,
    settings: PsGenerator.SavePixmapSettings
  ): Promise<void>;

  /** Parse and coerce a pixmap's numeric properties in place. */
  _parsePixmapProperties(pixmap: PsPixmap): void;

  /** Parse and coerce a save-pixmap settings object in place. */
  _parsePixmapSaveSettings(settings: PsGenerator.SavePixmapSettings): void;

  // --- shapes / svg / guides ----------------------------------------------

  /** Resolve to a layer's path/shape data, or reject "layer does not contain a shape". */
  getLayerShape(documentId: number, layerId: number): Promise<{ path: any }>;

  /** Resolve to an SVG string for the layer, optionally scaled. */
  getSVG(documentId: number, layerId: number, settings?: { scale?: number }): Promise<string>;

  /** Resolve to the horizontal/vertical guide positions in a document. */
  getGuides(documentId: number): Promise<PsGenerator.Guides>;

  /** Recursively compute the containing bounds of a layer tree (or undefined). */
  getDeepBounds(layer: any): PsBounds | undefined;

  // --- bounds helpers (private) -------------------------------------------

  /** True when a bounds rect has zero or non-finite area. */
  _isBoundEmpty(bounds: PsBounds): boolean;

  /** Smallest rect containing both bounds. */
  _unionBounds(boundsA: PsBounds, boundsB: PsBounds): PsBounds;

  /** Largest rect inside both bounds (zeroed when empty). */
  _intersectBounds(boundsA: PsBounds, boundsB: PsBounds): PsBounds;

  /** Union of a layer's raster + vector mask bounds, or undefined. */
  _getTotalMaskBounds(bounds: any): PsBounds | undefined;

  // --- hidden layers (private) --------------------------------------------

  /** Recursively collect indices of hidden layers (children of hidden groups
   *  are hidden too). Used by `getDocumentPixmap`. */
  _computeHiddenLayers(parent: { layers: any[] }, hideAll?: boolean): number[];

  // --- style (private) -----------------------------------------------------

  /** Resolve to extracted style info for a document (private, unstable API). */
  _getStyleInfo(documentId: number, flags?: { selectedLayers?: boolean }): Promise<any>;

  // --- settings parsing (private) -----------------------------------------

  /** Parse a `{ json }`-wrapped settings blob into an object. */
  _parseDocumentSettings(settings: { json?: string } | any): any;

  /** Register/subscribe a Photoshop event listener helper (private). */
  _registerPhotoshopEventHelper(
    event: string,
    listener: (event: any) => void,
    isOnce: boolean
  ): void;

  // --- headlights (private) -----------------------------------------------

  /** Log a Headlights event (Adobe-internal). */
  _logHeadlights(event: string): Promise<void>;

  /** Log a plugin-loaded Headlights record (Adobe-internal). */
  _logHeadlightsPluginLoaded(pluginName: string, pluginVersion: string): Promise<void>;

  // --- plugin management ---------------------------------------------------

  /** Read a plugin's `package.json` metadata; throws on invalid input. */
  getPluginMetadata(directory: string): any;

  /** Check a plugin's `generator-core-version` compatibility. */
  checkPluginCompatibility(metadata: any): PsGenerator.PluginCompatibility;

  /** Load a plugin from a directory; throws on incompatibility / failure. */
  loadPlugin(directory: string): void;

  /** Return an already-loaded plugin by name, or null. */
  getPlugin(name: string): any | null;

  // --- custom options ------------------------------------------------------

  /** Resolve to the custom-options table for a plugin (persists until PS quit). */
  getCustomOptions(pluginId: string): Promise<Record<string, any>>;

  /** Replace the custom-options table for a plugin (no merge). */
  setCustomOptions(pluginId: string, settings: Record<string, any>): Promise<void>;

  /** Update a single custom option key for a plugin. */
  updateCustomOption(pluginId: string, key: string, value: unknown): Promise<void>;

  /** Delete a single custom option key for a plugin. */
  deleteCustomOption(pluginId: string, key: string): Promise<void>;

  // --- websocket servers (generator-core built-in) ------------------------

  /** Start a generator-core websocket server for a plugin; resolves to the port. */
  startWebsocketServer(
    pluginId: string,
    desiredPort?: number,
    domain?: any,
    origin?: string
  ): Promise<number>;

  /** Stop a plugin's generator-core websocket server. */
  stopWebsocketServer(pluginId: string): Promise<void>;

  // --- interpolation constants (generator.js:1102-1135) -------------------

  readonly INTERPOLATION_NEAREST_NEIGHBOR: "nearestNeighbor";
  readonly INTERPOLATION_BILINEAR: "bilinear";
  readonly INTERPOLATION_BICUBIC: "bicubic";
  readonly INTERPOLATION_BICUBIC_SMOOTHER: "bicubicSmoother";
  readonly INTERPOLATION_BICUBIC_SHARPER: "bicubicSharper";
  readonly INTERPOLATION_BICUBIC_AUTOMATIC: "bicubicAutomatic";
  readonly INTERPOLATION_PRESERVE_DETAILS_UPSCALE: "preserveDetailsUpscale";
  readonly INTERPOLATION_AUTOMATIC: "automaticInterpolation";
}
