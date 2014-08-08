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
            eventHandler = self.eventHandler,
            cache = self.cache,
            config = self.config,
            start = new Date(),
            output = {},
            outputIndex = 0,
            cxOutput = {},
            data = "",
            nextTextDefault = false,
            skipClosingTag = false,
            templateVars = _.clone(req.templateVars);

        output[outputIndex] = "";
        req.timerStart = new Date();

        function createTag(tagname, attribs) {
            var attribArray = [];
            _.forIn(attribs, function(value, key) {
                attribArray.push(key + "=\"" + value + "\" ");
            });
            return ["<",tagname," "].concat(attribArray).concat([">"]).join("");
        }

        res.transformer = {
            end: function(data) {
                parser.write(data);
                parser.end();
            }
        };

        var parser = new htmlparser.Parser({
            onopentag: function(tagname, attribs){
                if(attribs && attribs['cx-url']) {
                    if(attribs['cx-replace-outer']) {
                        skipClosingTag = true;
                    } else {
                        output[outputIndex] += createTag(tagname, attribs);
                    }
                    outputIndex ++;

                    output[outputIndex] = attribs['cx-url'];
                    cxOutput[outputIndex] = attribs;
                    nextTextDefault = true;

                    getCx(outputIndex);

                    outputIndex ++;
                    output[outputIndex] = "";

                } else {
                    output[outputIndex] += createTag(tagname, attribs);
                }
            },
            onprocessinginstruction: function(name, data) {
                output[outputIndex] += "<" + data + ">";
            },
            ontext:function(data) {
                if(nextTextDefault) {
                    nextTextDefault = false;
                    output[outputIndex-1] = data;
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
                 function checkDone() {
                     var done = true, outputHTML = "";
                     _.transform(cxOutput, function(result, value, key) {
                        done = done && value.done;
                    });
                    if(done) {
                         _.forIn(output, function(value, key) { outputHTML += value });
                        var responseTime = (new Date() - req.timerStart);
                        self.eventHandler.logger('info', "Page composer response completed", {tracer: req.tracer,responseTime: responseTime});
                        self.eventHandler.stats('timing','responseTime',responseTime);
                        res.end(outputHTML);
                        //console.log('DONE IN ' + (new Date() - start));
                    } else {
                        setImmediate(checkDone);
                    }
                 }
                 checkDone();
            },
            recognizeSelfClosing: true
         });

        function getCx(index) {

            var options = {};
            options.unparsedUrl = cxOutput[index]['cx-url'];
            options.url = subs.text(cxOutput[index]['cx-url'], templateVars);
            options.timeout = utils.timeToMillis(cxOutput[index]['cx-timeout'] || "1s");
            options.cacheKey = subs.text(cxOutput[index]['cx-cache-key'] || cxOutput[index]['cx-url'], templateVars);
            options.cacheTTL = utils.timeToMillis(cxOutput[index]['cx-cache-ttl'] || "1m");
            options.explicitNoCache = cxOutput[index]['cx-no-cache'] === "true";
            options.type = 'fragment';
            options.cache = (options.cacheTTL > 0);
            options.headers = {
                'cx-page-url': templateVars['param:pageUrl']
            };
            options.headers.cookie = req.headers.cookie;
            options.tracer = req.tracer;

            if (config.cdn) options.headers['x-cdn-host'] = config.cdn.host;

            var responseStream = {
                end: function(data) {
                    output[index] = data;
                    cxOutput[index].done = true;
                }
            };

            getThenCache(options, cache, eventHandler, responseStream, onErrorHandler);

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
                            eventHandler.logger('error', errorMsg(options), {tracer:req.tracer});
                        } else {
                            responseStream.end(req.backend.leaveContentOnFail ? output[index] : "" );
                        }
                    }

                    eventHandler.stats('increment', options.statsdKey + '.error');
                    var elapsed = (new Date() - req.timerStart), timing = (new Date() - start);
                    errorMsg = _.template('<%= url %> FAILED in <%= timing%>, elapsed <%= elapsed %>.');
                    eventHandler.logger('error', errorMsg({url: options.url, timing: timing, elapsed: elapsed}), {tracer:req.tracer});

                }

            }

        }

        next();

}