'use strict';

var request = require('request');
var sf = require('sf');
var url = require('url');
var _ = require('lodash');
var CircuitBreaker = require('./CircuitBreaker');

function getThenCache(options, debugMode, config, cache, eventHandler, stream, onError) {

    debugMode.add(options.unparsedUrl, {options: _.cloneDeep(options)});

    var start = Date.now();

    function pipeAndCacheContent(next) {

        var content = '', start = Date.now(), inErrorState = false, res;

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

        if(!url.parse(options.url).protocol) { return handleError({message:'Invalid URL ' + options.url}); }

        options.headers.accept = 'text/html,application/xhtml+xml,application/xml,application/json';
        options.headers['user-agent'] = 'Compoxure-Request-Agent';

        request({url: options.url, agent: false, timeout: options.timeout, headers: options.headers})
            .on('error', handleError)
            .on('data', function(data) {
                content += data.toString();
            })
            .on('response', function(response) {
                res = response;
                if(response.statusCode != 200) {
                    handleError({message:'status code ' + response.statusCode}, response.statusCode);
                }
            })
            .on('end', function() {
                if(inErrorState) { return; }
                res.content = content;
                next(null, res);
                var timing = Date.now() - start;
                eventHandler.logger('debug', 'OK ' + options.url,{tracer:options.tracer, responseTime: timing, pcType:options.type});
                eventHandler.stats('timing', options.statsdKey + '.responseTime', timing);
            });

    }

    if(!options.explicitNoCache && options.cacheTTL > 0) {

        cache.get(options.cacheKey, function(err, content, oldContent) {

            if (err) { return onError(err, oldContent); }
            if (content) {
                var timing = Date.now() - start;
                eventHandler.logger('debug', 'CACHE HIT for key: ' + options.cacheKey,{tracer:options.tracer, responseTime: timing, pcType:options.type});
                eventHandler.stats('increment', options.statsdKey + '.cacheHit');
                debugMode.add(options.unparsedUrl, {status: 'OK', cache: 'HIT', timing: timing});
                stream.end(content);
                return;
            }

            debugMode.add(options.unparsedUrl, {cache: 'MISS'});
            eventHandler.logger('debug', 'CACHE MISS for key: ' + options.cacheKey,{tracer:options.tracer,pcType:options.type});
            eventHandler.stats('increment', options.statsdKey + '.cacheMiss');

            if(options.url == 'cache') {
                stream.end('');
                return;
            }

            new CircuitBreaker(options, config, eventHandler, pipeAndCacheContent, function(err, res) {

                if (err) { return onError(err, oldContent); }
                var timing = Date.now() - start;
                debugMode.add(options.unparsedUrl, {status: 'OK', timing: timing});
                stream.end(res.content);

                // Honor fragment cache control headers in a simplistic way
                if ((res.headers['cache-control'] || '').indexOf('no-cache') !== -1) { return; }
                if ((res.headers['cache-control'] || '').indexOf('no-store') !== -1) { return; }
                if ((res.headers['cache-control'] || '').indexOf('max-age') !== -1) {
                    options.cacheTTL = res.headers['cache-control'].split('=')[1];
                }

                cache.set(options.cacheKey, res.content, options.cacheTTL, function() {
                    eventHandler.logger('debug', 'CACHE SET for key: ' + options.cacheKey + ' @ TTL: ' + options.cacheTTL,{tracer:options.tracer,pcType:options.type});
                });

            });
        });

    } else {

        new CircuitBreaker(options, config, eventHandler, pipeAndCacheContent, function(err, res) {
            if (err) { return onError(err); }
            var timing = Date.now() - start;
            debugMode.add(options.unparsedUrl, {status: 'OK', cache: 'DISABLED', timing: timing});
            stream.end(res.content);
        });

    }

}

module.exports = getThenCache;
