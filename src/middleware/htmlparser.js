var fs = require('fs');
var path = require('path');
var url = require('url');
var parxer = require('parxer').parxer;
var debug = require('debug')('compoxure');
var parxerPlugins = require('parxer/Plugins');
var _ = require('lodash');
var utils = require('../utils');
var htmlEntities = new (require('html-entities').AllHtmlEntities)();

var errorTemplate = _.template('<div style="color: red; font-weight: bold; font-family: monospace;">Error: <%= err %></div>');
var debugScript = '<script>' + fs.readFileSync(path.join(__dirname, '../debug-script.js'), 'utf8') + '</script>';

function hasCxAttr(node, name) {
  return name in node.attribs || ('data-' + name in node.attribs);
}

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

function getMiddleware(config, reliableGet, eventHandler, optionsTransformer) {
  function getCdnHost() {
    if (config.cdn && config.cdn.host) {
      return config.cdn.host;
    }
  }

  function getCdnUrl() {
    if (config.cdn && config.cdn.url) {
      return config.cdn.url;
    }
  }

  return function parserMiddleware(req, res, cb) {
    var fragmentId = 0;
    var contentId = 0;
    var templateVars = req.templateVars;
    var commonState = {}; // common between all parser
    var fragmentTimings = [];
    var defaultedToNoCache = false;
    var noCacheFragments = [];
    var responseStatusCode = 200;

    function logError(err, message, ignoreError) {
      var logLevel = (err.statusCode === 404 || ignoreError) ? 'warn' : 'error';

      if (typeof eventHandler.logger === 'function') {
        eventHandler.logger(logLevel, message, { tracer: req.tracer });
      }
    }

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
        cacheKey: cacheKeyAttr,
        statsdKey: 'content',
        statsdTags: ['application:drupal'],
        cacheTTL: utils.timeToMillis(getCxAttr(fragment, 'cx-cache-ttl', '1m')),
        explicitNoCache: utils.isNoCacheEnabled(req)
      };

      var logEvents = utils.isDebugEnabled(req) && utils.attachEventLogger(opts);
      reliableGet.get(opts, function (err, response) {
        if (err) {
          logError(err, 'Error retrieving content for tag "' + tag + '", message:' + err.message);
          return next(null, '<!-- content ' + tag + ' failed due to "' + err.message + '"" -->');
        }

        var contentVars = {};
        try {
          contentVars = JSON.parse(response.content);
        } catch (e) {
          debug('Invalid json parsed from content', e);
        }
        var debugTag = utils.isDebugEnabled(req) ? utils.delimitContent('', response, opts, logEvents, 'content', contentId) : '';

        contentId++;
        /* server timing: content from drupal */
        if(utils.isDebugEnabled(req)) {
          utils.appendServerTimings(res, 'content', utils.getServerTimingName('content:' + contentId, response), response.realTiming);
        }
        _.forEach(contentVars, function (value, key) {
          templateVars['content:' + tag + ':' + key] = value;
          templateVars['content:' + tag + ':' + key + ':encoded'] = encodeURI(value);
        });

        next(null, '<!-- content ' + tag + ' loaded -->' + debugTag);
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

    function setResponseHeaders(headers, fragment) {
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
          var defaultCacheControl = config.cache.defaultNoCacheHeaders && config.cache.defaultNoCacheHeaders['cache-control'];
          res.setHeader('cache-control', defaultCacheControl || 'private, no-cache, max-age=0, must-revalidate, no-store');
          utils.addClientDebugLogEntry(req, 'Forcing no-cache because a fragment is telling us not to cache');
          defaultedToNoCache = true;
        }
        if (defaultedToNoCache) {
          // Push into list so we can add a debug header later
          noCacheFragments.push(getCxAttr(fragment, 'cx-url-raw'));
        }
      }

      if (headers['set-cookie']) {
        var existingResponseCookies = res.getHeader('set-cookie') || [];
        res.setHeader('set-cookie', _.union(existingResponseCookies, headers['set-cookie']));
      }
    }

    function getParxerOpts(depth) {
      function getCx(fragment, next) {
        var start = Date.now();
        var parseMeTag = hasCxAttr(fragment, 'cx-parse-me');
        var cxUrl = getCxAttr(fragment, 'cx-url');
        var cacheKeyAttr = getCxAttr(fragment, 'cx-cache-key');
        var ignoreError = getCxAttr(fragment, 'cx-ignore-error');

        function responseCallback(err, content, headers) {
          if (headers) {
            var newTemplateVars = utils.formatTemplateVariables(headers);
            _.assign(templateVars, newTemplateVars);
            setResponseHeaders(headers, fragment);
          }

          if (err || !content) {
            return next(err, content, headers);
          }

          if (depth > (config.fragmentDepth || 5)) {
            return next(err, content, headers);
          }

          if (!parseMeTag && (!headers || !headers['cx-parse-me'])) {
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
            eventHandler.stats('increment', transformedOptions.statsdKey + '.errors', transformedOptions.statsdTags);
          }

          errorMsg = _.template('FAIL <%= url %> (<%= cxUrl %>) did not respond in <%= timing%>, elapsed <%= elapsed %>. Reason: ' + err.message);
          logError(err, errorMsg({ url: transformedOptions.url, timing: timing, elapsed: elapsed, cxUrl: cxUrl }));
        }

        var options = {
          url: cxUrl,
          timeout: utils.timeToMillis(getCxAttr(fragment, 'cx-timeout', '5s')),
          cacheKey: cacheKeyAttr,
          cacheTTL: utils.timeToMillis(getCxAttr(fragment, 'cx-cache-ttl', '1m')),
          explicitNoCache: req.explicitNoCache || getNoCacheAttr(fragment),
          ignore404: getCxAttr(fragment, 'cx-ignore-404', 'true') === 'true',
          type: 'fragment',
          tracer: req.tracer,
          statsdKey: 'fragment',
          statsdTags: ['application:' + utils.getServiceNameFromUrl(cxUrl)],
          headers: {
            accept: getCxAttr(fragment, 'cx-accept', 'text/html'),
            cookie: getCookie(),
            'cx-page-url': templateVars['url:href'],
            'x-tracer': req.tracer,
            'x-cdn-host': getCdnHost(),
            'x-cdn-url': getCdnUrl(),
            'x-site-country': req.headers['x-site-country'],
            'x-site-language': req.headers['x-site-language']
          }
        };

        function transformerCallback(err, transformedOptions) {
          if (err) {
            return onErrorHandler(err, {}, transformedOptions);
          }
          var logEvents = utils.isDebugEnabled(req) && utils.attachEventLogger(transformedOptions);
          transformedOptions.explicitNoCache = utils.isNoCacheEnabled(req);

          reliableGet.get(transformedOptions, function getCallback(getErr, response) {
            if (getErr) {
              return onErrorHandler(getErr, response, transformedOptions);
            }
            fragmentId++;

            fragmentTimings.push({ url: cxUrl, status: response.statusCode, timing: response.timing });

            var content = utils.isDebugEnabled(req) ? utils.delimitContent(response.content, response, options, logEvents, 'fragment', fragmentId) : response.content;
            /* server timing: fragment */
            if(utils.isDebugEnabled(req)) {
              utils.appendServerTimings(res, 'fragment', utils.getServerTimingName('fragment:' + fragmentId, response), response.realTiming);
            }
            responseCallback(null, content, response.headers);
          });
        }

        optionsTransformer(req, options, transformerCallback);
      }

      var baseURL = config.getBaseURL ? config.getBaseURL(req) : url.format({ protocol: req.protocol, host: req.get('host') });

      return {
        environment: config.environment,
        baseURL: config.useRelativeURL ? baseURL : undefined,
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
        variables: templateVars,
        commonState: commonState
      };
    }

    function parseCallback(err, fragmentIndex, content) {
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

      var contentWithDebugging = content;
      if (utils.isDebugEnabled(req)) {
        contentWithDebugging = content.replace('</body>', res.debugInfo + debugScript + utils.renderScriptClientDebugLogEntry(req) + '</body>');
      }

      if (!res.headersSent) {
        try {
          if (noCacheFragments.length) {
            commonState.additionalHeaders['cx-notice'] = 'cache-control defaulted due to fragment nocache: ' + noCacheFragments.join(', ');
            res.writeHead(responseStatusCode, _.assign({ 'Content-Type': 'text/html' }, commonState.additionalHeaders || {}));
          } else {
            var etag = utils.calculateEtag(contentWithDebugging);
            var etagFromReq = req.headers['if-none-match'];
            if (etag === etagFromReq) {
              res.status(304).send();
              return;
            }
            res.writeHead(responseStatusCode, _.assign({ 'Content-Type': 'text/html' }, { ETag: etag }, commonState.additionalHeaders || {}));
          }

        } catch(ex) {
          eventHandler.logger('error', 'TypeError, unable to set response headers due to invalid character: ' + JSON.stringify(commonState.additionalHeaders));
        }

        return res.end(contentWithDebugging);
      }
    }

    res.parse = function parse(data, statusCode) {
      responseStatusCode = statusCode || responseStatusCode;
      parxer(getParxerOpts(1), data, parseCallback);
    };

    // used to parse the content without returning it on the request
    res.parseOnly = function parseOnly(data, pocb) {
      parxer(getParxerOpts(1), data, function(err, fragmentIndex, content) {
        // Overall errors
        if (!res.headersSent && err.content) {
          res.writeHead(err.statusCode || 500, { 'Content-Type': 'text/html' });
          return res.end(err.content);
        }

        pocb(null, content);
      });
    }
    cb();
  };
}


module.exports = {
  getMiddleware: getMiddleware
};
