/**
 * Photoshop ExtendScript 枚举类型声明
 * 来源: https://theiviaxx.github.io/photoshop-docs/Photoshop/
 */

// ============================================================
// 图层相关枚举
// ============================================================

/** 图层类型 */
declare enum LayerKind {
  /** 黑白调整图层 */
  BLACKANDWHITE = 22,
  /** 亮度/对比度调整图层 */
  BRIGHTNESSCONTRAST = 9,
  /** 通道混合器调整图层 */
  CHANNELMIXER = 12,
  /** 色彩平衡调整图层 */
  COLORBALANCE = 7,
  /** 颜色查找调整图层 */
  COLORLOOKUP = 26,
  /** 曲线调整图层 */
  CURVES = 6,
  /** 曝光度调整图层 */
  EXPOSURE = 15,
  /** 渐变填充图层 */
  GRADIENTFILL = 4,
  /** 渐变映射调整图层 */
  GRADIENTMAP = 13,
  /** 色相/饱和度调整图层 */
  HUESATURATION = 8,
  /** 反相调整图层 */
  INVERSION = 14,
  /** 3D 图层 */
  LAYER3D = 23,
  /** 色阶调整图层 */
  LEVELS = 5,
  /** 普通图层 */
  NORMAL = 1,
  /** 图案填充图层 */
  PATTERNFILL = 4,
  /** 照片滤镜调整图层 */
  PHOTOFILTER = 16,
  /** 色调分离调整图层 */
  POSTERIZE = 11,
  /** 可选颜色调整图层 */
  SELECTIVECOLOR = 17,
  /** 智能对象图层 */
  SMARTOBJECT = 18,
  /** 纯色填充图层 */
  SOLIDFILL = 3,
  /** 文字图层 */
  TEXT = 2,
  /** 阈值调整图层 */
  THRESHOLD = 10,
  /** 自然饱和度调整图层 */
  VIBRANCE = 20,
  /** 视频图层 */
  VIDEO = 21,
}

/** 图层混合模式 */
declare enum BlendMode {
  /** 颜色 — 以基色的亮度和混合色的色相和饱和度创建结果色 */
  COLORBLEND = 22,
  /** 颜色加深 — 通过增加对比度使基色变暗以反映混合色 */
  COLORBURN = 6,
  /** 颜色减淡 — 通过减小对比度使基色变亮以反映混合色 */
  COLORDODGE = 10,
  /** 变暗 — 选取基色或混合色中较暗的颜色 */
  DARKEN = 4,
  /** 深色 */
  DARKERCOLOR = 28,
  /** 差值 — 从基色中减去混合色或从混合色中减去基色 */
  DIFFERENCE = 18,
  /** 溶解 — 随机替换为基色或混合色的像素 */
  DISSOLVE = 3,
  /** 划分 */
  DIVIDE = 30,
  /** 排除 — 类似差值模式，但对比度较低 */
  EXCLUSION = 19,
  /** 强光 — 根据混合色进行正片叠底或滤色 */
  HARDLIGHT = 14,
  /** 实色混合 */
  HARDMIX = 26,
  /** 色相 — 以基色的亮度和饱和度及混合色的色相创建结果色 */
  HUE = 20,
  /** 变亮 — 选取基色或混合色中较亮的颜色 */
  LIGHTEN = 8,
  /** 浅色 */
  LIGHTERCOLOR = 29,
  /** 线性加深 — 通过减小亮度使基色变暗以反映混合色 */
  LINEARBURN = 7,
  /** 线性减淡 — 通过增加亮度使基色变亮以反映混合色 */
  LINEARDODGE = 11,
  /** 线性光 — 通过调整亮度使颜色加深或减淡 */
  LINEARLIGHT = 16,
  /** 明度 — 以基色的色相和饱和度及混合色的亮度创建结果色 */
  LUMINOSITY = 23,
  /** 正片叠底 — 将基色与混合色相乘 */
  MULTIPLY = 5,
  /** 正常 */
  NORMAL = 2,
  /** 叠加 — 正片叠底或滤色，同时保留高光和阴影 */
  OVERLAY = 12,
  /** 穿透 — 允许混合模式影响图层集中下方的图层 */
  PASSTHROUGH = 1,
  /** 点光 — 根据混合色的亮度替换颜色 */
  PINLIGHT = 17,
  /** 饱和度 — 以基色的亮度和色相及混合色的饱和度创建结果色 */
  SATURATION = 21,
  /** 滤色 — 将混合色与基色的互补色相乘 */
  SCREEN = 9,
  /** 柔光 — 使颜色变暗或变亮 */
  SOFTLIGHT = 13,
  /** 减去 */
  SUBTRACT = 27,
  /** 亮光 — 通过调整对比度使颜色加深或减淡 */
  VIVIDLIGHT = 15,
}

