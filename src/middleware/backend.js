var HttpStatus = require('http-status-codes');
var _ = require('lodash');
var utils = require('../utils');

module.exports = function (config) {

  var backendDefaults = _.defaults(config.backendDefaults || {}, {
    quietFailure: false,
    replaceOuter: false,
    dontPassUrl: true,
    leaveContentOnFail: true,
    ttl: '5m',
    noCache: false,
    timeout: '2s',
    addResponseHeaders: {},
    headers: [],
    passThroughHeaders: []
  });

  return function selectBackend(req, res, next) {

    var headerBackend = {
      name: req.get && req.get('x-compoxure-backend'),
      target: req.get && req.get('x-compoxure-backend-target'),
      ttl: req.get && req.get('x-compoxure-backend-ttl'),
      noCache: req.get && req.get('x-compoxure-backend-nocache'),
      timeout: req.get && req.get('x-compoxure-backend-timeout')
    };

    if (config.backend) {
      // First try to match based on header and use header values
      if (headerBackend.target) {
        req.backend = _.find(config.backend, function (server) {
          if(headerBackend.name && server.name === headerBackend.name) {
            return true;
          }
        });
      } else {
        req.backend = utils.getBackendConfig(config, req.url, req);
      }
    }

    // If we haven't matched but have headers, lets just use these
    if (!req.backend && headerBackend.target) {
      req.backend = headerBackend;
    }

    if (!req.backend) {
      if (!res.headersSent) {
        res.writeHead(HttpStatus.NOT_FOUND);
      }
      return next({
        level: 'warn',
        message: 'Backend not found'
      });
    } else {
      req.backend = _.defaults(_.clone(req.backend), headerBackend, backendDefaults);
      var backendNoCache = !req.backend.cacheKey || req.backend.noCache;
      if (backendNoCache && config.cache.defaultNoCacheHeaders) {
        req.backend.addResponseHeaders = _.defaults(req.backend.addResponseHeaders, config.cache.defaultNoCacheHeaders);
      }
      req.backend.target = utils.render(req.backend.target, req.templateVars);
      req.backend.cacheKey = req.backend.cacheKey ? utils.render(req.backend.cacheKey, req.templateVars) : null;
      return next();
    }
  }
}
