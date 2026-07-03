import { afterEach, describe, expect, it, vi } from "vitest";
import { openPhotoshopOnLightBox } from "../src/lightbox";

afterEach(() => {
  vi.unstubAllGlobals();
});

function responseJson(
  body: unknown,
  init: { status?: number; statusText?: string } = {}
): Response {
  const status = init.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: init.statusText ?? "",
    json: async () => body,
  } as Response;
}

describe("openPhotoshopOnLightBox", () => {
  it("does not open LightBox when the bridge status is ok", async () => {
    const fetchImpl: typeof fetch = async () => responseJson({ status: "ok" });
    const open = vi.fn();

    await openPhotoshopOnLightBox({ fetch: fetchImpl, open });

    expect(open).not.toHaveBeenCalled();
  });

  it("opens LightBox in a new page when the bridge status is not ok", async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new Error("offline");
    };
    const open = vi.fn();

    await openPhotoshopOnLightBox({ fetch: fetchImpl, open });

    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith(
      "http://arthub.woa.com/blade/shareQywxChat?code=ty3Lp2U7",
      "_blank"
    );
  });

  it("uses globalThis.open by default", async () => {
    const fetchImpl: typeof fetch = async () => responseJson({ status: "starting" });
    const open = vi.fn();
    vi.stubGlobal("open", open);

    await openPhotoshopOnLightBox({ fetch: fetchImpl });

    expect(open).toHaveBeenCalledWith(
      "http://arthub.woa.com/blade/shareQywxChat?code=ty3Lp2U7",
      "_blank"
    );
  });

  it("throws an actionable error when LightBox should open but no opener exists", async () => {
    const fetchImpl: typeof fetch = async () => responseJson({ status: "starting" });
    vi.stubGlobal("open", undefined);

    await expect(openPhotoshopOnLightBox({ fetch: fetchImpl })).rejects.toThrow(
      /pass options\.open/
    );
  });
});
