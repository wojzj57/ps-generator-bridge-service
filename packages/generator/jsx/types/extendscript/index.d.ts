/**
 * Photoshop ExtendScript TypeScript 类型声明入口文件
 *
 * 使用说明：在 tsconfig.json 中配置 typeRoots 或通过三斜线引用此文件。
 *
 * 所有类型均声明为全局类型（declare），在 Photoshop ExtendScript 环境中可直接使用。
 *
 * @example
 * // 在 JSX 脚本中
 * var doc = app.activeDocument;
 * var layer = doc.activeLayer;
 */

/// <reference path="./enums.d.ts" />
/// <reference path="./color.d.ts" />
/// <reference path="./channel.d.ts" />
/// <reference path="./selection.d.ts" />
/// <reference path="./path.d.ts" />
/// <reference path="./text.d.ts" />
/// <reference path="./layer.d.ts" />
/// <reference path="./actions.d.ts" />
/// <reference path="./save-options.d.ts" />
/// <reference path="./open-options.d.ts" />
/// <reference path="./misc.d.ts" />
/// <reference path="./document.d.ts" />
/// <reference path="./application.d.ts" />

// ============================================================
// 全局变量声明（Photoshop ExtendScript 运行时注入）
// ============================================================

/** Photoshop 应用程序根对象 */
declare const app: Application;

/** 当前活动文档（等同于 app.activeDocument）*/
declare let activeDocument: Document;

// ============================================================
// Core 对象（ExtendScript 内置）
// ============================================================

/**
 * 代表本地文件系统中的一个文件。
 * 来源: https://theiviaxx.github.io/photoshop-docs/Core/File.html
 */
declare class File {
  readonly absoluteURI: string;
  readonly alias: boolean;
  readonly created: Date | null;
  readonly creator: string;
  readonly displayName: string;
  encoding: string;
  readonly eof: boolean;
  readonly error: string;
  readonly exists: boolean;
  readonly fsName: string;
  readonly fullName: string;
  readonly hidden: boolean;
  readonly length: number;
  lineFeed: string;
  readonly modified: Date | null;
  readonly name: string;
  readonly parent: Folder;
  readonly path: string;
  readonly readonly: boolean;
  readonly relativeURI: string;
  readonly type: string;
  static readonly fs: string;

  constructor(path?: string);

  changePath(path: string): boolean;
  close(): boolean;
  copy(destination: string): boolean;
  createAlias(path?: string): boolean;
  execute(): boolean;
  getRelativeURI(baseURI?: string): string;
  open(mode: string, type?: string, creator?: string): boolean;
  openDlg(prompt?: string, filter?: string, multiSelect?: boolean): File | File[] | null;
  read(): string;
  readch(): string;
  readln(): string;
  remove(): boolean;
  rename(newName: string): boolean;
  resolve(): File | null;
  saveDlg(prompt?: string, filter?: string): File | null;
  seek(pos: number, mode?: number): boolean;
  tell(): number;
  toSource(): string;
  toString(): string;
  write(text: string): boolean;
  writeln(text: string): boolean;

  static decode(uri: string): string;
  static encode(name: string): string;
  static isEncodingAvailable(name: string): boolean;
  static openDialog(prompt?: string, filter?: string, multiSelect?: boolean): File | File[] | null;
  static saveDialog(prompt?: string, filter?: string): File | null;
}

/**
 * 代表文件系统中的文件夹或目录。
 * 来源: https://theiviaxx.github.io/photoshop-docs/Core/Folder.html
 */
declare class Folder {
  readonly absoluteURI: string;
  readonly alias: boolean;
  readonly created: Date | null;
  readonly displayName: string;
  readonly error: string;
  readonly exists: boolean;
  readonly fsName: string;
  readonly fullName: string;
  readonly modified: Date | null;
  readonly name: string;
  readonly parent: Folder | null;
  readonly path: string;
  readonly relativeURI: string;

  static readonly appData: Folder;
  static readonly appPackage: Folder;
  static readonly commonFiles: Folder;
  static current: Folder;
  static readonly desktop: Folder;
  static readonly fs: string;
  static readonly myDocuments: Folder;
  static readonly startup: Folder;
  static readonly system: Folder;
  static readonly temp: Folder;
  static readonly trash: Folder | null;
  static readonly userData: Folder;

  constructor(path?: string);

  changePath(path: string): boolean;
  create(): boolean;
  execute(): boolean;
  getFiles(mask?: string | Function): (File | Folder)[];
  getRelativeURI(baseURI?: string): string;
  remove(): boolean;
  rename(newName: string): boolean;
  resolve(): Folder | null;
  selectDlg(prompt?: string): Folder | null;
  toSource(): string;
  toString(): string;

