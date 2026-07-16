"use strict";

const path = require("node:path");

// Keep only the native boundary outside the bundle. The addon and every DLL it
// loads live together so Windows resolves the dependent libraries locally.
module.exports = require(path.join(__dirname, "..", "native", "sharp-win32-x64.node"));
