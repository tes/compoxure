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

  app.get('/replaced', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end('Replaced');
  });

  app.get('/uuid', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/html", "x-static|service-one": "100" });
    res.end(uuid.v1());
  });

  app.get('/experiment', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(req.query.variant);
  });

  app.get('/transformer', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(req.query.cacheKey);
  });

  app.get('/additionalHeaders', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("Check the headers luke");
  });

  app.get('/passThroughHeaders', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/html", "X-Robots-Tag": "noindex,nofollow" });
    res.end("Check the headers luke");
  });

  app.get('/user/:user?', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("User: " + req.params.user || 'Unknown user');
  });

  app.get('/', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/html" });
    var backendHtml = fs.readFileSync('./test/common/' + fileName, { encoding: 'utf8' });
    res.end(backendHtml);
  });

  app.get('/delayed', function (req, res) {
    setTimeout(function () {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("Delayed by 100ms");
    }, 100);
  });

  app.get('/timeout', function (req, res) {
    setTimeout(function () {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("Delayed by 6seconds");
    }, 6000);
  });

  app.get('/500', function (req, res) {
    res.writeHead(500, { "Content-Type": "text/html" });
    res.end("500");
  });

  app.get('/404', function (req, res) {
    res.writeHead(404, { "Content-Type": "text/html" });
    res.end("404");
  });

  app.get('/empty', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end('');
  });

  var alternate500 = true;
  app.get('/alternate500', function (req, res) {
    alternate500 = !alternate500;
    if (alternate500) {
      res.writeHead(500, { "Content-Type": "text/html" });
      res.end("500");
    } else {
      res.writeHead(200, { "Content-Type": "text/html", "x-static|service-one": "100" });
      var backendHtml = fs.readFileSync('./test/common/bundle500.html', { encoding: 'utf8' });
      res.end(backendHtml);
    }
  });

  app.get('/403', function (req, res) {
    res.writeHead(403, { "Content-Type": "text/html" });
    res.end("This is a 403 response from a backend! <div cx-url='{{server:local}}/replaced'></div>");
  });

  app.get('/302', function (req, res) {
    res.writeHead(302, { "location": "/replaced" });
    res.end("");
  });

  var toggle = 'A';
  app.get('/302cached', function (req, res) {
    res.writeHead(302, { "location": '/' + toggle });
    res.end("This is some content served with 302");
    toggle = toggle === 'A' ? 'B' : 'A';
  });

  app.get('/418', function (req, res) {
    res.writeHead(418, { "Content-Type": "text/html" });
    res.end("418");
  });

  app.get('/favicon.ico', function (req, res) {
    res.end("");
  });

  app.get('/broken', function (req) {
    req.socket.end();
  });

  app.get('/millis', function (req, res) {
    res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
    res.end('Millis since epoch:' + Date.now());
  });

  app.get('/millis-maxage', function (req, res) {
    res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'max-age=1' });
    res.end('Millis since epoch:' + Date.now());
  });

  app.get('/faulty', function (req, res) {
    setTimeout(function () {
      if (Math.random() > 0.5) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("Faulty service managed to serve good content!");
      } else {
        res.writeHead(500, { "Content-Type": "text/html" });
        res.end("Faulty service broken");
      }
    }, 100);
  });

  app.get('/intermittentslow', function (req, res) {
    if (Math.random() > 0.5) {
      setTimeout(function () {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("Why is this service sometimes so slow?");
      }, 2000);
    } else {
      res.writeHead(200, { "Content-Type": "text/html" });
      var largeHtml = fs.readFileSync('./test/common/large.html', { encoding: 'utf8' });
      res.write(largeHtml);
      setTimeout(function () {
        res.end(largeHtml);
      }, 100);
    }
  });

  app.get('/403backend', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/html" });
    var backendHtml = fs.readFileSync('./test/common/test403.html', { encoding: 'utf8' });
    res.end(backendHtml);
  });

  app.get('/418backend', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/html" });
    var backendHtml = fs.readFileSync('./test/common/test418.html', { encoding: 'utf8' });
    res.end(backendHtml);
  });

  app.get('/404backend', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/html" });
    var backendHtml = fs.readFileSync('./test/common/test404.html', { encoding: 'utf8' });
    res.end(backendHtml);
  });

  app.get('/302backend', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/html" });
    var backendHtml = fs.readFileSync('./test/common/test302.html', { encoding: 'utf8' });
    res.end(backendHtml);
  });

  app.get('/ignore404backend', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/html" });
    var backendHtml = fs.readFileSync('./test/common/ignore404.html', { encoding: 'utf8' });
    res.end(backendHtml);
  });

  app.get('/donotignore404backend', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/html" });
    var backendHtml = fs.readFileSync('./test/common/donotignore404.html', { encoding: 'utf8' });
    res.end(backendHtml);
  });

  app.get('/selectFnBackend', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/html" });
    var backendHtml = fs.readFileSync('./test/common/selectFnBackend.html', { encoding: 'utf8' });
    res.end(backendHtml);
  });

  app.get('/random', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end('<html>' + Math.random().toString(36) + '</html>');
  });

  app.get('/noCacheBackendFromFragment', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/html" });
    var backendHtml = fs.readFileSync('./test/common/noCacheBackendFromFragment.html', { encoding: 'utf8' });
    res.end(backendHtml);
  });

  app.get('/noCacheBackendFromFragmentNoKey', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/html" });
    var backendHtml = fs.readFileSync('./test/common/noCacheBackendFromFragmentNoKey.html', { encoding: 'utf8' });
    res.end(backendHtml);
  });

  app.get('/noCacheBackend', function (req, res) {
    res.writeHead(200, {
      "Content-Type": "text/html",
      "Cache-Control": 'no-cache, no-store, must-revalidate, private, max-stale=0, post-check=0, pre-check=0'
    });
    var backendHtml = fs.readFileSync('./test/common/noCacheBackendFromFragment.html', { encoding: 'utf8' });
    res.end(backendHtml);
  });

  app.get('/noCacheBackendNoHeader', function (req, res) {
    res.writeHead(200, {
      "Content-Type": "text/html",
    });
    var backendHtml = fs.readFileSync('./test/common/large.html', { encoding: 'utf8' });
    res.end(backendHtml);
  });

  app.get('/noCacheBackendWithHeader', function (req, res) {
    res.writeHead(200, {
      "Content-Type": "text/html",
    });
    var backendHtml = fs.readFileSync('./test/common/large.html', { encoding: 'utf8' });
    res.end(backendHtml);
  });

  app.get('/noCacheBackendViaFragment', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/html", "Cache-Control": 'private' });
    var backendHtml = fs.readFileSync('./test/common/noCacheBackendFromFragment.html', { encoding: 'utf8' });
    res.end(backendHtml);
  });

  app.get('/bundles', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/html" });
    var backendHtml = fs.readFileSync('./test/common/bundles.html', { encoding: 'utf8' });
    res.end(backendHtml);
  });

  app.get('/post', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("GET /post");
  });

  app.post('/post', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("POST " + req.cookies['PostCookie']);
  });

  app.get('/differenthost', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(req.headers.host);
  });

  app.get('/tracer', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(req.headers['x-tracer']);
  });

  app.get('/header/:name', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(req.headers[req.params.name]);
  });

  app.get('/service-one', function (req, res) {
    res.writeHead(200, {
      "Content-Type": "text/html",
      "x-static|service-one": "100"
    });
    res.end('Service One - I have a bundle, hear me roar.');
  });

  app.get('/service-two', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end('Service Two - my bundle is superior, but I have no version.');
  });

  app.get('/service-resolved', function (req, res) {
    res.writeHead(200, {
      "Content-Type": "text/html",
      "x-static|service-resolved": "123"
    });
    res.end('Service resolved - I have a bundle, hear me roar - over there.');
  });

  app.get('/service-resolved2', function (req, res) {
    res.writeHead(200, {
      "Content-Type": "text/html",
      "x-static|service-resolved2": "123"
    });
    res.end('Service resolved 2');
  });

  app.get('/static/:service/:version/html/:file', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(req.params.service + " >> " + req.params.version + " >> " + req.params.file);
  });

  app.get('/resolved-static/:service/:version/html/:file', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end('RESOLVED ' + req.params.service + " >> " + req.params.version + " >> " + req.params.file);
  });

  app.get('/cookie', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(req.headers.cookie);
  });

  app.get('/set-cookie', function (req, res) {
    res.cookie('hello', 'world');
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end('<div cx-no-cache="true" cx-url="{{server:local}}/set-fragment-cookie"></div><div cx-url="{{server:local}}/set-fragment-cookie"></div>');
  });

  app.get('/set-fragment-cookie', function (req, res) {
    res.cookie('another', 'cookie');
    res.cookie('hello', 'again');
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end('Fragment Cookies Set');
  });

  app.get('/country', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/plain" });
    var geo = req.query ? req.query.geo : undefined;

    res.end(geo || '');
  });

  app.get('/lang', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(req.headers['accept-language']);
  });

  app.get('/ua', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(req.headers['user-agent']);
  });

  app.get('/device', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(req.headers['x-device']);
  });

  app.get(['/arrayOfPattern1', '/arrayOfPattern2'], function (req, res) {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end('arrayOfPattern');
  });

  app.get('/browser-extension-backend', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end('Browser extension working');
  });

  app.get('/nested-nested-fragment', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end('<div cx-url="{{server:local}}/multiple-fragment" cx-replace-outer="true"></div>');
  });

  app.get('/nested-fragment', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end('<div cx-url="{{server:local}}/welcome-fragment" cx-replace-outer="true"></div>');
  });

  app.get('/nested-fragment-2', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end('<div cx-parse-me cx-url="{{server:local}}/welcome-fragment-2" cx-replace-outer="true"></div>');
  });

  app.get('/welcome-fragment', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/html", "cx-parse-me": true });
    res.end('<div><h1>Welcome</h1><div cx-url="{{server:local}}/fragment-content" cx-replace-outer="true"></div></div>');
  });

  app.get('/welcome-fragment-2', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end('<div><h1>Welcome</h1><div cx-url="{{server:local}}/fragment-content" cx-replace-outer="true"></div></div>');
  });

  app.get('/fragment-content', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/html", "cx-parse-me": true });
    res.end('<p>Welcome content</p>');
  });

  app.get('/fragment-content-id', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/html", "cx-parse-me": true });
    res.end('<p>Welcome content ' + req.query.id + '</p>');
  });

  app.get('/multiple-fragment', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/html", "cx-parse-me": true });
    res.end('<div cx-url="{{server:local}}/multiple-fragment-content" cx-replace-outer="true"></div>');
  });

  app.get('/multiple-fragment-content', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/html", "cx-parse-me": true });
    res.end('<body>' +
      '<div cx-url="{{server:local}}/header-fragment" cx-replace-outer="true"></div>' +
      '<main class="main"><p>bla bla bla</p></main>' +
      '<div cx-url="{{server:local}}/footer-fragment" cx-replace-outer="true"></div>' +
      '</body>');
  });

  app.get('/header-fragment', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end('<header class="header">Header</header>');
  });

  app.get('/footer-fragment', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end('<footer class="footer">Footer</footer>');
  });

  app.get('/default-limit', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end('<div cx-url="{{server:local}}/fragment1" cx-replace-outer="true"></div>');
  });

  app.get('/fragment1', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/html", "cx-parse-me": true });
    res.end('<div><p>fragment 1</p><div cx-url="{{server:local}}/fragment2" cx-replace-outer="true"></div></div>');
  });

  app.get('/fragment2', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/html", "cx-parse-me": true });
    res.end('<div><p>fragment 2</p><div cx-url="{{server:local}}/fragment3" cx-replace-outer="true"></div></div>');
  });

  app.get('/fragment3', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/html", "cx-parse-me": true });
    res.end('<div><p>fragment 3</p><div cx-url="{{server:local}}/fragment4" cx-replace-outer="true"></div></div>');
  });

  app.get('/fragment4', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/html", "cx-parse-me": true });
    res.end('<div><p>fragment 4</p><div cx-url="{{server:local}}/fragment5" cx-replace-outer="true"</div></div>');
  });

  app.get('/wont-parse', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end('<div><p>Dont this child</p><div cx-url="{{server:local}}/no-header-fragment" cx-replace-outer="true"</div></div>');
  });

  app.get('/no-header-fragment', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end('<div><p>Dont me</p><div cx-url="{{server:local}}/fragment5" cx-replace-outer="true"</div></div>');
  });

  app.get('/needs-content', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end('<html><meta cx-content="home"/><div id="item" cx-content-item="{{content:home:foo}}">default</div><div id="tag" cx-content-item="{{content:home:tag}}">not home</div></html>');
  });

  app.get('/needs-content-no-context', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end('<html><div id="item" cx-content-item="{{content:home:foo}}">default</div><div id="tag" cx-content-item="{{content:home:tag}}">default</div></html>');
  });

  app.get('/layout', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end('<html>hello <div cx-replace-outer cx-url="{{server:local}}/service-resolved2"></div><div cx-define-slot="slot1"></div></html>');
  });

  app.get('/use-layout', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/html", "cx-layout": "{{server:local}}/layout" });
    res.end('<html><div cx-use-slot="slot1">world</div></html>');
  });

  app.get('/use-layout-with-device', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/html", "cx-layout": "{{server:local}}/layout" });
    res.end('<html><div cx-use-slot="slot1">' + (req.headers['x-device'] === 'phone' ? 'device-mobile' : '') + '</div></body></html>');
  });

  app.get('/use-layout-with-cookie', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/html", "cx-layout": "{{server:local}}/layout" });
    res.end('<html><div cx-use-slot="slot1">' + req.headers.cookie + '</div></body></html>');
  });

  app.get('/use-layout-with-bundle', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/html", "cx-layout": "{{server:local}}/layout" });
    res.end('<html><div cx-use-slot="slot1"><div cx-url="{{server:local}}/service-resolved"></div><div class="bundle" cx-bundles="service-resolved/top.js"></div></div></html>');
  });

  app.get('/use-layout-with-bundle2', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/html", "cx-layout": "{{server:local}}/layout" });
    res.end('<html><div cx-use-slot="slot1"><div class="bundle" cx-bundles="service-resolved2/top.js"></div></div></html>');
  });

  app.get('/use-layout-with-bundle-bundle-in-layout', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/html", "cx-layout": "{{server:local}}/layout" });
    res.end('<html><div cx-use-slot="slot1"><div cx-url="{{server:local}}/service-resolved"></div><div class="bundle" cx-bundles="service-resolved/top.js"></div></div></html>');
  });

  app.get('/content/:tag', function (req, res) {
    res.json({
      tag: req.params.tag,
      foo: 'bar'
    });
  });

  app.get('/cx-strategy-default', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end('<div><div cx-url-1="{{server:local}}/fragment-content-id?id=fragment-1" cx-url-2="{{server:local}}/fragment-content-id?id=fragment-2" class="container"></div></div>');
  });

  app.get('/cx-strategy-first-non-empty', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end('<div><div cx-url-1="{{server:local}}/empty" cx-url-2="{{server:local}}/fragment-content-id?id=fragment-2" cx-url-3="{{server:local}}/fragment-content-id?id=fragment-3" cx-strategy="first-non-empty" class="container"></div></div>');
  });

  app.get('/slot-layout', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end('<html>Slot1:<div cx-define-slot="slot1"></div>Slot2:<div cx-define-slot="slot2"></div></html>');
  });

  app.get('/slot-layout-2', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end('<html>Header:<div cx-define-slot="header"></div>Content:<div cx-define-slot="content"></div>Footer:<div cx-define-slot="footer"></div></html>');
  });

  app.get('/cx-simple-slot-use', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/html", "cx-parse-me": true, "cx-layout": "{{server:local}}/slot-layout" });
    res.end('<html><div cx-use-slot="slot1">Slot1</div><div cx-use-slot="slot2">For slot 2</div></html>');
  });

  app.get('/cx-additional-slot-use', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/html", "cx-parse-me": true, "cx-layout": "{{server:local}}/slot-layout" });
    res.end('<html><div cx-use-slot="slot1">Slot1<compoxure cx-define-slot="slot3"></div></div><div cx-use-slot="slot2">For slot 2</div><div cx-use-slot="slot3">SLOT3</div></html>');
  });

  app.get('/cx-double-slot-use', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/html", "cx-parse-me": true, "cx-layout": "{{server:local}}/slot-layout" });
    res.end('<div cx-use-slot="slot1">THIS</div><div cx-use-slot="slot1">THAT</div>');
  });

  app.get('/cx-slot-sub-request', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/compoxure", "cx-parse-me": true, "cx-allow-slot-use": true, "cx-layout": "{{server:local}}/slot-layout"
  });
    res.end('<div cx-use-slot="slot1" cx-replace-outer="true"><p id="foo">Foo</p></div><div cx-url="{{server:local}}/cx-slot-sub-request-content" cx-replace-outer="true"></div>');
  });

  app.get('/cx-slot-sub-request-content', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/html", "cx-parse-me": true });
    res.end('<div cx-use-slot="slot2" cx-replace-outer="true">Bar</div>');
  });

  app.get('/cx-slot-sub-request-2', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/compoxure", "cx-parse-me": true, "cx-allow-slot-use": true, "cx-layout": "{{server:local}}/slot-layout-2"
  });
    res.end('<div cx-use-slot="header" cx-replace-outer="true">Foo1</div><div cx-use-slot="footer">Foo2</div><div cx-use-slot="content"><div cx-url="{{server:local}}/cx-slot-sub-request-content-2" cx-replace-outer="true"></div></div>');
  });

  app.get('/cx-slot-sub-request-content-2', function (req, res) {
    res.writeHead(200, { "Content-Type": "text/html", "cx-parse-me": true });
    res.end('<div cx-use-slot="header" cx-replace-outer="true">Bar1</div><div cx-use-slot="footer" cx-replace-outer="true">Bar2</div>Leave behind me');
  });


  return function (next) {
    app.listen(port).on('listening', next);
  };
}

module.exports = {
  init: initStubServer
};
