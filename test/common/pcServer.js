'use strict';

var cx = require('../../');
var config = require('./testConfig.json')
var connect = require('connect');
var cookieParser = require('cookie-parser');
var morgan = require('morgan');
var HttpStatus = require('http-status-codes');


function initPcServer(port, hostname, eventHandler) {

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
    config.environment = 'test';

    var compoxureMiddleware = cx(config, eventHandler);

    var server = connect();

    server.use(cookieParser());
    server.use(compoxureMiddleware);

    return function(next) {
        server.listen(port, hostname).on('listening',next)
    }

}

module.exports = {
    init: initPcServer
}
