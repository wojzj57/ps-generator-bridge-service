/**
 * Photoshop 图层类型声明
 * 来源: https://theiviaxx.github.io/photoshop-docs/Photoshop/
 */

// ============================================================
// 基础 Layer 类
// ============================================================

/**
 * 图层基类，ArtLayer 和 LayerSet 的共同父类。
 */
declare class Layer {
  /** 如果为 true，则图层的内容和设置已锁定 */
  allLocked: boolean;
  /** 混合模式 */
  blendMode: BlendMode;
  /** 图层的边界矩形（只读）*/
  readonly bounds: [number, number, number, number];
  /** 不包含效果的边界矩形（只读）*/
  readonly boundsNoEffects: [number, number, number, number];
  /** 图层的唯一 ID（只读）*/
  readonly id: number;
  /** 图层索引（不含图层组）（只读）*/
  readonly itemIndex: number;
  /** 与此图层链接的图层（只读）*/
  readonly linkedLayers: Layer[];
  /** 图层名称 */
  name: string;
  /** 图层的主不透明度（百分比）。范围：0.0 到 100.0 */
  opacity: number;
  /** 对象的容器（Document 或 LayerSet）（只读）*/
  readonly parent: Document | LayerSet;
  /** 对象的类名（只读）*/
  readonly typename: string;
  /** 如果为 true，则图层可见 */
  visible: boolean;
  /** 与图层关联的 XMP 元数据（只读）*/
  readonly xmpMetadata: XMPMetadata;

  /**
   * 复制此图层。
   * @param relativeObject 相对的目标对象（可选）
   * @param insertionLocation 插入位置（可选）
   */
  duplicate(relativeObject?: Layer | Document, insertionLocation?: ElementPlacement): Layer;

  /**
   * 将此图层与指定图层链接。
   * @param with_ 要链接的图层
   */
  link(with_: Layer): void;

  /**
   * 移动对象。
   * @param relativeObject 相对的目标对象
   * @param insertionLocation 插入位置
   */
  move(relativeObject: Layer | Document, insertionLocation: ElementPlacement): void;

  /**
   * 移动到末尾。
   * @param relativeObject 相对的目标对象（可选）
   */
  moveToEnd(relativeObject?: Document | LayerSet): void;

  /** 删除此图层 */
  remove(): void;

  /**
   * 缩放对象。
   * @param horizontal 水平缩放（百分比）
   * @param vertical 垂直缩放（百分比）
   * @param anchor 锚点位置（可选）
   */
  resize(horizontal?: number, vertical?: number, anchor?: AnchorPosition): void;

  /**
   * 旋转对象。
   * @param angle 旋转角度（度）
   * @param anchor 锚点位置（可选）
   */
  rotate(angle: number, anchor?: AnchorPosition): void;

  /**
   * 相对于当前位置移动对象。
   * @param deltaX 水平移动量
   * @param deltaY 垂直移动量
   */
  translate(deltaX?: number, deltaY?: number): void;

  /** 取消链接图层 */
  unlink(): void;
}

// ============================================================
// ArtLayer 类
// ============================================================

/**
 * 文档中包含图像视觉元素的艺术图层（等同于 Photoshop 中的普通图层）。
 */
