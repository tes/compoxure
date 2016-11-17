var fs = require('fs');
var path = require('path');
var parxer = require('parxer').parxer;
var parxerPlugins = require('parxer/Plugins');
var _ = require('lodash');
var utils = require('../utils');
var htmlEntities = new (require('html-entities').AllHtmlEntities)();

var errorTemplate = _.template('<div style="color: red; font-weight: bold; font-family: monospace;">Error: <%= err %></div>');
var debugScriptTag = _.template('<script type="cx-debug-<%- type %>" data-cx-<%- type %>-id="<%- id %>"><%= data && JSON.stringify(data) %></script>');
var debugScript = '<script>' + fs.readFileSync(path.join(__dirname, '../debug-script.js'), 'utf8') + '</script>';

function getCxAttr(node, name, defaultAttr) {
  var value = node.attribs[name] || node.attribs['data-' + name];

  if (value) {
    return htmlEntities.decode(value);
  }

  return defaultAttr === undefined ? false : defaultAttr;
}

function getNoCacheAttr(fragment) {
  /* jslint evil: true */
  var explicitNoCacheAttr = getCxAttr(fragment, 'cx-no-cache');
  return explicitNoCacheAttr ? eval(explicitNoCacheAttr) : false;
}

function delimitContent(response, options) {
  var id = _.uniqueId();
  var openTag = debugScriptTag({ data: { options: options, status: response.statusCode, timing: response.timing }, id: id, type: 'open' });
  var closeTag = debugScriptTag({ data: null, id: id, type: 'close' });
  return openTag + response.content + closeTag;
}

