'use strict';

var EventEmitter = require('events').EventEmitter;

module.exports = NoCache;

function NoCache() {

    this.engine = 'nocache';

    this.get = function(key, next) {
        next(null, null);
    };

    this.set = function(key, value, ttl, next) {
        next && next(null, null);
    };

    this.emit('ready');
};

require('util').inherits(NoCache, EventEmitter);