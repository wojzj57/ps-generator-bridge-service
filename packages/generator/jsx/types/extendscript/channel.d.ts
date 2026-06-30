/**
 * Photoshop 通道类型声明
 * 来源: https://theiviaxx.github.io/photoshop-docs/Photoshop/
 */

/**
 * 存储图像颜色元素信息的通道对象。
 * 文档的颜色模式决定了默认通道的数量。
 */
declare class Channel {
  /** 通道的颜色（对组件通道无效）*/
  color: SolidColor;
  /** 通道颜色的直方图（只读）*/
  readonly histogram: number[];
  /** 通道的类型（只读）*/
  readonly kind: ChannelType;
  /** 通道的名称 */
  name: string;
  /**
   * Alpha 通道的不透明度（对专色通道称为 solidity）。
   * 范围：0 到 100。仅当类型为 masked area 或 selected area 时有效。
   */
  opacity: number;
  /** 对象的容器（只读）*/
  readonly parent: Document;
  /** 对象的类名（只读）*/
  readonly typename: string;
  /** 如果为 true，则通道可见 */
  visible: boolean;

  /**
   * 复制该通道。
   * @param targetDocument 目标文档（可选）
   * @param placement 放置位置（可选）
   */
  duplicate(targetDocument?: Document, placement?: ElementPlacement): Channel;

  /** 将专色通道合并到组件通道中 */
  merge(): void;

  /** 删除此通道 */
  remove(): void;
}

/** 通道集合 */
declare class Channels {
  /** 通道数量（只读）*/
  readonly length: number;
  /** 对象的容器（只读）*/
  readonly parent: Document;
  /** 对象的类名（只读）*/
  readonly typename: string;
  /** 通过索引访问通道 */
  [index: number]: Channel;

  /**
   * 添加一个新通道。
   * @returns 新创建的通道
   */
  add(): Channel;

  /**
   * 通过名称获取通道。
   * @param name 通道名称
   */
  getByName(name: string): Channel;

  /** 删除所有通道 */
  removeAll(): void;
}
