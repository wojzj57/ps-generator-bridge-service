// Ambient process-env typing for the generator runtime. The Photoshop data
// shapes that used to live here as `declare global` types now have explicit,
// importable definitions in ./ps.ts (so the SDK can inline them without global
// pollution); only the env augmentation — which never crosses into the SDK —
// stays ambient.

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      // Host runtime (RFC 0009). All deployment/machine-level knobs share the
      // `PS_BRIDGE_` prefix; structured run params (port/pluginsDir) come via
      // PluginConfig and these env vars only override.
      PS_BRIDGE_PORT: string;
      PS_BRIDGE_PLUGINS_DIR: string;
      PS_BRIDGE_LOG_DIR: string;
      //
      // CosService (RFC 0008/0009): secrets + non-secret COS settings are all
      // env-driven for cohesion. All four credential fields must be present for
      // `plugin.cos` to be enabled; otherwise image exports fall back to base64.
      PS_BRIDGE_COS_SECRET_ID: string;
      PS_BRIDGE_COS_SECRET_KEY: string;
      PS_BRIDGE_COS_BUCKET: string;
      PS_BRIDGE_COS_REGION: string;
      // Optional COS tuning (defaults applied in CosService when unset).
      PS_BRIDGE_COS_KEY_PREFIX: string;
      PS_BRIDGE_COS_URL_EXPIRES: string;
    }
  }
}

export {};
