'use strict';

var _ = require('lodash');
var url = require('url');

module.exports = function (config, cdn, environment, eventHandler) {

    config = config || { urls: [
        {pattern: '.*', names: []}
    ], servers: {} };

    cdn = cdn || {};
    environment = environment || {name: process.env.NODE_ENV || 'development'};

    this.interrogateRequest = function (req, next) {
        
        var parsedUrl = url.parse(req.url, true);
        var params = interrogatePath(parsedUrl.path);
        params.pageUrl = getPageUrl(req, parsedUrl);
        var user = req.user || {userId: '_'};

        var requestVariables = {};

        var requestConfig = {
            param: params,
            url: url.parse(params.pageUrl, false),
            query: parsedUrl.query,
            cookie: req.cookies,
            header: req.headers,
            server: config.servers,
            cdn: cdn,
            env: environment, 
            user: user
        };

        _.forOwn(requestConfig, function (values, type) {
            _.forOwn(values, function (value, key) {
                requestVariables[type + ":" + key] = value;
                requestVariables[type + ":" + key + ":encoded"] = encodeURIComponent(value);
            });
        });

        next(requestVariables);
    };

    function interrogatePath(path) {

        var matches = _.map(config.urls, function (url) {
            var regexp = new RegExp(url.pattern);
            var match = regexp.exec(path);
            if (!match) return {};
            return _.object(url.names, _.rest(match, 1));
        });

        var parameters = {};
        _.each(matches, function (match) {
            _.each(match, function (value, key) {
                parameters[key] = value;
            });
        });

        return parameters;
    }

    function getPageUrl(req, parsedUrl) {

        var components = {
            host: req.headers.http_host || req.headers.host,
            port: getPort(req),
            protocol: req.isSpdy ? 'https' : (req.connection.pair ? 'https' : 'http'),
            search: parsedUrl.search,
            pathname: parsedUrl.pathname
        };

        return url.format(components);
    }

    function getPort(req) {
        var host = req.headers.http_host || req.headers.host;
        var res = host ? host.match(/:(\d+)/) : "";
        return res ? res[1] : req.connection.pair ? '443' : '80';
    }

};
