'use strict';

function timeToMillis(timeString) {

	var matched = new RegExp('(\\d+)(.*)').exec(timeString),
		num = matched[1],
		period = matched[2] || 'ms',
		value = 0;

	switch(period) {
		case "ms":
			value = parseInt(num);
			break;
		case "s":
			value = parseInt(num)*1000;
			break;
		case "m":
			value = parseInt(num)*1000*60;
			break;
		case "h":
			value = parseInt(num)*1000*60*60;
			break;
		case "d":
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


module.exports = {
	timeToMillis: timeToMillis,
	urlToCacheKey: urlToCacheKey,
	cacheKeytoStatsd: cacheKeytoStatsd
};