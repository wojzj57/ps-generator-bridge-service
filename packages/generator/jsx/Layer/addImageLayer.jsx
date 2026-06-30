var filePath = params.filePath;
var targetLayerId =
  params.id != undefined && params.id !== "" ? Number(params.id) : null;
var layerName = params.name;
var replace = false;

function getDocumentSize() {
  var ref1 = new ActionReference();
  ref1.putProperty(charIDToTypeID("Prpr"), stringIDToTypeID("width"));
  ref1.putEnumerated(
    charIDToTypeID("Dcmn"),
    charIDToTypeID("Ordn"),
    charIDToTypeID("Trgt")
  );
  var width = executeActionGet(ref1).getUnitDoubleValue(
    stringIDToTypeID("width")
  );

  var ref2 = new ActionReference();
  ref2.putProperty(charIDToTypeID("Prpr"), stringIDToTypeID("height"));
  ref2.putEnumerated(
    charIDToTypeID("Dcmn"),
    charIDToTypeID("Ordn"),
    charIDToTypeID("Trgt")
  );
  var height = executeActionGet(ref2).getUnitDoubleValue(
    stringIDToTypeID("height")
  );

  return {
    width: width,
    height: height,
  };
}

function rename(str) {
  var desc = new ActionDescriptor();
  var ref = new ActionReference();
  ref.putEnumerated(
    charIDToTypeID("Lyr "),
    charIDToTypeID("Ordn"),
    charIDToTypeID("Trgt")
  );
  desc.putReference(charIDToTypeID("null"), ref);
  var desc2 = new ActionDescriptor();
  desc2.putString(charIDToTypeID("Nm  "), str);
  desc.putObject(charIDToTypeID("T   "), charIDToTypeID("Lyr "), desc2);
  executeAction(charIDToTypeID("setd"), desc, DialogModes.NO);
}

function addImageLayer(filePath, name, insertIndex) {
  var desc = new ActionDescriptor();
  desc.putPath(charIDToTypeID("null"), new File(filePath));

  var idFTcs = charIDToTypeID("FTcs");
  var idQCSt = charIDToTypeID("QCSt");
  var idQcsa = charIDToTypeID("Qcsa");
  desc.putEnumerated(idFTcs, idQCSt, idQcsa);

  executeAction(charIDToTypeID("Plc "), desc, DialogModes.NO);
  rasterizeLayer();
  rename(name);

  try {
    if (insertIndex != undefined) {
      moveLayer(insertIndex);
    }
  } catch (e) {}
}

function rasterizeLayer() {
  var desc = new ActionDescriptor();
  var ref = new ActionReference();
  ref.putEnumerated(
    charIDToTypeID("Lyr "),
    charIDToTypeID("Ordn"),
    charIDToTypeID("Trgt")
  );
  desc.putReference(charIDToTypeID("null"), ref);
  executeAction(stringIDToTypeID("rasterizeLayer"), desc, DialogModes.NO);
}

function moveLayer(targetIndex) {
  var desc = new ActionDescriptor();
  var ref1 = new ActionReference();
  ref1.putEnumerated(
    charIDToTypeID("Lyr "),
    charIDToTypeID("Ordn"),
    charIDToTypeID("Trgt")
  );
  desc.putReference(charIDToTypeID("null"), ref1);
  var ref2 = new ActionReference();
  ref2.putIndex(charIDToTypeID("Lyr "), targetIndex);
  desc.putReference(charIDToTypeID("T   "), ref2);
  executeAction(charIDToTypeID("move"), desc, DialogModes.NO);
}

function deleteLayer(layerID) {
  var desc = new ActionDescriptor();
  var ref = new ActionReference();
  ref.putIdentifier(stringIDToTypeID("layer"), layerID);
  desc.putReference(charIDToTypeID("null"), ref);
  executeAction(charIDToTypeID("Dlt "), desc, DialogModes.NO);
}

function getLayerIndexByID(id) {
  var ref1 = new ActionReference();
  ref1.putProperty(charIDToTypeID("Prpr"), stringIDToTypeID("itemIndex"));
  ref1.putIdentifier(stringIDToTypeID("layer"), id);
  return executeActionGet(ref1).getInteger(stringIDToTypeID("itemIndex"));
}

function getLayerIDByIndex(layerIndex) {
  var ref1 = new ActionReference();
  ref1.putProperty(charIDToTypeID("Prpr"), stringIDToTypeID("layerID"));
  ref1.putIdentifier(stringIDToTypeID("layer"), layerIndex);
  return executeActionGet(ref1).getInteger(stringIDToTypeID("layerID"));
}

function getLayerInfoByIndex(layerIndex) {
  var ref1 = new ActionReference();
  ref1.putProperty(charIDToTypeID("Prpr"), stringIDToTypeID("layerID"));
  ref1.putIndex(stringIDToTypeID("layer"), layerIndex);
  var ref2 = new ActionReference();
  ref2.putProperty(charIDToTypeID("Prpr"), stringIDToTypeID("group"));
  ref2.putIndex(stringIDToTypeID("layer"), layerIndex);
  return {
    layerID: executeActionGet(ref1).getInteger(stringIDToTypeID("layerID")),
    group: executeActionGet(ref2).getBoolean(stringIDToTypeID("group")),
  };
}

function getInsertInfo(id) {
  var insertIndex = getLayerIndexByID(id);
  var origins = [id];

  function tryGetNextInfo() {
    try {
      var info = getLayerInfoByIndex(insertIndex + 1);
      if (info.group) {
        insertIndex = insertIndex + 1;
        origins.push(info.layerID);
        tryGetNextInfo();
      }
    } catch (error) {}
  }
  tryGetNextInfo();

  return {
    insertIndex: insertIndex,
    origins: origins,
  };
}

function getLayerBoundsByIndex(index) {
  var lr = new ActionReference();
  lr.putProperty(charIDToTypeID("Prpr"), stringIDToTypeID("bounds"));
  lr.putIndex(stringIDToTypeID("layer"), index);
  var value = executeActionGet(lr).getObjectValue(stringIDToTypeID("bounds"));
  return {
    left: value.getUnitDoubleValue(stringIDToTypeID("left")),
    top: value.getUnitDoubleValue(stringIDToTypeID("top")),
    right: value.getUnitDoubleValue(stringIDToTypeID("right")),
    bottom: value.getUnitDoubleValue(stringIDToTypeID("bottom")),
  };
}

function getLayerIdByIndex(index) {
  var idRef = new ActionReference();
  idRef.putProperty(charIDToTypeID("Prpr"), stringIDToTypeID("layerID"));
  idRef.putIndex(stringIDToTypeID("layer"), index);
  return executeActionGet(idRef).getInteger(stringIDToTypeID("layerID"));
}

var layerId;
try {
  function toTransform() {
    var insertIndex;

    if (targetLayerId != null && !isNaN(targetLayerId)) {
      var data = getInsertInfo(targetLayerId);
      insertIndex = data.insertIndex;
    }

    addImageLayer(filePath, layerName, insertIndex);

    try {
      if (insertIndex) {
        layerId = getLayerIdByIndex(insertIndex);
      } else {
        layerId = app.activeDocument.activeLayer.id;
      }
      
    } catch (error) {}
  }
  app.activeDocument.suspendHistory("导入图片", "toTransform()");

  // if (replace) {
  //   var origins = data.origins;
  //   for (var i = 0; i < origins.length; i++) {
  //     deleteLayer(origins[i]);
  //   }
  // }
} catch (error) {
  alert(error.message);
}

layerId;
