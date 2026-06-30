import type { PsGenerator } from "../src/types/generator";
import type { JsxProgressMessage } from "../src/utilis/jsxRunner";
interface MenuItem {
  name: string;
  displayName: string;
  enabled: boolean;
  checked: boolean;
}

interface JsxCall {
  path: string;
  params?: Record<string, unknown>;
  sharedEngineSafe?: boolean;
}

interface JsxStringCall {
  script: string;
  sharedEngineSafe?: boolean;
}

/**
 * A recorded `_sendJSXFile` call with controls to drive the progress stream
 * from a test: `emitProgress` feeds a message to every subscribed progress
 * handler, `resolve`/`reject` settle the underlying deferred. `ImageModule`
 * opens the pixmap jsx through this channel and awaits bounds/pixmap/iccProfile
 * messages, so tests replay them here.
 */
export interface FakeJsxFileCall {
  path: string;
  params?: Record<string, unknown>;
  sharedEngineSafe?: boolean;
  emitProgress(message: JsxProgressMessage): void;
  resolve(): void;
  reject(err?: unknown): void;
}

/**
 * Recording fake of the injected generator contract (the server's primary test
 * seam). Records menu registration + alerts and can replay Photoshop events.
 */
// `FakeGenerator` does NOT `implements PsGenerator`: the full contract
// (typed from generator-core) declares ~60 required methods, and a class with
// an index signature cannot satisfy a required-named-property interface.
// Instead, tests build a generator via the `fakeGenerator()` factory below,
// which casts once to `FakeGenerator & PsGenerator` — the single cast point for
// the whole suite. FakeGenerator keeps its `[key: string]: any` so tests can
// attach recording hooks (`onSendJSXFile`, `onEvaluateJSXFile`, …).
export class FakeGenerator {
  readonly menuItems: MenuItem[] = [];
  readonly alerts: string[] = [];
  readonly listeners = new Map<string, Array<(...args: any[]) => void>>();
  readonly jsxCalls: JsxCall[] = [];
  readonly jsxStringCalls: JsxStringCall[] = [];
  readonly jsxFileCalls: FakeJsxFileCall[] = [];
  psVersion = "26.0.0";

  /**
   * Drives JsxRunner without Photoshop: each evaluateJSXFile call is recorded in
   * jsxCalls and its result comes from this hook (default `undefined`). Return a
   * `"Error:..."` string to exercise JsxRunner's throw branch.
   */
  onEvaluateJSXFile?: (
    path: string,
    params?: Record<string, unknown>,
    sharedEngineSafe?: boolean
  ) => unknown;

  /**
   * Same contract for evaluateJSXString: each call is recorded in
   * `jsxStringCalls` and the result comes from this hook (default `undefined`).
   * Used to drive `JsxRunner.init` (polyfill injection) and `execute` without
   * Photoshop.
   */
  onEvaluateJSXString?: (
    script: string,
    sharedEngineSafe?: boolean
  ) => unknown;

  /**
   * Fired (on a microtask, after `ImageModule.getPixmap` has subscribed its
   * progress handlers) for each `_sendJSXFile` call, handing the test the call
   * handle so it can emit bounds/pixmap/iccProfile messages and settle the
   * deferred.
   */
  onSendJSXFile?: (call: FakeJsxFileCall) => void;

  /**
   * Returns the `PsDocumentInfo` for a `getDocumentInfo` call. Used to drive
   * `exportImage`/`getPreview` whole-document paths (layer tree for
   * `_computeHiddenLayers`, document bounds for preview scaling).
   */
  onGetDocumentInfo?: (
    documentId: number | undefined,
    options?: Record<string, unknown>
  ) => any;

  /**
   * Returns the parsed `PsPixmap` for a `getDocumentPixmap` call. Drives
   * `ImageModule.exportDocument` (whole-document export) without Photoshop.
   */
  onGetDocumentPixmap?: (documentId: number, settings?: Record<string, unknown>) => any;

  // Index signature from PsGenerator (escape hatch for the unmodelled surface).
  [key: string]: any;

  addMenuItem(name: string, displayName: string, enabled: boolean, checked: boolean) {
    this.menuItems.push({ name, displayName, enabled, checked });
    return Promise.resolve();
  }

