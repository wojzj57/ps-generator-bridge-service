//#region Array Polyfills (ES3 compatible)

// Array.isArray
if (!Array.isArray) {
    Array.isArray = function (arg) {
        return Object.prototype.toString.call(arg) === "[object Array]";
    };
}

// Array.prototype.indexOf
if (!Array.prototype.indexOf) {
    Array.prototype.indexOf = function (searchElement, fromIndex) {
        var len = this.length >>> 0;
        var i = Number(fromIndex) || 0;
        if (i < 0) { i = Math.max(len + i, 0); }
        for (; i < len; i++) {
            if (i in this && this[i] === searchElement) {
                return i;
            }
        }
        return -1;
    };
}

// Array.prototype.forEach
if (!Array.prototype.forEach) {
    Array.prototype.forEach = function (callback, thisArg) {
        if (typeof callback !== "function") { throw new TypeError(callback + " is not a function"); }
        var len = this.length >>> 0;
        for (var i = 0; i < len; i++) {
            if (i in this) {
                callback.call(thisArg, this[i], i, this);
            }
        }
    };
}

// Array.prototype.map
if (!Array.prototype.map) {
    Array.prototype.map = function (callback, thisArg) {
        if (typeof callback !== "function") { throw new TypeError(callback + " is not a function"); }
        var len = this.length >>> 0;
        var result = new Array(len);
        for (var i = 0; i < len; i++) {
            if (i in this) {
                result[i] = callback.call(thisArg, this[i], i, this);
            }
        }
        return result;
    };
}

// Array.prototype.filter
if (!Array.prototype.filter) {
    Array.prototype.filter = function (callback, thisArg) {
        if (typeof callback !== "function") { throw new TypeError(callback + " is not a function"); }
        var len = this.length >>> 0;
        var result = [];
        for (var i = 0; i < len; i++) {
            if (i in this) {
                var val = this[i];
                if (callback.call(thisArg, val, i, this)) {
                    result.push(val);
                }
            }
        }
        return result;
    };
}

// Array.prototype.reduce
if (!Array.prototype.reduce) {
    Array.prototype.reduce = function (callback, initialValue) {
        if (typeof callback !== "function") { throw new TypeError(callback + " is not a function"); }
        var len = this.length >>> 0;
        var i = 0;
        var accumulator;
        if (arguments.length >= 2) {
            accumulator = initialValue;
        } else {
            while (i < len && !(i in this)) { i++; }
            if (i >= len) { throw new TypeError("Reduce of empty array with no initial value"); }
            accumulator = this[i++];
        }
        for (; i < len; i++) {
            if (i in this) {
                accumulator = callback(accumulator, this[i], i, this);
            }
        }
        return accumulator;
    };
}

// Array.prototype.some
if (!Array.prototype.some) {
    Array.prototype.some = function (callback, thisArg) {
        if (typeof callback !== "function") { throw new TypeError(callback + " is not a function"); }
        var len = this.length >>> 0;
        for (var i = 0; i < len; i++) {
            if (i in this && callback.call(thisArg, this[i], i, this)) {
                return true;
            }
        }
        return false;
    };
}

// Array.prototype.every
if (!Array.prototype.every) {
    Array.prototype.every = function (callback, thisArg) {
        if (typeof callback !== "function") { throw new TypeError(callback + " is not a function"); }
        var len = this.length >>> 0;
        for (var i = 0; i < len; i++) {
            if (i in this && !callback.call(thisArg, this[i], i, this)) {
                return false;
            }
        }
        return true;
    };
}

// Array.prototype.find
if (!Array.prototype.find) {
    Array.prototype.find = function (callback, thisArg) {
        if (typeof callback !== "function") { throw new TypeError(callback + " is not a function"); }
        var len = this.length >>> 0;
        for (var i = 0; i < len; i++) {
            if (i in this) {
                var val = this[i];
                if (callback.call(thisArg, val, i, this)) {
                    return val;
                }
            }
        }
        return undefined;
    };
}

//#endregion
