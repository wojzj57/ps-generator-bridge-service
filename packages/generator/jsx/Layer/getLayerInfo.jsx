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

var layerID = params.layerID;
var layerIndex = params.layerIndex;
if (layerIndex != undefined) {
  var idRef = new ActionReference();
  idRef.putProperty(charIDToTypeID("Prpr"), stringIDToTypeID("layerID"));
  idRef.putIndex(stringIDToTypeID("layer"), layerIndex);
  layerID = executeActionGet(idRef).getInteger(stringIDToTypeID("layerID"));
}

var _getChildren = params.getChildren != undefined ? params.getChildren : false;

function getLayerInfoByID(layerID) {
  var result = {};
  result.id = layerID;
  // index
  // var ref = new ActionReference();
  // ref.putProperty(
  //   charIDToTypeID("Prpr"),
  //   stringIDToTypeID("hasBackgroundLayer")
  // );
  // ref.putEnumerated(
  //   charIDToTypeID("Dcmn"),
  //   charIDToTypeID("Ordn"),
  //   charIDToTypeID("Trgt")
  // );

  // var hasBackgroundLayer = executeActionGet(ref).getBoolean(
  //   stringIDToTypeID("hasBackgroundLayer")
  // );

  var ref = new ActionReference();
  ref.putProperty(charIDToTypeID("Prpr"), stringIDToTypeID("itemIndex"));
  ref.putIdentifier(stringIDToTypeID("layer"), layerID);
  result.index = executeActionGet(ref).getInteger(stringIDToTypeID("itemIndex"));
  // type
  var ref = new ActionReference();
  ref.putProperty(charIDToTypeID("Prpr"), stringIDToTypeID("layerKind"));
  ref.putIdentifier(stringIDToTypeID("layer"), layerID);
  result.type = executeActionGet(ref).getDouble(stringIDToTypeID("layerKind"));
  // name
  var ref = new ActionReference();
  ref.putProperty(charIDToTypeID("Prpr"), stringIDToTypeID("name"));
  ref.putIdentifier(stringIDToTypeID("layer"), layerID);
  result.name = executeActionGet(ref).getString(stringIDToTypeID("name"));

  // visible
  var ref = new ActionReference();
  ref.putProperty(charIDToTypeID("Prpr"), stringIDToTypeID("visible"));
  ref.putIdentifier(stringIDToTypeID("layer"), layerID);
  result.visible = executeActionGet(ref).getBoolean(stringIDToTypeID("visible"));

  // clip
  var ref = new ActionReference();
  ref.putProperty(charIDToTypeID("Prpr"), stringIDToTypeID("group"));
  ref.putIdentifier(stringIDToTypeID("layer"), layerID);
  result.clip = executeActionGet(ref).getBoolean(stringIDToTypeID("group"));
  //generatorSettings todo

  //bounds
  try {
    var ref = new ActionReference();
    ref.putProperty(charIDToTypeID("Prpr"), stringIDToTypeID("bounds"));
    ref.putIdentifier(stringIDToTypeID("layer"), layerID);
    var layerDescriptor = executeActionGet(ref);

    var rectangle = layerDescriptor.getObjectValue(stringIDToTypeID("bounds"));
    var left = rectangle.getUnitDoubleValue(charIDToTypeID("Left"));
    var top = rectangle.getUnitDoubleValue(charIDToTypeID("Top "));
    var right = rectangle.getUnitDoubleValue(charIDToTypeID("Rght"));
    var bottom = rectangle.getUnitDoubleValue(charIDToTypeID("Btom"));

    result.rect = {
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    };
    result.bounds = {
      left: left,
      right: right,
      top: top,
      bottom: bottom,
    };
  } catch (error) {
    alert("error " + error.message);
  }

  // layers
  if (_getChildren) {
    result.children = layerTreeCollection(result.index - 1, 0, undefined).layers;
  }
  return result;
}

function layerTreeCollection(from, to, items) {
  items = items ? items : [];
  for (var index = from; index >= to; index--) {
    var ref = new ActionReference();
    ref.putProperty(charIDToTypeID("Prpr"), stringIDToTypeID("layerKind"));
    ref.putIndex(stringIDToTypeID("layer"), index);
    var type = executeActionGet(ref).getDouble(stringIDToTypeID("layerKind"));

    if (type == 13) {
      return {
        layers: items,
        index: index,
      };
    }
    var layer = getLayerInfoByIndex(index);

    if (type == 7) {
      var result = layerTreeCollection(index - 1, to, undefined);
      layer.layers = result.layers;
      index = result.index;
    }
    items.push(layer);
  }
  return {
    layers: items,
    index: 0,
  };
}

var result = undefined;
try {
  if (!layerID) {
    var ref1 = new ActionReference();
    ref1.putProperty(charIDToTypeID("Prpr"), stringIDToTypeID("layerID"));
    ref1.putEnumerated(
      stringIDToTypeID("layer"),
      stringIDToTypeID("ordinal"),
      stringIDToTypeID("targetEnum")
    );
    layerID = executeActionGet(ref1).getInteger(stringIDToTypeID("layerID"));
  }
  result = JSON.stringify(getLayerInfoByID(layerID));
} catch (error) {
  result = "Error:获取的图层信息错误";
}
result;
