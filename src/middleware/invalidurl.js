module.exports = function (eventHandler) {
  return function (req, res, next) {
    try {
      decodeURI(req.url);
    } catch (ex) {
      eventHandler.logger('warn', 'Filtered out invalid URL - removed all query params.', { invalidUrl: req.url });
      req.url = req.url.split('?')[0]; // Just take the good parts for now - wtf
    }
    next();
  }
}
