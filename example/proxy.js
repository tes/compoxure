'use strict';

var cx = require('../');
var config = require('./config.json')
var connect = require('connect');
var cookieParser = require('cookie-parser');
var query = require('connect-query');
var morgan = require('morgan');

require('./memory');

function createEventHandler() {
    return {
        logger: function(level, message) {
            if(process.env.logging !== 'false') { console.log('LOG ' + level + ': ' + message); }
        },
        stats: function(type, key, value) {
            if(process.env.logging !== 'false') { console.log('STAT ' + type + ' for ' + key + ' | ' + value); }
        }
    }
}
var cxEventHandler = createEventHandler();

config.functions = {
	'selectGoogle': function(req, variables) {
		if(variables['query:google']) { return true; }
	},
    'handle403': function(req, res, variables, data) {
        if (res.headersSent) { return; } // too late to redirect
        res.writeHead(403, {'Content-Type': 'text/html'});
        res.end('CX says no, redirect to: ' + data.redirect + ' , return here: ' + variables['url:href']);
    }
}
config.environment = process.env.NODE_ENV || 'development';
config.minified = config.environment !== 'development';

var compoxureMiddleware = cx(config, cxEventHandler);

var server = connect();
server.use(cookieParser());
server.use(query());
if(process.env.logging !== 'false') { server.use(morgan('combined')); }
server.use(compoxureMiddleware);

server.listen(5000, 'localhost', function() {
    console.log('Example compoxure server on http://localhost:5000');
});