// ============================================================
// 文档与颜色模式枚举
// ============================================================

/** 文档颜色模式 */
declare enum DocumentMode {
  /** 位图（仅黑白两色）*/
  BITMAP = 1,
  /** CMYK 颜色模式 */
  CMYK = 4,
  /** 双色调模式 */
  DUOTONE = 8,
  /** 灰度模式 */
  GRAYSCALE = 2,
  /** 索引颜色 */
  INDEXEDCOLOR = 6,
  /** Lab 颜色 */
  LAB = 5,
  /** 多通道 */
  MULTICHANNEL = 7,
  /** RGB 颜色 */
  RGB = 3,
}

/** 新建文档颜色模式 */
declare enum NewDocumentMode {
  /** 位图 */
  BITMAP = 5,
  /** CMYK */
  CMYK = 4,
  /** 灰度 */
  GRAYSCALE = 2,
  /** Lab */
  LAB = 3,
  /** RGB */
  RGB = 1,
}

/** 更改文档颜色模式 */
declare enum ChangeMode {
  /** 位图 */
  BITMAP = 5,
  /** CMYK */
  CMYK = 4,
  /** 灰度 */
  GRAYSCALE = 2,
  /** 索引颜色 */
  INDEXEDCOLOR = 6,
  /** Lab */
  LAB = 3,
  /** 多通道 */
  MULTICHANNEL = 7,
  /** RGB */
  RGB = 1,
}

/** 颜色模型 */
declare enum ColorModel {
  /** CMYK 颜色模型 */
  CMYK = 4,
  /** 灰度颜色模型 */
  GRAYSCALE = 2,
  /** HSB 颜色模型 */
  HSB = 5,
  /** Lab 颜色模型 */
  LAB = 3,
  /** 未分配颜色模型 */
  NONE = 6,
  /** RGB 颜色模型 */
  RGB = 1,
}

/** 颜色配置文件类型 */
declare enum ColorProfileType {
  /** 使用自定义颜色配置文件管理文档 */
  CUSTOM = 3,
  /** 文档未进行颜色管理 */
  NONE = 1,
  /** 使用工作颜色配置文件管理文档 */
  WORKING = 2,
}

// ============================================================
// 单位与测量枚举
// ============================================================

/** 单位（标尺单位）*/
declare enum Units {
  /** 厘米 */
  CM = 3,
  /** 英寸 */
  INCHES = 2,
  /** 毫米 */
  MM = 4,
  /** 百分比 */
  PERCENT = 7,
  /** 派卡 */
  PICAS = 6,
  /** 像素 */
  PIXELS = 1,
  /** 点 */
  POINTS = 5,
}

/** 文字单位 */
declare enum TypeUnits {
  /** 毫米 */
  MM = 4,
  /** 像素 */
  PIXELS = 1,
  /** 点 */
  POINTS = 5,
}

/** 每通道位数 */
declare enum BitsPerChannelType {
  /** 1 位/通道 */
  ONE = 1,
  /** 8 位/通道 */
  EIGHT = 8,
  /** 16 位/通道 */
  SIXTEEN = 16,
  /** 32 位/通道 */
  THIRTYTWO = 32,
}

