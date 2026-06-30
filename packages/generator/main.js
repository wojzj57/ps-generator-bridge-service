/*
 * CJS plugin entry — the file generator-core `require`s (package.json "main").
 * This is the only boundary between the CommonJS world and the bundled plugin
 * code. Its jobs, in order:
 *   1. set PS_BRIDGE_LOG_DIR before the bundle is required (in case a file sink reads it),
 *   2. require the tsup bundle and re-export its `init` for generator-core.
 */
"use strict";

var path = require("path");

if (!process.env.PS_BRIDGE_LOG_DIR) {
  process.env.PS_BRIDGE_LOG_DIR = path.join(__dirname, "logs");
}

module.exports = require("./dist/index.js");
