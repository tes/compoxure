'use strict';

var _ = require('lodash');
var url = require('url');
var Hogan = require('hogan.js');

module.exports = function (config, cdn, environment, eventHandler) {

    config = config || { urls: [
        {pattern: '.*', names: []}
    ], servers: {} };

    cdn = cdn || {};
    environment = environment || {name: process.env.NODE_ENV || 'development'};

    var hoganCache = {};

    this.interrogateRequest = function (req, next) {

        var parsedUrl = url.parse(req.url, true);
        var templateParams = interrogatePath(parsedUrl.path);
        var queryParams = interrogateParams(parsedUrl.query);
        var pageUrl = getPageUrl(req, parsedUrl);
        var user = req.user || {userId: '_'};

        var requestVariables = {};

        var requestConfig = {
            param: _.extend(queryParams, templateParams),
            url: pageUrl,
            query: parsedUrl.query,
            cookie: req.cookies,
            header: req.headers,
            server: config.servers,
            env: environment,
            user: user
        };

        _.forOwn(requestConfig, function (values, type) {
            _.forOwn(values, function (value, key) {
                flatten(requestVariables, type, key, value);
            });
        });

        if(cdn) {
            flatten(requestVariables, 'cdn', 'url', render(cdn.url, requestVariables));
        }

        next(requestVariables);
    };

    function flatten(variables, type, key, value) {
        variables[type + ":" + key] = value;
        variables[type + ":" + key + ":encoded"] = encodeURIComponent(value);
    }

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

    function interrogateParams(params) {

        var parameters = {};
        _.forEach(config.query, function(query) {
            parameters[query.mapTo] = params[query.key];
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

        return url.parse(url.format(components),false);

    }

    function render(text, data) {
        var self = this;
        if(!hoganCache[text]) {
            hoganCache[text] = Hogan.compile(text);
        }
        return hoganCache[text].render(data);
    }

    function getPort(req) {
        var host = req.headers.http_host || req.headers.host;
        var res = host ? host.match(/:(\d+)/) : "";
        return res ? res[1] : req.connection.pair ? '443' : '80';
    }

};