  static decode(uri: string): string;
  static encode(name: string): string;
  static isEncodingAvailable(name: string): boolean;
  static selectDialog(prompt?: string): Folder | null;
}

// ============================================================
// 其他未覆盖枚举的占位符声明（避免编译错误）
// ============================================================

declare enum WarpStyle {
  ARC = 1, ARCH = 2, ARCLOWER = 3, ARCUPPER = 4, BULGE = 5,
  FISH = 6, FISHEYE = 7, FLAG = 8, INFLATE = 9, NONE = 16,
  RISE = 10, SHELLLOWER = 11, SHELLUPPER = 12, SQUEEZE = 13,
  TWIST = 14, WAVE = 15,
}

declare enum PaintingCursors { BRUSHSIZE = 3, PRECISE = 2, STANDARD = 1 }
declare enum OtherPaintingCursors { PRECISE = 2, STANDARD = 1 }
declare enum ColorPicker { ADOBE = 1, APPLE = 2, PLUGIN = 4, WINDOWS = 3 }
declare enum FontPreviewType { EXTRA_LARGE = 5, HUGE = 6, LARGE = 4, MEDIUM = 3, NONE = 1, SMALL = 2 }
declare enum FontSize { LARGE = 3, MEDIUM = 2, SMALL = 1 }
declare enum GridSize { LARGE = 4, MEDIUM = 3, NONE = 1, SMALL = 2 }
declare enum GridLineStyle { DASHED = 2, DOTTED = 3, SOLID = 1 }
declare enum GuideLineStyle { DASHED = 2, SOLID = 1 }
declare enum PointType { POSTSCRIPT = 2, TRADITIONAL = 1 }
declare enum ToolType { ARTHISTORYBRUSH = 9, BACKGROUNDERASER = 3, BLUR = 11, BRUSH = 2, BURN = 14, CLONESTAMP = 5, COLORREPLACEMENTTOOL = 16, DODGE = 13, ERASER = 4, HEALINGBRUSH = 7, HISTORYBRUSH = 8, PATTERNSTAMP = 6, PENCIL = 1, SHARPEN = 12, SMUDGE = 10, SPONGE = 15 }
declare enum ShapeOperation { SHAPEADD = 1, SHAPEINTERSECT = 3, SHAPESUBTRACT = 2, SHAPEXOR = 4 }
declare enum NoiseDistribution { GAUSSIAN = 2, UNIFORM = 1 }
declare enum LensType { MOVIEPRIME = 3, PRIME105 = 2, PRIME35 = 1, ZOOMLENS = 4 }
declare enum RadialBlurMethod { SPIN = 1, ZOOM = 2 }
declare enum RadialBlurQuality { BEST = 3, DRAFT = 1, GOOD = 2 }
declare enum SmartBlurQuality { HIGH = 3, LOW = 1, MEDIUM = 2 }
declare enum SmartBlurMode { EDGEONLY = 2, NORMAL = 1, OVERLAYEDGE = 3 }
declare enum SpherizeMode { HORIZONTAL = 2, NORMAL = 1, VERTICAL = 3 }
declare enum OffsetUndefinedAreas { REPEATEDGEPIXELS = 3, SETTOBACKGROUND = 1, WRAPAROUND = 2 }
declare enum FileNamingType { DDMM = 8, DDMMYY = 9, DOCUMENTNAMELOWER = 2, DOCUMENTNAMEMIXED = 1, DOCUMENTNAMEUPPER = 3, EXTENSIONLOWER = 17, EXTENSIONUPPER = 18, MMDD = 6, MMDDYY = 7, SERIALLETTERALPHA = 14, SERIALLETTERUPPER = 13, SERIALNUMBER1 = 10, SERIALNUMBER2 = 11, SERIALNUMBER3 = 12, SERIALNUMBER4 = 15, NONE = 16, YYDDMM = 5, YYMMDD = 4 }
declare enum BatchDestinationType { FOLDER = 3, NODESTINATION = 1, SAVEANDCLOSE = 2 }
declare enum ColorSpaceType { ADOBE_RGB = 1, COLORMATCH_RGB = 3, PROPHOTO_RGB = 4, SRGB = 2 }
declare enum Language { BRAZILLIANPORTUGUESE = 13, CANADIANFRENCH = 4, DANISH = 17, DUTCH = 16, ENGLISHUK = 2, ENGLISHUSA = 1, FINNISH = 18, FRENCH = 3, GERMAN = 5, ITALIAN = 9, JAPANESE = 14, NORWEGIAN = 19, NYNORSKNORWEGIAN = 20, OLDGERMAN = 6, POLISH = 15, PORTUGUESE = 12, SPANISH = 10, STANDARDFRENCH = 4, STANDARDGERMAN = 5, STANDARDPORTUGUESE = 11, SWEDISH = 21, SWISSGERMAN = 7, UKENGLISH = 2, USENGLISH = 1 }
declare enum CopyrightedType { COPYRIGHTEDWORK = 1, PUBLICDOMAIN = 2, UNMARKED = 3 }
declare enum Urgency { FOUR = 4, HIGH = 8, LOW = 1, NONE = 0, NORMAL = 5, THREE = 3, TWO = 2, URGENT = 7 }
declare enum Intent { ABSOLUTECOLORIMETRIC = 4, PERCEPTUAL = 1, RELATIVECOLORIMETRIC = 3, SATURATION = 2 }
declare enum SourceSpaceType { DOCUMENT = 1, PROOF = 2 }
declare enum MeasurementRange { ALLMEASUREMENTS = 1, ACTIVEMEASUREMENTS = 2 }
declare enum MeasurementSource { MEASURECURRENTIMAGE = 3, MEASUREMENTLOG = 1, MEASURESELECTEDLAYERS = 2 }
declare enum EditLogItemsType { CONCISE = 2, DETAILED = 3, SESSIONONLY = 1 }
declare enum SaveLogItemsType { LOGFILE = 2, LOGFILEANDMETADATA = 3, METADATA = 1 }
declare enum MacPreviewType { EIGHTBITIIFF = 3, MACOSPICT = 4, MONOIIFF = 2, NONE = 1 }
declare enum MacExtensionType { ALWAYS = 3, NEVER = 2, USE_DEFAULT = 1 }
declare enum SaveBehavior { ALWAYSSAVE = 3, ASKSAVE = 2, NEVERSAVE = 1 }
declare enum QueryStateType { ALWAYS = 1, ASK = 2, NEVER = 3 }
declare enum PaletteType { ADAPTIVE = 5, BLACKBODY = 11, CUSTOM = 10, EXACT = 1, MACOSPALETTE = 2, PERCEPTUAL = 6, PREVIOUSPALETTE = 12, RESTRICTEDCOLORS = 3, SELECTIVE = 7, SPECTRUM = 12, UNIFORM = 4, WEBPALETTE = 9, WINDOWSPALETTE = 2 }
declare enum DitherType { DIFFUSION = 3, NOISE = 2, NONE = 1, PATTERN = 2 }
declare enum SaveEncoding { BINARY = 1, JPEGLOW = 5, JPEGMEDIUM = 6, JPEGHIGH = 7, JPEGMAXIMUM = 8, ASCII = 2, ASCIIINTERCALATED = 3, BINARYFLOAT = 4 }
declare enum OperatingSystem { OS2 = 1, WINDOWS = 2 }
declare enum TargaBitsPerPixels { SIXTEEN = 16, THIRTYTWO = 32, TWENTYFOUR = 24 }
declare enum DCSType { COLORCOMPOSITE = 3, GRAYSCALECOMPOSITE = 2, NOCOMPOSITE = 1 }
declare enum PDFCompatibilityType { PDF13 = 1, PDF14 = 2, PDF15 = 3, PDF16 = 4, PDF17 = 5 }
declare enum PDFEncodingType { JPEG = 2, JPEGLOW = 6, JPEGMEDIUM = 5, JPEGHIGH = 4, JPEGMAXIMUM = 3, NONE = 0, PDFZIP = 1, PDFZIP4BIT = 7 }
declare enum PDFResampleType { NONE = 1, PDFAVERAGE = 2, PDFBICUBIC = 4, PDFSUBSAMPLE = 3 }
declare enum PDFStandardType { NONE = 1, PDFA1B = 3, PDFX1A2001 = 4, PDFX1A2003 = 5, PDFX32002 = 6, PDFX32003 = 7, PDFX42007 = 8 }
declare type PhotoCDColorSpace = any;
declare enum EliminateFields { EVENFIELDS = 1, ODDFIELDS = 2 }
declare enum CreateFields { DUPLICATION = 1, INTERPOLATION = 2 }
declare enum IllustratorPathType { ALLPATHS = 2, DOCUMENTBOUNDS = 1, NAMEDPATH = 3 }

// 源文件中未显式声明但被引用的占位类型
declare type CameraRAWSize = any;
declare type CameraRAWSettingsType = any;
declare type WhiteBalanceType = any;
declare type PrintColorHandling = any;