// ============================================================
// 选区相关枚举
// ============================================================

/** 选区操作类型 */
declare enum SelectionType {
  /** 从已选择区域中移除 */
  DIMINISH = 3,
  /** 添加到已选择区域 */
  EXTEND = 2,
  /** 仅保留新选区与当前选区的交集 */
  INTERSECT = 4,
  /** 替换已选择区域 */
  REPLACE = 1,
}

// ============================================================
// 通道相关枚举
// ============================================================

/** 通道类型 */
declare enum ChannelType {
  /** 与文档颜色模型相关的通道 */
  COMPONENT = 1,
  /** Alpha 通道（颜色表示蒙版区域）*/
  MASKEDAREA = 2,
  /** Alpha 通道（颜色表示选中区域）*/
  SELECTEDAREA = 3,
  /** 专色通道 */
  SPOTCOLOR = 4,
}

// ============================================================
// 路径相关枚举
// ============================================================

/** 路径类型 */
declare enum PathKind {
  /** 剪切路径 */
  CLIPPINGPATH = 2,
  /** 普通路径 */
  NORMALPATH = 1,
  /** 文字蒙版路径 */
  TEXTMASK = 5,
  /** 矢量蒙版路径 */
  VECTORMASK = 4,
  /** 工作路径 */
  WORKPATH = 3,
}

/** 路径点类型 */
declare enum PointKind {
  /** 角点（必须为直角）*/
  CORNERPOINT = 2,
  /** 平滑点（可以为曲线）*/
  SMOOTHPOINT = 1,
}

// ============================================================
// 文本相关枚举
// ============================================================

/** 文字类型 */
declare enum TextType {
  /** 区域文字（在定界框内自动换行）*/
  PARAGRAPHTEXT = 2,
  /** 点文字（不换行）*/
  POINTTEXT = 1,
}

/** 段落对齐方式 */
declare enum Justification {
  /** 居中对齐 */
  CENTER = 3,
  /** 末行居中对齐的两端对齐 */
  CENTERJUSTIFIED = 6,
  /** 强制两端对齐 */
  FULLYJUSTIFIED = 7,
  /** 左对齐 */
  LEFT = 1,
  /** 末行左对齐的两端对齐 */
  LEFTJUSTIFIED = 4,
  /** 右对齐 */
  RIGHT = 2,
  /** 末行右对齐的两端对齐 */
  RIGHTJUSTIFIED = 5,
}

/** 自动字距调整 */
declare enum AutoKernType {
  /** 手动字距调整 */
  MANUAL = 3,
  /** 字距调整对 */
  METRICS = 1,
  /** 视觉字距调整 */
  OPTICAL = 2,
}

/** 大小写格式 */
declare enum Case {
  /** 全大写 */
  ALLCAPS = 2,
  /** 正常大小写 */
  NORMAL = 1,
  /** 小型大写字母 */
  SMALLCAPS = 3,
}

/** 删除线选项 */
declare enum StrikeThruType {
  /** 关闭删除线 */
  STRIKEOFF = 1,
  /** 从文字高度中间划线 */
  STRIKEHEIGHT = 3,
  /** 从文字框中间划线 */
  STRIKEBOX = 2,
}

/** 下划线选项 */
declare enum UnderlineType {
  /** 下划线在文字下方 */
  UNDERLINELEFT = 2,
  /** 关闭下划线 */
  UNDERLINEOFF = 1,
  /** 下划线在文字右方 */
  UNDERLINERIGHT = 3,
}

/** 文本排版引擎 */
declare enum TextComposer {
  /** Adobe 中东单行排版引擎 */
  ADOBEMIDDLEEASTERN = 3,
  /** Adobe 单行排版引擎 */
  ADOBESINGLELINE = 2,
  /** Adobe 多行排版引擎 */
  ADOBEEVERYLINE = 1,
}

