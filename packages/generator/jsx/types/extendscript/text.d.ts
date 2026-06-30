/**
 * Photoshop 文字类型声明
 * 来源: https://theiviaxx.github.io/photoshop-docs/Photoshop/
 */

/** 字体对象 */
declare class TextFont {
  /** 字体系列名称（只读）*/
  readonly family: string;
  /** 字体名称（只读）*/
  readonly name: string;
  /** 对象的容器（只读）*/
  readonly parent: Application;
  /** 是否为固定宽度字体（只读）*/
  readonly postScriptName: string;
  /** 字体样式（只读）*/
  readonly style: string;
  /** 对象的类名（只读）*/
  readonly typename: string;
}

/** 字体集合 */
declare class TextFonts {
  /** 字体数量（只读）*/
  readonly length: number;
  /** 对象的容器（只读）*/
  readonly parent: Application;
  /** 对象的类名（只读）*/
  readonly typename: string;
  /** 通过索引访问字体 */
  [index: number]: TextFont;

  /**
   * 通过名称获取字体。
   * @param name 字体名称
   */
  getByName(name: string): TextFont;
}

/**
 * 包含在 ArtLayer 中的文本对象。
 * 仅当图层的 kind 为文字图层时有效。
 */
declare class TextItem {
  /** 如果为 true，使用替代连字 */
  alternateLigatures: boolean;
  /** 使用的抗锯齿方法 */
  antiAliasMethod: AntiAlias;
  /** 自动字距调整选项 */
  autoKerning: AutoKernType;
  /** 用于自动行距的百分比。范围：0.01 到 5000.00 */
  autoLeadingAmount: number;
  /** 文本的基线偏移量 */
  baselineShift: number;
  /** 文本的大小写格式 */
  capitalization: Case;
  /** 文本颜色 */
  color: SolidColor;
  /** 图层中的实际文本内容 */
  contents: string;
  /** 期望字形缩放百分比。范围：50 - 200（仅两端对齐有效）*/
  desiredGlyphScaling: number;
  /** 期望字母间距百分比。范围：100 - 500（仅两端对齐有效）*/
  desiredLetterScaling: number;
  /** 期望单词间距百分比。范围：0 - 1000（仅两端对齐有效）*/
  desiredWordScaling: number;
  /** 文本方向 */
  direction: Direction;
  /** 如果为 true，使用伪粗体 */
  fauxBold: boolean;
  /** 如果为 true，使用伪斜体 */
  fauxItalic: boolean;
  /** 段落首行缩进量。范围：-1296 到 1296 */
  firstLineIndent: number;
  /** 字符的字体名称 */
  font: string;
  /** 如果为 true，使用罗马式悬挂标点 */
  hangingPuntuation: boolean;
  /** 段落文本边界框的高度 */
  height: number;
  /** 字符水平缩放。范围：0 - 1000（百分比）*/
  horizontalScale: number;
  /** 允许换行断字的最少字母数。范围：1 到 15 */
  hyphenateAfterFirst: number;
  /** 允许换行断字前的最多字母数。范围：1 到 15 */
  hyphenateBeforeLast: number;
  /** 如果为 true，大写单词可以断字 */
  hyphenateCapitalWords: boolean;
  /** 允许换行断字的最少字母数。范围：2 到 25 */
  hyphenateWordsLongerThan: number;
  /** 如果为 true，使用断字 */
  hyphenation: boolean;
  /** 行末导致断字的距离。范围：0 - 720 派卡 */
  hyphenationZone: number;
  /** 连续以连字符结尾的最大行数 */
  hyphenLimit: number;
  /** 段落对齐方式 */
  justification: Justification;
  /** 文本类型（点文字/区域文字）*/
  kind: TextType;
  /** 语言 */
  language: Language;
  /** 行距量 */
  leading: number;
  /** 文本左侧缩进量。范围：-1296 到 1296 */
  leftIndent: number;
  /** 如果为 true，使用连字 */
  ligatures: boolean;
  /** 最大字形缩放百分比。范围：50 - 200 */
  maximumGlyphScaling: number;
  /** 最大字母间距百分比。范围：100 - 500 */
  maximumLetterScaling: number;
  /** 最大单词间距百分比。范围：0 - 1000 */
  maximumWordScaling: number;
  /** 最小字形缩放百分比。范围：50 - 200 */
  minimumGlyphScaling: number;
  /** 最小字母间距百分比。范围：100 - 500 */
  minimumLetterScaling: number;
  /** 最小单词间距百分比。范围：0 - 1000 */
  minimumWordScaling: number;
  /** 如果为 true，禁止在行尾断词 */
  noBreak: boolean;
  /** 如果为 true，使用旧式风格 */
  oldStyle: boolean;
  /** 对象的容器（只读）*/
  readonly parent: ArtLayer;
  /** 文本原点的位置 [x, y] */
  position: [number, number];
  /** 文本右侧缩进量。范围：-1296 到 1296 */
  rightIndent: number;
  /** 字体大小（点）*/
  size: number;
  /** 每个段落后的间距量。范围：-1296 到 1296 */
  spaceAfter: number;
  /** 每个段落前的间距量。范围：-1296 到 1296 */
  spaceBefore: number;
  /** 删除线选项 */
  strikeThru: StrikeThruType;
  /** 使用的文本排版引擎 */
  textComposer: TextComposer;
  /** 多个字符之间的均匀间距量。范围：-1000 到 10000 */
  tracking: number;
  /** 对象的类名（只读）*/
  readonly typename: string;
  /** 下划线选项 */
  underline: UnderlineType;
  /** 如果为 true，使用字体内置的行距信息 */
  useAutoLeading: boolean;
  /** 字符垂直缩放。范围：0 - 1000（百分比）*/
  verticalScale: number;
  /** 变形弯曲百分比。范围：-100 到 100 */
  warpBend: number;
  /** 变形方向 */
  warpDirection: Direction;
  /** 变形水平扭曲百分比。范围：-100 到 100 */
  warpHorizontalDistortion: number;
  /** 变形样式 */
  warpStyle: WarpStyle;
  /** 变形垂直扭曲百分比。范围：-100 到 100 */
  warpVerticalDistortion: number;
  /** 段落文本边界框的宽度 */
  width: number;

  /** 将文本对象及其包含的图层转换为填充图层，文本更改为剪切路径 */
  convertToShape(): void;

  /** 从实际文本项的轮廓创建剪切路径 */
  createPath(): void;
}
