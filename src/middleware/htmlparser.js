var parxer = require('parxer').parxer;
var parxerPlugins = require('parxer/Plugins');
var _ = require('lodash');
var utils = require('../utils');
var errorTemplate = '<div style="color: red; font-weight: bold; font-family: monospace;">Error: <%= err %></div>';
var htmlEntities = new (require('html-entities').AllHtmlEntities)();

function getCxAttr(node, name) {
  var value = node.attribs[name] || node.attribs['data-' + name];
  return value && htmlEntities.decode(value);
}

function getMiddleware(config, reliableGet, eventHandler) {

    return function(req, res, next) {

        var templateVars = _.clone(req.templateVars);

        function getCx(fragment, next) {

            var options = {},
                start = Date.now();

            options.url = getCxAttr(fragment, 'cx-url');
            options.timeout = utils.timeToMillis(getCxAttr(fragment, 'cx-timeout') || '1s');
            if(getCxAttr(fragment, 'cx-cache-key')) {
                options.cacheKey = getCxAttr(fragment, 'cx-cache-key');
            } else {
                options.cacheKey = utils.urlToCacheKey(getCxAttr(fragment, 'cx-url'));
            }
            options.cacheTTL = utils.timeToMillis(getCxAttr(fragment, 'cx-cache-ttl') || '1m');
            options.explicitNoCache = getCxAttr(fragment, 'cx-no-cache') ? getCxAttr(fragment, 'cx-no-cache') === 'true' : false;
            options.ignore404 = getCxAttr(fragment, 'cx-ignore-404') === 'true';
            options.type = 'fragment';
            options.cache = (options.cacheTTL > 0);
            options.headers = {
                'cx-page-url': templateVars['url:href'],
                'x-tracer': req.tracer
            };
            if (req.headers.cookie) { options.headers.cookie = req.headers.cookie; }
            options.tracer = req.tracer;
            options.statsdKey = 'fragment_' + (getCxAttr(fragment, 'cx-statsd-key') || 'unknown');

            if (config.cdn) {
                if(config.cdn.host) { options.headers['x-cdn-host'] = config.cdn.host; }
                if(config.cdn.url) { options.headers['x-cdn-url'] = config.cdn.url; }
            }

           // For each header prefixed with cx-variable, add to templateVars
           var addToTemplateVars = function(variables) {
             _.each(_.filter(_.keys(variables), function(key) {
                if(key.indexOf('cx-') >= 0) { return true; }
             }), function(cxKey) {
                var variable = variables[cxKey],
                    strippedKey = cxKey.replace('cx-',''),
                    variableKey = strippedKey.split('|')[0],
                    variableName = strippedKey.split('|')[1];

                if(templateVars[variableKey + ':' + variableName]) {
                    eventHandler.logger('error', 'Setting ' + variableKey + ' variable a second time - may indicate a duplicate property: ' + variableName + ' for url ' + options.url);
                }
                templateVars[variableKey + ':' + variableName] = variable;
                templateVars[variableKey + ':' + variableName + ':encoded'] = encodeURI(variable);
             });
           }

            var hasCacheControl = function(headers, value) {
                if (typeof value === 'undefined') { return headers['cache-control']; }
                return (headers['cache-control'] || '').indexOf(value) !== -1;
            }

            var setResponseHeaders = function(headers) {
                if (res.headersSent) { return; } // ignore late joiners
                if (hasCacheControl(headers, 'no-cache') || hasCacheControl(headers, 'no-store')) {
                    res.setHeader('cache-control', 'no-store');
                }
            }

            var responseCallback = function(err, content, headers) {
                if(headers) {
                    addToTemplateVars(headers);
                    setResponseHeaders(headers);
                }
                next(err, content ? content : null);
            };

            var onErrorHandler = function(err, oldCacheData) {

                var errorMsg, elapsed = Date.now() - req.timerStart, timing = Date.now() - start;

                // Check to see if we have any statusCode handlers defined
                if(err.statusCode && config.statusCodeHandlers && config.statusCodeHandlers[err.statusCode]) {

                    var handlerDefn = config.statusCodeHandlers[err.statusCode];
                    var handlerFn = config.functions && config.functions[handlerDefn.fn];
                    if(handlerFn) {
                        return handlerFn(req, res, req.templateVars, handlerDefn.data, options, err);
                    }

                }

                if (err.statusCode === 404 && !options.ignore404) {

                    errorMsg = _.template('404 Service <%= url %> cache <%= cacheKey %> returned 404.');
                    //debugMode.add(options.unparsedUrl, {status: 'ERROR', httpStatus: 404, timing: timing});
                    eventHandler.logger('error', errorMsg({url: options.url, cacheKey: options.cacheKey}), {tracer:req.tracer});
                    if (!res.headersSent) {
                        res.writeHead(404, {'Content-Type': 'text/html'});
                        res.end(errorMsg(options));
                    }

                } else {

                    var msg = _.template(errorTemplate);

                    if(oldCacheData && oldCacheData.content) {
                        responseCallback(msg({ 'err': err.message}), oldCacheData.content, oldCacheData.headers);
                        //debugMode.add(options.unparsedUrl, {status: 'ERROR', httpStatus: err.statusCode, staleContent: true, timing: timing });
                        errorMsg = _.template('STALE <%= url %> cache <%= cacheKey %> failed but serving stale content.');
                        eventHandler.logger('error', errorMsg(options), {tracer:req.tracer});
                    } else {
                        //debugMode.add(options.unparsedUrl, {status: 'ERROR', httpStatus: err.statusCode, defaultContent: true, timing: timing });
                        responseCallback(msg({ 'err': err.message}));
                    }

                    eventHandler.stats('increment', options.statsdKey + '.error');
                    errorMsg = _.template('FAIL <%= url %> did not respond in <%= timing%>, elapsed <%= elapsed %>. Reason: ' + err.message);
                    eventHandler.logger('error', errorMsg({url: options.url, timing: timing, elapsed: elapsed}), {tracer:req.tracer});

                 }

             }

             reliableGet(options, function(err, response) {
                if(err) {
                    return onErrorHandler(err, response && response.stale);
                }
                responseCallback(null, response.content, response.headers);
             });

         }

        res.parse = function(data) {
            parxer({
                environment: config.environment,
                cdn: config.cdn,
                showErrors: !req.backend.quietFailure,
                plugins: [
                    parxerPlugins.Test,
                    parxerPlugins.Url(getCx)
                ],
                variables: templateVars
            }, data, function(err, content) {
                res.end(content);
            });
        }

        next();

    }

}


module.exports = {
    getMiddleware: getMiddleware
};

