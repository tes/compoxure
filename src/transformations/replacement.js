'use strict';

var request = require('request');
var _ = require('lodash');
var Supplant = require('supplant');
var subs = new Supplant();
var utils = require('../utils');
var Stream = require('stream').Stream;
var through = require('through');
var getThenCache = require('../getThenCache');

var errorTemplate = "<div style='color: red; font-weight: bold; font-family: monospace;'>Error: <%= err %></div>";

module.exports = transform;

function transform(config, cxConfig) {

	return {
		query: cxConfig.query,
		func: function(req, res, cache, eventHandler) {

			return function(node) {

                var throughStream = node.createWriteStream({outer:req.backend.replaceOuter ? true : false});
                var start = new Date();
                var content = '';
                var templateVars = _.clone(req.templateVars);
                var options = {};

                function hasConfig() {
                    return cxConfig.url;
                }

                var _fragmentName;
                options.explicitNoCache = false;

                if (hasConfig()) {

                    _fragmentName = subs.text(cxConfig.statsdKey || "");

                    options.declarative = false;
                    options.unparsedUrl = cxConfig.url;
                    options.url = subs.text(cxConfig.url, templateVars);
                    options.timeout = utils.timeToMillis(cxConfig.timeout || "1s");
                    options.cacheKey = subs.text(cxConfig.cacheKey || cxConfig.url, templateVars);
                    options.cacheTTL = utils.timeToMillis(cxConfig.cacheTTL || "1m");

                } else {

                    _fragmentName = subs.text(node.getAttribute('CX-STATSD-KEY') || "");

                    options.declarative = true;
                    options.unparsedUrl = node.getAttribute('CX-URL');
                    options.url = subs.text(node.getAttribute('CX-URL'), templateVars);
                    options.timeout = utils.timeToMillis(node.getAttribute('CX-TIMEOUT') || "1s");
                    options.cacheKey = subs.text(node.getAttribute('CX-CACHE-KEY') || node.getAttribute('CX-URL'), templateVars);
                    options.cacheTTL = utils.timeToMillis(node.getAttribute('CX-CACHE-TTL') || "1m");
                    options.explicitNoCache = node.getAttribute('CX-CACHE-KEY') === "true";
                }

                options.statsdKey = 'fragment.' + utils.cacheKeytoStatsd(_fragmentName || '__');

                var isUrl = /^https?:|^unix:/;
                if (!isUrl.test(options.url)) {
                    if(options.unparsedUrl !== 'cache') {
                        var _error = {message: "Invalid CX url: " + options.unparsedUrl};
                        return onError(_error);
                    }
                }

                options.type = 'fragment';
                options.cache = (options.cacheTTL > 0);
                options.headers = {
                    'cx-page-url': templateVars['param:pageUrl']
                };

                options.headers.cookie = req.headers.cookie;

                options.tracer = req.tracer;
                if (config.cdn) options.headers['x-cdn-host'] = config.cdn.host;

                getThenCache(options, cache, eventHandler, throughStream, onError);

                function onError(err, oldContent) {

                    var errorMsg;

                    if (err.statusCode === 404) {
                        res.writeHead(404, {"Content-Type": "text/html"});
                        errorMsg = _.template('Service <%= url %> cache <%= cacheKey %> returned 404.');
                        res.end(errorMsg(options));
                    } else {

                        if(!req.backend.quietFailure) {

                            var msg = _.template(errorTemplate);
                            throughStream.end(msg({ 'err': err.message }));

                        } else {
                            if(oldContent) {
                                throughStream.end(oldContent);
                                errorMsg = _.template('Service <%= url %> cache <%= cacheKey %> FAILED but serving STALE content.');
                                eventHandler.logger('error', errorMsg(options), {tracer:req.tracer});

                            } else {
                                throughStream.end("");
                            }
                        }

                        eventHandler.stats('increment', options.statsdKey + '.error');
                        var elapsed = (new Date() - req.timerStart), timing = (new Date() - start);
                        eventHandler.logger('error','%s FAILED in %s, elapsed %s.', options.url, timing, elapsed, {tracer:req.tracer});

                    }
                }
			};
		}
	};

}
