import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Logger } from "@ps-generator-bridge/sdk/plugin";

// Mock the COS SDK so the service never touches the network. `vi.hoisted` makes
// the shared spies available to the hoisted `vi.mock` factory; the fake class's
// instance methods point at them so each test can drive the callbacks.
const { putObject, uploadFile, getObjectUrl } = vi.hoisted(() => ({
  putObject: vi.fn(),
  uploadFile: vi.fn(),
  getObjectUrl: vi.fn(),
}));

vi.mock("cos-nodejs-sdk-v5", () => ({
  default: class {
    putObject = putObject;
    uploadFile = uploadFile;
    getObjectUrl = getObjectUrl;
  },
}));

import { CosService, parseCosEnv, type CosConfig } from "../src/services/cos";

const silentLogger: Logger = { debug() {}, info() {}, warn() {}, error() {} };

const CONFIG: CosConfig = {
  secretId: "id",
  secretKey: "key",
  bucket: "bucket-1300000000",
  region: "ap-guangzhou",
  keyPrefix: "ps-bridge/exports",
  urlExpires: 315360000,
};

const ENV_KEYS = [
  "REZ_LIGHTBOX_PS_SERVICE_BASE",
  "PS_BRIDGE_COS_SECRET_ID",
  "PS_BRIDGE_COS_SECRET_KEY",
  "PS_BRIDGE_COS_BUCKET",
  "PS_BRIDGE_COS_REGION",
] as const;

let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = {};
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  vi.clearAllMocks();
});

function setAllEnv() {
  process.env.PS_BRIDGE_COS_SECRET_ID = "id";
  process.env.PS_BRIDGE_COS_SECRET_KEY = "key";
  process.env.PS_BRIDGE_COS_BUCKET = "bucket-1300000000";
  process.env.PS_BRIDGE_COS_REGION = "ap-guangzhou";
}

describe("parseCosEnv", () => {
  it("returns undefined when no PS_BRIDGE_COS_* env is set", () => {
    expect(parseCosEnv()).toBeUndefined();
  });

  it("returns undefined when only some fields are set", () => {
    process.env.PS_BRIDGE_COS_SECRET_ID = "id";
    process.env.PS_BRIDGE_COS_SECRET_KEY = "key";
    expect(parseCosEnv()).toBeUndefined();
  });

  it("treats whitespace-only fields as missing", () => {
    setAllEnv();
    process.env.PS_BRIDGE_COS_SECRET_ID = "   ";
    expect(parseCosEnv()).toBeUndefined();
  });

  it("parses a full config with trimmed values and defaults", () => {
    setAllEnv();
    expect(parseCosEnv()).toEqual(CONFIG);
  });

  it("preserves secret credentials when REZ_LIGHTBOX_PS_SERVICE_BASE is absent", () => {
    setAllEnv();
    process.env.PS_BRIDGE_COS_SECRET_ID = "aWQ=";
    process.env.PS_BRIDGE_COS_SECRET_KEY = "a2V5";
    expect(parseCosEnv()).toMatchObject({ secretId: "aWQ=", secretKey: "a2V5" });
  });

  it("decodes Base64 secret credentials when REZ_LIGHTBOX_PS_SERVICE_BASE is present", () => {
    setAllEnv();
    process.env.REZ_LIGHTBOX_PS_SERVICE_BASE = "https://lightbox.example.com";
    process.env.PS_BRIDGE_COS_SECRET_ID = "aWQ=";
    process.env.PS_BRIDGE_COS_SECRET_KEY = "a2V5";
    expect(parseCosEnv()).toEqual(CONFIG);
  });

  it.each(["not-base64!", "====", "IA=="])(
    "treats an invalid or empty decoded Base64 secret as missing: %s",
    (secretId) => {
      setAllEnv();
      process.env.REZ_LIGHTBOX_PS_SERVICE_BASE = "https://lightbox.example.com";
      process.env.PS_BRIDGE_COS_SECRET_ID = secretId;
      expect(parseCosEnv()).toBeUndefined();
    }
  );

  it("applies KEY_PREFIX / URL_EXPIRES overrides", () => {
    setAllEnv();
    process.env.PS_BRIDGE_COS_KEY_PREFIX = "custom/prefix";
    process.env.PS_BRIDGE_COS_URL_EXPIRES = "3600";
    expect(parseCosEnv()).toMatchObject({ keyPrefix: "custom/prefix", urlExpires: 3600 });
  });
});

