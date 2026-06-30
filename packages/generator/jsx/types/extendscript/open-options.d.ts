/**
 * Photoshop 打开选项类型声明
 * 来源: https://theiviaxx.github.io/photoshop-docs/Photoshop/
 */

/** Camera RAW 打开选项 */
declare class CameraRAWOpenOptions {
  blueSaturation: number;
  brightness: number;
  chromaticAberrationBY: number;
  chromaticAberrationRC: number;
  colorNoiseReduction: number;
  colorSpace: ColorSpaceType;
  contrast: number;
  exposure: number;
  greenSaturation: number;
  highBitDepth: boolean;
  lensVignettingAmount: number;
  lensVignettingMidpoint: number;
  luminanceSmoothing: number;
  redSaturation: number;
  saturation: number;
  shadowTint: number;
  sharpness: number;
  size: CameraRAWSize;
  tint: number;
  settings: CameraRAWSettingsType;
  whiteBalance: WhiteBalanceType;
}

/** DICOM 打开选项 */
declare class DICOMOpenOptions {
  anonymize: boolean;
  columns: number;
  reverseImage: boolean;
  rows: number;
  showOverlays: boolean;
  windowLevel: number;
  windowWidth: number;
}

/** 通用 EPS 打开选项 */
declare class GenericEPSOpenOptions {
  antiAlias: boolean;
  constrainProportions: boolean;
  height: number;
  mode: OpenDocumentMode;
  resolution: number;
  width: number;
}

/** 通用 PDF 打开选项 */
declare class GenericPDFOpenOptions {
  antiAlias: boolean;
  bitsPerChannel: BitsPerChannelType;
  cropPage: CropToType;
  constrainProportions: boolean;
  height: number;
  image: number;
  mode: OpenDocumentMode;
  page: number;
  resolution: number;
  suppressWarnings: boolean;
  usePageNumber: boolean;
  width: number;
}

/** PhotoCD 打开选项 */
declare class PhotoCDOpenOptions {
  colorProfileName: string;
  colorSpace: ColorSpaceType;
  orientation: Orientation;
  pixelSize: PhotoCDColorSpace;
  resolution: number;
}

/** Raw 格式打开选项 */
declare class RawFormatOpenOptions {
  bitsPerChannel: number;
  byteOrder: ByteOrderType;
  channelNumber: number;
  headerSize: number;
  height: number;
  retainHeader: boolean;
  width: number;
}
