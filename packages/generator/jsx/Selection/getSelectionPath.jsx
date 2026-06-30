var expand = params.expand || 0;

//#region JSON

// JSON
if (typeof JSON !== "object") {
  JSON = {};
}

(function () {
  "use strict";

  var rx_one = /^[\],:{}\s]*$/;
  var rx_two = /\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g;
  var rx_three = /"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g;
  var rx_four = /(?:^|:|,)(?:\s*\[)+/g;
  var rx_escapable =
    /[\\"\u0000-\u001f\u007f-\u009f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g;
  var rx_dangerous =
    /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g;

  function f(n) {
    // Format integers to have at least two digits.
    return n < 10 ? "0" + n : n;
  }

  function this_value() {
    return this.valueOf();
  }

  if (typeof Date.prototype.toJSON !== "function") {
    Date.prototype.toJSON = function () {
      return isFinite(this.valueOf())
        ? this.getUTCFullYear() +
            "-" +
            f(this.getUTCMonth() + 1) +
            "-" +
            f(this.getUTCDate()) +
            "T" +
            f(this.getUTCHours()) +
            ":" +
            f(this.getUTCMinutes()) +
            ":" +
            f(this.getUTCSeconds()) +
            "Z"
        : null;
    };

    Boolean.prototype.toJSON = this_value;
    Number.prototype.toJSON = this_value;
    String.prototype.toJSON = this_value;
  }

  var gap;
  var indent;
  var meta;
  var rep;

  function quote(string) {
    rx_escapable.lastIndex = 0;
    return rx_escapable.test(string)
      ? '"' +
          string.replace(rx_escapable, function (a) {
            var c = meta[a];
            return typeof c === "string"
              ? c
              : "\\u" + ("0000" + a.charCodeAt(0).toString(16)).slice(-4);
          }) +
          '"'
      : '"' + string + '"';
  }

  function str(key, holder) {
    var i; // The loop counter.
    var k; // The member key.
    var v; // The member value.
    var length;
    var mind = gap;
    var partial;
    var value = holder[key];

    if (value && typeof value === "object" && typeof value.toJSON === "function") {
      value = value.toJSON(key);
    }
    if (typeof rep === "function") {
      value = rep.call(holder, key, value);
    }
    switch (typeof value) {
      case "string":
        return quote(value);

      case "number":
        return isFinite(value) ? String(value) : "null";

      case "boolean":
      case "null":
        return String(value);
      case "object":
        if (!value) {
          return "null";
        }
        gap += indent;
        partial = [];
        if (Object.prototype.toString.apply(value) === "[object Array]") {
          length = value.length;
          for (i = 0; i < length; i += 1) {
            partial[i] = str(i, value) || "null";
          }
          v =
            partial.length === 0
              ? "[]"
              : gap
                ? "[\n" + gap + partial.join(",\n" + gap) + "\n" + mind + "]"
                : "[" + partial.join(",") + "]";
          gap = mind;
          return v;
        }
        if (rep && typeof rep === "object") {
          length = rep.length;
          for (i = 0; i < length; i += 1) {
            if (typeof rep[i] === "string") {
              k = rep[i];
              v = str(k, value);
              if (v) {
                partial.push(quote(k) + (gap ? ": " : ":") + v);
              }
            }
          }
        } else {
          for (k in value) {
            if (Object.prototype.hasOwnProperty.call(value, k)) {
              v = str(k, value);
              if (v) {
                partial.push(quote(k) + (gap ? ": " : ":") + v);
              }
            }
          }
        }
        v =
          partial.length === 0
            ? "{}"
            : gap
              ? "{\n" + gap + partial.join(",\n" + gap) + "\n" + mind + "}"
              : "{" + partial.join(",") + "}";
        gap = mind;
        return v;
    }
  }
  if (typeof JSON.stringify !== "function") {
    meta = {
      // table of character substitutions
      "\b": "\\b",
      "\t": "\\t",
      "\n": "\\n",
      "\f": "\\f",
      "\r": "\\r",
      '"': '\\"',
      "\\": "\\\\",
    };
    JSON.stringify = function (value, replacer, space) {
      var i;
      gap = "";
      indent = "";
      if (typeof space === "number") {
        for (i = 0; i < space; i += 1) {
          indent += " ";
        }
      } else if (typeof space === "string") {
        indent = space;
      }
      rep = replacer;
      if (
        replacer &&
        typeof replacer !== "function" &&
        (typeof replacer !== "object" || typeof replacer.length !== "number")
      ) {
        throw new Error("JSON.stringify");
      }
      return str("", { "": value });
    };
  }
})();

//#endregion

Array.prototype.map = function (f) {
  var retArr = [];
  for (var i = 0, e = this.length; i < e; i++) {
    retArr[i] = f(this[i], i);
  }
  return retArr;
};

Array.prototype.filter = function (f) {
  var retArr = [];
  for (var i = 0, e = this.length; i < e; i++) {
    if (f(this[i], i)) {
      retArr.push(this[i]);
    }
  }
  return retArr;
};

Array.prototype.forEach = function (f) {
  this.map(f);
};

Array.from = function (iterable) {
  var retArr = [];
  for (var i = 0, e = iterable.length; i < e; i++) {
    retArr.push(iterable[i]);
  }
  return retArr;
};
//
var Point = function (kind, x, y) {
  this.kind = kind;
  this.x = x;
  this.y = y;
};

Point.prototype = {
  toString: function () {
    var base = [this.kind];
    if (this.in) {
      base = base.concat(["(", this.in.x, this.in.y, ")"]);
    }
    base = base.concat([this.x, this.y]);
    if (this.out) {
      base = base.concat(["(", this.out.x, this.out.y, ")"]);
    }
    return base.join(" ");
  },
};

var BBox = function () {
  this.mx = 9999999;
  this.my = 9999999;
  this.MX = -9999999;
  this.MY = -9999999;
};

BBox.prototype = {
  grow: function (p) {
    if (!p) return;
    if (p.x < this.mx) {
      this.mx = p.x;
    }
    if (p.y < this.my) {
      this.my = p.y;
    }
    if (p.x > this.MX) {
      this.MX = p.x;
    }
    if (p.y > this.MY) {
      this.MY = p.y;
    }
    this.grow(p.in);
    this.grow(p.out);
  },
};

var pointTypes = {
  "PointKind.CORNERPOINT": "P",
  "PointKind.SMOOTHPOINT": "C",
};

//
function improvePoint(point) {
  var kind = pointTypes[point.kind];
  var coord = point.anchor;
  var x = Math.round(coord[0]);
  var y = Math.round(coord[1]);
  var obj = new Point(kind, x, y);

  if (kind === "C") {
    var d;
    if (point.leftDirection) {
      d = point.leftDirection.map(Math.round);
      obj.out = { x: d[0], y: d[1] };
    }
    if (point.rightDirection) {
      d = point.rightDirection.map(Math.round);
      obj.in = { x: d[0], y: d[1] };
    }
  }

  return obj;
}

// convert all points in a subpath to easier to parse form
function handleSubPath(subpath) {
  var pathPoints = Array.from(subpath.pathPoints);
  return pathPoints.map(improvePoint);
}

function cullUnclosedSubPathItem(subpath) {
  return subpath.closed;
}
function handlePath(path) {
  var subPaths = Array.from(path.subPathItems).filter(cullUnclosedSubPathItem);
  return subPaths.map(handleSubPath);
}

function tryGetWorkPath(pathItems) {
  var len = pathItems.length;
  if (len == 0) return undefined;
  var lastPath = pathItems[len - 1];
  if (lastPath.kind != PathKind.WORKPATH) return undefined;
  return lastPath;
}

function expandSelectionArea(size) {
  var idExpn = charIDToTypeID("Expn");
  var desc = new ActionDescriptor();
  var idBy = charIDToTypeID("By  ");
  var idPxl = charIDToTypeID("#Pxl");
  desc.putUnitDouble(idBy, idPxl, size);
  var idselectionModifyEffectAtCanvasBounds = stringIDToTypeID(
    "selectionModifyEffectAtCanvasBounds"
  );
  desc.putBoolean(idselectionModifyEffectAtCanvasBounds, false);
  executeAction(idExpn, desc, DialogModes.NO);
}

function makeWorkpathFromSelection() {
  var idMk = charIDToTypeID("Mk  ");
  var desc = new ActionDescriptor();
  var idnull = charIDToTypeID("null");
  var ref1 = new ActionReference();
  var idPath = charIDToTypeID("Path");
  ref1.putClass(idPath);
  desc.putReference(idnull, ref1);
  var idFrom = charIDToTypeID("From");
  var ref2 = new ActionReference();
  var idcsel = charIDToTypeID("csel");
  var idfsel = charIDToTypeID("fsel");
  ref2.putProperty(idcsel, idfsel);
  desc.putReference(idFrom, ref2);
  var idTlrn = charIDToTypeID("Tlrn");
  var idPxl = charIDToTypeID("#Pxl");
  desc.putUnitDouble(idTlrn, idPxl, 2.0);
  executeAction(idMk, desc, DialogModes.NO);
}

var data = {};
try {
  function getSelectionAndPath() {
    try {
      var activeDoc = app.activeDocument;
      app.preferences.rulerUnits = Units.PIXELS;
      var hasSelection;

      try {
        hasSelection = activeDoc.selection.bounds;
      } catch (error) {}

      if (hasSelection) {
        if (expand > 0) {
          expandSelectionArea(expand);
        }

        var selectionBounds = activeDoc.selection.bounds;
        data.bounds = {
          left: selectionBounds[0].value,
          top: selectionBounds[1].value,
          right: selectionBounds[2].value,
          bottom: selectionBounds[3].value,
        };

        //
        makeWorkpathFromSelection();
        //
        var workPathItem = tryGetWorkPath(activeDoc.pathItems);

        if (workPathItem) {
          data.path = handlePath(workPathItem);
        }
      }
    } catch (error) {
      alert("[getSelectionPath] " + error.message);
    }
  }
  app.activeDocument.suspendHistory("getSelectionAndPath", "getSelectionAndPath()");
} catch (error) {
  alert(error.message);
}

data = JSON.stringify(data);
