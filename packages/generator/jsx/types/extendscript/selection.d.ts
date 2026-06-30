/**
 * Photoshop 选区类型声明
 * 来源: https://theiviaxx.github.io/photoshop-docs/Photoshop/
 */

/**
 * 文档或图层中的选定区域。
 * 通过 Document.selection 属性访问。
 */
declare class Selection {
  /** 整个选区的边界矩形（只读）*/
  readonly bounds: [number, number, number, number];
  /** 对象的容器（只读）*/
  readonly parent: Document;
  /** 如果为 true，则边界矩形为实心矩形（只读）*/
  readonly solid: boolean;
  /** 对象的类名（只读）*/
  readonly typename: string;

  /** 清除选区（不复制到剪贴板）*/
  clear(): void;

  /**
   * 收缩选区。
   * @param by 收缩量（像素）
   */
  contract(by: number): void;

  /**
   * 将选区复制到剪贴板。
   * @param merged 是否复制所有可见图层（可选）
   */
  copy(merged?: boolean): void;

  /** 将当前选区剪切到剪贴板 */
  cut(): void;

  /** 取消选择当前选区 */
  deselect(): void;

  /**
   * 扩大选区。
   * @param by 扩大量（像素）
   */
  expand(by: number): void;

  /**
   * 羽化选区的边缘。
   * @param by 羽化量（像素）
   */
  feather(by: number): void;

  /**
   * 填充选区。
   * @param fillType 填充类型（颜色、内容识别等）
   * @param mode 混合模式（可选）
   * @param opacity 不透明度（可选）
   * @param preserveTransparency 是否保留透明度（可选）
   */
  fill(fillType: SolidColor | DocumentFill, mode?: BlendMode, opacity?: number, preserveTransparency?: boolean): void;

  /**
   * 增大选区以包含所有落在指定容差范围内的相邻像素。
   * @param tolerance 容差值（0-255）
   * @param antiAlias 是否使用消除锯齿（可选）
   */
  grow(tolerance: number, antiAlias?: boolean): void;

  /** 反转选区 */
  invert(): void;

  /**
   * 从指定通道加载选区。
   * @param from 包含选区的文档
   * @param channel 要从中加载选区的通道
   * @param inverting 是否反转通道的选区（可选）
   */
  load(from: Document, channel: Channel, inverting?: boolean): void;

  /**
   * 将此选区项作为此文档的工作路径。
   * @param tolerance 容差值（可选）
   */
  makeWorkPath(tolerance?: number): void;

  /**
   * 将选定区域调整大小到指定的尺寸和锚点位置。
   * @param horizontal 水平缩放（百分比）
   * @param vertical 垂直缩放（百分比）
   * @param anchor 锚点位置（可选）
   */
  resize(horizontal?: number, vertical?: number, anchor?: AnchorPosition): void;

  /**
   * 缩放选区的边界（不缩放内容）。
   * @param horizontal 水平缩放（百分比）
   * @param vertical 垂直缩放（百分比）
   * @param anchor 锚点位置（可选）
   */
  resizeBoundary(horizontal?: number, vertical?: number, anchor?: AnchorPosition): void;

  /**
   * 旋转对象。
   * @param angle 旋转角度（度）
   * @param anchor 锚点位置（可选）
   */
  rotate(angle: number, anchor?: AnchorPosition): void;

  /**
   * 旋转选区的边界（不旋转内容）。
   * @param angle 旋转角度（度）
   * @param anchor 锚点位置（可选）
   */
  rotateBoundary(angle: number, anchor?: AnchorPosition): void;

  /**
   * 选择指定的区域。
   * @param region 定义选区的坐标数组（[左, 上, 右, 下] 或多边形点数组）
   * @param type 选区操作类型（可选）
   * @param feather 羽化量（可选）
   * @param antiAlias 是否消除锯齿（可选）
   */
  select(region: number[][], type?: SelectionType, feather?: number, antiAlias?: boolean): void;

  /** 选择整个图层 */
  selectAll(): void;

  /**
   * 仅选择选区边框（在指定宽度内）。
   * @param width 边框宽度（像素）
   */
  selectBorder(width: number): void;

  /**
   * 增大选区以包含图像中所有落在容差范围内的像素。
   * @param tolerance 容差值（0-255）
   * @param antiAlias 是否使用消除锯齿（可选）
   */
  similar(tolerance: number, antiAlias?: boolean): void;

  /**
   * 清理基于颜色的选区内部或外部残留的像素。
   * @param radius 半径（像素）
   */
  smooth(radius: number): void;

  /**
   * 将选区保存为通道。
   * @param into 目标文档
   * @param channel 目标通道（可选，若不提供则创建新通道）
   * @param replacing 是否替换已有通道（可选）
   */
  store(into: Document, channel?: Channel, replacing?: SelectionType): void;

  /**
   * 描边选区。
   * @param strokeColor 描边颜色
   * @param width 描边宽度（像素）
   * @param location 描边位置（可选）
   * @param mode 混合模式（可选）
   * @param opacity 不透明度（可选）
   * @param preserveTransparency 是否保留透明度（可选）
   */
  stroke(strokeColor: SolidColor, width: number, location?: StrokeLocation, mode?: BlendMode, opacity?: number, preserveTransparency?: boolean): void;

  /**
   * 相对于当前位置移动对象。
   * @param deltaX 水平移动量
   * @param deltaY 垂直移动量
   */
  translate(deltaX?: number, deltaY?: number): void;

  /**
   * 相对于当前位置移动选区边界（不移动内容）。
   * @param deltaX 水平移动量
   * @param deltaY 垂直移动量
   */
  translateBoundary(deltaX?: number, deltaY?: number): void;
}
