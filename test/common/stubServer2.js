'use strict';

var express = require('express');
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var http = require('http');
var fs = require('fs');
var uuid = require('node-uuid');

// This should probably be made its own project!
function initStubServer(fileName, port/*, hostname*/) {

  var app = express();

  app.use(cookieParser());
  app.use(bodyParser.urlencoded({ extended: true }));

  app.get('/', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/html", "x-guid": uuid.v1() });
    res.end('I am from the second stub server!');
  });

  return function (next) {
    app.listen(port).on('listening', next);
  };
}

module.exports = {
  init: initStubServer
};
