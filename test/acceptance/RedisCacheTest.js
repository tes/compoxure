'use strict';

var expect = require('expect.js');
var cacheFactory = require('../../src/cache/cacheFactory');

describe("Redis Cache Engine", function() {

    this.timeout(5000);
    this.slow(3000);

    beforeEach(function() {
        cacheFactory.clearCacheInstances();
    });

	it('should set and get values from cache', function(done) {
        withCache({engine:'redis'}, function(err, cache) {
            cache.set('bar:123', {content:'content', headers:{'header':'1'}}, 1000, function(err) {
                expect(err).to.be(null);
                assertCachedValue(cache, 'bar:123', 'content', function() {
                    assertHeaderValue(cache, 'bar:123', 'header', '1', done);
                });
            });
        });
	});

    it('should return null when value not present', function(done) {
        withCache({engine:'redis'}, function(err, cache) {
            assertCachedNullValue(cache, 'bar:212122', done);
        });
    });

    it('should expire values in cache', function(done) {
        withCache({engine:'redis'}, function(err, cache) {
            cache.set('bar:1234', {content:'content', headers:{'header':'1'}}, 1000, function(err) {
                expect(err).to.be(null);
                assertCachedValue(cache, 'bar:1234', 'content', function() {
                    setTimeout(function() {
                        assertCachedNullValue(cache, 'bar:1234', done);
                    }, 1100);
                });
            });
        });
    });

    it('should bypass cache is redis is unavailable', function(done) {
        var cache = cacheFactory.getCache({engine:'redis', hostname: 'foobar.acuminous.co.uk'});
        cache.get('anything', function(err, data) {
            expect(err).to.be(undefined);
            expect(data).to.be(undefined);
            done();
        });
    });

    function withCache(config, next) {
        var cache = cacheFactory.getCache(config);
        cache.on('ready', function() {
            next(null, cache);
        });
    };

    function assertCachedValue(cache, key, expected, next) {
        cache.get(key, function(err, actual) {
            expect(err).to.be(null);
            expect(actual.content).to.be(expected);
            next();
        });
    }

    function assertCachedNullValue(cache, key, next) {
        cache.get(key, function(err, actual) {
            expect(err).to.be(null);
            expect(actual).to.be(null);
            next();
        });
    }

    function assertHeaderValue(cache, key, header, expected, next) {
        cache.get(key, function(err, actual) {
            expect(err).to.be(null);
            expect(actual.headers[header]).to.be(expected);
            next();
        });
    }


});
