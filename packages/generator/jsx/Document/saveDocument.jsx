// Save the active document. With `params.savePath`, save-as a PSD (maximize
// compatibility) to that path and bind the document to it; without it, save the
// document in place. Returns "OK", or an "Error:"-prefixed string the JsxRunner
// turns into a thrown error.
let result;
try {
  const savePath = typeof params !== "undefined" && params ? params.savePath : undefined;
  if (savePath) {
    const saveDesc = new ActionDescriptor();
    const psdOptions = new ActionDescriptor();
    psdOptions.putBoolean(stringIDToTypeID("maximizeCompatibility"), true);
    saveDesc.putObject(charIDToTypeID("As  "), charIDToTypeID("Pht3"), psdOptions);
    saveDesc.putPath(charIDToTypeID("In  "), new File(savePath));
    saveDesc.putInteger(charIDToTypeID("DocI"), app.activeDocument.id);
    saveDesc.putBoolean(charIDToTypeID("LwCs"), true);
    saveDesc.putEnumerated(
      stringIDToTypeID("saveStage"),
      stringIDToTypeID("saveStageType"),
      stringIDToTypeID("saveBegin")
    );
    executeAction(charIDToTypeID("save"), saveDesc, DialogModes.NO);
  } else {
    const ref_save = new ActionReference();
    ref_save.putEnumerated(
      stringIDToTypeID("document"),
      charIDToTypeID("Ordn"),
      charIDToTypeID("Trgt")
    );
    const setDescriptor = new ActionDescriptor();
    setDescriptor.putReference(stringIDToTypeID("null"), ref_save);
    executeAction(stringIDToTypeID("save"), setDescriptor, DialogModes.NO);
  }
  result = "OK";
} catch (e) {
  result = "Error: saveDocument failed: " + e.message;
}
result;
