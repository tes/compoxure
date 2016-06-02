'use strict';

var _ = require('lodash');
var url = require('url');
var Parser = require('express-device').Parser;
var utils = require('../utils');

module.exports = function (config, cdn, environment) {

  config = config || {
      urls: [
        { pattern: '.*', names: [] }
      ], servers: {}
    };

  environment = { name: environment || process.env.NODE_ENV || 'development' };


  function flatten(variables, type, key, value) {
    variables[type + ':' + key] = value;
    variables[type + ':' + key + ':encoded'] = encodeURIComponent(value);
  }

  function interrogatePath(path) {

    var matches = _.map(config.urls, function (url) {
      var regexp = new RegExp(url.pattern);
      var match = regexp.exec(path);
      if (!match) { return {}; }
      return _.object(url.names, _.rest(match, 1));
    });

    var parameters = {};
    _.each(matches, function (match) {
      _.each(match, function (value, key) {
        parameters[key] = value;
      });
    });

    return parameters;
  }

  function interrogateParams(params) {

    var parameters = {};
    _.forEach(config.query, function (query) {
      if (params[query.key]) {
        parameters[query.mapTo] = params[query.key];
      }
    });
    return parameters;
  }

  function getPort(req) {
    var host = req.headers.http_host || req.headers.host;
    var res = host ? host.match(/:(\d+)/) : '';
    return res ? res[1] : req.connection.pair ? '443' : '80';
  }

  function getPageUrl(req, parsedUrl) {

    var components = {
      host: req.headers.http_host || req.headers.host,
      port: getPort(req),
      protocol: req.isSpdy ? 'https' : (req.connection.pair ? 'https' : 'http'),
      search: parsedUrl.search,
      pathname: parsedUrl.pathname
    };

    return url.parse(url.format(components), false);

  }

  this.interrogateRequest = function (req, next) {

    var parsedUrl = url.parse(req.url, true);
    var templateParams = interrogatePath(parsedUrl.path);
    var queryParams = interrogateParams(parsedUrl.query);
    var pageUrl = getPageUrl(req, parsedUrl);
    var user = req.user || { userId: '_' };
    var deviceType = new Parser(req).get_type();
    if (deviceType === 'bot') { deviceType = 'desktop'; } // Serve desktop versions to bots ?

    var requestVariables = {};

    var requestConfig = {
      param: _.extend(queryParams, templateParams),
      url: pageUrl,
      query: parsedUrl.query,
      cookie: req.cookies,
      header: req.headers,
      server: config.servers,
      env: environment,
      user: user,
      experiments: req.experiments || {},
      device: { type: deviceType }
    };

    _.forOwn(requestConfig, function (values, type) {
      _.forOwn(values, function (value, key) {
        flatten(requestVariables, type, key, value);
      });
    });

    if (cdn && cdn.url) {
      flatten(requestVariables, 'cdn', 'url', utils.render(cdn.url, requestVariables));
    }

    next(requestVariables);
  };

};
