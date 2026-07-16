/*
 * CJS plugin entry — the file generator-core `require`s (package.json "main").
 * This is the only boundary between the CommonJS world and the bundled plugin
 * code. Its jobs, in order:
 *   1. load package-local .env values through the bundled environment helper,
 *   2. set PS_BRIDGE_LOG_DIR before the bundle is required (in case a file sink reads it),
 *   3. require the tsup bundle and re-export its `init` for generator-core.
 */
"use strict";

var fs = require("fs");
var path = require("path");

// Adobe Generator restricts package resolution to its configured plugin
// folders. When this plugin is installed through a symlink, Node executes the
// entry from the symlink's real target, which falls outside that whitelist and
// makes package-private runtime dependencies (notably sharp) unresolvable.
// Allow only this plugin's real directory before loading any bundled code.
var whitelistedModuleFolders = globalThis.whitelistedModuleFolders;
if (Array.isArray(whitelistedModuleFolders)) {
  var pluginRoot = fs.realpathSync(__dirname);
  if (!whitelistedModuleFolders.includes(pluginRoot)) {
    whitelistedModuleFolders.push(pluginRoot);
  }
}

var environment = require("./dist/environment.js");

environment.loadEnvironment(__dirname);

if (!process.env.PS_BRIDGE_LOG_DIR) {
  process.env.PS_BRIDGE_LOG_DIR = path.join(__dirname, "logs");
}

module.exports = require("./dist/index.js");