declare class ArtLayer extends Layer {
  /** 图层的内部不透明度。范围：0.0 到 100.0 */
  fillOpacity: number;
  /** 滤镜蒙版的密度。范围：0.0 到 100.0 */
  filterMaskDensity: number;
  /** 滤镜蒙版的羽化值。范围：0.0 到 250.0 */
  filterMaskFeather: number;
  /** 如果为 true，表示该图层与下方图层进行了编组（剪贴蒙版）*/
  grouped: boolean;
  /** 如果为 true，表示该图层是背景图层 */
  isBackgroundLayer: boolean;
  /** 图层类型（仅在图层为空且不是背景图层时可设置）*/
  kind: LayerKind;
  /** 图层蒙版的密度。范围：0.0 到 100.0 */
  layerMaskDensity: number;
  /** 图层蒙版的羽化值。范围：0.0 到 250.0 */
  layerMaskFeather: number;
  /** 如果为 true，图层图像中的像素无法编辑 */
  pixelsLocked: boolean;
  /** 如果为 true，图层图像中的像素无法在图层内移动 */
  positionLocked: boolean;
  /** 与图层关联的文本（仅当 kind 为文字图层时有效）（只读）*/
  readonly textItem: TextItem;
  /** 如果为 true，编辑操作限制在图层的不透明部分 */
  transparentPixelsLocked: boolean;
  /** 矢量蒙版的密度。范围：0.0 到 100.0 */
  vectorMaskDensity: number;
  /** 矢量蒙版的羽化值。范围：0.0 到 250.0 */
  vectorMaskFeather: number;

  // 基础操作
  /** 清除图层（不复制到剪贴板）*/
  clear(): void;
  /**
   * 将图层复制到剪贴板。
   * @param merge 是否合并所有可见图层（可选）
   */
  copy(merge?: boolean): void;
  /** 将图层剪切到剪贴板 */
  cut(): void;
  /** 向下合并图层，返回被合并到的图层 */
  merge(): ArtLayer;
  /**
   * 将图层中的内容转换为栅格图像。
   * @param target 要栅格化的内容类型（可选）
   */
  rasterize(target?: RasterizeType): void;

  // 调整与颜色
  /**
   * 调整亮度和对比度。
   * @param brightness 亮度（-100 到 100）
   * @param contrast 对比度（-100 到 100）
   */
  adjustBrightnessContrast(brightness: number, contrast: number): void;

  /**
   * 调整图层分量的颜色平衡。
   * @param shadowLevels 阴影色阶（[CMY, CMY, CMY]）
   * @param midtoneLevels 中间调色阶
   * @param highlightLevels 高光色阶
   * @param preserveLuminosity 是否保留明度
   */
  adjustColorBalance(shadowLevels: number[], midtoneLevels: number[], highlightLevels: number[], preserveLuminosity: boolean): void;

  /**
   * 使用多达 14 个点调整所选通道的色调范围。
   * @param curveShape 曲线形状（[输入, 输出] 数组）
   */
  adjustCurves(curveShape: number[][]): void;

  /**
   * 调整所选通道的色阶。
   * @param inputRangeStart 输入范围起始（0 到 253）
   * @param inputRangeEnd 输入范围结束（2 到 255）
   * @param inputRangeGamma 输入范围 Gamma（0.10 到 9.99）
   * @param outputRangeStart 输出范围起始（0 到 255）
   * @param outputRangeEnd 输出范围结束（0 到 255）
   */
  adjustLevels(inputRangeStart: number, inputRangeEnd: number, inputRangeGamma: number, outputRangeStart: number, outputRangeEnd: number): void;

  /** 自动调整所选通道的对比度 */
  autoContrast(): void;
  /** 使用自动色阶选项调整色阶 */
  autoLevels(): void;
  /** 将彩色图像转换为灰度图像 */
  desaturate(): void;
  /** 重新分布像素亮度值 */
  equalize(): void;
  /** 反转图层中的颜色 */
  invert(): void;

  /**
   * 指定每通道色调级别数。
   * @param levels 色调级别数（2 到 255）
   */
  posterize(levels: number): void;

  /**
   * 将图像转换为高对比度的黑白图像。
   * @param level 阈值（1 到 255）
   */
  threshold(level: number): void;

  // 滤镜
  /**
   * 添加杂色滤镜。
   * @param amount 杂色量
   * @param distribution 分布类型
   * @param monochromatic 是否为单色
   */
  applyAddNoise(amount: number, distribution: NoiseDistribution, monochromatic: boolean): void;

