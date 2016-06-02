var request = require('request');
var url = require('url');
var utils = require('../utils');

module.exports = function (config) {
  return function (req, res, next) {

    var isPassThrough = function (req) {
      if (!req.backend.passThrough) { return false }
      if (config.enableExtension && req.method === 'POST' && req.is('text/compoxure')) { return false; }
      if (req.method !== 'GET') { return true; }
      if (req.contentType === 'text/html') { return false; }
      if (req.contentType === 'html') { return false; }
      if (req.contentType === '*/*') { return false; }
      return true;
    }

    if (isPassThrough(req)) {

      var targetUrl = url.parse(req.backend.target);
      var reqUrl = url.parse(req.url);

      // Create forward url
      var forwardUrl = url.format({
        pathname: reqUrl.pathname,
        search: reqUrl.search,
        host: targetUrl.host,
        protocol: targetUrl.protocol,
      });

      var requestConfig = {
        url: forwardUrl,
        timeout: utils.timeToMillis(req.backend.timeout || '30s')
      };

      req.pipe(request(requestConfig)).pipe(res);

    } else {

      next();

    }
  }
}
