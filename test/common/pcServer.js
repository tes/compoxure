'use strict';

var cx = require('../../');
var config = require('./testConfig.json')
var connect = require('connect');
var cookieParser = require('cookie-parser');
var morgan = require('morgan');
var HttpStatus = require('http-status-codes');


function initPcServer(port, hostname) {

    var compoxureMiddleware = cx(config);

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