function getMiddleware(config, reliableGet, eventHandler, optionsTransformer) {
  function getCdnHost() {
    if (config.cdn.host) {
      return config.cdn.host;
    }
  }

  function getCdnUrl() {
    if (config.cdn.url) {
      return config.cdn.url;
    }
  }

  return function parserMiddleware(req, res, cb) {
    var templateVars = req.templateVars;
    var fragmentTimings = [];

    function getContent(fragment, next) {
      if (!(config.content && config.content.server)) {
        return next(null);
      }

      var tag = getCxAttr(fragment, 'cx-content');
      var url = config.content.server + '/' + tag;
      var cacheKeyAttr = getCxAttr(fragment, 'cx-cache-key');

      var opts = {
        url: url,
        timeout: config.content.timeout || 5000,
        cacheKey: cacheKeyAttr || utils.urlToCacheKey(url),
        cacheTTL: utils.timeToMillis(getCxAttr(fragment, 'cx-cache-ttl', '1m'))
      };

      reliableGet.get(opts, function (err, response) {
        if (err) {
          return next(errorTemplate({ err: err.message }));
        }

        var contentVars = {};
        try {
          contentVars = JSON.parse(response.content);
        } catch (e) {
          // Ignore parse error
        }

        _.each(contentVars, function (value, key) {
          templateVars['content:' + tag + ':' + key] = value;
          templateVars['content:' + tag + ':' + key + ':encoded'] = encodeURI(value);
        });

        next(null, '<!-- content ' + tag + ' loaded -->');
      });
    }

    function getSlot(fragment, next) {
      var slotName = getCxAttr(fragment, 'cx-define-slot');
      var content = templateVars.slots[slotName];
      parxer(getParxerOpts(0), content, function (parxerErr, fragmentCount, newContent) {
        if (parxerErr && parxerErr.content) {
          return next(parxerErr, content);
        }

        return next(null, newContent);
      });
    }

    function getCookie() {
      if (req.cookies && req.headers.cookie) {
        var whitelist = config.cookies && config.cookies.whitelist;
        return whitelist ? utils.filterCookies(whitelist, req.cookies) : req.headers.cookie;
      }
    }

    function setResponseHeaders(headers) {
      if (res.headersSent) {
        return; // ignore late joiners
      }

      // A fragment is telling us to not cache it. We force the entire backend/composed page to not be cached.
      var cacheControlHeader = headers['cache-control'];
      if (cacheControlHeader && (cacheControlHeader.indexOf('no-cache') !== -1 || cacheControlHeader.indexOf('no-store') !== -1)) {
        // Use the fragment's cache-control header only if we don't already have one from the backend, or
        // it does not have no-cache or no-store.
        var backendCacheControl = res.getHeader('cache-control');
        if (!backendCacheControl || (backendCacheControl.indexOf('no-cache') === -1 && backendCacheControl.indexOf('no-store') === -1)) {
          res.setHeader('cache-control', 'no-cache, no-store, must-revalidate');
        }
      }

      if (headers['set-cookie']) {
        var existingResponseCookies = res.getHeader('set-cookie') || [];
        res.setHeader('set-cookie', _.union(existingResponseCookies, headers['set-cookie']));
      }
    }

    function logError(err, message, ignoreError) {
      var logLevel = (err.statusCode === 404 || ignoreError) ? 'warn' : 'error';

      if (typeof eventHandler.logger === 'function') {
        eventHandler.logger(logLevel, message, { tracer: req.tracer });
      }
    }

    function isDebugEnabled() {
      return req.query && req.query['cx-debug'];
    }

    function getParxerOpts(depth) {
      function getCx(fragment, next) {
        var start = Date.now();
        var url = getCxAttr(fragment, 'cx-url');
        var cacheKeyAttr = getCxAttr(fragment, 'cx-cache-key');
        var ignoreError = getCxAttr(fragment, 'cx-ignore-error');

        function responseCallback(err, content, headers) {
          if (headers) {
            var newTemplateVars = utils.formatTemplateVariables(headers);
            _.assign(templateVars, newTemplateVars);
            setResponseHeaders(headers);
          }

          if (err || !content) {
            return next(err, content, headers);
          }

          if (depth > (config.fragmentDepth || 5)) {
            return next(err, content, headers);
          }

          if (!headers || !headers['cx-parse-me']) {
            return next(err, content, headers);
          }

          parxer(getParxerOpts(depth + 1), content, function (parxerErr, fragmentCount, newContent) {
            if (parxerErr && parxerErr.content) {
              return next(parxerErr, content, headers);
            }

            return next(null, newContent, headers);
          });
        }

        function onErrorHandler(err, oldCacheData, transformedOptions) {
          var errorMsg;
          var elapsed = Date.now() - req.timerStart;
          var timing = Date.now() - start;

          // Check to see if we are just ignoring errors completely for this fragment
          if (ignoreError && (ignoreError === 'true' || _.includes(ignoreError.split(','), String(err.statusCode)))) {
            errorMsg = _.template('IGNORE <%= statusCode %> for Service <%= url %> cache <%= cacheKey %>.');
            logError(err, errorMsg({ url: transformedOptions.url, cacheKey: transformedOptions.cacheKey, statusCode: err.statusCode }), true);
            return responseCallback(errorTemplate({ err: err.message }));
          }

          // Check to see if we have any statusCode handlers defined
          if (err.statusCode && config.statusCodeHandlers && config.statusCodeHandlers[err.statusCode]) {
            var handlerDefn = config.statusCodeHandlers[err.statusCode];
            var handlerFn = config.functions && config.functions[handlerDefn.fn];

            if (handlerFn) {
              return handlerFn(req, res, req.templateVars, handlerDefn.data, transformedOptions, err, responseCallback);
            }
          }

          if (err.statusCode === 404 && !transformedOptions.ignore404) {
            errorMsg = _.template('404 Service <%= url %> cache <%= cacheKey %> returned 404.');
            logError(err, errorMsg({ url: transformedOptions.url, cacheKey: transformedOptions.cacheKey }));

            if (res.headersSent) {
              return;
            }

            res.writeHead(404, { 'Content-Type': 'text/html' });
            return res.end(errorMsg(transformedOptions));
          }

          if (oldCacheData && oldCacheData.content) {
            responseCallback(errorTemplate({ err: err.message }), oldCacheData.content, oldCacheData.headers);
            errorMsg = _.template('STALE <%= url %> cache <%= cacheKey %> failed but serving stale content.');
            logError(err, errorMsg(transformedOptions));
          } else {
            responseCallback(errorTemplate({ err: err.message }));
          }

          if (typeof eventHandler.stats === 'function') {
            eventHandler.stats('increment', transformedOptions.statsdKey + '.error');
          }

          errorMsg = _.template('FAIL <%= url %> did not respond in <%= timing%>, elapsed <%= elapsed %>. Reason: ' + err.message);
          logError(err, errorMsg({ url: transformedOptions.url, timing: timing, elapsed: elapsed }));
        }

        var options = {
          url: url,
          timeout: utils.timeToMillis(getCxAttr(fragment, 'cx-timeout', '5s')),
          cacheKey: cacheKeyAttr || utils.urlToCacheKey(url),
          cacheTTL: utils.timeToMillis(getCxAttr(fragment, 'cx-cache-ttl', '1m')),
          explicitNoCache: req.explicitNoCache || getNoCacheAttr(fragment),
          ignore404: getCxAttr(fragment, 'cx-ignore-404', 'true') === 'true',
          type: 'fragment',
          tracer: req.tracer,
          statsdKey: 'fragment_' + getCxAttr(fragment, 'cx-statsd-key', 'unknown'),
          headers: {
            accept: getCxAttr(fragment, 'cx-accept', 'text/html'),
            cookie: getCookie(),
            'cx-page-url': templateVars['url:href'],
            'x-tracer': req.tracer,
            'x-cdn-host': getCdnHost(),
            'x-cdn-url': getCdnUrl()
          }
        };

        function transformerCallback(err, transformedOptions) {
          if (err) {
            return onErrorHandler(err, {}, transformedOptions);
          }

          reliableGet.get(transformedOptions, function getCallback(getErr, response) {
            if (getErr) {
              return onErrorHandler(getErr, response, transformedOptions);
            }

            fragmentTimings.push({ url: url, status: response.statusCode, timing: response.timing });

            var content = isDebugEnabled() ? delimitContent(response, options) : response.content;
            responseCallback(null, content, response.headers);
          });
        }

        optionsTransformer(req, options, transformerCallback);
      }

      return {
        environment: config.environment,
        cdn: config.cdn,
        minified: config.minified,
        showErrors: !req.backend.quietFailure,
        timeout: utils.timeToMillis(req.backend.timeout || '5000'),
        parserTimeout: utils.timeToMillis(req.backend.parserTimeout || '5000'),
        plugins: [
          parxerPlugins.Test,
          parxerPlugins.If,
          parxerPlugins.Url(getCx),
          parxerPlugins.Image(),
          parxerPlugins.Bundle(getCx),
          parxerPlugins.Content(getContent),
          parxerPlugins.ContentItem,
          parxerPlugins.DefineSlot(getSlot),
          parxerPlugins.Library(getCx)
        ],
        variables: templateVars
      };
    }

    function parseCallback(err, fragmentIndex, content, additionalHeaders) {
      if (err) {
        // Overall errors
        if (!res.headersSent && err.content) {
          res.writeHead(err.statusCode || 500, { 'Content-Type': 'text/html' });
          return res.end(err.content);
        }

        if (err.fragmentErrors) {
          // TODO: Notify fragment errors to debugger in future
        }

        if (err.statistics && config.functions && config.functions.statisticsHandler) {
          // Send stats to the stats handler if it is defined
          config.functions.statisticsHandler(req.backend, err.statistics);
        }
      }

      if (!res.headersSent) {
        res.writeHead(200, _.assign({ 'Content-Type': 'text/html' }, additionalHeaders || {}));

        if (req.query && req.query['cx-debug']) {
          return res.end(content.replace('</body>', debugScript + '</body>'));
        }

        return res.end(content);
      }
    }

    res.parse = function parse(data) {
      parxer(getParxerOpts(1), data, parseCallback);
    };

    cb();
  };
}


module.exports = {
  getMiddleware: getMiddleware
};
