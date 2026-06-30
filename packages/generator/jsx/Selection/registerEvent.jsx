var events = params.events;

var actionDescriptor = new ActionDescriptor();
actionDescriptor.putString(stringIDToTypeID("version"), "1.0.0");

for (var i = 0; i < events.length; i++) {
    // 这里要指定生成的那个扩展ID
    actionDescriptor.putClass(stringIDToTypeID("eventIDAttr"), charIDToTypeID(events[i]));
    executeAction(stringIDToTypeID("networkEventSubscribe"), actionDescriptor, DialogModes.NO);
}

