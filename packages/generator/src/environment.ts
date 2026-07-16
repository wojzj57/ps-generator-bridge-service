import { join } from "node:path";
import dotenv from "dotenv";

/** Load package-local deployment settings before the server bundle starts. */
export function loadEnvironment(packageDir: string): void {
  dotenv.config({ path: join(packageDir, ".env"), quiet: true });
}
