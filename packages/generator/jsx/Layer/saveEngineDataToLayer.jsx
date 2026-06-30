const layerName = params.layerName;
const data = params.data;
const config = params.config;

function saveEngineData(layerName, data, config) {
  config = config || {};

  const refLay_gs = new ActionReference();
  refLay_gs.putProperty(charIDToTypeID("Prpr"), stringIDToTypeID("generatorSettings"));
  refLay_gs.putName(stringIDToTypeID("layer"), layerName);

  const settingsDesc = new ActionDescriptor();
  settingsDesc.putString(stringIDToTypeID("data"), data);

  if (config.engine) settingsDesc.putString(stringIDToTypeID("engine"), config.engine);
  if (config.version) settingsDesc.putString(stringIDToTypeID("version"), config.version);

  const setDescriptor = new ActionDescriptor();
  setDescriptor.putReference(stringIDToTypeID("null"), refLay_gs);
  setDescriptor.putObject(stringIDToTypeID("to"), stringIDToTypeID("null"), settingsDesc);
  setDescriptor.putString(charIDToTypeID("Prpr"), "engineData");
  executeAction(charIDToTypeID("setd"), setDescriptor, DialogModes.NO);
}
try {
  saveEngineData(layerName, data, config);
} catch (error) {}
