
var filePath = params.filePath;
try {
    app.open(new File(filePath));
} catch (error) {
    alert("[打开Psd错误] "+error.message);
}