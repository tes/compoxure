'use strict';

var _ = require('lodash');

function timeToMillis(timeString) {

  var matched = new RegExp('(\\d+)(.*)').exec(timeString),
    num = matched[1],
    period = matched[2] || 'ms',
    value = 0;

  switch (period) {
  case 's':
    value = parseInt(num) * 1000;
    break;
  case 'm':
    value = parseInt(num) * 1000 * 60;
    break;
  case 'h':
    value = parseInt(num) * 1000 * 60 * 60;
    break;
  case 'd':
    value = parseInt(num) * 1000 * 60 * 60 * 24;
    break;
  default:
    value = parseInt(num);
  }

  return value;

}

function cacheKeytoStatsd(key) {
  key = key.replace(/\./g, '_');
  key = key.replace(/-/g, '_');
  key = key.replace(/:/g, '_');
  key = key.replace(/\//g, '_');
  return key;
}

function urlToCacheKey(url) {
  url = url.replace('http://', '');
  url = cacheKeytoStatsd(url);
  return url;
}

function formatTemplateVariables(variables) {
  return _.reduce(variables, function (result, variable, cxKey) {
    if (cxKey.indexOf('x-') === -1) {
      return result;
    }

    var strippedKey = cxKey.replace('x-', '');
    var variableKey = strippedKey.split('|')[0];
    var variableName = strippedKey.replace(variableKey + '|', '');

    result[variableKey + ':' + variableName] = variable;
    result[variableKey + ':' + variableName + ':encoded'] = encodeURI(variable);

    return result;
  }, {});
}

function filterCookies(whitelist, cookies) {
  return _.reduce(cookies, function (result, value, key) {
    if (whitelist.length === 0 || _.contains(whitelist, key)) {
      result += result ? '; ' : '';
      result += key + '=' + value;
    }
    return result;
  }, '');
}

function getBackendConfig(config, url, req) {
  return _.find(config.backend, function (server) {
    // Then try to match based on pattern in backend Config
    if (server.pattern) {
      return [].concat(server.pattern).some(function (pattern) {
        return new RegExp(pattern).test(url);
      });
    }
    // Finally try to match based on lookup function in backend Config
    if (req && server.fn) { // for layout config I am not passing req !
      if (typeof config.functions[server.fn] == 'function') {
        return config.functions[server.fn](req, req.templateVars, server);
      }
    }
  });
}

module.exports = {
  timeToMillis: timeToMillis,
  urlToCacheKey: urlToCacheKey,
  cacheKeytoStatsd: cacheKeytoStatsd,
  render: require('parxer').render,
  formatTemplateVariables: formatTemplateVariables,
  filterCookies: filterCookies,
  getBackendConfig: getBackendConfig,
};