/** 抗锯齿方式 */
declare enum AntiAlias {
  /** 无抗锯齿 */
  NONE = 1,
  /** 尖锐 */
  SHARP = 2,
  /** 清晰 */
  CRISP = 3,
  /** 强 */
  STRONG = 4,
  /** 平滑 */
  SMOOTH = 5,
}

/** 变形方向 */
declare enum Direction {
  /** 水平方向 */
  HORIZONTAL = 1,
  /** 垂直方向 */
  VERTICAL = 2,
}

// ============================================================
// 保存与导出枚举
// ============================================================

/** 保存选项（关闭文档时）*/
declare enum SaveOptions {
  /** 不保存更改 */
  DONOTSAVECHANGES = 2,
  /** 提示用户是否保存 */
  PROMPTTOSAVECHANGES = 3,
  /** 保存更改 */
  SAVECHANGES = 1,
}

/** JPEG 格式选项 */
declare enum FormatOptionsType {
  /** 优化基线（较小文件大小）*/
  OPTIMIZEDBASELINE = 2,
  /** 渐进式（下载时逐步显示）*/
  PROGRESSIVE = 3,
  /** 标准基线（大多数浏览器支持）*/
  STANDARDBASELINE = 1,
}

/** 杂边颜色 */
declare enum MatteType {
  /** 当前背景色 */
  BACKGROUND = 7,
  /** 黑色 */
  BLACK = 3,
  /** 当前前景色 */
  FOREGROUND = 6,
  /** Netscape 灰色 */
  NETSCAPE = 5,
  /** 无 */
  NONE = 1,
  /** 50% 灰色 */
  SEMIGRAY = 4,
  /** 白色 */
  WHITE = 2,
}

/** TIFF 编码类型 */
declare enum TiffEncodingType {
  /** JPEG 压缩（有损）*/
  JPEG = 3,
  /** 无压缩 */
  NONE = 1,
  /** LZW 压缩（无损）*/
  TIFFLZW = 2,
  /** ZIP 压缩（无损）*/
  TIFFZIP = 4,
}

/** 字节顺序 */
declare enum ByteOrderType {
  /** IBM PC 字节顺序 */
  IBM = 2,
  /** Mac OS 字节顺序 */
  MACOS = 1,
}

/** 图层压缩类型 */
declare enum LayerCompressionType {
  /** RLE 压缩（无损）*/
  RLE = 1,
  /** ZIP 压缩（无损）*/
  ZIP = 2,
}

/** 导出类型 */
declare enum ExportType {
  /** 导出为 Illustrator 路径 */
  ILLUSTRATORPATHS = 1,
  /** 存储为 Web 所用格式 */
  SAVEFORWEB = 2,
}

// ============================================================
// 元素放置枚举
// ============================================================

/** 元素放置位置 */
declare enum ElementPlacement {
  /** 放置在指定元素之后 */
  PLACEAFTER = 4,
  /** 放置在末尾 */
  PLACEATEND = 5,
  /** 放置在指定元素之前 */
  PLACEBEFORE = 3,
  /** 放置在开头 */
  PLACEATBEGINNING = 1,
  /** 放置在内部 */
  PLACEINSIDE = 2,
}

/** 锚点位置 */
declare enum AnchorPosition {
  /** 底部中间 */
  BOTTOMCENTER = 8,
  /** 左下角 */
  BOTTOMLEFT = 7,
  /** 右下角 */
  BOTTOMRIGHT = 9,
  /** 中心 */
  MIDDLECENTER = 5,
  /** 左侧中间 */
  MIDDLELEFT = 4,
  /** 右侧中间 */
  MIDDLERIGHT = 6,
  /** 顶部中间 */
  TOPCENTER = 2,
  /** 左上角 */
  TOPLEFT = 1,
  /** 右上角 */
  TOPRIGHT = 3,
}

