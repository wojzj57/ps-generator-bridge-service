/**
 * Photoshop 保存选项类型声明
 * 来源: https://theiviaxx.github.io/photoshop-docs/Photoshop/
 */

/** 用于将文档保存为 JPEG 格式的选项 */
declare class JPEGSaveOptions {
  embedColorProfile: boolean;
  formatOptions: FormatOptionsType;
  matte: MatteType;
  quality: number;
  scans: number;
}

/** 用于将文档保存为 PNG 格式的选项 */
declare class PNGSaveOptions {
  compression: number;
  interlaced: boolean;
}

/** 用于保存 Photoshop 文档（PSD 格式）的选项 */
declare class PhotoshopSaveOptions {
  alphaChannels: boolean;
  annotations: boolean;
  embedColorProfile: boolean;
  layers: boolean;
  spotColors: boolean;
}

/** 用于以 TIFF 格式保存文档的选项 */
declare class TiffSaveOptions {
  alphaChannels: boolean;
  annotations: boolean;
  byteOrder: ByteOrderType;
  embedColorProfile: boolean;
  imageCompression: TiffEncodingType;
  interleaveChannels: boolean;
  jpegQuality: number;
  layerCompression: LayerCompressionType;
  layers: boolean;
  saveImagePyramid: boolean;
  spotColors: boolean;
  transparency: boolean;
}

/** 用于将文档保存为 BMP 格式的选项 */
declare class BMPSaveOptions {
  flipRowOrder: boolean;
  osType: OperatingSystem;
  rleCompression: boolean;
}

/** 用于将文档保存为 CompuServe GIF 格式的选项 */
declare class GIFSaveOptions {
  colors: number;
  dither: DitherType;
  ditherAmount: number;
  palette: PaletteType;
  preserveExactColors: boolean;
  transparency: boolean;
}

/** 用于将文档保存为 EPS 格式的选项 */
declare class EPSSaveOptions {
  embedColorProfile: boolean;
  encoding: SaveEncoding;
  halftoneScreen: boolean;
  interpolation: boolean;
  preview: MacPreviewType;
  psColorManagement: boolean;
  transparentWhites: boolean;
  vectorData: boolean;
}

/** 用于将文档保存为 Photoshop PDF 格式的选项 */
declare class PDFSaveOptions {
  alphaChannels: boolean;
  annotations: boolean;
  colorConversion: boolean;
  colorProfile: string;
  compatibility: PDFCompatibilityType;
  convertDotsToHyphens: boolean;
  description: string;
  downSample: PDFResampleType;
  downSampleSize: number;
  downSampleSizeLimit: number;
  embedColorProfile: boolean;
  embedFonts: boolean;
  encoding: PDFEncodingType;
  interpolation: boolean;
  jpegQuality: number;
  layers: boolean;
  optimizeForWeb: boolean;
  password: string;
  pDFStandard: PDFStandardType;
  preserveEditing: boolean;
  spotColors: boolean;
  tiles: boolean;
  transparency: boolean;
  view: boolean;
}

/** 用于将文档保存为 Targa 格式的选项 */
declare class TargaSaveOptions {
  resolution: TargaBitsPerPixels;
  rleCompression: boolean;
  transparency: boolean;
}

/** 用于将文档保存为 DCS 1.0 格式的选项 */
declare class DCS1_SaveOptions {
  embedColorProfile: boolean;
  encoding: SaveEncoding;
  halftoneScreen: boolean;
  interpolation: boolean;
  preview: MacPreviewType;
  dCS: DCSType;
  vectorData: boolean;
}

/** 用于将文档保存为 DCS 2.0 格式的选项 */
declare class DCS2_SaveOptions {
  embedColorProfile: boolean;
  encoding: SaveEncoding;
  halftoneScreen: boolean;
  interpolation: boolean;
  multiFileDCS: boolean;
  preview: MacPreviewType;
  spotColors: boolean;
  dCS: DCSType;
  vectorData: boolean;
}

/** 用于将文档保存为 SGI RGB 格式的选项 */
declare class SGIRGBSaveOptions {
  alphaChannels: boolean;
  spotColors: boolean;
}

/** 用于将文档保存为 Raw 格式的选项 */
declare class RawSaveOptions {
  alphaChannels: boolean;
  interleavedChannels: boolean;
}