  onPhotoshopEvent(event: string, listener: (...args: any[]) => void) {
    const list = this.listeners.get(event) ?? [];
    list.push(listener);
    this.listeners.set(event, list);
    return undefined;
  }

  removePhotoshopEventListener(event: string, listener: (...args: any[]) => void) {
    const list = this.listeners.get(event) ?? [];
    this.listeners.set(
      event,
      list.filter((fn) => fn !== listener)
    );
  }

  alert(message: string) {
    this.alerts.push(message);
  }

  getPhotoshopVersion(): Promise<string> {
    return Promise.resolve(this.psVersion);
  }

  evaluateJSXFile(
    path: string,
    params?: Record<string, unknown>,
    sharedEngineSafe?: boolean
  ): Promise<unknown> {
    this.jsxCalls.push({ path, params, sharedEngineSafe });
    return Promise.resolve(this.onEvaluateJSXFile?.(path, params, sharedEngineSafe));
  }

  evaluateJSXString(script: string, sharedEngineSafe?: boolean): Promise<unknown> {
    this.jsxStringCalls.push({ script, sharedEngineSafe });
    return Promise.resolve(this.onEvaluateJSXString?.(script, sharedEngineSafe));
  }

  getDocumentInfo(
    documentId?: number,
    options?: Record<string, unknown>
  ): any {
    return this.onGetDocumentInfo?.(documentId, options);
  }

  getDocumentPixmap(documentId: number, settings?: Record<string, unknown>): any {
    return Promise.resolve(this.onGetDocumentPixmap?.(documentId, settings));
  }

  /**
   * Low-level progress-channel fake. Returns a deferred-shaped object whose
   * `.promise.progress`/`.promise.fail` accumulate subscribers and whose
   * `.resolve`/`.reject` settle it. Records the call and fires `onSendJSXFile`
   * on a microtask so callers' progress handlers are attached first.
   */
  _sendJSXFile(
    path: string,
    params?: Record<string, unknown>,
    sharedEngineSafe?: boolean
  ): any {
    const progressFns: Array<(m: JsxProgressMessage) => void> = [];
    const failFns: Array<(e: unknown) => void> = [];
    const call: FakeJsxFileCall = {
      path,
      params,
      sharedEngineSafe,
      emitProgress: (message) => {
        for (const fn of progressFns) fn(message);
      },
      resolve: () => {
        /* no-op: the Q deferred's resolve just settles the promise */
      },
      reject: (err) => {
        for (const fn of failFns) fn(err);
      },
    };
    const deferred: any = {
      promise: {
        progress: (fn: (m: JsxProgressMessage) => void) => {
          progressFns.push(fn);
          return deferred.promise;
        },
        fail: (fn: (e: unknown) => void) => {
          failFns.push(fn);
          return deferred.promise;
        },
      },
      resolve: () => call.resolve(),
      reject: (err?: unknown) => call.reject(err),
    };
    this.jsxFileCalls.push(call);
    if (this.onSendJSXFile) {
      const hook = this.onSendJSXFile;
      queueMicrotask(() => hook(call));
    }
    return deferred;
  }

  /** Test helper: replay a Photoshop event to its subscribers. */
  emit(event: string, payload: unknown): void {
    for (const listener of this.listeners.get(event) ?? []) listener(payload);
  }
}

/**
 * Build a `FakeGenerator` typed as `FakeGenerator & PsGenerator` — the single
 * cast point for the test suite. Tests attach hooks (`generator.onSendJSXFile`
 * etc.) through the `FakeGenerator` side and pass it to `PsGenerator`-typed
 * params (`new JsxRunner(generator)`, `PsBridgeHost.init(generator, …)`,
 * `registry.dispatch(_, { generator })`) through the `PsGenerator` side, with
 * no per-call-site casts. Only the methods FakeGenerator models are stubbed;
 * calling an unmodelled one throws at runtime (`undefined is not a function`),
 * which surfaces tests that exercise unstubbed surface.
 */
export function fakeGenerator(): FakeGenerator & PsGenerator {
  return new FakeGenerator() as unknown as FakeGenerator & PsGenerator;
}
