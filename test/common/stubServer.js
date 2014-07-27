'use strict';

var connect = require('connect');
var connectRoute = require('connect-route');
var http = require('http');
var fs = require('fs');
var uuid = require('node-uuid');
var stubServer = {};

// This should probably be made its own project!
function initStubServer(fileName, port, hostname) {

    var app = connect();

    app.use(connectRoute(function (router) {
        router.get('/replaced', function(req, res) {
            res.writeHead(200, {"Content-Type": "text/html"});
            res.end('Replaced');
        });

        router.get('/uuid', function(req, res) {
             res.writeHead(200, {"Content-Type": "text/html"});
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

        router.get('/500', function(req, res) {
            res.writeHead(500, {"Content-Type": "text/html"});
            res.end("500");
        });

        router.get('/404', function(req, res) {
            res.writeHead(404, {"Content-Type": "text/html"});
            res.end("404");
        });

        router.get('/favicon.ico', function(req, res) {
            res.end("");
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

        router.get('/header', function(req, res) {
            res.writeHead(200, {"Content-Type": "text/html"});
            var backendHtml = fs.readFileSync('./test/common/furniture/header.html', { encoding: 'utf8' });
            res.end(backendHtml);
        });

        router.get('/footer', function(req, res) {
            res.writeHead(200, {"Content-Type": "text/html"});
            var backendHtml = fs.readFileSync('./test/common/furniture/footer.html', { encoding: 'utf8' });
            res.end(backendHtml);
        });

        router.get('/furniture', function(req, res) {
            res.writeHead(200, {"content-Type": "text/html"});
            var backendHtml = fs.readFileSync('./test/common/furniture/page.html', { encoding: 'utf8' });
            res.write(backendHtml);
            res.end();
        });

        router.get('/404backend', function(req, res) {
            res.writeHead(200, {"Content-Type": "text/html"});
            var backendHtml = fs.readFileSync('./test/common/test404.html', { encoding: 'utf8' });
            res.end(backendHtml);
        });
    }));

    return function(next) {
        app.listen(port).on('listening', next);
    };
}

module.exports = {
    init: initStubServer,
    close: stubServer.close || function() {}
};