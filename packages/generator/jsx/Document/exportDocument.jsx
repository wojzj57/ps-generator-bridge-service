// Export current document - based on PS "Save a Copy" mechanism
// params: { filePath, format, jpegQuality, jpegMatte, pngInterlace, pngCompression,
//           tiffCompression, tiffByteOrder, tiffLayers, tiffTransparency,
//           embedColorProfile }

var _result = (function () {
    if (app.documents.length === 0) return "Error:No document is open.";

    var doc = app.activeDocument;
    var filePath = params.filePath;
    var format = (params.format || "png").toLowerCase();

    if (!filePath) {
        filePath = Folder.desktop + "/" + doc.name.replace(/\.[^\.]+$/, '') + "." + format;
    }

    var file = new File(filePath);
    var folder = file.parent;
    if (!folder.exists) folder.create();

    var desc1 = new ActionDescriptor();
    var desc2 = new ActionDescriptor();

    if (format === "jpeg" || format === "jpg") {
        // quality: 0-12, default 10
        var quality = (params.jpegQuality != undefined) ? params.jpegQuality : 10;
        desc2.putInteger(stringIDToTypeID("extendedQuality"), quality);

        // matte color for transparent areas: "none" / "white" / "black" / "foregroundColor" / "backgroundColor"
        var matte = (params.jpegMatte || "none").toLowerCase();
        var matteMap = {
            "none": "none",
            "white": "white",
            "black": "black",
            "foreground": "foregroundColor",
            "background": "backgroundColor"
        };
        var matteValue = matteMap[matte] || "none";
        desc2.putEnumerated(stringIDToTypeID("matte"), stringIDToTypeID("matteColor"), stringIDToTypeID(matteValue));

        desc1.putObject(stringIDToTypeID("as"), stringIDToTypeID("JPEG"), desc2);

    } else if (format === "png") {
        // interlace: 0=none, 1=interlaced
        var interlace = params.pngInterlace ? 1 : 0;
        try { desc2.putInteger(stringIDToTypeID("PNGInterlaceType"), interlace); } catch(e) {}

        // compression: 0-9, default 6
        var compression = (params.pngCompression != undefined) ? params.pngCompression : 6;
        try { desc2.putInteger(stringIDToTypeID("compression"), compression); } catch(e) {}

        desc1.putObject(stringIDToTypeID("as"), stringIDToTypeID("PNGFormat"), desc2);

    } else if (format === "tiff" || format === "tif") {
        // byte order: "IBMPC" (Windows/Intel) or "macintosh" (Mac)
        var byteOrder = (params.tiffByteOrder || "ibm").toLowerCase();
        var byteOrderValue = (byteOrder === "mac" || byteOrder === "macintosh") ? "macintosh" : "IBMPC";
        try {
            desc2.putEnumerated(stringIDToTypeID("byteOrder"), stringIDToTypeID("platform"), stringIDToTypeID(byteOrderValue));
        } catch(e) {}

        // compression: "none" / "LZW" / "ZIPCompression" / "JPEG"
        var tiffComp = (params.tiffCompression || "none").toLowerCase();
        var tiffCompMap = { "lzw": "LZW", "zip": "ZIPCompression", "jpeg": "JPEG", "none": "none" };
        var tiffCompValue = tiffCompMap[tiffComp] || "none";
        try {
            desc2.putEnumerated(stringIDToTypeID("encoding"), stringIDToTypeID("encoding"), stringIDToTypeID(tiffCompValue));
        } catch(e) {}

        // save layers
        if (params.tiffLayers != undefined) {
            try { desc2.putBoolean(stringIDToTypeID("layerOrder"), params.tiffLayers); } catch(e) {}
        }

        // transparency
        if (params.tiffTransparency != undefined) {
            try { desc2.putBoolean(stringIDToTypeID("transparency"), params.tiffTransparency); } catch(e) {}
        }

        desc1.putObject(stringIDToTypeID("as"), stringIDToTypeID("TIFF"), desc2);

    } else if (format === "bmp") {
        desc1.putObject(stringIDToTypeID("as"), stringIDToTypeID("BMPFormat"), desc2);

    } else if (format === "tga" || format === "targa") {
        // resolution: 16 / 24 / 32, default 24
        var tgaRes = (params.tgaDepth != undefined) ? params.tgaDepth : 24;
        try { desc2.putInteger(stringIDToTypeID("resolution"), tgaRes); } catch(e) {}
        try { desc2.putBoolean(stringIDToTypeID("rLECompression"), true); } catch(e) {}
        desc1.putObject(stringIDToTypeID("as"), stringIDToTypeID("targaFormat"), desc2);

    } else {
        return "Error:Unsupported format: " + format;
    }

    // embed ICC color profile
    if (params.embedColorProfile != undefined) {
        try { desc1.putBoolean(stringIDToTypeID("ICC"), params.embedColorProfile); } catch(e) {}
    }

    desc1.putPath(stringIDToTypeID("in"), file);
    desc1.putBoolean(stringIDToTypeID("copy"), true);
    executeAction(stringIDToTypeID("save"), desc1, DialogModes.NO);

    return "OK";
})();
_result;
