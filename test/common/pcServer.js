'use strict';

var cx = require('../../');
var express = require('express');
var cookieParser = require('cookie-parser');

function initPcServer(port, hostname, eventHandler, configFile, enableExtension) {

  var config = require('./' + (configFile || 'testConfig') + '.json');

  config.enableExtension = enableExtension;

  // Define functions
  config.functions = {
    'selectFnTest': function (req, variables) {
      if (variables['query:selectFn']) { return true; }
    },
    'handle403': function (req, res, variables, data, options, err) {
      res.writeHead(403, { 'Content-Type': 'text/html' });
      res.end('CX says no.');
    },
    'handle302': function (req, res, variables, data, options, err) {
      res.writeHead(err.statusCode, { location: err.headers.location });
      res.end('');
    },
    'handle418': function(req, res, variables, data, options, err, responseCallback) {
      responseCallback('<div id="handler">Teapot</div>');
    },
    'statisticsHandler': function (backend, statistics) {
      // Example statistics handler
    }
  }
  config.environment = 'test';

  // Example options transformer
  var optionsTransformer = function (req, options, next) {
    // You have full access to req, and the selected backend
    if (req.backend && req.backend.name === 'transformer') {
      // You can modify any element of the options object
      options.cacheKey = 'prefix-' + options.cacheKey + '-suffix';
      // Url modified to allow for testing
      options.url = options.url + '?cacheKey=' + options.cacheKey;
    }
    next(null, options);
  }

  // Add CDN resolver
  config.cdn.resolver = function(service) {
    if (service === 'service-resolved') {
      return 'http://localhost:5001/resolved-static/';
    }
  }

  var compoxureMiddleware = cx(config, eventHandler, optionsTransformer);

  var server = express();

  server.use(cookieParser());
  server.use(function (req, res, next) {
    // This would be a call off to a service (e.g. planout based)
    // To retrieve active experiments for the current user.
    // Assumed it returns a simple object one level of properties deep
    req.experiments = { details_block: 'A123', another_test: 'B112' };
    next();
  });
  server.use(compoxureMiddleware);

  return function (next) {
    server.listen(port, hostname).on('listening', next)
  }

}

module.exports = {
  init: initPcServer
}
