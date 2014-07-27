'use strict';

var express = require('express');
var config = require('module-tsl-config').init();
var http = require('http');
var fs = require('fs');
var uuid = require('node-uuid');
var stubServer = {};

// This should probably be made its own project!
function initStubServer(fileName, port, hostname) {

    var app = express();

    app.get('/replaced', function(req, res) {
        res.writeHead(200, {"Content-Type": "text/html"});
        res.end('Replaced');
    });

    app.get('/uuid', function(req, res) {
         res.writeHead(200, {"Content-Type": "text/html"});
        res.end(uuid.v1());
    });

    app.get('/user/:user?', function(req, res) {
        res.writeHead(200, {"Content-Type": "text/html"});
        res.end("User: " + req.params.user || 'Unknown user');
    });

    app.get('/', function(req, res) {
        res.writeHead(200, {"Content-Type": "text/html"});
        var backendHtml = fs.readFileSync('./test/common/' + fileName, { encoding: 'utf8' });
        res.end(backendHtml);
    });

    app.get('/delayed', function(req, res) {
        setTimeout(function() {
            res.writeHead(200, {"Content-Type": "text/html"});
            res.end("Delayed by 100ms");
        },100);
    });

    app.get('/500', function(req, res) {
        res.writeHead(500, {"Content-Type": "text/html"});
        res.end("500");
    });

    app.get('/404', function(req, res) {
        res.writeHead(404, {"Content-Type": "text/html"});
        res.end("404");
    });

    app.get('/favicon.ico', function(req, res) {
        res.end("");
    });

    app.get('/faulty', function(req, res) {
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

    app.get('/intermittentslow', function(req, res) {
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

    app.get('/header', function(req, res) {
        res.writeHead(200, {"Content-Type": "text/html"});
        var backendHtml = fs.readFileSync('./test/common/furniture/header.html', { encoding: 'utf8' });
        res.end(backendHtml);
    });

    app.get('/footer', function(req, res) {
        res.writeHead(200, {"Content-Type": "text/html"});
        var backendHtml = fs.readFileSync('./test/common/furniture/footer.html', { encoding: 'utf8' });
        res.end(backendHtml);
    });

    app.get('/furniture', function(req, res) {
        res.writeHead(200, {"content-Type": "text/html"});
        var backendHtml = fs.readFileSync('./test/common/furniture/page.html', { encoding: 'utf8' });
        res.write(backendHtml);
        res.end();
    });

    app.get('/404backend', function(req, res) {
        res.writeHead(200, {"Content-Type": "text/html"});
        var backendHtml = fs.readFileSync('./test/common/test404.html', { encoding: 'utf8' });
        res.end(backendHtml);
    });


    return function(next) {
        app.listen(port).on('listening', next);
    };
}

module.exports = {
    init: initStubServer,
    close: stubServer.close || function() {}
};