describe("CosService.fromEnv", () => {
  it("returns undefined when no PS_BRIDGE_COS_* env is set", () => {
    expect(CosService.fromEnv(silentLogger)).toBeUndefined();
  });

  it("returns an instance when all four fields are present", () => {
    setAllEnv();
    expect(CosService.fromEnv(silentLogger)).toBeInstanceOf(CosService);
  });
});

describe("CosService.uploadObject", () => {
  // Construct directly from injected config — no process.env mocking needed.
  function make(): CosService {
    return new CosService(CONFIG, silentLogger);
  }

  it("uploads bytes and returns the signed URL; key carries prefix/name/.png", async () => {
    putObject.mockImplementation((_params, cb) => cb(null, { statusCode: 200 }));
    getObjectUrl.mockImplementation((_params, cb) => cb(null, { Url: "https://signed/url" }));

    const svc = make();
    const url = await svc.uploadObject(new Uint8Array([1, 2, 3]), "我的图层");

    expect(url).toBe("https://signed/url");
    const key = putObject.mock.calls[0]![0].Key as string;
    // Chinese is preserved verbatim; key = prefix/{name}-{ts}.png.
    expect(key).toMatch(/^ps-bridge\/exports\/我的图层-\d+\.png$/);
    expect(putObject.mock.calls[0]![0].Bucket).toBe("bucket-1300000000");
    expect(putObject.mock.calls[0]![0].Region).toBe("ap-guangzhou");
  });

  it("signs the URL for 10 years with the same key, no attachment disposition", async () => {
    putObject.mockImplementation((_params, cb) => cb(null, { statusCode: 200 }));
    getObjectUrl.mockImplementation((_params, cb) => cb(null, { Url: "https://signed/url" }));

    const svc = make();
    await svc.uploadObject(new Uint8Array([1]), "layer-1");

    const urlParams = getObjectUrl.mock.calls[0]![0];
    expect(urlParams.Sign).toBe(true);
    expect(urlParams.Expires).toBe(315360000);
    expect(urlParams.Key).toBe(putObject.mock.calls[0]![0].Key);
  });

  it("replaces path separators and whitespace in the name", async () => {
    putObject.mockImplementation((_params, cb) => cb(null, { statusCode: 200 }));
    getObjectUrl.mockImplementation((_params, cb) => cb(null, { Url: "https://u" }));

    const svc = make();
    await svc.uploadObject(new Uint8Array([1]), "a/b c");

    expect(putObject.mock.calls[0]![0].Key).toMatch(/^ps-bridge\/exports\/a_b_c-\d+\.png$/);
  });

  it("defaults the name to 'image' when omitted", async () => {
    putObject.mockImplementation((_params, cb) => cb(null, { statusCode: 200 }));
    getObjectUrl.mockImplementation((_params, cb) => cb(null, { Url: "https://u" }));

    const svc = make();
    await svc.uploadObject(new Uint8Array([1]));

    expect(putObject.mock.calls[0]![0].Key).toMatch(/^ps-bridge\/exports\/image-\d+\.png$/);
  });

  it("rejects on a non-200 status", async () => {
    putObject.mockImplementation((_params, cb) => cb(null, { statusCode: 403 }));

    const svc = make();
    await expect(svc.uploadObject(new Uint8Array([1]))).rejects.toThrow(/status 403/);
  });

  it("rejects when putObject errors", async () => {
    putObject.mockImplementation((_params, cb) => cb(new Error("boom")));

    const svc = make();
    await expect(svc.uploadObject(new Uint8Array([1]))).rejects.toThrow("boom");
  });
});

describe("CosService.uploadFile", () => {
  function make(): CosService {
    return new CosService(CONFIG, silentLogger);
  }

  it("uploads a local file and keeps its extension in the key", async () => {
    uploadFile.mockImplementation((_params, cb) => cb(null, { statusCode: 200 }));
    getObjectUrl.mockImplementation((_params, cb) => cb(null, { Url: "https://file/url" }));

    const svc = make();
    const url = await svc.uploadFile("C:/tmp/export.psd", "doc-9");

    expect(url).toBe("https://file/url");
    expect(uploadFile.mock.calls[0]![0].FilePath).toBe("C:/tmp/export.psd");
    expect(uploadFile.mock.calls[0]![0].Key).toMatch(/^ps-bridge\/exports\/doc-9-\d+\.psd$/);
  });

  it("rejects when uploadFile errors", async () => {
    uploadFile.mockImplementation((_params, cb) => cb(new Error("no disk")));

    const svc = make();
    await expect(svc.uploadFile("C:/tmp/x.png")).rejects.toThrow("no disk");
  });
});