// ============================================================
// 图像调整与滤镜枚举
// ============================================================

/** 对话框显示模式 */
declare enum DialogModes {
  /** 显示所有对话框 */
  ALL = 1,
  /** 仅显示错误对话框 */
  ERROR = 2,
  /** 不显示任何对话框 */
  NO = 3,
}

/** 重采样方法 */
declare enum ResampleMethod {
  /** 自动选择 */
  AUTOMATIC = 8,
  /** 两次立方 */
  BICUBIC = 4,
  /** 两次立方（自动）*/
  BICUBICAUTOMATIC = 7,
  /** 两次立方（较锐利，适合缩小）*/
  BICUBICSHARPER = 5,
  /** 两次立方（较平滑，适合放大）*/
  BICUBICSMOOTHER = 6,
  /** 两次线性 */
  BILINEAR = 3,
  /** 邻近 */
  NEARESTNEIGHBOR = 2,
  /** 不重采样 */
  NONE = 1,
  /** 保留细节 */
  PRESERVEDETAILS = 9,
}

/** 描边位置 */
declare enum StrokeLocation {
  /** 描边在选区或图层边界的中央 */
  CENTER = 2,
  /** 描边在选区或图层边界内侧 */
  INSIDE = 1,
  /** 描边在选区或图层边界外侧 */
  OUTSIDE = 3,
}

/** 栅格化类型 */
declare enum RasterizeType {
  /** 栅格化图层上的所有矢量数据 */
  ENTIRELAYER = 5,
  /** 栅格化形状图层的填充 */
  FILLCONTENT = 2,
  /** 栅格化形状图层的矢量蒙版 */
  LAYERCLIPPINGPATH = 3,
  /** 栅格化选定图层 */
  LINKEDLAYERS = 4,
  /** 栅格化形状图层 */
  SHAPE = 6,
  /** 栅格化文字图层上的文字 */
  TEXTCONTENTS = 1,
}

/** 修剪类型 */
declare enum TrimType {
  /** 修剪与右下角像素颜色相同的区域 */
  BOTTOMRIGHT = 3,
  /** 修剪与左上角像素颜色相同的区域 */
  TOPLEFT = 1,
  /** 修剪透明区域 */
  TRANSPARENT = 2,
}

/** 文档填充类型（新建文档）*/
declare enum DocumentFill {
  /** 工具箱中显示的背景色 */
  BACKGROUNDCOLOR = 2,
  /** 透明 */
  TRANSPARENT = 3,
  /** 白色 */
  WHITE = 1,
}

/** 清除缓存目标 */
declare enum PurgeTarget {
  /** 清除所有缓存 */
  ALLCACHES = 4,
  /** 清除剪贴板 */
  CLIPBOARDCACHE = 2,
  /** 删除历史记录状态 */
  HISTORYCACHES = 3,
  /** 清除撤销缓存 */
  UNDOCACHES = 1,
}

// ============================================================
// 动作管理器值类型枚举
// ============================================================

/** ActionDescriptor 值类型 */
declare enum DescValueType {
  /** 别名 */
  ALIASTYPE = 10,
  /** 布尔值 */
  BOOLEANTYPE = 5,
  /** 类 */
  CLASSTYPE = 8,
  /** 双精度浮点数 */
  DOUBLETYPE = 2,
  /** 枚举 */
  ENUMERATEDTYPE = 9,
  /** 整数 */
  INTEGERTYPE = 3,
  /** 长整数 */
  LARGEINTEGERTYPE = 11,
  /** 动作列表 */
  LISTTYPE = 7,
  /** 对象 */
  OBJECTTYPE = 6,
  /** 原始数据 */
  RAWTYPE = 12,
  /** 引用 */
  REFERENCETYPE = 13,
  /** 字符串 */
  STRINGTYPE = 4,
  /** 单位 double */
  UNITDOUBLE = 1,
}

