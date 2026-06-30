var layerID = params.id;
var blurSeed = params.blur || 0;


function setSelectionArea(rect) {
    var desc1 = new ActionDescriptor();
    var ref1 = new ActionReference();
    var idChnl = charIDToTypeID("Chnl");
    var idfsel = charIDToTypeID("fsel");
    ref1.putProperty(idChnl, idfsel);
    desc1.putReference(charIDToTypeID("null"), ref1);

    var idT = charIDToTypeID("T   ");
    var desc2 = new ActionDescriptor();

    var idLeft = charIDToTypeID("Left");
    var idPxl = charIDToTypeID("#Pxl");
    desc2.putUnitDouble(idLeft, idPxl, rect.x - blurSeed);

    var idTop = charIDToTypeID("Top ");
    var idPxl = charIDToTypeID("#Pxl");
    desc2.putUnitDouble(idTop, idPxl, rect.y - blurSeed);

    var idBtom = charIDToTypeID("Btom");
    var idPxl = charIDToTypeID("#Pxl");
    desc2.putUnitDouble(idBtom, idPxl, rect.y + rect.height + blurSeed);

    var idRght = charIDToTypeID("Rght");
    var idPxl = charIDToTypeID("#Pxl");
    desc2.putUnitDouble(idRght, idPxl, rect.x + rect.width + blurSeed);

    var idRctn = charIDToTypeID("Rctn");
    desc1.putObject(idT, idRctn, desc2);

    executeAction(charIDToTypeID("setd"), desc1, DialogModes.NO);
}

function setSelectionBlur(blurSeed) {
    var idFthr = charIDToTypeID("Fthr");
    var desc1 = new ActionDescriptor();
    var idRds = charIDToTypeID("Rds ");
    var idPxl = charIDToTypeID("#Pxl");
    desc1.putUnitDouble(idRds, idPxl, blurSeed);
    var idselectionModifyEffectAtCanvasBounds = stringIDToTypeID("selectionModifyEffectAtCanvasBounds");
    desc1.putBoolean(idselectionModifyEffectAtCanvasBounds, false);
    executeAction(idFthr, desc1, DialogModes.NO);
}

function makeMaskFromSelection() {
    var idMk = charIDToTypeID("Mk  ");
    var desc1 = new ActionDescriptor();
    var idNw = charIDToTypeID("Nw  ");
    var idChnl = charIDToTypeID("Chnl");
    desc1.putClass(idNw, idChnl);
    var idAt = charIDToTypeID("At  ");
    var ref659 = new ActionReference();
    var idChnl = charIDToTypeID("Chnl");
    var idChnl = charIDToTypeID("Chnl");
    var idMsk = charIDToTypeID("Msk ");
    ref659.putEnumerated(idChnl, idChnl, idMsk);
    desc1.putReference(idAt, ref659);
    var idUsng = charIDToTypeID("Usng");
    var idUsrM = charIDToTypeID("UsrM");
    var idRvlS = charIDToTypeID("RvlS");
    desc1.putEnumerated(idUsng, idUsrM, idRvlS);
    executeAction(idMk, desc1, DialogModes.NO);
}

function selectLayerById(layerId) {
    var idslct = charIDToTypeID("slct");
    var desc1 = new ActionDescriptor();
    var idnull = charIDToTypeID("null");
    var ref1 = new ActionReference();
    ref1.putIdentifier(stringIDToTypeID("layer"), layerId);
    desc1.putReference(idnull, ref1);
    executeAction(idslct, desc1, DialogModes.NO);
}

function workpathToSelection() {
    var idsetd = charIDToTypeID("setd");
    var desc1 = new ActionDescriptor();
    var idnull = charIDToTypeID("null");
    var ref1 = new ActionReference();
    var idChnl = charIDToTypeID("Chnl");
    var idfsel = charIDToTypeID("fsel");
    ref1.putProperty(idChnl, idfsel);
    desc1.putReference(idnull, ref1);
    var idT = charIDToTypeID("T   ");
    var ref2 = new ActionReference();
    var idPath = charIDToTypeID("Path");
    var idWrPt = charIDToTypeID("WrPt");
    ref2.putProperty(idPath, idWrPt);
    desc1.putReference(idT, ref2);
    var idVrsn = charIDToTypeID("Vrsn");
    desc1.putInteger(idVrsn, 1);
    var idvectorMaskParams = stringIDToTypeID("vectorMaskParams");
    desc1.putBoolean(idvectorMaskParams, true);
    executeAction(idsetd, desc1, DialogModes.NO);
}

function clearWorkpath() {
    var idDlt = charIDToTypeID("Dlt ");
    var desc = new ActionDescriptor();
    var idnull = charIDToTypeID("null");
    var ref1 = new ActionReference();
    var idPath = charIDToTypeID("Path");
    var idWrPt = charIDToTypeID("WrPt");
    ref1.putProperty(idPath, idWrPt);
    desc.putReference(idnull, ref1);
    executeAction(idDlt, desc, DialogModes.NO);
}

try {
    if (!layerID) throw new Error("Layer ID is not defined");

    selectLayerById(layerID);
    workpathToSelection();
    if (blurSeed > 0) {
        setSelectionBlur(blurSeed);
    }
    makeMaskFromSelection();
    clearWorkpath();
} catch (error) {
    alert("[setLayerMask] " + error.message);
}