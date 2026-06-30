//#region Object Polyfills (ES3 compatible)

// Object.keys
if (!Object.keys) {
    Object.keys = function (obj) {
        if (obj !== Object(obj)) { throw new TypeError("Object.keys called on a non-object"); }
        var result = [];
        for (var key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                result.push(key);
            }
        }
        return result;
    };
}

// Object.values
if (!Object.values) {
    Object.values = function (obj) {
        if (obj !== Object(obj)) { throw new TypeError("Object.values called on a non-object"); }
        var result = [];
        for (var key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                result.push(obj[key]);
            }
        }
        return result;
    };
}

// Object.entries
if (!Object.entries) {
    Object.entries = function (obj) {
        if (obj !== Object(obj)) { throw new TypeError("Object.entries called on a non-object"); }
        var result = [];
        for (var key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                result.push([key, obj[key]]);
            }
        }
        return result;
    };
}

// Object.assign
if (!Object.assign) {
    Object.assign = function (target) {
        if (target == null) { throw new TypeError("Cannot convert undefined or null to object"); }
        var to = Object(target);
        for (var i = 1; i < arguments.length; i++) {
            var source = arguments[i];
            if (source != null) {
                for (var key in source) {
                    if (Object.prototype.hasOwnProperty.call(source, key)) {
                        to[key] = source[key];
                    }
                }
            }
        }
        return to;
    };
}

// Object.freeze
if (!Object.freeze) {
    Object.freeze = function (obj) {
        // ES3 cannot truly freeze objects — return as-is (noop shim)
        return obj;
    };
}

//#endregion
