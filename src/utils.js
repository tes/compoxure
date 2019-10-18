'use strict';

var _ = require('lodash');
var url = require('url');
var crypto = require('crypto');

var _RX_TIME_EXT_P = new RegExp('[^0-9]+$');
function timeToMillis(timeString) {
  var matched = _RX_TIME_EXT_P.exec(timeString),
      num = timeString,
      period = 'ms';

  if (matched !== null) {
    num = timeString.substr(0, timeString.length - matched[0].length);
    period = matched[0];
  }

  switch (period) {
  case 's':
    return Number(num) * 1000;
  case 'm':
    return Number(num) * 1000 * 60;
  case 'h':
    return Number(num) * 1000 * 60 * 60;
  case 'd':
    return Number(num) * 1000 * 60 * 60 * 24;
  default:
    return Number(num);
  }
}

function getServiceNameFromUrl(inputUrl) {
  if (!url) { return 'unknown'; }
  var hostname = url.parse(inputUrl).hostname;
  return hostname && hostname.split('.')[0] || 'unknown';
}

var _RX_KEY_STATSD = new RegExp('[\.:\/-]', 'g');
function cacheKeytoStatsd(key) {
  return key.replace(_RX_KEY_STATSD, '_');
}

function urlToCacheKey(url) {
  url = url.replace('http://', '');
  return cacheKeytoStatsd(url);
}

var tagMatch = /^c?x-/;
function formatTemplateVariables(variables) {
  return _.reduce(variables, function (result, variable, cxKey) {
    if (!(cxKey.match(tagMatch))) {
      return result;
    }

    var strippedKey = cxKey.substring(cxKey.indexOf('-') + 1);
    var pipeIdx = strippedKey.indexOf('|');
    var variableKey = strippedKey.substring(0, pipeIdx);
    var variableName = strippedKey.substring(pipeIdx + 1);

    result[variableKey + ':' + variableName] = variable;
    result[variableKey + ':' + variableName + ':encoded'] = encodeURI(variable);

    return result;
  }, {});
}

function filterCookies(whitelist, cookies) {
  return _.reduce(cookies, function (result, value, key) {
    if (whitelist.length === 0 || _.includes(whitelist, key)) {
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

function renderLogEntry(debugLogEntry){
  return 'console.log(\'' + debugLogEntry  + '\')';
}

function renderScriptClientDebugLogEntry(req){
  return '<script>' + (req.clientDebugLogEntry || []).map(renderLogEntry).join(';') + '</script>';
}

function addClientDebugLogEntry(req, message){
  if(isDebugEnabled(req)){
    req.clientDebugLogEntry = req.clientDebugLogEntry || [];
    req.clientDebugLogEntry.push(message);
  }
}

function calculateEtag (content) {
  return crypto
    .createHash('sha1')
    .update(content, 'utf8')
    .digest('base64')
    .substring(0, 27);
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
  addClientDebugLogEntry: addClientDebugLogEntry,
  renderScriptClientDebugLogEntry: renderScriptClientDebugLogEntry,
  calculateEtag: calculateEtag,
};
