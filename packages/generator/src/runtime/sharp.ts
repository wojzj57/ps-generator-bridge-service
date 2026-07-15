import { createRequire } from "node:module";
import { join } from "node:path";

const vendorRequire = createRequire(join(__dirname, "..", "vendor", "package.json"));

/** Resolve the pinned native runtime from the package-private vendor tree. */
const sharp = vendorRequire("sharp") as typeof import("sharp");

export default sharp;
