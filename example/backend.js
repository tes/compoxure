'use strict';

var connect = require('connect');
var cookieParser = require('cookie-parser');
var morgan = require('morgan');
var serveStatic = require('serve-static');
var HttpStatus = require('http-status-codes');

var server = connect();

server.use(cookieParser());
server.use(morgan('combined'));
server.use(serveStatic('example/static', {'index': ['index.html', 'index.htm']}));
server.use(function(req, res) {
	if(req.url == '/dynamic') {
		res.end("This is some dynamic comment: " + (new Date()));
	}
})

server.listen(5001, 'localhost', function(err) {
    console.log('Example backend server on http://localhost:5001');
});