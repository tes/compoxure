var HttpStatus = require('http-status-codes');
var _ = require('lodash');
var utils = require('../utils');

module.exports = function(config)  {

  var backendDefaults = {
    quietFailure: false,
    replaceOuter: false,
    dontPassUrl: true,
    leaveContentOnFail: true,
    addResponseHeaders: {}
  };

  return function selectBackend(req, res, next) {
    if (config.backend) {
      req.backend = _.find(config.backend, function(server) {
          if (server.pattern) { return new RegExp(server.pattern).test(req.url); }
          if (server.fn) {
            if (typeof config.functions[server.fn] == 'function') {
              return config.functions[server.fn](req, req.templateVars);
            }
          }
      });
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
      req.backend = _.clone(_.defaults(req.backend, backendDefaults));
      req.backend.target = utils.render(req.backend.target, req.templateVars);
      req.backend.cacheKey = req.backend.cacheKey ? utils.render(req.backend.cacheKey, req.templateVars) : null;
      return next();
    }
  }
}
