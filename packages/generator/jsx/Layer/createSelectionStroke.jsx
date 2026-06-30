var wdth = params.width; //描边宽度
var opct = params.opct; //透明度
var location = params.location; //位置 Insd Otsd
var h = params.h;
var s = params.s;
var b = params.b;
try {
  app.activeDocument.selection.bounds;
} catch (e) {
  throw new Error("请先选中一个选区");
}
function createSelection() {
  //新建一个图层
  try {
    var idMk = charIDToTypeID("Mk  ");
    var desc4597 = new ActionDescriptor();
    var idnull = charIDToTypeID("null");
    var ref73 = new ActionReference();
    var idLyr = charIDToTypeID("Lyr ");
    ref73.putClass(idLyr);
    desc4597.putReference(idnull, ref73);
    executeAction(idMk, desc4597, DialogModes.NO);
  } catch (e) {
    throw new Error("图层转换失败");
  }
  //描边
  try {
    var desc1 = new ActionDescriptor();
    desc1.putInteger(charIDToTypeID("Wdth"), wdth);
    desc1.putEnumerated(
      charIDToTypeID("Lctn"),
      charIDToTypeID("StrL"),
      charIDToTypeID(location)
    );
    desc1.putUnitDouble(charIDToTypeID("Opct"), charIDToTypeID("#Prc"), opct);
    desc1.putEnumerated(
      charIDToTypeID("Md  "),
      charIDToTypeID("BlnM"),
      charIDToTypeID("Nrml")
    );
    var desc2 = new ActionDescriptor();
    desc2.putUnitDouble(charIDToTypeID("H   "), charIDToTypeID("#Ang"), h);
    desc2.putDouble(charIDToTypeID("Strt"), s);
    desc2.putDouble(charIDToTypeID("Brgh"), b);
    desc1.putObject(charIDToTypeID("Clr "), charIDToTypeID("HSBC"), desc2);
    executeAction(charIDToTypeID("Strk"), desc1, DialogModes.NO);
  } catch (e) {
    throw new Error("创建描边选区失败");
  }
}
app.activeDocument.suspendHistory("创建选区描边", "createSelection()");
app.activeDocument.activeLayer.id
