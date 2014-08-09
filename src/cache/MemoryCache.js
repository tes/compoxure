'use strict';

var cache = {};

module.exports = function() {

    this.engine = 'memorycache';

    var oneMinute = 60 * 1000;

    this.get = function(key, next) {
        var data = cache[key];

        if(!data) return next(null, null);
        var expires = (new Date()).getTime();
        if(expires - data.expires > 0) {
            setTimeout(function() {
                next(null, null, data.content);
            },5);
        } else {
            setTimeout(function() {
                next(null, data.content);
            },5);
        }
    };

    this.set = function(key, value, _ttl, next) {
    	var ttl = _ttl || oneMinute;
        var expires = (new Date()).getTime() + ttl*1;
    	cache[key] = {expires:expires, content:value};
        next && next(null);
    };
};