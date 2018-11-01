var _ = require('lodash');
var utils = require('../utils');
var HtmlParserProxy = require('./htmlparser');
var HttpStatus = require('http-status-codes');
var ReliableGet = require('reliable-get');
var url = require('url');
var extractSlots = require('../extract-slots');
var Core = require('parxer/lib/core');

module.exports = function backendProxyMiddleware(config, eventHandler, optionsTransformer) {

  var reliableGet = new ReliableGet(config),
    htmlParserMiddleware = HtmlParserProxy.getMiddleware(config, reliableGet, eventHandler, optionsTransformer);

  reliableGet.on('log', eventHandler.logger);
  reliableGet.on('stat', eventHandler.stats);

  return function (req, res) {
    htmlParserMiddleware(req, res, function () {

      req.tracer = req.headers['x-tracer'] || 'no-tracer';

      var DEFAULT_LOW_TIMEOUT = 5000,
        referer = req.headers.referer || 'direct',
        userAgent = req.headers['user-agent'] || 'unknown',
        remoteAddress = req.connection.remoteAddress || req.socket.remoteAddress || req.connection.socket.remoteAddress,
        remoteIp = req.headers['x-forwarded-for'] || remoteAddress,
        backend = req.backend,
        targetUrl = backend.target + (backend.dontPassUrl ? '' : req.url),
        targetHost = url.parse(backend.target).hostname,
        host = backend.host || targetHost,
        accept = backend.accept || 'text/html',
        device = req.templateVars['device:type'],
        backendHeaders = {
          'x-forwarded-host': req.headers.host || 'no-forwarded-host',
          'x-forwarded-for': req.headers['x-forwarded-for'] || remoteAddress,
          host: host,
          accept: accept,
          'x-tracer': req.tracer,
          'user-agent': userAgent,
          'x-device': device,
          'x-site-country': req.headers['x-site-country'],
          'x-site-language': req.headers['x-site-language'],
          'x-site-locales': req.headers['x-site-locales'],
          'x-geoip-country-code': req.headers['x-geoip-country-code'],
          'x-csrf-token': req.headers['x-csrf-token']
        },
        targetCacheKey = backend.cacheKey,
        targetCacheTTL = utils.timeToMillis(backend.ttl || '30s'),
        targetTags = backend.tags,
        explicitNoCache = backend.noCache || req.explicitNoCache,
        options;

      if (config.cdn && config.cdn.url) { backendHeaders['x-cdn-url'] = config.cdn.url; }

      if (req.cookies && req.headers.cookie) {
        var whitelist = config.cookies && config.cookies.whitelist;
        backendHeaders.cookie = whitelist ? utils.filterCookies(whitelist, req.cookies) : req.headers.cookie;
      }

      if (req.headers['accept-language']) {
        backendHeaders['accept-language'] = req.headers['accept-language'];
      }

      if (backend.headers) {
        backend.headers.forEach(function (header) {
          backendHeaders[header] = req.headers[header] || '';
        });
      }

      eventHandler.logger('debug', 'GET ' + req.url, {
        tracer: req.tracer,
        referer: referer,
        remoteIp: remoteIp,
        userAgent: userAgent
      });

      options = {
        url: targetUrl,
        cacheKey: targetCacheKey,
        cacheTTL: targetCacheTTL,
        tags: targetTags,
        explicitNoCache: explicitNoCache,
        timeout: utils.timeToMillis(backend.timeout || DEFAULT_LOW_TIMEOUT),
        headers: backendHeaders,
        tracer: req.tracer,
        type: 'backend',
        statsdKey: 'backend',
        statsdTags: ['application:' + utils.getServiceNameFromUrl(targetUrl)],
        eventHandler: eventHandler
      };

      var logError = function (err, message) {
        var logLevel = err.statusCode === 404 ? 'warn' : 'error';
        eventHandler.logger(logLevel, message, {
          tracer: req.tracer
        });
      }

      var showResponseContentOnError = function(statusCode) {
        var codes = config.renderContentOnErrorCode || [];
        return codes.includes(statusCode);
      }

      var handleError = function (err) {
        if (!res.headersSent) {
          res.writeHead(err.statusCode || HttpStatus.INTERNAL_SERVER_ERROR);
          res.end(err.message);
        }
        logError(err, 'Backend FAILED but to respond: ' + err.message);
      };

      var handleErrorDecorator = function (func) {
        return function (err, response) {
          if (!err) {
            return func(null, response); // no errors!
          }

          // If we are allowing the backend to respond with content, then do so
          if (showResponseContentOnError(err.statusCode)) {
            return func(null, response);
          }

          // Check to see if we have any statusCode handlers defined
          if (err.statusCode && config.statusCodeHandlers && config.statusCodeHandlers[err.statusCode]) {
            var handlerDefn = config.statusCodeHandlers[err.statusCode];
            var handlerFn = config.functions && config.functions[handlerDefn.fn];
            if (handlerFn) {
              return handlerFn(req, res, req.templateVars, handlerDefn.data, options, err, res.parse);
            }
          }

          if (req.backend.quietFailure && response && response.stale) {
            logError(err, 'Backend FAILED but serving STALE content from key ' + targetCacheKey + ' : ' + err.message);
            func(null, response);
          } else {
            handleError(err, response);
          }
        };
      };

      var setAdditionalHeaders = function () {
        var headersToAdd = _.keys(backend.addResponseHeaders);
        headersToAdd.forEach(function (header) {
          var headerValue = Core.render(backend.addResponseHeaders[header], req.templateVars);
          if (headerValue) { res.setHeader(header, headerValue); }
        });
      }

      var passThroughHeaders = function (backendHeaders) {
        var headersToAllow = backend.passThroughHeaders || [];
        headersToAllow.forEach(function (header) {
          var headerValue = backendHeaders[header];
          if (headerValue) { res.setHeader(header, headerValue); }
        });
      }

      optionsTransformer(req, options, function (err, transformedOptions) {
        if (err) { return handleError(err); }

        if (config.enableExtension && req.method === 'POST' && req.is('text/compoxure')) {
          res.parseAndResponse(req.body);
          return;
        }

        var logEventsPage = utils.isDebugEnabled(req) && utils.attachEventLogger(transformedOptions);
        transformedOptions.explicitNoCache = utils.isNoCacheEnabled(req);
        reliableGet.get(transformedOptions, handleErrorDecorator(function (err, response) {
          var layoutUrl;
          var newTemplateVars = utils.formatTemplateVariables(response.headers);
          req.templateVars = _.assign(req.templateVars, newTemplateVars);
          if (response.headers['set-cookie']) {
            res.setHeader('set-cookie', response.headers['set-cookie']);
          }
          setAdditionalHeaders();
          passThroughHeaders(response.headers);
          /* server timing: main page */
          if(utils.isDebugEnabled(req)) {
            utils.appendServerTimings(res, 'page', utils.getServerTimingName('page', response), response.realTiming);
            res.debugInfo = utils.delimitContent('', response, transformedOptions, logEventsPage, 'page');
          }

          if ('cx-layout' in response.headers) {
            layoutUrl = Core.render(response.headers['cx-layout'], req.templateVars);
            req.templateVars.layout = layoutUrl;
            res.parse(response.content, function (err, fragmentIndex, content) {
              // extract slots from original html
              extractSlots(content, function (err, slots) {
                req.templateVars.slots =  slots;
  
                var layoutConfig = utils.getBackendConfig(config, layoutUrl);
                var cacheKey = layoutConfig && layoutConfig.cacheKey ?
                  Core.render(layoutConfig.cacheKey, req.templateVars) :
                  'layout:'+ layoutUrl;
  
                var cacheTTL = layoutConfig && layoutConfig.cacheTTL ?
                  layoutConfig.cacheTTL :
                  60000 * 5; // 5 mins
  
                var layoutOptions = {
                  url: layoutUrl,
                  cacheKey: cacheKey,
                  cacheTTL: cacheTTL,
                  statsdKey: 'layout',
                  statsdTags: ['application:' + utils.getServiceNameFromUrl(layoutUrl)],
                  headers: {
                    'user-agent': transformedOptions.headers['user-agent'],
                    'x-device': transformedOptions.headers['x-device'],
                    'x-site-country': transformedOptions.headers['x-site-country'],
                    'x-site-language': transformedOptions.headers['x-site-language'],
                    cookie: transformedOptions.headers.cookie
                  },
                  explicitNoCache: utils.isNoCacheEnabled(req)
                };
                var logEventsLayout = utils.isDebugEnabled(req) && utils.attachEventLogger(layoutOptions);
                // get the layout
                reliableGet.get(layoutOptions, handleErrorDecorator(function (err, response) {
                  /* server timing: layout */
                  if(utils.isDebugEnabled(req)) {
                    utils.appendServerTimings(res, 'layout', utils.getServerTimingName('layout', response), response.realTiming);
                    res.debugInfo += utils.delimitContent('', response, layoutOptions, logEventsLayout, 'layout');
                  }
                  res.parseAndResponse(response.content, response.statusCode);
                }));
              });
            });
          } else {
            res.parseAndResponse(response.content, response.statusCode);
          }
        }));
      });

    });

  }
}
