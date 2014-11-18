var utils = require('./src/utils');
var HtmlParserProxy = require('./src/middleware/htmlparser');
var RequestInterrogator = require('./src/parameters/RequestInterrogator');
var _ = require('lodash');
var request = require('request');
var url = require('url');
var HttpStatus = require('http-status-codes');
var ReliableGet = require('reliable-get');
var Accepts = require('accepts');
var ware = require('ware');

var prevMillis = 0;
var intraMillis = 0;

module.exports = function(config, eventHandler) {

  // Ensure event handler has sensible defaults
  eventHandler = eventHandler || {
    logger: function() {},
    stats: function() {}
  };
  eventHandler.logger = eventHandler.logger || function() {};
  eventHandler.stats = eventHandler.stats || function() {};

  var interrogator = new RequestInterrogator(config.parameters,
    config.cdn || {},
    config.environment,
    eventHandler),
    reliableGet = ReliableGet(config),
    cacheMiddleware = require('reliable-get/CacheMiddleware')(config),
    htmlParserMiddleware = HtmlParserProxy.getMiddleware(config, reliableGet, eventHandler);

  function backendProxyMiddleware(req, res) {

    htmlParserMiddleware(req, res, function() {

      req.tracer = req.headers['x-tracer'] || (Date.now() * 1000) + intraMillis;

      var DEFAULT_LOW_TIMEOUT = 500,
          now = Date.now(),
          referer = req.headers.referer || 'direct',
          userAgent = req.headers['user-agent'] || 'unknown',
          remoteAddress = req.connection.remoteAddress || req.socket.remoteAddress || req.connection.socket.remoteAddress,
          remoteIp = req.headers['x-forwarded-for'] || remoteAddress,
          backend = req.backend,
          targetUrl = backend.target + (backend.dontPassUrl ? '' : req.url),
          targetHost = url.parse(backend.target).host,
          backendHeaders = {
            'x-forwarded-host': req.headers.host,
            host: backend.host || targetHost,
            'x-tracer': req.tracer
          },
          targetCacheKey = utils.urlToCacheKey(targetUrl),
          targetCacheTTL = utils.timeToMillis(backend.ttl || '30s'),
          options;

      if (now > prevMillis) {
        prevMillis = now;
        intraMillis = 0;
      } else {
        intraMillis += 1;
      }

      eventHandler.logger('info', 'GET ' + req.url, {
        tracer: req.tracer,
        referer: referer,
        remoteIp: remoteIp,
        userAgent: userAgent
      });

      if (config.cdn) {
        if (config.cdn.host) { backendHeaders['x-cdn-host'] = config.cdn.host; }
        if (config.cdn.url) { backendHeaders['x-cdn-url'] = config.cdn.url; }
      }

      options = {
        url: targetUrl,
        cacheKey: targetCacheKey,
        cacheTTL: targetCacheTTL,
        timeout: utils.timeToMillis(backend.timeout || DEFAULT_LOW_TIMEOUT),
        headers: backendHeaders,
        tracer: req.tracer,
        type: 'backend',
        statsdKey: 'backend_' + utils.urlToCacheKey(backend.host),
        eventHandler: eventHandler
      };

      // For each header prefixed with cx-variable, add to templateVars
      var addToTemplateVars = function(variables) {
         _.each(_.filter(_.keys(variables), function(key) {
            if(key.indexOf('cx-') >= 0) { return true; }
         }), function(cxKey) {
            var variable = variables[cxKey],
                strippedKey = cxKey.replace('cx-',''),
                variableKey = strippedKey.split('|')[0],
                variableName = strippedKey.split('|')[1];
            req.templateVars[variableKey + ':' + variableName] = variable;
            req.templateVars[variableKey + ':' + variableName + ':encoded'] = encodeURI(variable);
         });
      }

      var handleError = function(err, oldCacheData) {
        if (req.backend.quietFailure && oldCacheData) {
          res.parse(oldCacheData);
          eventHandler.logger('error', 'Backend FAILED but serving STALE content: ' + err.message, {
            tracer: req.tracer
          });
        } else {
          if (!res.headersSent) {
            res.writeHead(HttpStatus.INTERNAL_SERVER_ERROR);
            res.end(err.message);
          }
          eventHandler.logger('error', 'Backend FAILED to respond: ' + err.message, {
            tracer: req.tracer
          });
        }
      }

      reliableGet(options, function(err, response) {
        if(err) {
          handleError(err, response.stale);
        } else {
          addToTemplateVars(response.headers);
          res.parse(response.content);
        }
      });

    });

  }

  function dropFavicon(req, res, next) {
    if (req.url === '/favicon.ico') {
      if (!res.headersSent) {
        res.writeHead(200, {
          'Content-Type': 'image/x-icon'
        });
      }
      return next({
        level: 'info',
        message: 'Dropped favicon request'
      });
    }
    next();
  }

  function selectBackend(req, res, next) {
    if (config.backend) {
      req.backend = _.find(config.backend, function(server) {
          if (server.pattern) { return new RegExp(server.pattern).test(req.url); }
          if (server.fn) {
            if (typeof config.functions[server.fn] == 'function') {
              return config.functions[server.fn](req, req.templateVars);
            }
          }
      });
    }

    if (!req.backend) {
      if (!res.headersSent) {
        res.writeHead(HttpStatus.NOT_FOUND);
      }
      return next({
        level: 'warn',
        message: 'Backend not found'
      });
    } else {
      return next();
    }
  }

  function rejectUnsupportedMediaType(req, res, next) {
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

  function isPassThrough(req) {
    if (!req.backend.passThrough) { return false }
    if (req.method !== 'GET') { return true; }
    if (req.contentType === 'text/html') { return false; }
    if (req.contentType === 'html') { return false; }
    if (req.contentType === '*/*') { return false; }
    return true;
  }

  function passThrough(req, res, next) {
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

  function cleanInvalidUri(req, res, next) {
    try {
      decodeURI(req.url);
    } catch(ex) {
      eventHandler.logger('warn','Filtered out invalid URL - removed all query params.', {invalidUrl: req.url});
      req.url = req.url.split('?')[0]; // Just take the good parts for now - wtf
    }
    next();
  }

  function interrogateRequest(req, res, next) {
    interrogator.interrogateRequest(req, function(templateVars) {
      req.templateVars = templateVars;
      next();
    });
  }

  var middleware = ware()
                    .use(cleanInvalidUri)
                    .use(dropFavicon)
                    .use(cacheMiddleware)
                    .use(interrogateRequest)
                    .use(selectBackend)
                    .use(rejectUnsupportedMediaType)
                    .use(passThrough)
                    .use(backendProxyMiddleware);

  return function(req, res) {
    middleware.run(req, res, function(err) {
        if(err) {
            // Just end fast - headers sent above if needed.
            res.end('');
        }
    });
  }

};
