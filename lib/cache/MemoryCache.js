'use strict';

module.exports = function() {

    this.engine = 'memorycache';

    var oneMinute = 60 * 1000;
    var cache = {};

    this.get = function(key, next) {
        var data = cache[key];
        if(!data) return next(null, null);
        var expires = (new Date()).getTime();
        if(expires - data.expires > 0) {
            next(null, null, data.content);
        } else {
            next(null, data.content);
        }
    };

    this.set = function(key, value, _ttl, next) {
    	var ttl = _ttl || oneMinute;
        var expires = (new Date()).getTime() + ttl*1;
    	cache[key] = {expires:expires, content:value};
        next && next(null);
    };
};