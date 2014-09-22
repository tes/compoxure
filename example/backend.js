'use strict';

var connect = require('connect');
var cookieParser = require('cookie-parser');
var morgan = require('morgan');
var serveStatic = require('serve-static');
var bodyParser = require('body-parser');
var HttpStatus = require('http-status-codes');
var connectRoute = require('connect-route');

var server = connect();

server.use(cookieParser());

if(process.env.logging !== 'false') server.use(morgan('combined'));

server.use(serveStatic('example/static', {'index': ['index.html', 'index.htm']}));
server.use(bodyParser.urlencoded({ extended: false }))

server.use(connectRoute(function (router) {

    router.get('/dynamic', function(req, res) {
		res.writeHead(200, {"Content-Type": "text/html"});
    	res.end("This is some dynamic comment: " + (new Date()));
    });

    router.get('/500', function(req, res) {
    	res.writeHead(500);
		res.end("This is an error.");
    });

    router.get('/faulty', function(req, res) {
    	setTimeout(function() {
            if(Math.random() > 0.5) {
                res.writeHead(200, {"Content-Type": "text/html"});
                res.end("Faulty service managed to serve good content!");
            } else {
                res.writeHead(500, {"Content-Type": "text/html"});
                res.end("Faulty service broken");
            }
        },100);
    });

  	router.get('/slow', function(req, res) {
    	setTimeout(function() {
			res.end("This is a slow service");
		},200);
    });

    router.post('/post', function(req, res) {
    	res.writeHead(200, {"Content-Type": "text/html"});
    	res.end("POST Data: " + req.body.test + "<br/><pre>" + JSON.stringify(req.headers) + "</pre>");
    });

    router.put('/put', function(req, res) {
    	res.writeHead(200, {"Content-Type": "text/html"});
    	res.end("PUT Data: " + req.body.test + "<br/><pre>" + JSON.stringify(req.headers) + "</pre>");
    });
}));

server.listen(5001, 'localhost', function(err) {
    console.log('Example backend server on http://localhost:5001');
});