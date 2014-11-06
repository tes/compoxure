
/**
 * Simple API exposed (if configured and cache is Redis) that allows
 * addition and deletion of content into the compoxure cache
 */

var connectRoute = require('connect-route');
var redis = require('redis');
var utils = require('../utils');

module.exports = function(config) {

  var redisClient;

  var endError = function(res, statusCode, message) {
      res.writeHead(statusCode, {'Content-Type': 'text/html'});
      res.end(message || 'Error');
  }

  var endSuccess = function(res, message) {
      res.writeHead(200, {'Content-Type': 'text/html'});
      res.end(message || 'OK');
  }

  var getCacheKey = function(req, res) {
    var key = req.params.key;
    if(!key) {
      endError(res, 500, 'No key provided');
    } else {
      redisClient.hgetall(key, function(err, data) {
        if(err) { return endError(res, 500, err.message); }
        if(!data) { return endError(res, 404, 'No data at key: ' + key); }
        endSuccess(res, JSON.stringify(data));
      });
    }
  }

  var postCacheKey = function(req, res) {
    var key = req.params.key;
    var bodyParser = require('body-parser').json();
    bodyParser(req, res, function() {
      var cacheJson = req.body;
      if(!cacheJson.content) { return endError(res, 500, 'You must provide content.'); }
      if(!cacheJson.expires) { return endError(res, 500, 'You must provide an expires timestamp.'); }
      if(!cacheJson.ttl) { cacheJson.ttl = 0; }
      redisClient.hmset(key, cacheJson, function(err) {
        if(err) { return endError(res, 500, err.message); }
        endSuccess(res, 'Key ' + key + ' set.' )
      })
    });
  }

  var deleteCacheKey = function(req, res) {
    var key = req.params.key;
    if(!key) {
      endError(res, 500, 'No key provided');
    } else {
      redisClient.del(key, function(err) {
        if(err) { return endError(res, 500, err.message); }
        return endSuccess(res, 'Key ' + key + ' deleted.');
      });
    }
  }

  if(config.cache && config.cache.engine === 'redis' && config.cache.apiEnabled) {
    var redisConfig;
    if(config.cache.url) {
      redisConfig = utils.parseRedisConnectionString(config.cache.url);
    } else {
      redisConfig = config.cache;
    }
    redisClient = redis.createClient(redisConfig.port, redisConfig.host, redisConfig.options);

    return connectRoute(function (router) {
      router.get('/api/cache/:key', getCacheKey);
      router.post('/api/cache/:key', postCacheKey);
      router.delete('/api/cache/:key', deleteCacheKey);
    });

  } else {

    return function(req, res, next) { next(); }

  }

}
