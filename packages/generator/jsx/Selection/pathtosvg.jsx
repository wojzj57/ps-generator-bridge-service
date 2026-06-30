Array.prototype.map = function (f) {
  var retArr = [];
  for (var i = 0, e = this.length; i < e; i++) {
    retArr[i] = f(this[i], i);
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
// Also we'll need some custom objects.
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
  this.mx = null;
  this.my = null;
  this.MX = null;
  this.MY = null;
  this.initialized = false;
};

BBox.prototype = {
  grow: function (p) {
    if (!p || (p.x === undefined || p.y === undefined)) return;
    
    if (!this.initialized) {
      this.mx = p.x;
      this.my = p.y;
      this.MX = p.x;
      this.MY = p.y;
      this.initialized = true;
    } else {
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
    }
    
    // 也要考虑控制点
    this.grow(p.in);
    this.grow(p.out);
  },
};

//
// And with that out of the way, the actual script:
//

var pointTypes = {
  "PointKind.CORNERPOINT": "P",
  "PointKind.SMOOTHPOINT": "C",
};

// filewrite function
function writeToFile(data) {
  var path = "/";
  // can we get a file location from the current document?
  try {
    path = app.activeDocument.path;
  } catch (e) {}
  var dir = Folder(path);
  var file = dir.saveDlg("", ".svg", true);
  if (!file) return false;

  var mode = "w";
  file.open(mode);
  file.write(data);
  file.close(mode);
  return file.toString();
}

// convert a PathPoint to a real object.
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

// convert all subpaths in a path to easier to walk form
function handlePath(path) {
  var subPaths = Array.from(path.subPathItems);
  return subPaths.map(handleSubPath);
}

// convert only the first path in a document to easier to walk form.
function convertLastedPath(pathItems) {
  if (pathItems.length === 0) {
    return null;
  }
  // 只获取第一个路径
  var lastedPath = pathItems[pathItems.length - 1];
  return handlePath(lastedPath);
}

// turn a subpath of improved points into an SVG path
function formSVGpath(subpath, bbox) {
  var p0 = subpath[0];
  var path = ["M", p0.x, p0.y];
  
  // 确保第一个点也被计算进边界框
  bbox.grow(p0);
  
  // we want to close this path:
  subpath.push(p0);
  subpath.forEach(function (p, i) {
    if (i === 0) return;
    bbox.grow(p);

    if (p0.kind === "P" && p.kind === "P") {
      path = path.concat(["L", p.x, p.y]);
    } else if (p0.kind === "P" && p.kind === "C") {
      path = path.concat(["C", p0.x, p0.y, p.in.x, p.in.y, p.x, p.y]);
    } else if (p0.kind === "C" && p.kind === "P") {
      path = path.concat(["C", p0.out.x, p0.out.y, p.x, p.y, p.x, p.y]);
    } else if (p0.kind === "C" && p.kind === "C") {
      path = path.concat(["C", p0.out.x, p0.out.y, p.in.x, p.in.y, p.x, p.y]);
    }
    p0 = p;
  });
  path.push("z");
  return path.join(" ");
}

// Convert a single improved path into an SVG string with tight bounding box
function formSinglePathSVG(singlePath) {
  if (!singlePath) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0"></svg>';
  }
  
  var svg = [];
  var bbox = new BBox();
  var d = "";
  
  // 处理单个路径的所有子路径
  singlePath.forEach(function (subpath) {
    d += formSVGpath(subpath, bbox);
  });
  
  // 检查边界框是否有效
  if (!bbox.initialized) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0"></svg>';
  }
  
  // 计算精确的宽高，完全贴合形状
  var w = bbox.MX - bbox.mx;
  var h = bbox.MY - bbox.my;
  
  // 确保宽高至少为1，避免无效的SVG
  w = Math.max(w, 1);
  h = Math.max(h, 1);
  
  svg.push(
    '<path fill="none" stroke="#25b048" stroke-width="2" fill-rule="evenodd" d="' + d + '"/>'
  );
  svg.push("</svg>");
  
  var header =
    '<svg xmlns="http://www.w3.org/2000/svg" width="' +
    Math.round(w) +
    '" height="' +
    Math.round(h) +
    '" viewBox="' +
    [bbox.mx, bbox.my, w, h].join(" ") +
    '">';
  svg = [header].concat(svg);
  return svg.join("\n");
}

// ===========================================
//
//           JS equivalent of main()
//
// ===========================================

// #target photoshop;

// switch to using pixels as unit, irrespective of what the document is set to
var activeDoc = app.activeDocument;
var origUnits = app.preferences.rulerUnits;
app.preferences.rulerUnits = Units.PIXELS;

// 检查是否有工作路径
if (activeDoc.pathItems.length === 0) {
  app.preferences.rulerUnits = origUnits;
  throw new Error("没有找到工作路径");
}

// 只转换第一个路径
var firstPathImproved = convertLastedPath(activeDoc.pathItems);
var svg = formSinglePathSVG(firstPathImproved);

// switch back to the original document's units once we're done.
app.preferences.rulerUnits = origUnits;

// 返回 SVG 字符串
svg
