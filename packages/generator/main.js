/*
 * CJS plugin entry — the file generator-core `require`s (package.json "main").
 * This is the only boundary between the CommonJS world and the bundled plugin
 * code. Its jobs, in order:
 *   1. load package-local .env values before the bundle is required,
 *   2. set PS_BRIDGE_LOG_DIR before the bundle is required (in case a file sink reads it),
 *   3. require the tsup bundle and re-export its `init` for generator-core.
 */
"use strict";

var dotenv = require("dotenv");
var path = require("path");

dotenv.config({ path: path.join(__dirname, ".env"), quiet: true });

if (!process.env.PS_BRIDGE_LOG_DIR) {
  process.env.PS_BRIDGE_LOG_DIR = path.join(__dirname, "logs");
}

module.exports = require("./dist/index.js");
