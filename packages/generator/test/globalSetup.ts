import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

/**
 * The plugin-loader tests `require()` the *published* SDK plugin subpath
 * (dist/plugin.cjs) — plugins depend on built packages, not source. Ensure that
 * artifact exists before the suite runs so `pnpm -r test` (which does not
 * implicitly build) stays green. The generator's own imports still resolve the
 * SDK from source via vitest aliases.
 */
export default function setup(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const root = resolve(here, "../../..");
  if (!existsSync(resolve(here, "../../sdk/dist/plugin.cjs"))) {
    execSync("pnpm --filter @ps-generator-bridge/sdk build", { stdio: "inherit", cwd: root });
  }
}
