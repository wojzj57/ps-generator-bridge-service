/**
 * Photoshop Application 类型声明
 * 来源: https://theiviaxx.github.io/photoshop-docs/Photoshop/
 */

declare class Application {
  activeDocument: Document;
  backgroundColor: SolidColor;
  readonly build: string;
  colorSettings: string;
  currentTool: string;
  displayDialogs: DialogModes;
  readonly documents: Documents;
  readonly fonts: TextFonts;
  foregroundColor: SolidColor;
  readonly freeMemory: number;
  readonly locale: string;
  readonly macintoshFileTypes: string[];
  readonly measurementLog: MeasurementLog;
  readonly name: string;
  readonly notifiers: Notifiers;
  notifiersEnabled: boolean;
  readonly parent: any;
  readonly path: File;
  readonly playbackDisplayDialogs: DialogModes;
  readonly playbackParameters: ActionDescriptor;
  readonly preferences: Preferences;
  readonly preferencesFolder: Folder;
  readonly recentFiles: File[];
  readonly scriptingBuildDate: string;
  readonly scriptingVersion: string;
  readonly systemInformation: string;
  readonly typename: string;
  readonly version: string;
  readonly windowsFileTypes: string[];

  batch(inputFiles: File[], action: string, from: string, options?: BatchOptions): string;
  beep(): void;
  bringToFront(): void;
  changeProgressText(progressString: string): void;
  charIDToTypeID(charID: string): number;
  doAction(action: string, from: string): void;
  doForcedProgress(taskName: string, func: Function): void;
  doProgress(progressString: string, func: Function): void;
  eraseCustomOptions(key: string): void;
  executeAction(
    eventID: number,
    descriptor?: ActionDescriptor,
    displayDialogs?: DialogModes
  ): ActionDescriptor;
  executeActionGet(reference: ActionReference): ActionDescriptor;
  featureEnabled(name: string): boolean;
  getCustomOptions(key: string): ActionDescriptor;
  isQuicktimeAvailable(): boolean;
  load(document: File): void;
  makeContactSheet(inputFiles: File[], options?: any): string;
  makePDFPresentation(inputFiles: File[], outputFile: File, options?: any): string;
  makePicturePackage(inputFiles?: File[], options?: any): string;
  open(document: File, openAs?: OpenDocumentType, openOptions?: any): Document;
  openDialog(): File[];
  purge(target: PurgeTarget): void;
  putCustomOptions(key: string, customObject: ActionDescriptor, persistent?: boolean): void;
  refresh(): void;
  refreshFonts(): void;
  runMenuItem(menuID: number): void;
  showColorPicker(): boolean;
  stringIDToTypeID(stringID: string): number;
  system(callString: string): number;
  togglePalettes(): void;
  toolSupportsBrushes(tool: string): boolean;
  typeIDToCharID(typeID: number): string;
  typeIDToStringID(typeID: number): string;
  updateProgress(done: number, total: number): void;
}
