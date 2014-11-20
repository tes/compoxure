'use strict';

var connect = require('connect');
var connectRoute = require('connect-route');
var cookieParser = require('cookie-parser');
var http = require('http');
var fs = require('fs');
var uuid = require('node-uuid');
var stubServer = {};

// This should probably be made its own project!
function initStubServer(fileName, port, hostname) {

    var app = connect();

    app.use(cookieParser());

    app.use(connectRoute(function (router) {
        router.get('/replaced', function(req, res) {
            res.writeHead(200, {"Content-Type": "text/html"});
            res.end('Replaced');
        });

        router.get('/uuid', function(req, res) {
            res.writeHead(200, {"Content-Type": "text/html", "cx-static|bundle": "100"});
            res.end(uuid.v1());
        });

        router.get('/user/:user?', function(req, res) {
            res.writeHead(200, {"Content-Type": "text/html"});
            res.end("User: " + req.params.user || 'Unknown user');
        });

        router.get('/', function(req, res) {
            res.writeHead(200, {"Content-Type": "text/html"});
            var backendHtml = fs.readFileSync('./test/common/' + fileName, { encoding: 'utf8' });
            res.end(backendHtml);
        });

        router.get('/delayed', function(req, res) {
            setTimeout(function() {
                res.writeHead(200, {"Content-Type": "text/html"});
                res.end("Delayed by 100ms");
            },100);
        });

        router.get('/timeout', function(req, res) {
            setTimeout(function() {
                res.writeHead(200, {"Content-Type": "text/html"});
                res.end("Delayed by 6seconds");
            },6000);
        });

        router.get('/500', function(req, res) {
            res.writeHead(500, {"Content-Type": "text/html"});
            res.end("500");
        });

        router.get('/404', function(req, res) {
            res.writeHead(404, {"Content-Type": "text/html"});
            res.end("404");
        });

        router.get('/403', function(req, res) {
            res.writeHead(403, {"Content-Type": "text/html"});
            res.end("403");
        });

        router.get('/favicon.ico', function(req, res) {
            res.end("");
        });

        router.get('/broken', function(req) {
            // Rudely end request
            req.socket.end();
        });

        router.get('/millis', function(req, res) {
            res.writeHead(200, {'Content-Type': 'text/html', 'Cache-Control': 'no-store'});
            res.end('Millis since epoch:' + Date.now());
        });

        router.get('/millis-maxage', function(req, res) {
            res.writeHead(200, {'Content-Type': 'text/html', 'Cache-Control': 'max-age=1'});
            res.end('Millis since epoch:' + Date.now());
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

        router.get('/intermittentslow', function(req, res) {
            if(Math.random() > 0.5) {
                setTimeout(function() {
                    res.writeHead(200, {"Content-Type": "text/html"});
                    res.end("Why is this service sometimes so slow?");
                },2000);
            } else {
                res.writeHead(200, {"Content-Type": "text/html"});
                var largeHtml = fs.readFileSync('./test/common/large.html', { encoding: 'utf8' });
                res.write(largeHtml);
                setTimeout(function() {
                    res.end(largeHtml);
                },100);
            }
        });

        router.get('/403backend', function(req, res) {
            res.writeHead(200, {"Content-Type": "text/html"});
            var backendHtml = fs.readFileSync('./test/common/test403.html', { encoding: 'utf8' });
            res.end(backendHtml);
        });

        router.get('/404backend', function(req, res) {
            res.writeHead(200, {"Content-Type": "text/html"});
            var backendHtml = fs.readFileSync('./test/common/test404.html', { encoding: 'utf8' });
            res.end(backendHtml);
        });

        router.get('/ignore404backend', function(req, res) {
            res.writeHead(200, {"Content-Type": "text/html"});
            var backendHtml = fs.readFileSync('./test/common/ignore404.html', { encoding: 'utf8' });
            res.end(backendHtml);
        });

        router.get('/selectFnBackend', function(req, res) {
            res.writeHead(200, {"Content-Type": "text/html"});
            var backendHtml = fs.readFileSync('./test/common/selectFnBackend.html', { encoding: 'utf8' });
            res.end(backendHtml);
        });

        router.get('/noCacheBackend', function(req, res) {
            res.writeHead(200, {"Content-Type": "text/html"});
            var backendHtml = fs.readFileSync('./test/common/noCacheBackend.html', { encoding: 'utf8' });
            res.end(backendHtml);
        });

        router.get('/bundles', function(req, res) {
            res.writeHead(200, {"Content-Type": "text/html"});
            var backendHtml = fs.readFileSync('./test/common/bundles.html', { encoding: 'utf8' });
            res.end(backendHtml);
        });

        router.get('/post', function(req, res) {
            res.writeHead(200, {"Content-Type": "text/html"});
            res.end("GET /post");
        });

        router.post('/post', function(req, res) {
            res.writeHead(200, {"Content-Type": "text/html"});
            res.end("POST " + req.cookies['PostCookie']);
        });

        router.get('/nohost', function(req, res) {
            res.writeHead(200, {"Content-Type": "text/html"});
            res.end(req.headers.host);
        });

        router.get('/tracer', function(req, res) {
            res.writeHead(200, {"Content-Type": "text/plain"});
            res.end(req.headers['x-tracer']);
        });

        router.get('/service-one', function(req, res) {
            res.writeHead(200, {"Content-Type": "text/html", "cx-static|service-one-top": "100"});
            res.end('Service One - I have a bundle, hear me roar.');
        });

        router.get('/service-two', function(req, res) {
            res.writeHead(200, {"Content-Type": "text/html"});
            res.end('Service Two - my bundle is superior, but I have no version.');
        });

        router.get('/static/test/:version/html/:file', function(req, res) {
            res.writeHead(200, {"Content-Type": "text/html"});
            res.end(req.params.version + " >> " + req.params.file);
        });

        router.get('/cookie', function(req, res) {
            res.writeHead(200, {"Content-Type": "text/plain"});
            res.end(req.headers.cookie);
        });

    }));

    return function(next) {
        app.listen(port).on('listening', next);
    };
}

module.exports = {
    init: initStubServer
};
