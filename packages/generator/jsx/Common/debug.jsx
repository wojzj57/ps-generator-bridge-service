/**
 * 这个函数接受一个AD的对象，返回这个对象所有属性值的JSON结构
 * @param desc [ActionDescriptor]
 * @return JSON
 */
function ADToJson(desc) {
  var json = {};
  for (var i = 0; i < desc.count; i++) {
    var typeID = desc.getKey(i);
    var stringID = typeIDToStringID(typeID);
    var typeString = desc.getType(typeID).toString();
    alert(stringID + " " + typeString);
    switch (typeString) {
      case "DescValueType.BOOLEANTYPE":
        json[stringID] = desc.getBoolean(typeID);
        break;
      case "DescValueType.DOUBLETYPE":
        json[stringID] = desc.getDouble(typeID);
        break;
      case "DescValueType.INTEGERTYPE":
        json[stringID] = desc.getInteger(typeID);
        break;
      case "DescValueType.STRINGTYPE":
        json[stringID] = desc.getString(typeID);
        break;
      case "DescValueType.OBJECTTYPE":
        var objectValue = desc.getObjectValue(typeID);
        json[stringID] = ADToJson(objectValue);
        break;
      case "DescValueType.UNITDOUBLE":
        json[stringID] = desc.getUnitDoubleValue(typeID);
        break;
      case "DescValueType.CLASSTYPE":
      case "DescValueType.LISTTYPE":
      case "DescValueType.REFERENCETYPE":
        // 剩下这些留给你去补充完成
        break;
      default:
        break;
    }
  }
  return json;
}
