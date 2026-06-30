//#region Number Polyfills (ES3 compatible)

// Number.isFinite
if (!Number.isFinite) {
  Number.isFinite = function (value) {
    return typeof value === "number" && isFinite(value);
  };
}

// Number.isNaN
if (!Number.isNaN) {
  Number.isNaN = function (value) {
    return typeof value === "number" && value !== value;
  };
}

// Number.isInteger
if (!Number.isInteger) {
  Number.isInteger = function (value) {
    return typeof value === "number" && isFinite(value) && Math.floor(value) === value;
  };
}

//#endregion
