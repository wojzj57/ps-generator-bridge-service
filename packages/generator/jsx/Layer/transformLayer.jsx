var targetLayerId = params.id;
var rect = params.rect;

function getLayerBoundsById(id) {
    var lr = new ActionReference();
    lr.putProperty(charIDToTypeID("Prpr"), stringIDToTypeID("bounds"));
    lr.putIdentifier(stringIDToTypeID("layer"), id);
    var value = executeActionGet(lr).getObjectValue(stringIDToTypeID("bounds"));
    return {
        left: value.getUnitDoubleValue(stringIDToTypeID('left')),
        top: value.getUnitDoubleValue(stringIDToTypeID('top')),
        right: value.getUnitDoubleValue(stringIDToTypeID('right')),
        bottom: value.getUnitDoubleValue(stringIDToTypeID('bottom'))
    }
}

function resizeLayer(id, size) {
    var bounds = getLayerBoundsById(id);

    var idTrnf = charIDToTypeID("Trnf");
    var desc1 = new ActionDescriptor();
    var idnull = charIDToTypeID("null");

    var ref1 = new ActionReference();
    ref1.putIdentifier(stringIDToTypeID("layer"), id);
    desc1.putReference(idnull, ref1);


    var idFTcs = charIDToTypeID("FTcs");
    var idQCSt = charIDToTypeID("QCSt");
    var idQcsa = charIDToTypeID("Qcsa");
    desc1.putEnumerated(idFTcs, idQCSt, idQcsa);

    var idOfst = charIDToTypeID("Ofst");
    var desc2 = new ActionDescriptor();
    var idHrzn = charIDToTypeID("Hrzn");
    var idPxl = charIDToTypeID("#Pxl");
    desc2.putUnitDouble(idHrzn, idPxl, 0);
    var idVrtc = charIDToTypeID("Vrtc");
    var idPxl = charIDToTypeID("#Pxl");
    desc2.putUnitDouble(idVrtc, idPxl, 0);
    var idOfst = charIDToTypeID("Ofst");
    desc1.putObject(idOfst, idOfst, desc2);

    var percentX = (size.width / (bounds.right - bounds.left)) * 100;
    var percentY = (size.height / (bounds.bottom - bounds.top)) * 100;

    var idWdth = charIDToTypeID("Wdth");
    var idPrc = charIDToTypeID("#Prc");
    desc1.putUnitDouble(idWdth, idPrc, percentX);
    var idHght = charIDToTypeID("Hght");
    var idPrc = charIDToTypeID("#Prc");
    desc1.putUnitDouble(idHght, idPrc, percentY);
    var idLnkd = charIDToTypeID("Lnkd");

    desc1.putBoolean(idLnkd, true);
    var idIntr = charIDToTypeID("Intr");
    var idIntp = charIDToTypeID("Intp");
    var idBcbc = charIDToTypeID("Bcbc");
    desc1.putEnumerated(idIntr, idIntp, idBcbc);
    executeAction(idTrnf, desc1, DialogModes.NO);
}

function moveLayer(id, pos) {
    var bounds = getLayerBoundsById(id);

    var offsetX = pos.x - bounds.left;
    var offsetY = pos.y - bounds.top;

    var idTrnf = charIDToTypeID("Trnf");
    var desc1 = new ActionDescriptor();
    var idnull = charIDToTypeID("null");

    var ref1 = new ActionReference();
    ref1.putIdentifier(stringIDToTypeID("layer"), id);
    desc1.putReference(idnull, ref1);


    var idFTcs = charIDToTypeID("FTcs");
    var idQCSt = charIDToTypeID("QCSt");
    var idQcsa = charIDToTypeID("Qcsa");
    desc1.putEnumerated(idFTcs, idQCSt, idQcsa);
    var idOfst = charIDToTypeID("Ofst");
    var desc2 = new ActionDescriptor();
    var idHrzn = charIDToTypeID("Hrzn");
    var idPxl = charIDToTypeID("#Pxl");
    desc2.putUnitDouble(idHrzn, idPxl, offsetX);
    var idVrtc = charIDToTypeID("Vrtc");
    var idPxl = charIDToTypeID("#Pxl");
    desc2.putUnitDouble(idVrtc, idPxl, offsetY);
    var idOfst = charIDToTypeID("Ofst");
    desc1.putObject(idOfst, idOfst, desc2);

    var idLnkd = charIDToTypeID("Lnkd");
    desc1.putBoolean(idLnkd, true);
    var idIntr = charIDToTypeID("Intr");
    var idIntp = charIDToTypeID("Intp");
    var idBcbc = charIDToTypeID("Bcbc");
    desc1.putEnumerated(idIntr, idIntp, idBcbc);
    executeAction(idTrnf, desc1, DialogModes.NO);
}


function transformLayer(id, pos, size) {
    if (size) {
        resizeLayer(id, size);
    }
    if (pos) {
        moveLayer(id, pos);
    }
}

try {
    function toTransform() {
        transformLayer(targetLayerId, { x: rect.x, y: rect.y }, { width: rect.width, height: rect.height });
    }
    app.activeDocument.suspendHistory("图片变化", "toTransform()");

} catch (error) {
    alert(error.message);
}