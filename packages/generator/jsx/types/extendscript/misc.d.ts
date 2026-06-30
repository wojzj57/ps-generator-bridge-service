/**
 * Photoshop 杂项类型声明
 * 来源: https://theiviaxx.github.io/photoshop-docs/Photoshop/
 */

declare class UnitValue {
  value: number;
  type: string;
  as(unit: string): number;
  convert(unit: string): boolean;
}

type Rectangle = [number, number, number, number];

declare class Preferences {
  additionalPluginFolder: File;
  appendExtension: MacExtensionType;
  askBeforeSavingLayeredTIFF: boolean;
  autoUpdateOpenDocuments: boolean;
  exportClipboard: boolean;
  imagePreviews: SaveBehavior;
  macOSThumbnail: boolean;
  maxRAMuse: number;
  maximizeCompatibility: QueryStateType;
  saveLogItems: SaveLogItemsType;
  saveLogItemsFile: File;
  useAdditionalPluginFolder: boolean;
  useDiffusionDither: boolean;
  useHistoryLog: boolean;
  useLowerCaseExtension: boolean;
  windowsThumbnail: boolean;
  beepWhenDone: boolean;
  colorChannelsInColor: boolean;
  colorPicker: ColorPicker;
  dynamicColorSliders: boolean;
  fontPreviewSize: FontPreviewType;
  fullSizePreview: boolean;
  gamutWarningOpacity: number;
  iconPreview: boolean;
  imageCacheForHistograms: boolean;
  keyboardZoomResizesWindows: boolean;
  otherCursors: OtherPaintingCursors;
  paintingCursors: PaintingCursors;
  pixelDoubling: boolean;
  savePaletteLocations: boolean;
  showAsianTextOptions: boolean;
  showEnglishFontNames: boolean;
  showSliceNumber: boolean;
  showToolTips: boolean;
  smartQuotes: boolean;
  textFontSize: FontSize;
  useShiftKeyForToolSwitch: boolean;
  useVideoAlpha: boolean;
  columnGutter: number;
  columnWidth: number;
  gridSize: GridSize;
  gridStyle: GridLineStyle;
  gridSubDivisions: number;
  guideStyle: GuideLineStyle;
  interpolation: ResampleMethod;
  pointSize: PointType;
  rulerUnits: Units;
  typeUnits: TypeUnits;
  createFirstSnapshot: boolean;
  editLogItems: EditLogItemsType;
  imageCacheLevels: number;
  nonLinearHistory: boolean;
  numberOfHistoryStates: number;
  recentFileListLength: number;
  readonly parent: Application;
  readonly typename: string;
}

declare class Guide {
  direction: Direction;
  coordinate: number;
  readonly parent: Document;
  readonly typename: string;
  remove(): void;
}

declare class Guides {
  readonly length: number;
  readonly parent: Document;
  readonly typename: string;
  [index: number]: Guide;
  add(direction: Direction, coordinate: number): Guide;
  removeAll(): void;
}

declare class HistoryState {
  readonly name: string;
  readonly snapshot: boolean;
  readonly parent: Document;
  readonly typename: string;
}

declare class HistoryStates {
  readonly length: number;
  readonly parent: Document;
  readonly typename: string;
  [index: number]: HistoryState;
  getByName(name: string): HistoryState;
}

declare class Notifier {
  readonly event: string;
  readonly eventClass: string;
  readonly eventFile: File;
  readonly parent: Application;
  readonly typename: string;
  remove(): void;
}

declare class Notifiers {
  readonly length: number;
  readonly parent: Application;
  readonly typename: string;
  [index: number]: Notifier;
  add(event: string, eventFile: File, eventClass?: string): Notifier;
  removeAll(): void;
}

declare class ColorSampler {
  readonly color: SolidColor;
  readonly position: [number, number];
  readonly parent: Document;
  readonly typename: string;
  move(position: [number, number]): void;
  remove(): void;
}

declare class ColorSamplers {
  readonly length: number;
  readonly parent: Document;
  readonly typename: string;
  [index: number]: ColorSampler;
  add(position: [number, number]): ColorSampler;
  removeAll(): void;
}

declare class CountItem {
  readonly position: [number, number];
  readonly parent: Document;
  readonly typename: string;
  remove(): void;
}

declare class CountItems {
  readonly length: number;
  readonly parent: Document;
  readonly typename: string;
  [index: number]: CountItem;
  add(position: [number, number]): CountItem;
  removeAll(): void;
}

declare class XMPMetadata {
  readonly author: string;
  readonly caption: string;
  readonly copyrightNotice: string;
  copyrightStatus: CopyrightedType;
  copyrightInfoURL: string;
  readonly creationDate: string;
  city: string;
  country: string;
  credit: string;
  exif: any;
  headline: string;
  instructions: string;
  ISOCountryCode: string;
  keywords: string[];
  provinceState: string;
  source: string;
  title: string;
  readonly parent: Document;
  readonly typename: string;
  rawData: string;
}

declare class DocumentInfo {
  author: string;
  authorPosition: string;
  caption: string;
  captionWriter: string;
  city: string;
  copyrightNotice: string;
  copyrightStatus: CopyrightedType;
  copyrightInfoURL: string;
  country: string;
  readonly creationDate: string;
  credit: string;
  headline: string;
  instructions: string;
  ISOCountryCode: string;
  keywords: string[];
  ownerUrl: string;
  provinceState: string;
  source: string;
  supplementalCategories: string[];
  title: string;
  urgency: Urgency;
  readonly parent: Document;
  readonly typename: string;
}

declare class DocumentPrintSettings {
  background: SolidColor;
  bleedWidth: number;
  caption: boolean;
  colorBars: boolean;
  colorHandling: PrintColorHandling;
  copies: number;
  cropMarks: boolean;
  hardProof: boolean;
  flip: boolean;
  registrationMarks: boolean;
  printerName: string;
  negative: boolean;
  labels: boolean;
  readonly parent: Document;
  readonly typename: string;
}

declare class MeasurementScale {
  name: string;
  pixelLength: number;
  logicalLength: number;
  logicalUnit: string;
  readonly parent: Document;
  readonly typename: string;
}

declare class MeasurementLog {
  readonly parent: Application;
  readonly typename: string;
  exportMeasurements(file: File, range?: MeasurementRange, dataPoints?: string[]): void;
  deleteMeasurements(range?: MeasurementRange): void;
}

declare class BatchOptions {
  destinationFolder: Folder;
  destination: BatchDestinationType;
  errorFile: File;
  fileNaming: FileNamingType[];
  macintoshCompatible: boolean;
  overrideOpen: boolean;
  overrideSave: boolean;
  startingSerial: number;
  suppressOpen: boolean;
  suppressProfile: boolean;
  unixCompatible: boolean;
  windowsCompatible: boolean;
}

declare class ExportOptions {}

declare class ExportOptionsIllustrator extends ExportOptions {
  path: IllustratorPathType;
  pathName: string;
}

declare class ExportOptionsSaveForWeb extends ExportOptions {
  includeProfile: boolean;
  dither: number;
  ditherType: DitherType;
  format: SaveDocumentType;
  interlaced: boolean;
  colors: number;
  quality: number;
  optimized: boolean;
  transparency: boolean;
  webSnap: number;
}
