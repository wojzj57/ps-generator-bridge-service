/**
 * Photoshop 路径类型声明
 * 来源: https://theiviaxx.github.io/photoshop-docs/Photoshop/
 */

// ============================================================
// 路径点相关
// ============================================================

/** 路径点（PathPoints 集合中的元素）*/
declare class PathPoint {
  /** 前向控制点（贝塞尔曲线的方向锚点）[x, y] */
  leftDirection: [number, number];
  /** 路径点的坐标 [x, y] */
  anchor: [number, number];
  /** 后向控制点（贝塞尔曲线的方向锚点）[x, y] */
  rightDirection: [number, number];
  /** 点类型（角点或平滑点）*/
  kind: PointKind;
  /** 对象的容器（只读）*/
  readonly parent: SubPathItem;
  /** 对象的类名（只读）*/
  readonly typename: string;
}

/** 路径点集合 */
declare class PathPoints {
  /** 路径点数量（只读）*/
  readonly length: number;
  /** 对象的容器（只读）*/
  readonly parent: SubPathItem;
  /** 对象的类名（只读）*/
  readonly typename: string;
  /** 通过索引访问路径点 */
  [index: number]: PathPoint;
}

/** 路径点信息（用于创建路径时）*/
declare class PathPointInfo {
  /** 前向控制点 [x, y] */
  leftDirection: [number, number];
  /** 路径点的坐标 [x, y] */
  anchor: [number, number];
  /** 后向控制点 [x, y] */
  rightDirection: [number, number];
  /** 点类型 */
  kind: PointKind;

  constructor();
}

// ============================================================
// 子路径相关
// ============================================================

/** 子路径项 */
declare class SubPathItem {
  /** 如果为 true，则子路径是封闭的（只读）*/
  readonly closed: boolean;
  /** 子路径中的路径点（只读）*/
  readonly pathPoints: PathPoints;
  /** 对象的容器（只读）*/
  readonly parent: PathItem;
  /** 对象的类名（只读）*/
  readonly typename: string;
}

/** 子路径集合 */
declare class SubPathItems {
  /** 子路径数量（只读）*/
  readonly length: number;
  /** 对象的容器（只读）*/
  readonly parent: PathItem;
  /** 对象的类名（只读）*/
  readonly typename: string;
  /** 通过索引访问子路径 */
  [index: number]: SubPathItem;
}

/** 子路径信息（用于创建路径时）*/
declare class SubPathInfo {
  /** 是否封闭 */
  closed: boolean;
  /** 路径点信息数组 */
  entireSubPath: PathPointInfo[];
  /** 路径操作类型 */
  operation: ShapeOperation;

  constructor();
}

// ============================================================
// 路径项
// ============================================================

/**
 * 表示一个路径或绘制对象（例如形状的轮廓或直线/曲线），
 * 其中包含构成其几何结构的子路径。
 */
declare class PathItem {
  /** 路径的类型（只读）*/
  readonly kind: PathKind;
  /** 路径项的名称 */
  name: string;
  /** 对象的容器（只读）*/
  readonly parent: Document;
  /** 此路径项的子路径对象（只读）*/
  readonly subPathItems: SubPathItems;
  /** 对象的类名（只读）*/
  readonly typename: string;

  /** 取消选中路径 */
  deselect(): void;

  /**
   * 复制此路径项。
   * @param targetDocument 目标文档（可选）
   * @param placement 放置位置（可选）
   */
  duplicate(targetDocument?: Document, placement?: ElementPlacement): PathItem;

  /**
   * 填充路径所包围的区域。
   * @param fillColor 填充颜色（可选）
   * @param mode 混合模式（可选）
   * @param opacity 不透明度（可选）
   * @param preserveTransparency 是否保留透明度（可选）
   * @param feather 羽化量（可选）
   * @param antiAlias 是否消除锯齿（可选）
   * @param wholePath 是否填充整个路径（可选）
   */
  fillPath(fillColor?: SolidColor, mode?: BlendMode, opacity?: number, preserveTransparency?: boolean, feather?: number, antiAlias?: boolean, wholePath?: boolean): void;

  /**
   * 将此路径项设为此文档的剪切路径。
   * @param flatness 平坦度（可选）
   */
  makeClippingPath(flatness?: number): void;

  /**
   * 从此路径项对象创建一个选定对象。
   * @param feather 羽化量（可选）
   * @param antiAlias 是否消除锯齿（可选）
   * @param operation 选区操作类型（可选）
   */
  makeSelection(feather?: number, antiAlias?: boolean, operation?: SelectionType): void;

  /** 删除此路径 */
  remove(): void;

  /** 将此路径项设为活动或选定路径项 */
  select(): void;

  /**
   * 描边路径。
   * @param tool 描边使用的工具（可选）
   * @param simulatePressure 是否模拟压力（可选）
   */
  strokePath(tool?: ToolType, simulatePressure?: boolean): void;
}

/** 路径集合 */
declare class PathItems {
  /** 路径数量（只读）*/
  readonly length: number;
  /** 对象的容器（只读）*/
  readonly parent: Document;
  /** 对象的类名（只读）*/
  readonly typename: string;
  /** 通过索引访问路径项 */
  [index: number]: PathItem;

  /**
   * 新建路径。
   * @param name 路径名称
   * @param entirePath 路径信息数组
   */
  add(name: string, entirePath: SubPathInfo[]): PathItem;

  /**
   * 通过名称获取路径。
   * @param name 路径名称
   */
  getByName(name: string): PathItem;

  /** 删除所有路径 */
  removeAll(): void;
}
