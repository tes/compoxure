'use strict';

var EventEmitter = require('events').EventEmitter;

var cache = {};

function MemoryCache() {

    this.engine = 'memorycache';

    var oneMinute = 60 * 1000;

    this.get = function(key, next) {
        var data = cache[key];
        if(!data) { return next(null, null); }
        var expires = Date.now();
        if(expires - data.expires > 0) {
            setTimeout(function() {
                next(null, null, data.data);
            },5);
        } else {
            setTimeout(function() {
                next(null, data.data);
            },5);
        }
    };

    this.set = function(key, value, _ttl, next) {
    	var ttl = _ttl || oneMinute;
        var expires = Date.now() + ttl*1;
    	cache[key] = {expires:expires, data:value};
        if(next) { next(null); }
    };

    this.emit('ready');

}

module.exports = MemoryCache;

require('util').inherits(MemoryCache, EventEmitter);
