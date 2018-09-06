'use strict';

var _ = require('lodash');
var url = require('url');

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

function getServiceNameFromUrl(inputUrl) {
  if (!url) { return 'unknown'; }
  var hostname = url.parse(inputUrl).hostname;
  return hostname && hostname.split('.')[0] || 'unknown';
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

function getServerTimingName(name, response) {
  var flags = [];
  if (response.stale) {
    flags.push('stale');
  }
  if (response.cached) {
    flags.push('cached');
  }
  if (response.deduped) {
    flags.push('deduped');
  }
  return flags.length ? name + ' (' + flags.join(' ,') + ')': name;
}

function appendServerTimings(res, name, description, ms) {
  var headerStr = res.getHeader('Server-Timing');
  var header = headerStr ? headerStr.split(',') : [];
  header.push('cx-' + name + ';desc="' + description + '"; dur=' + ms);
  res.setHeader('Server-Timing', header.join(',') );
}

function isDebugEnabled(req) {
  return req.query && req.query['cx-debug'];
}

function isNoCacheEnabled(req) {
  return req.query && req.query['cx-no-cache'];
}

var debugScriptTag = _.template('<script type="cx-debug-<%- type %>" data-cx-<%- type %>-id="<%- id %>"><%= data && JSON.stringify(data) %></script>');

function delimitContent(content, response, options, logEvents, fragmentType, fragmentId) {
  var id = _.uniqueId();
  var data = { type: fragmentType, options: options, status: response.statusCode, timing: response.realTiming, logEvents: logEvents };
  if (fragmentId) {
    data.id = fragmentId;
  }
  var openTag = debugScriptTag({ data: data, id: id, type: 'open' });
  var closeTag = debugScriptTag({ data: null, id: id, type: 'close' });
  return openTag + content + closeTag;
}

function attachEventLogger(opts) {
  var logEvents = [];
  opts.onLog = function (evt, payload, ts) {
    logEvents.push({evt: evt, ts: ts});
  }
  return logEvents;
}

module.exports = {
  timeToMillis: timeToMillis,
  urlToCacheKey: urlToCacheKey,
  cacheKeytoStatsd: cacheKeytoStatsd,
  render: require('parxer').render,
  formatTemplateVariables: formatTemplateVariables,
  filterCookies: filterCookies,
  getBackendConfig: getBackendConfig,
  getServiceNameFromUrl: getServiceNameFromUrl,
  appendServerTimings: appendServerTimings,
  getServerTimingName: getServerTimingName,
  isDebugEnabled: isDebugEnabled,
  isNoCacheEnabled: isNoCacheEnabled,
  delimitContent: delimitContent,
  attachEventLogger: attachEventLogger,
};
