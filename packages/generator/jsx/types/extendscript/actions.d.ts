/**
 * Photoshop Action Manager 类型声明
 * 来源: https://theiviaxx.github.io/photoshop-docs/Photoshop/
 */

// ============================================================
// ActionDescriptor
// ============================================================

/**
 * Action Manager 的核心类，包含键值对的记录，用于定义和存储动作。
 * 用于 app.executeAction() 和 app.executeActionGet()。
 */
declare class ActionDescriptor {
  /** 描述符中包含的键的数量（只读）*/
  readonly count: number;

  /** 清空描述符 */
  clear(): void;

  /** 判断描述符是否包含指定键 */
  hasKey(key: number): boolean;

  /** 获取键对应的值类型 */
  getType(key: number): DescValueType;

  // Getter 方法
  getBoolean(key: number): boolean;
  getClass(key: number): number;
  getData(key: number): string;
  getDouble(key: number): number;
  getEnumerationType(key: number): number;
  getEnumerationValue(key: number): number;
  getInteger(key: number): number;
  getLargeInteger(key: number): number;
  getList(key: number): ActionList;
  getObjectType(key: number): number;
  getObjectValue(key: number): ActionDescriptor;
  getPath(key: number): File;
  getReference(key: number): ActionReference;
  getString(key: number): string;
  getUnitDoubleType(key: number): number;
  getUnitDoubleValue(key: number): number;

  // Setter 方法
  putBoolean(key: number, value: boolean): void;
  putClass(key: number, value: number): void;
  putData(key: number, value: string): void;
  putDouble(key: number, value: number): void;
  putEnumerated(key: number, enumType: number, value: number): void;
  putInteger(key: number, value: number): void;
  putLargeInteger(key: number, value: number): void;
  putList(key: number, value: ActionList): void;
  putObject(key: number, type: number, value: ActionDescriptor): void;
  putPath(key: number, value: File): void;
  putReference(key: number, value: ActionReference): void;
  putString(key: number, value: string): void;
  putUnitDouble(key: number, unitID: number, value: number): void;

  /** 返回描述符中位置为 index 的键 */
  getKey(index: number): number;

  /** 将描述符序列化为字符串 */
  toStream(): string;

  /** 从字符串反序列化描述符 */
  fromStream(stream: string): void;
}

// ============================================================
// ActionList
// ============================================================

/** Action Manager 的列表容器，存储一系列值。*/
declare class ActionList {
  /** 列表中的元素数量（只读）*/
  readonly count: number;

  /** 获取指定索引的值类型 */
  getType(index: number): DescValueType;

  // Getter 方法
  getBoolean(index: number): boolean;
  getClass(index: number): number;
  getData(index: number): string;
  getDouble(index: number): number;
  getEnumerationType(index: number): number;
  getEnumerationValue(index: number): number;
  getInteger(index: number): number;
  getLargeInteger(index: number): number;
  getList(index: number): ActionList;
  getObjectType(index: number): number;
  getObjectValue(index: number): ActionDescriptor;
  getPath(index: number): File;
  getReference(index: number): ActionReference;
  getString(index: number): string;
  getUnitDoubleType(index: number): number;
  getUnitDoubleValue(index: number): number;

  // Putter 方法（附加到末尾）
  putBoolean(value: boolean): void;
  putClass(value: number): void;
  putData(value: string): void;
  putDouble(value: number): void;
  putEnumerated(enumType: number, value: number): void;
  putInteger(value: number): void;
  putLargeInteger(value: number): void;
  putList(value: ActionList): void;
  putObject(type: number, value: ActionDescriptor): void;
  putPath(value: File): void;
  putReference(value: ActionReference): void;
  putString(value: string): void;
  putUnitDouble(unitID: number, value: number): void;
}

// ============================================================
// ActionReference
// ============================================================

/** Action Manager 的引用对象，用于引用文档中的特定元素。*/
declare class ActionReference {
  /** 获取此引用的容器 */
  getContainer(): ActionReference;

  /** 获取引用表示类型 */
  getForm(): ReferenceFormType;

  /** 获取引用的实际对象类型 */
  getDesiredClass(): number;

  // 获取各种类型的引用值
  getEnumerationType(): number;
  getEnumerationValue(): number;
  getIdentifier(): number;
  getIndex(): number;
  getName(): string;
  getOffset(): number;
  getProperty(): number;

  // 设置各种类型的引用值
  putClass(value: number): void;
  putEnumerated(desiredClass: number, enumType: number, value: number): void;
  putIdentifier(desiredClass: number, value: number): void;
  putIndex(desiredClass: number, value: number): void;
  putName(desiredClass: number, value: string): void;
  putOffset(desiredClass: number, value: number): void;
  putProperty(desiredClass: number, value: number): void;
}
