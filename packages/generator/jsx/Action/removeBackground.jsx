var _result = (function () {
  try {
    var idremoveBackground = stringIDToTypeID("removeBackground");
    executeAction(idremoveBackground, undefined, DialogModes.NO);
    return true;
  } catch (error) {
    return false;
  }
})();
_result;
