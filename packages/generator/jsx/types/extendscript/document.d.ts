/**
 * Photoshop 文档类型声明
 * 来源: https://theiviaxx.github.io/photoshop-docs/Photoshop/
 */

declare class Document {
  activeChannels: Channel[];
  readonly activeHistoryBrushSource: HistoryState;
  activeHistoryState: HistoryState;
  activeLayer: ArtLayer | LayerSet;
  readonly artLayers: ArtLayers;
  readonly backgroundLayer: ArtLayer;
  bitsPerChannel: BitsPerChannelType;
  readonly channels: Channels;
  colorProfileName: string;
  colorProfileType: ColorProfileType;
  readonly colorSamplers: ColorSamplers;
  readonly componentChannels: Channel[];
  readonly countItems: CountItems;
  readonly fullName: File;
  readonly guides: Guides;
  readonly height: number;
  readonly histogram: number[];
  readonly historyStates: HistoryStates;
  readonly id: number;
  readonly info: DocumentInfo;
  readonly layerComps: LayerComps;
  readonly layerSets: LayerSets;
  readonly layers: Layers;
  readonly managed: boolean;
  readonly measurementScale: MeasurementScale;
  readonly mode: DocumentMode;
  readonly name: string;
  readonly parent: Application;
  readonly path: File;
  readonly pathItems: PathItems;
  readonly pixelAspectRatio: number;
  readonly printSettings: DocumentPrintSettings;
  quickMaskMode: boolean;
  readonly resolution: number;
  readonly saved: boolean;
  readonly selection: Selection;
  readonly typename: string;
  readonly width: number;
  readonly xmpMetadata: XMPMetadata;

  autoCount(channel: Channel, merge: boolean): void;
  changeMode(destinationMode: ChangeMode, options?: any): void;
  close(saving?: SaveOptions): void;
  convertProfile(
    destinationProfile: string,
    intent: Intent,
    blackPointCompensation?: boolean,
    dither?: boolean
  ): void;
  crop(bounds: Rectangle, angle?: number, width?: number, height?: number): void;
  duplicate(name?: string, mergeLayersOnly?: boolean): Document;
  exportDocument(exportIn: File, exportAs?: ExportType, options?: ExportOptions): void;
  flatten(): void;
  flipCanvas(direction: Direction): void;
  importAnnotations(from: File): void;
  mergeVisibleLayers(): void;
  paste(intoSelection?: boolean): ArtLayer;
  print(
    sourceSpace?: SourceSpaceType,
    printSpace?: string,
    intent?: Intent,
    blackPointCompensation?: boolean
  ): void;
  printOneCopy(): void;
  rasterizeAllLayers(): void;
  recordMeasurements(selection?: MeasurementSource, dataPoints?: string[]): void;
  resizeCanvas(width: number, height: number, anchor?: AnchorPosition): void;
  resizeImage(
    width?: number,
    height?: number,
    resolution?: number,
    resampleImage?: ResampleMethod,
    amount?: number
  ): void;
  revealAll(): void;
  rotateCanvas(angle: number): void;
  save(): void;
  saveAs(saveIn: File, options?: any, asCopy?: boolean, extensionType?: MacExtensionType): void;
  splitChannels(): Document[];
  suspendHistory(historyString: string, javaScriptString: string): void;
  trap(width: number): void;
  trim(type?: TrimType, top?: boolean, left?: boolean, bottom?: boolean, right?: boolean): void;
}

/** 打开文档的集合 */
declare class Documents {
  readonly length: number;
  readonly parent: Application;
  readonly typename: string;
  [index: number]: Document;

  add(
    width?: number,
    height?: number,
    resolution?: number,
    name?: string,
    mode?: NewDocumentMode,
    initialFill?: DocumentFill,
    pixelAspectRatio?: number,
    bitsPerChannel?: BitsPerChannelType,
    colorProfileName?: string
  ): Document;
  getByName(name: string): Document;
}
