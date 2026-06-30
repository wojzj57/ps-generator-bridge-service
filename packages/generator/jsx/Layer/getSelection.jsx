try {
  const bounds = app.activeDocument.selection.bounds;
  bounds;
} catch (e) {
  throw new Error("请先选中一个选区");
}
