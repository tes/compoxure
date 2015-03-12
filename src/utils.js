'use strict';

var _ = require('lodash');

function timeToMillis(timeString) {

	var matched = new RegExp('(\\d+)(.*)').exec(timeString),
		num = matched[1],
		period = matched[2] || 'ms',
		value = 0;

	switch(period) {
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

 function updateTemplateVariables(templateVars, variables) {

   _.each(_.filter(_.keys(variables), function(key) {
      if(key.indexOf('x-') >= 0) { return true; }
   }), function(cxKey) {

      var variable = variables[cxKey],
          strippedKey = cxKey.replace('x-',''),
          variableKey = strippedKey.split('|')[0],
          variableName = strippedKey.replace(variableKey + '|','');

      templateVars[variableKey + ':' + variableName] = variable;
      templateVars[variableKey + ':' + variableName + ':encoded'] = encodeURI(variable);
   });
   return templateVars;
 }

function filterCookies(whitelist, cookies) {
    return _.reduce(cookies, function(result, value, key) {
      if(whitelist.length === 0 || _.contains(whitelist, key)) {
        result += result ? '; ' : '';
        result += key + '=' + value;
      }
      return result;
    }, '');
}

module.exports = {
	timeToMillis: timeToMillis,
	urlToCacheKey: urlToCacheKey,
	cacheKeytoStatsd: cacheKeytoStatsd,
  render: require('parxer').render,
  updateTemplateVariables: updateTemplateVariables,
  filterCookies: filterCookies
};
