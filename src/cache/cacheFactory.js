'use strict';

var _ = require('lodash');

var engines = {
    redis: require('./RedisCache'),
    nocache: require('./NoCache'),
    memorycache: require('./MemoryCache')
};

var cacheInstance = {};

var obtainCacheInstance = function(config) {
    var Engine = engines[config.engine];
    cacheInstance[config.engine] = cacheInstance[config.engine] || new Engine(config);
    return cacheInstance[config.engine];
};

module.exports.getCache = function(_config) {
    var config = _.defaults(_config || {}, { engine: 'nocache' });
    return obtainCacheInstance(config);
};

module.exports.clearCacheInstances = function() {
    cacheInstance = {};
};