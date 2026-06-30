var desc1 = new ActionDescriptor();
var ref1 = new ActionReference();
ref1.putEnumerated(charIDToTypeID("HstS"), charIDToTypeID("Ordn"), charIDToTypeID("Prvs"));
desc1.putReference(charIDToTypeID("null"), ref1);
executeAction(charIDToTypeID("slct"), desc1, DialogModes.NO);
