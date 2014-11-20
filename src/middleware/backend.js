var HttpStatus = require('http-status-codes');
var _ = require('lodash');

module.exports = function(config)  {
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
      return next();
    }
  }
}
