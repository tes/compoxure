var RequestInterrogator = require('../parameters/RequestInterrogator');

module.exports = function (config, eventHandler) {

  var interrogator = new RequestInterrogator(config.parameters,
    config.cdn || {},
    config.environment,
    eventHandler);

  return function (req, res, next) {
    interrogator.interrogateRequest(req, function (templateVars) {
      req.templateVars = templateVars;
      next();
    });
  }

}

