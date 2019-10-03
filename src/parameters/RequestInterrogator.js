'use strict';

var _ = require('lodash');
var url = require('url');
var Parser = require('device').Parser;
var utils = require('../utils');

module.exports = function (config, cdn, environment) {

  config = config || {
      urls: [
        { pattern: '.*', names: [] }
      ], servers: {}
    };

  if (config.urls) {
    config.urls = config.urls.map(function (url) {
      url.regexp = new RegExp(url.pattern);
      return url;
    });
  }

  if (config.urlGroups) {
    config.urlGroups = config.urlGroups.map(function (group) {
      group.regexp = new RegExp(group.pattern);
      return group;
    });
  }

  environment = { name: environment || process.env.NODE_ENV || 'development' };

  function flatten(variables, type, key, value) {
    variables[type + ':' + key] = value;
    variables[type + ':' + key + ':encoded'] = encodeURIComponent(value);
  }

  function interrogatePath(path) {
    var matches = _.map(config.urls, function (url) {
      var match = url.regexp.exec(path);
      if (!match) { return {}; }
      return _.zipObject(url.names, _.tail(match, 1));
    });

    var parameters = {};
    _.forEach(matches, function (match) {
      _.forEach(match, function (value, key) {
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

  function getUrlGroup(path) {
    return _.result(_.find(config.urlGroups || [], function(urlGroup) {
      return path.match(urlGroup.pattern);
    }), 'group') || 'none';
  }

  function getPageUrl(req, parsedUrl) {

    var components = {
      host: req.headers.http_host || req.headers.host,
      port: getPort(req),
      protocol: req.isSpdy ? 'https' : (req.connection.pair ? 'https' : 'http'),
      search: parsedUrl.search,
      pathname: parsedUrl.pathname
    };

    var structuredUrl = url.parse(url.format(components), false);
    structuredUrl.group = getUrlGroup(parsedUrl.pathname);
    return structuredUrl;

  }

  this.interrogateRequest = function (req, next) {

    var parsedUrl = url.parse(req.url, true);
    var templateParams = interrogatePath(parsedUrl.path);
    var queryParams = interrogateParams(parsedUrl.query);
    var pageUrl = getPageUrl(req, parsedUrl);
    var user = req.user || { userId: '_' };
    user.loggedIn = Boolean(req.user);

    var ua = req.headers['user-agent'] || '';
    var parser = new Parser(ua);
    var deviceType = parser.get_type();
    if (deviceType === 'bot') { deviceType = 'desktop'; } // Serve desktop versions to bots ?

    var requestVariables = {};

    var requestConfig = {
      param: _.assignIn(queryParams, templateParams),
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
