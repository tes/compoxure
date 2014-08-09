var htmlparser = require("htmlparser2");
var fs = require('fs');
var _ = require('lodash');
var Supplant = require('supplant');
var subs = new Supplant();
var utils = require('../utils');
var Stream = require('stream').Stream;
var through = require('through');
var getThenCache = require('../getThenCache');
var errorTemplate = "<div style='color: red; font-weight: bold; font-family: monospace;'>Error: <%= err %></div>";

module.exports = HtmlParserProxy;

function HtmlParserProxy(config, cache, eventHandler) {
    if (!(this instanceof HtmlParserProxy)) return new HtmlParserProxy(config, cache, eventHandler);
    this.config = config;
    this.cache = cache;
    this.eventHandler = eventHandler;
    return this;
};

HtmlParserProxy.prototype.middleware = function(req, res, next) {

        var self = this,
            output = [],
            outputIndex = 0,
            fragmentIndex = 0,
            fragmentOutput = [],
            nextTextDefault = false,
            skipClosingTag = false;

        output[outputIndex] = "";
        req.timerStart = new Date();

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
                 var timeoutStart = new Date(), timeout = req.backend.timeout || 5000;
                 function checkDone() {
                    var done = true, outputHTML = "";
                    for (var i = 0, len = fragmentOutput.length; i < len; i++) {
                        done = done && fragmentOutput[i].done;
                    }
                    if(done) {
                        for (var i = 0, len = output.length; i < len; i++) {
                            outputHTML += output[i];
                        }
                        var responseTime = (new Date() - req.timerStart);
                        self.eventHandler.logger('info', "Page composer response completed", {tracer: req.tracer,responseTime: responseTime});
                        self.eventHandler.stats('timing','responseTime',responseTime);
                        res.end(outputHTML);
                    } else {

                        if((new Date() - timeoutStart) > timeout) {
                            res.writeHead(500, {"Content-Type": "text/html"});
                            var errorMsg = _.template('Compoxure failed to respond in <%= timeout %>ms');
                            res.end(errorMsg({timeout:timeout}));
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
                start = new Date(),
                templateVars = _.clone(req.templateVars);

            options.unparsedUrl = node['cx-url'];
            options.url = subs.text(node['cx-url'], templateVars);
            options.timeout = utils.timeToMillis(node['cx-timeout'] || "1s");
            options.cacheKey = subs.text(node['cx-cache-key'] || node['cx-url'], templateVars);
            options.cacheTTL = utils.timeToMillis(node['cx-cache-ttl'] || "1m");
            options.explicitNoCache = node['cx-no-cache'] === "true";
            options.type = 'fragment';
            options.cache = (options.cacheTTL > 0);
            options.headers = {
                'cx-page-url': templateVars['param:pageUrl']
            };
            options.headers.cookie = req.headers.cookie;
            options.tracer = req.tracer;
            if (self.config.cdn) options.headers['x-cdn-host'] = self.config.cdn.host;
            var responseStream = {
                end: function(data) {
                    next(node, data);
                }
            };

            getThenCache(options, self.config, self.cache, self.eventHandler, responseStream, onErrorHandler);

            function onErrorHandler(err, oldContent) {

                var errorMsg;

                if (err.statusCode === 404) {
                    res.writeHead(404, {"Content-Type": "text/html"});
                    errorMsg = _.template('Service <%= url %> cache <%= cacheKey %> returned 404.');
                    res.end(errorMsg(options));
                } else {

                    if(!req.backend.quietFailure) {

                        var msg = _.template(errorTemplate);
                        responseStream.end(msg({ 'err': err.message }));

                    } else {
                        if(oldContent) {
                            responseStream.end(oldContent);
                            errorMsg = _.template('Service <%= url %> cache <%= cacheKey %> FAILED but serving STALE content.');
                            self.eventHandler.logger('error', errorMsg(options), {tracer:req.tracer});
                        } else {
                            responseStream.end(req.backend.leaveContentOnFail ? output[node.outputIndex] : "" );
                        }
                    }

                    self.eventHandler.stats('increment', options.statsdKey + '.error');
                    var elapsed = (new Date() - req.timerStart), timing = (new Date() - start);
                    errorMsg = _.template('<%= url %> FAILED in <%= timing%>, elapsed <%= elapsed %>.');
                    self.eventHandler.logger('error', errorMsg({url: options.url, timing: timing, elapsed: elapsed}), {tracer:req.tracer});

                }

            }

        }

        next();

}