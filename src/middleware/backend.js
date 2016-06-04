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
      name: req.get('x-compoxure-backend'),
      target: req.get('x-compoxure-backend-target'),
      ttl: req.get('x-compoxure-backend-ttl'),
      noCache: req.get('x-compoxure-backend-nocache'),
      timeout: req.get('x-compoxure-backend-timeout')
    };

    if (config.backend) {
      req.backend = _.find(config.backend, function (server) {
        // First try to match based on header and use header values
        if(headerBackend.target && headerBackend.name && server.name === headerBackend.name) {
          return true;
        }
        // Then try to match based on pattern in backend Config
        if (!headerBackend.target && server.pattern) {
          return [].concat(server.pattern).some(function (pattern) {
            return new RegExp(pattern).test(req.url);
          });
        }
        // Finally try to match based on lookup function in backend Config
        if (!headerBackend.target && server.fn) {
          if (typeof config.functions[server.fn] == 'function') {
            return config.functions[server.fn](req, req.templateVars, server);
          }
        }
      });
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
      req.backend.target = utils.render(req.backend.target, req.templateVars);
      req.backend.cacheKey = req.backend.cacheKey ? utils.render(req.backend.cacheKey, req.templateVars) : null;
      return next();
    }
  }
}