  /** 平均滤镜 */
  applyAverage(): void;
  /** 模糊滤镜 */
  applyBlur(): void;
  /** 进一步模糊滤镜 */
  applyBlurMore(): void;
  /** 云彩滤镜 */
  applyClouds(): void;
  /** 去交错滤镜 */
  applyDeInterlace(eliminateFields: EliminateFields, createFields: CreateFields): void;
  /** 去斑滤镜 */
  applyDespeckle(): void;
  /** 分层云彩滤镜 */
  applyDifferenceClouds(): void;

  /**
   * 高斯模糊滤镜。
   * @param radius 模糊半径（像素）
   */
  applyGaussianBlur(radius: number): void;

  /**
   * 高反差保留滤镜。
   * @param radius 半径
   */
  applyHighPass(radius: number): void;

  /**
   * 镜头光晕滤镜。
   * @param brightness 亮度（10 到 300）
   * @param flareCenter 光晕中心 [x, y]
   * @param lensType 镜头类型
   */
  applyLensFlare(brightness: number, flareCenter: [number, number], lensType: LensType): void;

  /**
   * 最大值滤镜。
   * @param radius 半径（像素）
   */
  applyMaximum(radius: number): void;

  /**
   * 最小值滤镜。
   * @param radius 半径（像素）
   */
  applyMinimum(radius: number): void;

  /**
   * 动感模糊滤镜。
   * @param angle 角度（-360 到 360 度）
   * @param distance 距离（像素，1 到 999）
   */
  applyMotionBlur(angle: number, distance: number): void;

  /** NTSC 颜色滤镜 */
  applyNTSC(): void;

  /**
   * 位移滤镜。
   * @param horizontal 水平位移
   * @param vertical 垂直位移
   * @param undefinedAreas 未定义区域处理
   */
  applyOffset(horizontal: number, vertical: number, undefinedAreas: OffsetUndefinedAreas): void;

  /**
   * 径向模糊滤镜。
   * @param amount 数量（1 到 100）
   * @param blurMethod 模糊方法
   * @param blurQuality 模糊品质
   */
  applyRadialBlur(amount: number, blurMethod: RadialBlurMethod, blurQuality: RadialBlurQuality): void;

  /**
   * 锐化滤镜。
   */
  applySharpen(): void;
  /** 锐化边缘滤镜 */
  applySharpenEdges(): void;
  /** 进一步锐化滤镜 */
  applySharpenMore(): void;

  /**
   * 智能模糊滤镜。
   * @param radius 半径
   * @param threshold 阈值
   * @param blurQuality 模糊品质
   * @param mode 模糊模式
   */
  applySmartBlur(radius: number, threshold: number, blurQuality: SmartBlurQuality, mode: SmartBlurMode): void;

  /**
   * 球面化滤镜。
   * @param amount 数量（-100 到 100）
   * @param mode 球面化模式
   */
  applySpherize(amount: number, mode: SpherizeMode): void;

  /**
   * USM 锐化滤镜。
   * @param amount 数量（1 到 500）
   * @param radius 半径（0.1 到 250.0）
   * @param threshold 阈值（0 到 255）
   */
  applyUnSharpMask(amount: number, radius: number, threshold: number): void;

  // 样式
  /**
   * 将指定的样式应用到图层。
   * @param styleName 样式名称
   */
  applyStyle(styleName: string): void;
}

// ============================================================
// ArtLayers 集合
// ============================================================

/** 艺术图层集合 */
declare class ArtLayers {
  /** 图层数量（只读）*/
  readonly length: number;
  /** 对象的容器（只读）*/
  readonly parent: Document | LayerSet;
  /** 对象的类名（只读）*/
  readonly typename: string;
  /** 通过索引访问图层 */
  [index: number]: ArtLayer;

  /**
   * 新建艺术图层。
   * @returns 新创建的艺术图层
   */
  add(): ArtLayer;

  /**
   * 通过名称获取艺术图层。
   * @param name 图层名称
   */
  getByName(name: string): ArtLayer;

  /** 删除所有艺术图层 */
  removeAll(): void;
}

// ============================================================
// LayerSet 类（图层组）
// ============================================================

