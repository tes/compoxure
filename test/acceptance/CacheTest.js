'use strict';

var expect = require('expect.js');
var cacheFactory = require('../../lib/cache/cacheFactory');
var cache = cacheFactory.getCache({engine:'memorycache'});

describe("Cache Engine", function(){

	it('should set and get values from cache', function(done) {
        cache.set('bar:123', 'content', 1000, function(err) {
            expect(err).to.be(null);
            assertCachedValue(cache, 'bar:123', 'content', done);
        });
	});

    it('should return null when value not present', function(done) {
        assertCachedValue(cache, 'bar:212122', null, done);
    });

    it('should expire values in cache', function(done) {
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
