const filepath = params.path;

const desc = new ActionDescriptor();
desc.putBoolean(stringIDToTypeID("dontRecord"), false);
desc.putBoolean(stringIDToTypeID("forceNotify"), true);
desc.putPath(stringIDToTypeID("null"), new File(filepath));
executeAction(stringIDToTypeID("open"), desc, DialogModes.NO); 