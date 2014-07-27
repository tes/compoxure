'use strict';

module.exports = function() {

    this.engine = 'nocache';

    this.get = function(key, next) {
        next(null, null);
    };

    this.set = function(key, value, ttl, next) {
        next && next(null, null);
    };
};