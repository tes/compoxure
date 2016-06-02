var Accepts = require('accepts');
var HttpStatus = require('http-status-codes');

module.exports = function rejectUnsupportedMediaType(req, res, next) {
  var accept = new Accepts(req);
  var backendTypes = req.backend.contentTypes || ['html'];

  var contentType = accept.types(backendTypes);
  if (contentType === false) {
    if (!res.headersSent) {
      res.writeHead(HttpStatus.UNSUPPORTED_MEDIA_TYPE);
    }

    var message = 'Unsupported content type: [' + req.headers.accept + '], url was ' + req.url;
    next({
      message: message,
      url: req.url,
      supportedTypes: backendTypes,
      requestedTypes: req.headers.accept
    });
    return;
  }

  req.contentType = contentType;
  next();
}
