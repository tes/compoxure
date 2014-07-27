'use strict';

var request = require('request');
var sf = require('sf');

module.exports = getThenCache;

function getThenCache(options, cache, eventHandler, stream, onError) {

    var start = new Date();

    if(!options.explicitNoCache && options.cacheTTL > 0) {

        cache.get(options.cacheKey, function(err, content, oldContent) {
            if (err) return onError(err, oldContent);
            if (content) {
                var timing = (new Date() - start);
                eventHandler.logger('info', 'CACHE ' + options.cacheKey,{tracer:options.tracer, responseTime: timing, pcType:options.type});
                eventHandler.logger('debug', 'Cache HIT for key: ' + options.cacheKey,{tracer:options.tracer,pcType:options.type});
                eventHandler.stats('increment', options.statsdKey + '.cacheHit');
                stream.end(content);
                return;
            } else {
                eventHandler.logger('debug', 'Cache MISS for key: ' + options.cacheKey,{tracer:options.tracer,pcType:options.type});
                eventHandler.stats('increment', options.statsdKey + '.cacheMiss');
            }

            pipeAndCacheContent(function(err, content) {
                if (err) return onError(err, oldContent);
                if (!options.pipe) stream.end(content);
                cache.set(options.cacheKey, content, options.cacheTTL, function(err) {
                    eventHandler.logger('debug', 'Cache SET for key: ' + options.cacheKey + ' @ TTL: ' + options.cacheTTL,{tracer:options.tracer,pcType:options.type});
                });
            });
        });

    } else {

        pipeAndCacheContent(function(err, content) {
            if (err) return onError(err);
            stream.end(content);
        });

    }

    function pipeAndCacheContent(next) {

        var content = "", start = new Date(), inErrorState = false;

        var r = request({url: options.url, agent: false, timeout: options.timeout, headers: options.headers})
            .on('error', handleError)
            .on('data', function(data) {
                content += data.toString();
            })
            .on('response', function(response) {
                if(response.statusCode != 200) {
                    handleError({message:'status code ' + response.statusCode},response.statusCode)
                }
            })
            .on('end', function() {
                if(inErrorState) return;
                next(null, content);
                var timing = (new Date() - start);
                eventHandler.logger('info', 'URL ' + options.url,{tracer:options.tracer, responseTime: timing, pcType:options.type});
                eventHandler.stats('timing', options.statsdKey + '.responseTime', timing);
            });

        if (options.pipe) r.pipe(stream);

        function handleError(err, statusCode) {
            if (!inErrorState) {
                inErrorState = true;
                var message = sf('Service {url} FAILED due to {errorMessage}', {
                    url: options.url,
                    errorMessage: err.message
                });
                next({statusCode: statusCode, message: message});
            }
        }

    }


}