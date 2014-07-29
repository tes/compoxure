'use strict';

var cx = require('../');
var config = require('./config.json')
var connect = require('connect');
var cookieParser = require('cookie-parser');
var morgan = require('morgan');
var HttpStatus = require('http-status-codes');

var cxEventHandler = createEventHandler();
var compoxureMiddleware = cx(config, cxEventHandler);

var server = connect();
server.use(cookieParser());
server.use(morgan('combined'));
server.use(compoxureMiddleware);

server.listen(5000, 'localhost', function(err) {
    console.log('Example compoxure server on http://localhost:5000');
});

function createEventHandler() {
	return {
		logger: function(level, message, data) {
			console.log('LOG ' + level + ': ' + message);
		},
		stats: function(type, key, value) {
			console.log('STAT ' + type + ' for ' + key + ' | ' + value);
		}
	}
}