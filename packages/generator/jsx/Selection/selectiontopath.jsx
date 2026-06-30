var desc1 = new ActionDescriptor();
var ref1 = new ActionReference();
ref1.putClass( charIDToTypeID( "Path" ) );
desc1.putReference( charIDToTypeID( "null" ), ref1 );
var ref2 = new ActionReference();
ref2.putProperty( charIDToTypeID( "csel" ), charIDToTypeID( "fsel" ) );
desc1.putReference( charIDToTypeID( "From" ), ref2 );
desc1.putUnitDouble( charIDToTypeID( "Tlrn" ), charIDToTypeID( "#Pxl" ), 1.000000 );
executeAction( charIDToTypeID( "Mk  " ), desc1, DialogModes.NO );