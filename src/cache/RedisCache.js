'use strict';

var redis = require('redis');
var url = require('url');
var utils = require('../utils');

module.exports = function(config) {

    var redisOptions;
    var oneMinute = 60 * 1000;
    var cleanupPeriod = 60 * 60 * 24; // 1 day

    if(config.url) {
        redisOptions = utils.parseRedisConnectionString(config.url);
    } else {
        redisOptions = config;
    }

    var redisClient = redis.createClient(redisOptions.port, redisOptions.host);
    redisClient.select(redisOptions.db || 0);

    this.engine = 'redis';

    this.get = function(key, next) {

        redisClient.hgetall(key, function(err, data) {

            if(!data) return next(err, null);

            // Check if there is a hit but look at expiry time
            // Allows us to serve stale cached values vs TTL only
            var expires = Date.now();
            if(expires - data.expires > 0) {
                next(err, null, data.content);
            } else {
                next(err, data.content);
            }
        });
    };

    this.set = function(key, value, _ttl, next) {
        if (arguments.length === 3) return this.set(key, value, _ttl, function() {});

        var ttl = _ttl || oneMinute;
        var expires = Date.now() + ttl*1;
        var multi = redisClient.multi();

        multi.hset(key, "content", value);
        multi.hset(key, "expires", expires);
        multi.hset(key, "ttl", ttl);

        multi.expire(key, (ttl / 1000) * cleanupPeriod); // Delete them eventually

        multi.exec(next);

    };
};