/** ActionReference 引用类型 */
declare enum ReferenceFormType {
  /** 类 */
  CLASS = 7,
  /** 枚举 */
  ENUMERATED = 5,
  /** 标识符 */
  IDENTIFIER = 3,
  /** 索引 */
  INDEX = 2,
  /** 名称 */
  NAME = 1,
  /** 偏移量 */
  OFFSET = 4,
  /** 属性 */
  PROPERTY = 6,
}

// ============================================================
// 其他常用枚举
// ============================================================

/** 图层组的可见颜色通道 */
declare enum OpenDocumentMode {
  /** 灰度 */
  GRAYSCALE = 2,
  /** Lab */
  LAB = 3,
  /** RGB */
  RGB = 1,
}

/** 打开文档类型 */
declare enum OpenDocumentType {
  /** 3DS */
  _3DS = 54,
  /** Alias PIX */
  ALIASPIX = 25,
  /** BMP */
  BMP = 2,
  /** Camera RAW */
  CAMERARAW = 32,
  /** CompuServe GIF */
  COMPUSERVEGIF = 3,
  /** DICOM */
  DICOM = 42,
  /** EPS */
  EPS = 22,
  /** EPSF */
  EPSF = 19,
  /** FilmStrip */
  FILMSTRIP = 5,
  /** JPEG */
  JPEG = 6,
  /** Large Document */
  LARGEDOCUMENTFORMAT = 44,
  /** Photoshop */
  PHOTOSHOP = 1,
  /** Photoshop DCS 1.0 */
  PHOTOSHOPDCS_1 = 23,
  /** Photoshop DCS 2.0 */
  PHOTOSHOPDCS_2 = 24,
  /** Photoshop EPS */
  PHOTOSHOPEPS = 21,
  /** Photoshop PDF */
  PHOTOSHOPPDF = 26,
  /** PICT File */
  PICTFILEFORMAT = 7,
  /** PNG */
  PNG = 13,
  /** Portable Bitmap */
  PORTABLEBITMAP = 36,
  /** Raw */
  RAW = 16,
  /** SGI RGB */
  SGIRGB = 33,
  /** SoftImage */
  SOFTIMAGE = 35,
  /** Targa */
  TARGA = 17,
  /** TIFF */
  TIFF = 15,
  /** Wireless Bitmap */
  WIRELESSBITMAP = 37,
}

/** 保存文档类型 */
declare enum SaveDocumentType {
  /** Alias PIX */
  ALIASPIX = 25,
  /** BMP */
  BMP = 2,
  /** CompuServe GIF */
  COMPUSERVEGIF = 3,
  /** EPS */
  EPS = 22,
  /** JPEG */
  JPEG = 6,
  /** Large Document Format */
  LARGEDOCUMENTFORMAT = 44,
  /** Photoshop */
  PHOTOSHOP = 1,
  /** Photoshop DCS 1.0 */
  PHOTOSHOPDCS_1 = 23,
  /** Photoshop DCS 2.0 */
  PHOTOSHOPDCS_2 = 24,
  /** Photoshop EPS */
  PHOTOSHOPEPS = 21,
  /** Photoshop PDF */
  PHOTOSHOPPDF = 26,
  /** PNG */
  PNG = 13,
  /** Raw */
  RAW = 16,
  /** SGI RGB */
  SGIRGB = 33,
  /** Targa */
  TARGA = 17,
  /** TIFF */
  TIFF = 15,
}

/** 裁剪到区域类型 */
declare enum CropToType {
  /** 裁剪框 */
  CROPBOX = 5,
  /** 出血框 */
  BLEEDBOX = 3,
  /** 媒体框 */
  MEDIABOX = 1,
  /** 裁切框 */
  ARTBOX = 4,
  /** 修剪框 */
  TRIMBOX = 2,
}

/** 朝向 */
declare enum Orientation {
  /** 横向 */
  LANDSCAPE = 2,
  /** 纵向 */
  PORTRAIT = 1,
}
