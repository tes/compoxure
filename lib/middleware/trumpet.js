'use strict';

var trumpet = require('trumpet');
var fs = require('fs');
var path = require('path');
var _ = require('lodash');
var through = require('through');

module.exports = TrumpetProxy;

function TrumpetProxy(config, cache, eventHandler) {

    if (!(this instanceof TrumpetProxy)) return new TrumpetProxy(config, eventHandler);

    this.transformations = {};
    this.config = config;
    this.cache = cache;
    this.eventhandler = eventHandler;

    var transformConfig = {};
	if(config.backend) {
    	(config.backend).forEach(function(server) {
    		if(server.transformations) transformConfig[server.target] = server.transformations;
    	});
    }
	transformConfig.global = config.transformations;
    this.loadTransformations(transformConfig);

    this.eventHandler = eventHandler;
    return this;

}

TrumpetProxy.prototype.add = function(type, transformationName, transformation) {
	this.transformations[type] = this.transformations[type] || {};
	this.transformations[type][transformationName] = transformation;
};

TrumpetProxy.prototype.loadTransformations = function(transformConfig) {

    var self = this;
    _.each(transformConfig, function(transformConfigType, key) {
	    _.each(transformConfigType, function(transformationConfig, transformationName) {
	        var library = path.join(__dirname, '..', 'transformations', transformationConfig.type);
	        var transformation = require(library)(self.config, transformationConfig);
	        self.add(key, transformationName, transformation);
	    });
	});
};

TrumpetProxy.prototype.middleware = function(req, res, next) {

	var self = this;
	req.timerStart = new Date();

	if (self.transformations) {

		var tr = trumpet();

		var transformations = _.extend(self.transformations.global, self.transformations[req.backend.target] || {});

		_.forOwn(transformations, function(transformation, transformationName) {
			tr.selectAll(transformation.query, transformation.func(req, res, self.cache, self.eventHandler));
		});

		res.trumpet = tr;

		var bufferedResponse = "";

		tr.on('data', function(data) {
			if(!req.dataStart) req.dataStart = new Date();
			bufferedResponse = bufferedResponse + data.toString();
		});

		tr.on('end', function () {
			var responseTime = (new Date() - req.timerStart);
			var dataTime = (new Date() - req.dataStart);
            res.end(bufferedResponse);
			//self.logger.info("Page composer response completed", {tracer: req.tracer,responseTime: responseTime, dataTime: dataTime});
			//self.logger.statsd.timing('PC','responseTime',responseTime);
		});

	}

	next();
};