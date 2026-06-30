/**
 * Photoshop 颜色类型声明
 * 来源: https://theiviaxx.github.io/photoshop-docs/Photoshop/
 */

// ============================================================
// 颜色分量类
// ============================================================

/** RGB 颜色模型 */
declare class RGBColor {
  /** 蓝色通道值。范围：0.0 到 255.0 */
  blue: number;
  /** 绿色通道值。范围：0.0 到 255.0 */
  green: number;
  /** 十六进制颜色字符串（例如 "ff0000"）*/
  hexValue: string;
  /** 红色通道值。范围：0.0 到 255.0 */
  red: number;
}

/** CMYK 颜色模型 */
declare class CMYKColor {
  /** 黑色（K）通道值。范围：0.0 到 100.0 */
  black: number;
  /** 青色通道值。范围：0.0 到 100.0 */
  cyan: number;
  /** 品红色通道值。范围：0.0 到 100.0 */
  magenta: number;
  /** 黄色通道值。范围：0.0 到 100.0 */
  yellow: number;
}

/** HSB 颜色模型 */
declare class HSBColor {
  /** 亮度。范围：0.0 到 100.0 */
  brightness: number;
  /** 色相。范围：0.0 到 360.0 */
  hue: number;
  /** 饱和度。范围：0.0 到 100.0 */
  saturation: number;
}

/** Lab 颜色模型 */
declare class LabColor {
  /** A 通道值。范围：-128.0 到 127.0 */
  a: number;
  /** B 通道值。范围：-128.0 到 127.0 */
  b: number;
  /** 亮度（L）值。范围：0.0 到 100.0 */
  l: number;
}

/** 灰度颜色模型 */
declare class GrayColor {
  /** 灰度值。范围：0.0 到 100.0 */
  gray: number;
}

/** 无颜色（透明）*/
declare class NoColor {}

// ============================================================
// SolidColor 主颜色类
// ============================================================

/**
 * 用于文档中的颜色定义。
 * 可通过 rgb、cmyk、hsb、lab、gray 属性访问不同颜色模型。
 */
declare class SolidColor {
  /** CMYK 颜色模型 */
  cmyk: CMYKColor;
  /** 灰度颜色模型 */
  gray: GrayColor;
  /** HSB 颜色模型 */
  hsb: HSBColor;
  /** Lab 颜色模型 */
  lab: LabColor;
  /** 颜色模型 */
  model: ColorModel;
  /** 最接近当前颜色的 Web 安全色（只读）*/
  readonly nearestWebColor: RGBColor;
  /** RGB 颜色模型 */
  rgb: RGBColor;

  /**
   * 比较两种颜色是否相等。
   * @param color 要比较的颜色
   */
  isEqual(color: SolidColor): boolean;
}
