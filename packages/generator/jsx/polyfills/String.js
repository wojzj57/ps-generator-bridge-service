//#region String Polyfills (ES3 compatible)

// String.prototype.trim
if (!String.prototype.trim) {
    String.prototype.trim = function () {
        return this.replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g, "");
    };
}

// String.prototype.startsWith
if (!String.prototype.startsWith) {
    String.prototype.startsWith = function (searchString, position) {
        var pos = position || 0;
        return this.substring(pos, pos + searchString.length) === searchString;
    };
}

// String.prototype.endsWith
if (!String.prototype.endsWith) {
    String.prototype.endsWith = function (searchString, length) {
        var len = (typeof length === "number") ? length : this.length;
        var end = len;
        var start = end - searchString.length;
        if (start < 0) { return false; }
        return this.substring(start, end) === searchString;
    };
}

// String.prototype.includes
if (!String.prototype.includes) {
    String.prototype.includes = function (search, start) {
        if (typeof start !== "number") { start = 0; }
        if (start + search.length > this.length) { return false; }
        return this.indexOf(search, start) !== -1;
    };
}

// String.prototype.repeat
if (!String.prototype.repeat) {
    String.prototype.repeat = function (count) {
        var n = Math.floor(Number(count));
        if (n < 0 || n === Infinity) { throw new RangeError("Invalid count value"); }
        var result = "";
        var str = String(this);
        while (n > 0) {
            if (n % 2 === 1) { result = result + str; }
            n = Math.floor(n / 2);
            if (n > 0) { str = str + str; }
        }
        return result;
    };
}

// String.prototype.padStart
if (!String.prototype.padStart) {
    String.prototype.padStart = function (targetLength, padString) {
        var str = String(this);
        targetLength = targetLength >> 0;
        if (str.length >= targetLength) { return str; }
        var pad = (typeof padString !== "undefined") ? String(padString) : " ";
        if (pad.length === 0) { return str; }
        var needed = targetLength - str.length;
        var full = "";
        while (full.length < needed) {
            full = full + pad;
        }
        return full.substring(0, needed) + str;
    };
}

//#endregion
