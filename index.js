
var utils = require('./src/utils');
var TrumpetProxy = require('./src/middleware/trumpet');
var RequestInterrogator = require('./src/parameters/RequestInterrogator');
var cacheFactory = require('./src/cache/cacheFactory');
var getThenCache = require('./src/getThenCache');
var async = require('async');
var _ = require('lodash');
var HttpStatus = require('http-status-codes');

// Hack for intra ms unique keys for tracer (not sure if this even works - todo)
var msCounter = 0;
setInterval(function() {
    msCounter = 0;
},1);

module.exports = function(config, eventHandler) {

    // Ensure event handler has sensible defaults
    eventHandler = eventHandler || {logger:function() {}, stats: function() {}};
    eventHandler.logger = eventHandler.logger || function() {};
    eventHandler.stats = eventHandler.stats || function() {};

    var interrogator = new RequestInterrogator(config.parameters, eventHandler);
    var cache = cacheFactory.getCache(config.cache);
    var trumpetProxy = new TrumpetProxy(config, cache, eventHandler);

    function backendProxyMiddleware(req, res, next) {

        trumpetProxy.middleware(req, res, function() {

            var DEFAULT_LOW_TIMEOUT = 500;

            msCounter++;
            req.tracer = (new Date()).getTime() + '' + msCounter;

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

            backend.timeout = backend.timeout || DEFAULT_LOW_TIMEOUT;

            if (config.cdn) backendHeaders['x-cdn-host'] = config.cdn.host;

            var options = {
                url: targetUrl,
                cacheKey: targetCacheKey,
                cacheTTL: targetCacheTTL,
                timeout: backend.timeout,
                headers: backendHeaders,
                tracer: req.tracer,
                type: 'backend',
                pipe: true,
                statsdKey: 'backend_' + utils.urlToCacheKey(backend.host)
            };

            getThenCache(options, cache, eventHandler, res.trumpet, function(err, oldContent) {
                if(req.backend.quietFailure && oldContent) {
                    res.trumpet.end(oldContent);
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
                return new RegExp(server.pattern).test(req.url);
            });
        }

        if(!req.backend) {
            res.writeHead(HttpStatus.NOT_FOUND);
            return next({message: 'Backend not found'});
        } else {
            return next();
        }
    }

    function ignoreNotHtml(req, res, next) {
        if (!req.headers || !req.headers.accept) {
            return next({message: 'No accept headers'});
        }

        var accept = req.headers.accept.toLowerCase();
        if (accept.indexOf("*/*") >= 0 || accept.indexOf("text/html") >= 0 ) {
            return next();
        }

        res.writeHead(HttpStatus.UNSUPPORTED_MEDIA_TYPE);
        next({message: 'Unsupported content type: [' + req.headers.accept + '], url was ' + req.url});
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
            function(callback) { selectBackend(req, res, callback) },
            function(callback) { interrogateRequest(req, res, callback) },
            function(callback) { backendProxyMiddleware(req, res, callback) }
        ], function(err) {
            if(err) {
                res.end();
                eventHandler.logger(err.level ? err.level : 'error', err.message);
            } else {
                next();
            }
        });

    }

    return allMiddleware;

}