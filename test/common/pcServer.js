'use strict';

var cx = require('../../');
var config = require('./testConfig.json')
var connect = require('connect');
var cookieParser = require('cookie-parser');
var morgan = require('morgan');
var HttpStatus = require('http-status-codes');


function initPcServer(port, hostname) {

    // Define functions
    config.functions = {
        'selectFnTest': function(req, variables) {
            if(variables['query:selectFn']) { return true; }
        },
        'handle403': function(req, res, variables, data) {
            res.writeHead(403, {'Content-Type': 'text/html'});
            res.end('CX says no.');
        }
    }

    var compoxureMiddleware = cx(config, createEventHandler());

    var server = connect();

    server.use(cookieParser());
    server.use(compoxureMiddleware);

    return function(next) {
        server.listen(port, hostname).on('listening',next)
    }

}

function createEventHandler() {
	return {
		logger: function(level, message, data) {
		},
		stats: function(type, key, value) {
		}
	}
}

module.exports = {
    init: initPcServer
}
