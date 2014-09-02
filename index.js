
var utils = require('./src/utils');
var HtmlParserProxy = require('./src/middleware/htmlparser');
var RequestInterrogator = require('./src/parameters/RequestInterrogator');
var cacheFactory = require('./src/cache/cacheFactory');
var getThenCache = require('./src/getThenCache');
var utils = require('./src/utils');
var async = require('async');
var _ = require('lodash');
var request = require('request');
var url = require('url');
var HttpStatus = require('http-status-codes');

var prevMillis = 0;
var intraMillis = 0;

module.exports = function(config, eventHandler) {

    // Ensure event handler has sensible defaults
    eventHandler = eventHandler || {logger:function() {}, stats: function() {}};
    eventHandler.logger = eventHandler.logger || function() {};
    eventHandler.stats = eventHandler.stats || function() {};

    var interrogator = new RequestInterrogator(config.parameters, config.cdn || {}, config.environment, eventHandler);
    var cache = cacheFactory.getCache(config.cache);
    var htmlParserProxy = HtmlParserProxy(config, cache, eventHandler);

    function backendProxyMiddleware(req, res, next) {

        htmlParserProxy.middleware(req, res, function() {

            var DEFAULT_LOW_TIMEOUT = 500;

            var now = Date.now();
            if (now > prevMillis) {
                prevMillis = now;
                intraMillis = 0;
            } else {
                intraMillis += 1;
            }

            req.tracer = req.headers['x-tracer'] || (Date.now() * 1000) + intraMillis;

            var referer = req.headers.referer || 'direct',
                userAgent = req.headers['user-agent'] || 'unknown',
                remoteAddress = req.connection.remoteAddress || req.socket.remoteAddress || req.connection.socket.remoteAddress,
                remoteIp = req.headers['x-forwarded-for'] || remoteAddress;

            eventHandler.logger('info', 'GET ' + req.url, {tracer:req.tracer, referer: referer, remoteIp: remoteIp, userAgent: userAgent});

            var backend = req.backend,
                targetUrl = backend.target + (backend.dontPassUrl ? '' : req.url),
                backendHeaders = {  'x-forwarded-host' : req.headers.host,
                                    host: backend.host },
                targetCacheKey = 'backend_' + utils.urlToCacheKey(targetUrl),
                targetCacheTTL = utils.timeToMillis(backend.ttl || "30s");

            if (config.cdn) {
                if(config.cdn.host) backendHeaders['x-cdn-host'] = config.cdn.host;
                if(config.cdn.url) backendHeaders['x-cdn-url'] = config.cdn.url;
            }

            var options = {
                url: targetUrl,
                cacheKey: targetCacheKey,
                cacheTTL: targetCacheTTL,
                timeout: utils.timeToMillis(backend.timeout || DEFAULT_LOW_TIMEOUT),
                headers: backendHeaders,
                tracer: req.tracer,
                type: 'backend',
                statsdKey: 'backend_' + utils.urlToCacheKey(backend.host)
            };

            getThenCache(options, config, cache, eventHandler, res.transformer, function(err, oldContent) {
                if(req.backend.quietFailure && oldContent) {
                    res.transformer.end(oldContent);
                    eventHandler.logger('error', 'Backend FAILED but serving STALE content: ' + err.message, {tracer:req.tracer});
                } else {
                    res.writeHead(HttpStatus.INTERNAL_SERVER_ERROR);
                    res.end(err.message);
                    eventHandler.logger('error', 'Backend FAILED to respond: ' + err.message, {tracer:req.tracer});
                }
            });

        });

    }

    function dropFavicon(req, res, next) {
         if (req.url === '/favicon.ico') {
            res.writeHead(200, {'Content-Type': 'image/x-icon'} );
            return next({level: 'info', message:'Dropped favicon request'})
          }
          next();
    }

    function selectBackend(req, res, next) {
        
        if(config.backend) {
            req.backend = _.find(config.backend, function(server) {
                if(server.pattern) return new RegExp(server.pattern).test(req.url);
                if(server.fn) {                    
                    if(typeof config.functions[server.fn] == 'function') {                        
                        return config.functions[server.fn](req, req.templateVars);
                    }
                }
            });
        }

        if(!req.backend) {
            res.writeHead(HttpStatus.NOT_FOUND);
            return next({level: 'warn', message: 'Backend not found'});
        } else {
            return next();
        }
    }

    function ignoreNotHtml(req, res, next) {
        if (!req.headers || !req.headers.accept) {
            return next({level:'warn', message: 'No accept headers'});
        }

        var accept = req.headers.accept.toLowerCase();
        if (accept.indexOf("*/*") >= 0 || accept.indexOf("text/html") >= 0 ) {
            return next();
        }

        res.writeHead(HttpStatus.UNSUPPORTED_MEDIA_TYPE);
        next({message: 'Unsupported content type: [' + req.headers.accept + '], url was ' + req.url});
    }

    function passThrough(req, res, next) {

        if(req.method !== 'GET') {  

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
                url: forwardUrl                
            }

            req.pipe(request(requestConfig)).pipe(res);            

        } else {

            next();
            
        }

    }

    function interrogateRequest(req, res, next) {
        interrogator.interrogateRequest(req, function(templateVars) {
            req.templateVars = templateVars;
            next();
        });
    }

    function allMiddleware(req, res, next) {

        async.series([
            function(callback) { dropFavicon(req, res, callback) },
            function(callback) { ignoreNotHtml(req, res, callback) },
            function(callback) { interrogateRequest(req, res, callback) },
            function(callback) { selectBackend(req, res, callback) },
            function(callback) { passThrough(req, res, callback) },
            function(callback) { backendProxyMiddleware(req, res, callback) }
        ], function(err) {
            if(err) {
                res.end();
                eventHandler.logger(err.level ? err.level : 'error', err.message, {url: req.url});
            } else {
                next();
            }
        });

    }

    return allMiddleware;

}
