'use strict';

var expect = require('expect.js');
var cacheFactory = require('../../src/cache/cacheFactory');
var cache = cacheFactory.getCache({engine:'memorycache'});

describe("Memory Cache Engine", function(){

    this.timeout(5000);
    this.slow(3000);

    it('should set and get values from cache', function(done) {
        cache.set('bar:123', {content:'content', headers:{'header':'1'}}, 1000, function(err) {
            expect(err).to.be(null);
            assertCachedValue(cache, 'bar:123', 'content', done);
        });
	});

    it('should return null when value not present', function(done) {
        assertCachedNullValue(cache, {content:'bar:212122'}, done);
    });

    it('should expire values in cache', function(done) {
        cache.set('bar:1234', {content:'content'}, 1000, function(err) {
            expect(err).to.be(null);
            assertCachedValue(cache, 'bar:1234', 'content', function() {
                setTimeout(function() {
                    assertCachedNullValue(cache, 'bar:1234', done);
                }, 1100);
            });
        });
    });

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

});

