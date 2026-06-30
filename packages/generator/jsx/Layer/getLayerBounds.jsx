var layerID = params.layerID;
var layerBounds = undefined;

var lr = new ActionReference();
lr.putProperty(charIDToTypeID("Prpr"), stringIDToTypeID("layerKind"));
lr.putIdentifier(stringIDToTypeID("layer"), layerID);
var layerKind = executeActionGet(lr).getDouble(stringIDToTypeID("layerKind"));

if (layerKind == 7) {
  var rawBounds = [8096, 8096, 0, 0];
  var lr = new ActionReference();
  lr.putProperty(charIDToTypeID("Prpr"), stringIDToTypeID("itemIndex"));
  lr.putIdentifier(stringIDToTypeID("layer"), layerID);
  var index = executeActionGet(lr).getInteger(stringIDToTypeID("itemIndex"));

  try {
    if (activeDocument.backgroundLayer) index -= 1;
  } catch (error) {}

  var _flag = 1;
  var _index = index - 1;
  var _visibleFlag = 999;
  while (_flag) {
    var ref = new ActionReference();
    ref.putProperty(charIDToTypeID("Prpr"), stringIDToTypeID("layerKind"));
    ref.putIndex(stringIDToTypeID("layer"), _index);
    var layerKind = executeActionGet(ref).getDouble(stringIDToTypeID("layerKind"));

    var refPrpr = new ActionReference();
    refPrpr.putProperty(charIDToTypeID("Prpr"), stringIDToTypeID("visible"));
    refPrpr.putIndex(stringIDToTypeID("layer"), _index);
    var layerVisible = executeActionGet(refPrpr).getBoolean(stringIDToTypeID("visible"));

    if (layerKind == 7) {
      _flag += 1;
      _index -= 1;
      if (!layerVisible) _visibleFlag = _flag;
      continue;
    }
    if (layerKind == 13) {
      _flag -= 1;
      _index -= 1;
      continue;
    }
    if (_flag >= _visibleFlag) {
      _index -= 1;
      continue;
    }

    refPrpr = new ActionReference();
    refPrpr.putProperty(charIDToTypeID("Prpr"), stringIDToTypeID("group"));
    refPrpr.putIndex(stringIDToTypeID("layer"), _index);
    var layerGroup = executeActionGet(refPrpr).getBoolean(stringIDToTypeID("group"));
    if (layerGroup || !layerVisible) {
      _index -= 1;
      continue;
    }

    var ref3 = new ActionReference();
    ref3.putProperty(charIDToTypeID("Prpr"), stringIDToTypeID("bounds"));
    ref3.putIndex(stringIDToTypeID("layer"), _index);
    var layerBounds = executeActionGet(ref3).getObjectValue(stringIDToTypeID("bounds"));

    var boundslist = [];
    boundslist.push(layerBounds.getUnitDoubleValue(stringIDToTypeID("left")));
    boundslist.push(layerBounds.getUnitDoubleValue(stringIDToTypeID("top")));
    boundslist.push(layerBounds.getUnitDoubleValue(stringIDToTypeID("right")));
    boundslist.push(layerBounds.getUnitDoubleValue(stringIDToTypeID("bottom")));

    if (boundslist[0] != 0 || boundslist[1] != 0 || boundslist[2] != 0 || boundslist[3] != 0) {
      if (rawBounds[0] > boundslist[0]) rawBounds[0] = boundslist[0];
      if (rawBounds[1] > boundslist[1]) rawBounds[1] = boundslist[1];
      if (rawBounds[2] < boundslist[2]) rawBounds[2] = boundslist[2];
      if (rawBounds[3] < boundslist[3]) rawBounds[3] = boundslist[3];
    }

    _index -= 1;
    _visibleFlag = 999;
    if (_index == -1) break;
  }
  layerBounds =
    '{\"left\":' +
    boundslist[0] +
    "," +
    '\"top\":' +
    boundslist[1] +
    "," +
    '\"right\":' +
    boundslist[2] +
    "," +
    '\"bottom\":' +
    boundslist[3] +
    "}";
} else {
  var lr = new ActionReference();
  lr.putProperty(charIDToTypeID("Prpr"), stringIDToTypeID("bounds"));
  lr.putIdentifier(stringIDToTypeID("layer"), layerID);
  var value = executeActionGet(lr).getObjectValue(stringIDToTypeID("bounds"));
  layerBounds =
    '{\"left\":' +
    value.getUnitDoubleValue(stringIDToTypeID("left")) +
    "," +
    '\"top\":' +
    value.getUnitDoubleValue(stringIDToTypeID("top")) +
    "," +
    '\"right\":' +
    value.getUnitDoubleValue(stringIDToTypeID("right")) +
    "," +
    '\"bottom\":' +
    value.getUnitDoubleValue(stringIDToTypeID("bottom")) +
    "}";
}

layerBounds;
