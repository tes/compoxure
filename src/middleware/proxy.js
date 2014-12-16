var utils = require('../utils');
var HtmlParserProxy = require('./htmlparser');
var HttpStatus = require('http-status-codes');
var ReliableGet = require('reliable-get');
var url = require('url');

module.exports = function backendProxyMiddleware(config, eventHandler) {

    var reliableGet = new ReliableGet(config),
      htmlParserMiddleware = HtmlParserProxy.getMiddleware(config, reliableGet, eventHandler);

    reliableGet.on('log', eventHandler.logger);
    reliableGet.on('stat', eventHandler.stats);

    return function(req, res) {

      htmlParserMiddleware(req, res, function() {

        req.tracer = req.headers['x-tracer'];

        var DEFAULT_LOW_TIMEOUT = 5000,
            referer = req.headers.referer || 'direct',
            userAgent = req.headers['user-agent'] || 'unknown',
            remoteAddress = req.connection.remoteAddress || req.socket.remoteAddress || req.connection.socket.remoteAddress,
            remoteIp = req.headers['x-forwarded-for'] || remoteAddress,
            backend = req.backend,
            targetUrl = backend.target + (backend.dontPassUrl ? '' : req.url),
            targetHost = url.parse(backend.target).hostname,
            host = backend.host || targetHost,
            backendHeaders = {
              'x-forwarded-host': req.headers.host,
              host: host,
              'x-tracer': req.tracer
            },
            targetCacheKey = utils.urlToCacheKey(targetUrl),
            targetCacheTTL = utils.timeToMillis(backend.ttl || '30s'),
            options;

        if (config.cdn && config.cdn.url) { backendHeaders['x-cdn-url'] = config.cdn.url; }

        eventHandler.logger('info', 'GET ' + req.url, {tracer: req.tracer, referer: referer, remoteIp: remoteIp, userAgent: userAgent});

        options = {
          url: targetUrl,
          cacheKey: targetCacheKey,
          cacheTTL: targetCacheTTL,
          timeout: utils.timeToMillis(backend.timeout || DEFAULT_LOW_TIMEOUT),
          headers: backendHeaders,
          tracer: req.tracer,
          type: 'backend',
          statsdKey: 'backend_' + utils.urlToCacheKey(host),
          eventHandler: eventHandler
        };

        var handleError = function(err, oldCacheData) {
          if (req.backend.quietFailure && oldCacheData) {
            res.parse(oldCacheData.content);
            eventHandler.logger('error', 'Backend FAILED but serving STALE content: ' + err.message, {
              tracer: req.tracer
            });
          } else {

            // Check to see if we have any statusCode handlers defined, they come next
            if(err.statusCode && config.statusCodeHandlers && config.statusCodeHandlers[err.statusCode]) {
                var handlerDefn = config.statusCodeHandlers[err.statusCode];
                var handlerFn = config.functions && config.functions[handlerDefn.fn];
                if(handlerFn) {
                    return handlerFn(req, res, req.templateVars, handlerDefn.data, options, err);
                }
            }

            if (!res.headersSent) {
              res.writeHead(err.statusCode || HttpStatus.INTERNAL_SERVER_ERROR);
              res.end(err.message);
            }
            eventHandler.logger('error', 'Backend FAILED to respond: ' + err.message, {
              tracer: req.tracer
            });
          }
        }

        reliableGet.get(options, function(err, response) {
          if(err) {
            handleError(err, response);
          } else {
            req.templateVars = utils.updateTemplateVariables(req.templateVars, response.headers);
            res.parse(response.content);
          }
        });

      });

    }
}
