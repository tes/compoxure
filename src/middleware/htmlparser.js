var fs = require('fs');
var path = require('path');
var parxer = require('parxer').parxer;
var parxerPlugins = require('parxer/Plugins');
var _ = require('lodash');
var async = require('async');
var utils = require('../utils');
var errorTemplate = '<div style="color: red; font-weight: bold; font-family: monospace;">Error: <%= err %></div>';
var debugScriptTag = _.template('<script type="cx-debug-<%- type %>" data-cx-<%- type %>-id="<%- id %>"><%= data && JSON.stringify(data) %></script>');
var debugScript = '<script>' + fs.readFileSync(path.join(__dirname, '../debug-script.js'), 'utf8') + '</script>';
var htmlEntities = new (require('html-entities').AllHtmlEntities)();

function getCxAttr(node, name) {
  var value = node.attribs[name] || node.attribs['data-' + name];
  return value && htmlEntities.decode(value);
}

function getMiddleware(config, reliableGet, eventHandler, optionsTransformer) {

  return function (req, res, next) {

    var templateVars = req.templateVars;
    var fragmentTimings = [];

    function getCx(fragment, next) {

      /*jslint evil: true */
      var options,
        start = Date.now(),
        url = getCxAttr(fragment, 'cx-url'),
        timeout = utils.timeToMillis(getCxAttr(fragment, 'cx-timeout') || '5s'),
        cacheKeyAttr = getCxAttr(fragment, 'cx-cache-key'),
        cacheKey = cacheKeyAttr ? cacheKeyAttr : utils.urlToCacheKey(url),
        cacheTTL = utils.timeToMillis(getCxAttr(fragment, 'cx-cache-ttl') || '1m'),
        explicitNoCacheAttr = getCxAttr(fragment, 'cx-no-cache'),
        explicitNoCache = req.explicitNoCache || (explicitNoCacheAttr ? eval(explicitNoCacheAttr) : false),
        ignore404 = (getCxAttr(fragment, 'cx-ignore-404') || 'true') === 'true',
        ignoreError = getCxAttr(fragment, 'cx-ignore-error'),
        statsdKey = 'fragment_' + (getCxAttr(fragment, 'cx-statsd-key') || 'unknown'),
        accept = getCxAttr(fragment, 'cx-accept') || 'text/html',
        optionsHeaders = {
          'accept': accept,
          'cx-page-url': templateVars['url:href'],
          'x-tracer': req.tracer
        };

      if (req.cookies && req.headers.cookie) {
        var whitelist = config.cookies && config.cookies.whitelist;
        optionsHeaders.cookie = whitelist ? utils.filterCookies(whitelist, req.cookies) : req.headers.cookie;
      }
      if (config.cdn) {
        if (config.cdn.host) { optionsHeaders['x-cdn-host'] = config.cdn.host; }
        if (config.cdn.url) { optionsHeaders['x-cdn-url'] = config.cdn.url; }
      }

      options = {
        url: url,
        timeout: timeout,
        cacheKey: cacheKey,
        cacheTTL: cacheTTL,
        explicitNoCache: explicitNoCache,
        ignore404: ignore404,
        type: 'fragment',
        headers: optionsHeaders,
        tracer: req.tracer,
        statsdKey: statsdKey
      }

      var setResponseHeaders = function (headers) {
        if (res.headersSent) { return; } // ignore late joiners
        var hasCacheControl = function (headers, value) {
          if (typeof value === 'undefined') { return headers['cache-control']; }
          return (headers['cache-control'] || '').indexOf(value) !== -1;
        }
        // A fragment is telling us to not cache it. We force the entire backend/composed page to not be cached.
        if (hasCacheControl(headers, 'no-cache') || hasCacheControl(headers, 'no-store')) {
          // Use the fragment's cache-control header only if we don't already have one from the backend, or
          // it does not have no-cache or no-store.
          var backendCacheControl = res.getHeader('cache-control');
          if (!backendCacheControl || !(hasCacheControl({ 'cache-control': backendCacheControl }, 'no-cache') ||
            hasCacheControl({ 'cache-control': backendCacheControl }, 'no-store'))) {
            res.setHeader('cache-control', 'no-cache, no-store, must-revalidate');
          }
        }
        if (headers['set-cookie']) {
          var existingResponseCookies = res.getHeader('set-cookie') || [];
          res.setHeader('set-cookie', _.union(existingResponseCookies, headers['set-cookie']));
        }
      }

      var responseCallback = function (err, content, headers) {
        if (headers) {
          utils.updateTemplateVariables(templateVars, headers);
          setResponseHeaders(headers);
        }
        next(err, content ? content : null, headers);
      };

      var logError = function (err, message, ignoreError) {
        var logLevel = err.statusCode === 404 || ignoreError ? 'warn' : 'error';
        eventHandler.logger(logLevel, message, {
          tracer: req.tracer
        });
      }

      var onErrorHandler = function (err, oldCacheData, transformedOptions) {

        var errorMsg, elapsed = Date.now() - req.timerStart, timing = Date.now() - start, msg = _.template(errorTemplate);

        // Check to see if we are just ignoring errors completely for this fragment - takes priority
        if (ignoreError && (ignoreError === 'true' || _.contains(ignoreError.split(','), '' + err.statusCode))) {
          errorMsg = _.template('IGNORE <%= statusCode %> for Service <%= url %> cache <%= cacheKey %>.');
          logError(err, errorMsg({
            url: transformedOptions.url,
            cacheKey: transformedOptions.cacheKey,
            statusCode: err.statusCode
          }), true);
          return responseCallback(msg({ 'err': err.message }));
        }

        // Check to see if we have any statusCode handlers defined, they come next
        if (err.statusCode && config.statusCodeHandlers && config.statusCodeHandlers[err.statusCode]) {
          var handlerDefn = config.statusCodeHandlers[err.statusCode];
          var handlerFn = config.functions && config.functions[handlerDefn.fn];
          if (handlerFn) {
            return handlerFn(req, res, req.templateVars, handlerDefn.data, transformedOptions, err);
          }
        }

        if (err.statusCode === 404 && !transformedOptions.ignore404) {

          errorMsg = _.template('404 Service <%= url %> cache <%= cacheKey %> returned 404.');

          logError(err, errorMsg({ url: transformedOptions.url, cacheKey: transformedOptions.cacheKey }));

          if (!res.headersSent) {
            res.writeHead(404, { 'Content-Type': 'text/html' });
            return res.end(errorMsg(transformedOptions));
          }

        } else {

          if (oldCacheData && oldCacheData.content) {
            responseCallback(msg({ 'err': err.message }), oldCacheData.content, oldCacheData.headers);
            //debugMode.add(transformedOptions.unparsedUrl, {status: 'ERROR', httpStatus: err.statusCode, staleContent: true, timing: timing });
            errorMsg = _.template('STALE <%= url %> cache <%= cacheKey %> failed but serving stale content.');
            logError(err, errorMsg(transformedOptions));
          } else {
            //debugMode.add(transformedOptions.unparsedUrl, {status: 'ERROR', httpStatus: err.statusCode, defaultContent: true, timing: timing });
            responseCallback(msg({ 'err': err.message }));
          }

          eventHandler.stats('increment', transformedOptions.statsdKey + '.error');
          errorMsg = _.template('FAIL <%= url %> did not respond in <%= timing%>, elapsed <%= elapsed %>. Reason: ' + err.message);
          logError(err, errorMsg({ url: transformedOptions.url, timing: timing, elapsed: elapsed }));

        }

      };

      var isDebugEnabled = function () {
        return req.query && req.query['cx-debug'];
      };

      var delimitContent = function (response, options) {
        var id = _.uniqueId();
        var data = {
          options: options,
          status: response.statusCode,
          timing: response.timing,
        };
        var open_tag = debugScriptTag({ data: data, id: id, type: 'open' });
        var close_tag = debugScriptTag({ data: null, id: id, type: 'close' });
        return open_tag + response.content + close_tag;
      };

      optionsTransformer(req, options, function (err, transformedOptions) {
        if (err) { return onErrorHandler(err, {}, transformedOptions); }
        reliableGet.get(transformedOptions, function (err, response) {
          var content;
          if (err) {
            return onErrorHandler(err, response, transformedOptions);
          }
          fragmentTimings.push({ url: options.url, status: response.statusCode, timing: response.timing });
          content = isDebugEnabled() ? delimitContent(response, options) : response.content;
          responseCallback(null, content, response.headers);
        });
      });

    }

    function getContent(fragment, next) {
      var tag = getCxAttr(fragment, 'cx-content');
      var url = config.content.server + '/' + tag;
      var cacheKeyAttr = getCxAttr(fragment, 'cx-cache-key');
      var cacheKey = cacheKeyAttr ? cacheKeyAttr : utils.urlToCacheKey(url);
      var cacheTTL = utils.timeToMillis(getCxAttr(fragment, 'cx-cache-ttl') || '1m');

      var opts = {
        url: url,
        timeout: config.content.timeout || 5000,
        cacheKey: cacheKey,
        cacheTTL: cacheTTL
      };

      reliableGet.get(opts, function (err, response) {
        if (err) { return next(err); }
        var contentVars;
        try {
          contentVars = JSON.parse(response.content)
        } catch (e) {
          contentVars = {};
        }
        _.each(contentVars, function (value, key) {
          templateVars['content:' + key] = value;
          templateVars['content:' + key + ':encoded'] = encodeURI(value);
        });
        next(null);
      });
    }

    var parse = function (data, callback) {
      parxer({
        environment: config.environment,
        cdn: config.cdn,
        minified: config.minified,
        showErrors: !req.backend.quietFailure,
        timeout: utils.timeToMillis(req.backend.timeout || '5000'),
        plugins: [
          parxerPlugins.Test,
          parxerPlugins.If,
          parxerPlugins.Url(getCx),
          parxerPlugins.Image(),
          parxerPlugins.Bundle(getCx),
          parxerPlugins.Content(getContent),
          parxerPlugins.ContentItem
        ],
        variables: templateVars
      }, data, callback);
    };

    var dealWithStats = function (err) {
      if (err && err.statistics && config.functions && config.functions.statisticsHandler) {
        // Send stats to the stats handler if it is defined
        config.functions.statisticsHandler(req.backend, err.statistics);
      }
    }

    res.parse = function (data) {
      parse(data, function (err, fragmentIndex, content) {
        var lastPassFragmentIndex = fragmentIndex;
        var lastPassContent = content;
        var rePassCount = 0;

        // Overall errors
        if (err && err.content && !res.headersSent) {
          res.writeHead(err.statusCode || 500, { 'Content-Type': 'text/html' });
          return res.end(err.content);
        }

        if (err.fragmentErrors) {
          // TODO: Notify fragment errors to debugger in future
        }

        dealWithStats(err);

        if (!res.headersSent) {
          if (req.query && req.query['cx-debug']) {
            content = content.replace('</body>', debugScript + '</body>');
          }

          async.whilst( // Look for nested fragments
            function () {
              return lastPassFragmentIndex > 0 && rePassCount < (config.fragmentPasses || 5);
            },
            function (next) {
              ++rePassCount;
              parse(lastPassContent, function (err, newPassFragmentIndex, newPassContent) {
                if (err && err.content) {
                  return next(err);
                }

                lastPassFragmentIndex = newPassFragmentIndex;
                lastPassContent = newPassContent;

                dealWithStats(err);

                return next();
              });
            },
            function (err) {
              if (err && err.content && !res.headersSent) {
                res.writeHead(err.statusCode || 500, { 'Content-Type': 'text/html' });
                return res.end(err.content);
              }

              if (!res.headersSent) {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(lastPassContent);
              }
            }
          );
        }
      });
    };

    next();

  }

}


module.exports = {
  getMiddleware: getMiddleware
};
