import COS from "cos-nodejs-sdk-v5";
import { extname } from "node:path";
import type { Logger } from "../utilis/logger";

/**
 * Plugin-facing COS contract (RFC 0008). The minimal slice modules and plugins
 * reach through `plugin.cos`: upload in-memory bytes or a local file and get back
 * a ready-to-use signed URL. Params use `Uint8Array`/path strings (never `Buffer`
 * or the COS SDK's own types) so the SDK's re-export of this interface stays
 * Node-free, mirroring how `ImageModuleApi` is exposed.
 */
export interface CosServiceApi {
  /** Upload raw bytes, returning a signed URL. `name` labels the object key. */
  uploadObject(data: Uint8Array, name?: string): Promise<string>;
  /** Upload a local file by path, returning a signed URL. */
  uploadFile(dir: string, name?: string): Promise<string>;
}

/** Permanent-key COS config, read from the environment by {@link CosService.fromEnv}. */
interface CosConfig {
  secretId: string;
  secretKey: string;
  bucket: string;
  region: string;
  keyPrefix: string;
  urlExpires: number;
}

// Defaults applied when the optional COS tuning env vars are unset (RFC 0009).
const DEFAULT_KEY_PREFIX = "ps-bridge/exports";
// Signed-URL lifetime: 10 years. Permanent keys (not STS temp credentials) are
// what make a horizon this long meaningful — a temp credential's signature dies
// with the credential (RFC 0008).
const DEFAULT_URL_EXPIRES_SECONDS = 315360000;
const MAX_NAME_LENGTH = 64;

/**
 * Optional object-storage upload unit (RFC 0008). Enabled only when the four
 * `PS_BRIDGE_COS_*` env fields are present; otherwise the host leaves `plugin.cos`
 * undefined and image exports fall back to base64. Uses a permanent key pair and
 * returns signed URLs without an attachment disposition, so the image they point
 * at stays inline-displayable.
 */
export class CosService implements CosServiceApi {
  private readonly cos: COS;

  constructor(
    private readonly config: CosConfig,
    private readonly logger: Logger
  ) {
    this.cos = new COS({ SecretId: config.secretId, SecretKey: config.secretKey });
  }

  /**
   * Build a CosService from the environment, or return undefined when COS is not
   * configured. All four `PS_BRIDGE_COS_SECRET_ID/SECRET_KEY/BUCKET/REGION` must be
   * present and non-empty — a missing field means "not enabled", decided once at
   * startup rather than failing loudly on the first upload.
   */
  static fromEnv(logger: Logger): CosService | undefined {
    const secretId = process.env.PS_BRIDGE_COS_SECRET_ID?.trim();
    const secretKey = process.env.PS_BRIDGE_COS_SECRET_KEY?.trim();
    const bucket = process.env.PS_BRIDGE_COS_BUCKET?.trim();
    const region = process.env.PS_BRIDGE_COS_REGION?.trim();
    if (!secretId || !secretKey || !bucket || !region) return undefined;
    const keyPrefix = process.env.PS_BRIDGE_COS_KEY_PREFIX?.trim() || DEFAULT_KEY_PREFIX;
    const expiresRaw = Number(process.env.PS_BRIDGE_COS_URL_EXPIRES);
    const urlExpires =
      Number.isFinite(expiresRaw) && expiresRaw > 0 ? expiresRaw : DEFAULT_URL_EXPIRES_SECONDS;
    return new CosService({ secretId, secretKey, bucket, region, keyPrefix, urlExpires }, logger);
  }

  async uploadObject(data: Uint8Array, name?: string): Promise<string> {
    const key = this.buildKey(name, ".png");
    await this.putObject(key, Buffer.from(data));
    return this.signedUrl(key);
  }

  async uploadFile(dir: string, name?: string): Promise<string> {
    const key = this.buildKey(name, extname(dir));
    await this.putFile(key, dir);
    return this.signedUrl(key);
  }

  /**
   * Compose the object key `{keyPrefix}/{name}-{ts}{ext}` (keyPrefix is env-
   * configurable, default `ps-bridge/exports`). `name` (a layer/document name) is
   * kept verbatim including non-ASCII (e.g. Chinese); only path separators and
   * whitespace are replaced — they would nest the key or break the URL — and the
   * label is length-capped. Uniqueness rides on the timestamp, not the label.
   */
  private buildKey(name: string | undefined, ext: string): string {
    const label = this.sanitizeName(name ?? "image");
    return `${this.config.keyPrefix}/${label}-${Date.now()}${ext}`;
  }

  private sanitizeName(name: string): string {
    const cleaned = name
      .replace(/[/\\\s]+/g, "_")
      .replace(/^_+/, "")
      .slice(0, MAX_NAME_LENGTH);
    return cleaned || "image";
  }

  private putObject(key: string, body: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      this.cos.putObject(
        { Bucket: this.config.bucket, Region: this.config.region, Key: key, Body: body },
        (err, data) => {
          if (err) return reject(new Error(err.message ?? String(err)));
          if (data.statusCode !== 200) {
            return reject(new Error(`COS upload failed: status ${data.statusCode}`));
          }
          this.logger.info(`CosService uploaded object ${key}`);
          resolve();
        }
      );
    });
  }

  private putFile(key: string, filePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.cos.uploadFile(
        { Bucket: this.config.bucket, Region: this.config.region, Key: key, FilePath: filePath },
        (err) => {
          if (err) return reject(new Error(err.message ?? String(err)));
          this.logger.info(`CosService uploaded file ${key}`);
          resolve();
        }
      );
    });
  }

  private signedUrl(key: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.cos.getObjectUrl(
        {
          Bucket: this.config.bucket,
          Region: this.config.region,
          Key: key,
          Sign: true,
          Expires: this.config.urlExpires,
        },
        (err, data) => {
          if (err) return reject(err instanceof Error ? err : new Error(String(err)));
          // Deliberately no `response-content-disposition=attachment`: the URL is
          // meant for `<img src>`, and an attachment disposition would force a
          // download instead of inline display (RFC 0008).
          resolve(data.Url);
        }
      );
    });
  }
}
