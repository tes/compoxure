var htmlparser = require("htmlparser2");
var _ = require('lodash');
var Hogan = require('hogan.js');
var utils = require('../utils');
var DebugMode = require('../DebugMode');
var getThenCache = require('../getThenCache');
var errorTemplate = "<div style='color: red; font-weight: bold; font-family: monospace;'>Error: <%= err %></div>";

module.exports = HtmlParserProxy;

function HtmlParserProxy(config, cache, eventHandler) {
    if (!(this instanceof HtmlParserProxy)) return new HtmlParserProxy(config, cache, eventHandler);
    this.config = config;
    this.cache = cache;
    this.eventHandler = eventHandler;
    this.hoganCache = {};
    return this;
}

HtmlParserProxy.prototype.render = function(text, data) {
    var self = this;
    if(!this.hoganCache[text]) {
        this.hoganCache[text] = Hogan.compile(text);
    }
    return this.hoganCache[text].render(data);
};

HtmlParserProxy.prototype.middleware = function(req, res, next) {

        var self = this,
            output = [],
            outputIndex = 0,
            fragmentIndex = 0,
            fragmentOutput = [],
            nextTextDefault = false,
            skipClosingTag = false,
            debugMode = {add: function() {}};

        // Only load the debug handler if in debug mode
        if(req.templateVars['query:cx-debug']) debugMode = new DebugMode;

        output[outputIndex] = "";
        req.timerStart = Date.now();

        res.transformer = {
            end: function(data) {
                parser.end(data);
            }
        };

        var parser = new htmlparser.Parser({
            onopentag: function(tagname, attribs) {
                if(attribs && attribs['cx-url']) {

                    if(attribs['cx-replace-outer']) {
                        skipClosingTag = true;
                    } else {
                        output[outputIndex] += utils.createTag(tagname, attribs);
                    }
                    outputIndex ++;

                    output[outputIndex] = "_processing_";
                    fragmentOutput[fragmentIndex] = attribs;
                    fragmentOutput[fragmentIndex].outputIndex = outputIndex;
                    fragmentOutput[fragmentIndex].fragmentIndex = fragmentIndex;
                    nextTextDefault = true;

                    getCx(fragmentOutput[fragmentIndex], function(fragment, response) {
                        output[fragment.outputIndex] = response;
                        fragment.done = true;
                    });

                    outputIndex ++;
                    fragmentIndex ++;
                    output[outputIndex] = "";

                } else if(attribs && attribs['cx-test']) {
                    output[outputIndex] += utils.createTag(tagname, attribs);
                    output[outputIndex] += self.render(attribs['cx-test'], req.templateVars);
                } else {
                    output[outputIndex] += utils.createTag(tagname, attribs);
                }
            },
            onprocessinginstruction: function(name, data) {
                output[outputIndex] += "<" + data + ">";
            },
            ontext:function(data) {
                if(nextTextDefault) {
                    // Set Default value - provided it hasn't already been set
                    // When using memory cache it could actually retrieve a value
                    // Faster than the ontext event fired from this library
                    nextTextDefault = false;
                    if(output[outputIndex-1] == "_processing_") output[outputIndex-1] = data;
                } else {
                    output[outputIndex] += data;
                }
            },
            oncomment: function(data) {
                output[outputIndex] += "<!-- " + data
            },
            oncommentend: function() {
                output[outputIndex] += " -->"
            },
            onclosetag: function(tagname){
                if(nextTextDefault) nextTextDefault = false;
                if(skipClosingTag) {
                    skipClosingTag = false;
                    return;
                }
                output[outputIndex] += "</" + tagname + ">";
            },
            onend: function(){
                 var timeoutStart = Date.now(), timeout = utils.timeToMillis(req.backend.timeout || "5s");
                 function checkDone() {
                    var done = true, outputHTML = "";
                    for (var i = 0, len = fragmentOutput.length; i < len; i++) {
                        done = done && fragmentOutput[i].done;
                    }
                    if(done) {
                        var responseTime = Date.now() - req.timerStart;
                        for (var i = 0, len = output.length; i < len; i++) {
                            outputHTML += output[i];
                        }
                        if(req.templateVars['query:cx-debug']) outputHTML += debugMode.render();
                        self.eventHandler.logger('info', "Page composer response completed", {tracer: req.tracer,responseTime: responseTime});
                        self.eventHandler.stats('timing','responseTime',responseTime);
                        res.end(outputHTML);
                    } else {

                        if((Date.now() - timeoutStart) > timeout) {
                            res.writeHead(500, {"Content-Type": "text/html"});
                            var errorMsg = 'Compoxure failed to respond in <%= timeout %>ms. Failed to respond: ';
                            for (var i = 0, len = fragmentOutput.length; i < len; i++) {
                                if(!fragmentOutput[i].done) {
                                    errorMsg += ' ' + self.render(fragmentOutput[i]['cx-url'], req.templateVars) + '.';
                                }
                            }
                            res.end(_.template(errorMsg)({timeout:timeout}));
                        } else {
                            setTimeout(checkDone,1);
                        }
                    }
                 }
                 checkDone();
            },
            recognizeSelfClosing: true
         });

        function getCx(node, next) {

            var options = {},
                start = Date.now(),
                templateVars = _.clone(req.templateVars);

            options.unparsedUrl = node['cx-url'];
            options.url = self.render(node['cx-url'], templateVars);
            options.timeout = utils.timeToMillis(node['cx-timeout'] || "1s");
            options.cacheKey = self.render(node['cx-cache-key'] || node['cx-url'], templateVars);
            options.cacheTTL = utils.timeToMillis(node['cx-cache-ttl'] || "1m");
            options.explicitNoCache = node['cx-no-cache'] ? self.render(node['cx-no-cache'], templateVars) === "true" : false;
            options.ignore404 = node['cx-ignore-404'] === "true";
            options.type = 'fragment';
            options.cache = (options.cacheTTL > 0);
            options.headers = {
                'cx-page-url': templateVars['url:href'],
                'x-tracer': req.tracer
            };
            if (req.headers.cookie) options.headers.cookie = req.headers.cookie;
            options.tracer = req.tracer;
            options.statsdKey = 'fragment_' + (node['cx-statsd-key'] || 'unknown');

            if (self.config.cdn) {
                if(self.config.cdn.host) options.headers['x-cdn-host'] = self.config.cdn.host;
                if(self.config.cdn.url) options.headers['x-cdn-url'] = self.config.cdn.url;
            }

            var responseStream = {
                end: function(data) {
                    next(node, data);
                }
            };

            getThenCache(options, debugMode, self.config, self.cache, self.eventHandler, responseStream, onErrorHandler);

            function onErrorHandler(err, oldContent) {

                var errorMsg;

                if (err.statusCode === 404 && !options.ignore404) {
                    res.writeHead(404, {"Content-Type": "text/html"});
                    errorMsg = _.template('404 Service <%= url %> cache <%= cacheKey %> returned 404.');
                    debugMode.add(options.unparsedUrl, {status: 'ERROR', httpStatus: 404, timing: timing});
                    self.eventHandler.logger('error', errorMsg({url: options.url, cacheKey: options.cacheKey}), {tracer:req.tracer});
                    res.end(errorMsg(options));
                } else {

                    if(!req.backend.quietFailure) {

                        var msg = _.template(errorTemplate);
                        debugMode.add(options.unparsedUrl, {status: 'ERROR', httpStatus: err.statusCode, timing: timing });
                        responseStream.end(msg({ 'err': err.message }));

                    } else {
                        if(oldContent) {
                            responseStream.end(oldContent);
                            debugMode.add(options.unparsedUrl, {status: 'ERROR', httpStatus: err.statusCode, staleContent: true, timing: timing });
                            errorMsg = _.template('STALE <%= url %> cache <%= cacheKey %> failed but serving stale content.');
                            self.eventHandler.logger('error', errorMsg(options), {tracer:req.tracer});
                        } else {
                            debugMode.add(options.unparsedUrl, {status: 'ERROR', httpStatus: err.statusCode, defaultContent: true, timing: timing });
                            responseStream.end(req.backend.leaveContentOnFail ? output[node.outputIndex] : "" );
                        }
                    }

                    self.eventHandler.stats('increment', options.statsdKey + '.error');
                    var elapsed = Date.now() - req.timerStart, timing = Date.now() - start;
                    errorMsg = _.template('FAIL <%= url %> did not respond in <%= timing%>, elapsed <%= elapsed %>. Reason: ' + err.message);
                    self.eventHandler.logger('error', errorMsg({url: options.url, timing: timing, elapsed: elapsed}), {tracer:req.tracer});

                }

            }

        }

        next();

};