/**
 * 图层对象组（图层组），可包含艺术图层和其他嵌套的图层组。
 */
declare class LayerSet extends Layer {
  /** 该图层集中包含的艺术图层（只读）*/
  readonly artLayers: ArtLayers;
  /** 为该图层集启用的通道（只读）*/
  readonly enabledChannels: Channel[];
  /** 该图层集中包含的子图层集（只读）*/
  readonly layerSets: LayerSets;
  /** 该图层集中的所有图层（只读）*/
  readonly layers: Layers;

  /** 添加一个元素 */
  add(): LayerSet;
  /** 合并该图层集 */
  merge(): ArtLayer;
}

// ============================================================
// LayerSets 集合
// ============================================================

/** 图层组集合 */
declare class LayerSets {
  /** 图层组数量（只读）*/
  readonly length: number;
  /** 对象的容器（只读）*/
  readonly parent: Document | LayerSet;
  /** 对象的类名（只读）*/
  readonly typename: string;
  /** 通过索引访问图层组 */
  [index: number]: LayerSet;

  /**
   * 新建图层组。
   * @returns 新创建的图层组
   */
  add(): LayerSet;

  /**
   * 通过名称获取图层组。
   * @param name 图层组名称
   */
  getByName(name: string): LayerSet;

  /** 删除所有图层组 */
  removeAll(): void;
}

// ============================================================
// Layers 集合（图层与图层组的混合集合）
// ============================================================

/** 图层集合（包含 ArtLayer 和 LayerSet）*/
declare class Layers {
  /** 图层数量（只读）*/
  readonly length: number;
  /** 对象的容器（只读）*/
  readonly parent: Document | LayerSet;
  /** 对象的类名（只读）*/
  readonly typename: string;
  /** 通过索引访问图层 */
  [index: number]: ArtLayer | LayerSet;

  /**
   * 通过名称获取图层。
   * @param name 图层名称
   */
  getByName(name: string): ArtLayer | LayerSet;

  /** 删除所有图层 */
  removeAll(): void;
}

// ============================================================
// LayerComp 类
// ============================================================

/** 图层复合 */
declare class LayerComp {
  /** 如果为 true，则图层复合已应用（只读）*/
  readonly applied: boolean;
  /** 如果为 true，则图层复合捕获图层外观（只读）*/
  readonly appearance: boolean;
  /** 注释（只读）*/
  readonly comment: string;
  /** 如果为 true，则图层复合捕获图层位置（只读）*/
  readonly position: boolean;
  /** 如果为 true，则图层复合捕获图层可见性（只读）*/
  readonly visibility: boolean;
  /** 图层复合名称 */
  name: string;
  /** 对象的容器（只读）*/
  readonly parent: Document;
  /** 对象的类名（只读）*/
  readonly typename: string;

  /** 将图层复合应用到文档 */
  apply(): void;
  /**
   * 将图层复合重置为文档的当前状态。
   */
  recapture(): void;
  /** 删除图层复合 */
  remove(): void;
  /** 恢复图层复合的上一个状态 */
  resetLayerComp(): void;
}

/** 图层复合集合 */
declare class LayerComps {
  /** 图层复合数量（只读）*/
  readonly length: number;
  /** 对象的容器（只读）*/
  readonly parent: Document;
  /** 对象的类名（只读）*/
  readonly typename: string;
  /** 通过索引访问图层复合 */
  [index: number]: LayerComp;

  /**
   * 新建图层复合。
   * @param name 图层复合名称
   * @param comment 注释（可选）
   * @param appearance 是否捕获外观（可选）
   * @param position 是否捕获位置（可选）
   * @param visibility 是否捕获可见性（可选）
   */
  add(name: string, comment?: string, appearance?: boolean, position?: boolean, visibility?: boolean): LayerComp;

  /**
   * 通过名称获取图层复合。
   * @param name 名称
   */
  getByName(name: string): LayerComp;

  /** 删除所有图层复合 */
  removeAll(): void;
}
