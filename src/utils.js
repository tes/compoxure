'use strict';

var _ = require('lodash');
var url = require('url');

function timeToMillis(timeString) {

	var matched = new RegExp('(\\d+)(.*)').exec(timeString),
		num = matched[1],
		period = matched[2] || 'ms',
		value = 0;

	switch(period) {
		case 'ms':
			value = parseInt(num);
			break;
		case 's':
			value = parseInt(num)*1000;
			break;
		case 'm':
			value = parseInt(num)*1000*60;
			break;
		case 'h':
			value = parseInt(num)*1000*60*60;
			break;
		case 'd':
			value = parseInt(num)*1000*60*60*24;
			break;
		default:
			value = parseInt(num);
	}

	return value;

}

function cacheKeytoStatsd(key) {
	key = key.replace(/\./g,'_');
	key = key.replace(/-/g,'_');
	key = key.replace(/:/g,'_');
	key = key.replace(/\//g,'_');
	return key;
}

function urlToCacheKey(url) {
	url = url.replace('http://','');
	url = cacheKeytoStatsd(url);
	return url;
}

function createTag(tagname, attribs) {
    var attribArray = [], attribLength = attribs.length, attribCounter = 0;
    _.forIn(attribs, function(value, key) {
        attribCounter++;
        attribArray.push(' ' + key + '=\'' + value + '\'');
    });
    return ['<',tagname,(attribLength > 0 ? ' ' : '')].concat(attribArray).concat(['>']).join('');
}

function parseRedisConnectionString(connectionString) {
    var params = url.parse(connectionString, true);
    return {
        host: params.hostname,
        port: params.port && parseInt(params.port) || 6379,
        db: params.query.db && parseInt(params.query.db) || 0
    };
}

 function updateTemplateVariables(templateVars, variables) {
   _.each(_.filter(_.keys(variables), function(key) {
      if(key.indexOf('cx-') >= 0) { return true; }
   }), function(cxKey) {
      var variable = variables[cxKey],
          strippedKey = cxKey.replace('cx-',''),
          variableKey = strippedKey.split('|')[0],
          variableName = strippedKey.split('|')[1];
      templateVars[variableKey + ':' + variableName] = variable;
      templateVars[variableKey + ':' + variableName + ':encoded'] = encodeURI(variable);
   });
   return templateVars;
 }

module.exports = {
	timeToMillis: timeToMillis,
	urlToCacheKey: urlToCacheKey,
	cacheKeytoStatsd: cacheKeytoStatsd,
	createTag: createTag,
	parseRedisConnectionString: parseRedisConnectionString,
  updateTemplateVariables: updateTemplateVariables
};
