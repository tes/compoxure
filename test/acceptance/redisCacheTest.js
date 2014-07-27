'use strict';

var expect = require('expect.js');
var config = require('module-tsl-config').init();
var endpoints = require('module-tsl-endpoints');
var environment = require('module-tsl-environment');
var RedisCache = require('../../src/cache/RedisCache');
var redisFactory = require('module-tsl-redis');

describe("Redis Cache", function(){

    var redisClient;

    before(function(done){
        var redisEndpoint = endpoints.getSync('page-composer/cache', environment);
        redisClient = redisFactory.createClient(redisEndpoint);
        redisClient.info(done);
    });

    beforeEach(function(done) {
        redisClient.flushdb(done);
    });

    after(function(done){
        redisClient.flushdb(done);
    });

	it('should set and get values from cache', function(done) {
        var cache = new RedisCache();
        cache.set('bar:1234', 'content', 1000, function(err) {
            expect(err).to.be(null);
            assertCachedValue(cache, 'bar:1234', 'content', done);
        });
	});

    it('should return null when value not present', function(done) {
        var cache = new RedisCache();
        assertCachedValue(cache, 'bar:1234', null, done);
    });

    it('should expire values in cache', function(done) {
        var cache = new RedisCache();
        cache.set('bar:1234', 'content', 1000, function(err) {
            expect(err).to.be(null);
            assertCachedValue(cache, 'bar:1234', 'content', function() {
                setTimeout(function() {
                    assertCachedValue(cache, 'bar:1234', null, done);
                }, 1100);
            });
        });
    });

    function assertCachedValue(cache, key, expected, next) {
        cache.get(key, function(err, actual) {
            expect(err).to.be(null);
            expect(actual).to.be(expected);
            next();
        });
    }

});
