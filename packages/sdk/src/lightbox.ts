import { Connection, type ConnectionHttpOptions } from "./publicConnection";

const LIGHTBOX_PHOTOSHOP_URL = "http://arthub.woa.com/blade/shareQywxChat?code=ty3Lp2U7";

export type LightBoxOpener = (url: string, target?: string) => unknown;

export interface OpenPhotoshopOnLightBoxOptions extends ConnectionHttpOptions {
  /** Inject an opener for tests or non-browser runtimes. Defaults to globalThis.open. */
  open?: LightBoxOpener;
}

/**
 * Open the LightBox Photoshop entry page only when the bridge server is not healthy.
 */
export async function openPhotoshopOnLightBox(
  options: OpenPhotoshopOnLightBoxOptions = {}
): Promise<void> {
  const status = await Connection.status(options);
  if (status.ok) return;

  const open = options.open ?? resolveGlobalOpen();
  if (!open) {
    throw new Error(
      "openPhotoshopOnLightBox requires a browser opener; pass options.open in this runtime."
    );
  }

  open(LIGHTBOX_PHOTOSHOP_URL, "_blank");
}

function resolveGlobalOpen(): LightBoxOpener | undefined {
  const open = (globalThis as { open?: LightBoxOpener }).open;
  return typeof open === "function" ? open.bind(globalThis) : undefined;
}
