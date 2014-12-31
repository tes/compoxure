'use strict';

var cx = require('../../');
var connect = require('connect');
var cookieParser = require('cookie-parser');

function initPcServer(port, hostname, eventHandler, configFile) {

    var config = require('./' + (configFile || 'testConfig') + '.json');

    // Define functions
    config.functions = {
        'selectFnTest': function(req, variables) {
            if(variables['query:selectFn']) { return true; }
        },
        'handle403': function(req, res, variables, data, options, err) {
            res.writeHead(403, {'Content-Type': 'text/html'});
            res.end('CX says no.');
        },
        'handle302': function(req, res, variables, data, options, err) {
            res.writeHead(err.statusCode, {location: err.headers.location});
            res.end('');
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
