'use strict';

var expect = require('expect.js');
var cacheFactory = require('../../src/cache/cacheFactory');
var cache = cacheFactory.getCache({engine:'nocache'});

describe("No Cache Engine", function() {

	it('should not set and get values from cache', function(done) {
        cache.set('bar:123', 'content', 1000, function(err) {
            expect(err).to.be(null);
            assertCachedValue(cache, 'bar:123', null, done);
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