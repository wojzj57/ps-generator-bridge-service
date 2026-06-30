try {
  function autoCutout() {
    var idautoCutout = stringIDToTypeID("autoCutout");
    var desc1 = new ActionDescriptor();
    var idsampleAllLayers = stringIDToTypeID("sampleAllLayers");
    desc1.putBoolean(idsampleAllLayers, false);
    executeAction(idautoCutout, desc1, DialogModes.NO);
  }
  app.activeDocument.suspendHistory("autoCutout", "autoCutout()");
} catch (error) {
  alert("[AutoCutout] " + error.message);
}
