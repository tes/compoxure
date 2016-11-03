'use strict';

var connect = require('connect');
var cookieParser = require('cookie-parser');
var morgan = require('morgan');
var serveStatic = require('serve-static');
var bodyParser = require('body-parser');
var connectRoute = require('connect-route');

var server = connect();

server.use(cookieParser());

if (process.env.logging !== 'false') { server.use(morgan('combined')); }

server.use(serveStatic('example/static', { 'index': ['index.html', 'index.htm'] }));
server.use(bodyParser.urlencoded({ extended: false }))

server.use(connectRoute(function (router) {

  router.get('/backend-layout', function (req, res) {
    res.writeHead(200, { 'Content-Type': 'text/html', 'cx-template': 'http://localhost:5001/layout.html' });
    var content = ['<p>This is not the layout</p>',
      '<p cx-use-slot="slot1">Slot 1</p>',
      '<p cx-use-slot="slot2">Slot 2</p>'].join('\n')
    res.end(content);
  });

  router.get('/dynamic', function (req, res) {
    res.writeHead(200, { 'Content-Type': 'text/html', 'x-static|service|top': '100' });
    res.end('This is some dynamic comment: ' + (new Date()));
  });

  router.get('/500', function (req, res) {
    res.writeHead(500);
    res.end('This is an error.');
  });

  router.get('/403', function (req, res) {
    res.writeHead(403);
    res.end('Unauthorised error.');
  });

  router.get('/broken', function (req) {
    // Rudely end request
    req.socket.end();
  });

  router.get('/faulty', function (req, res) {
    setTimeout(function () {
      if (Math.random() > 0.5) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('Faulty service managed to serve good content!');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/html' });
        res.end('Faulty service broken');
      }
    }, 100);
  });

  router.get('/nestedroot', function (req, res) {
    res.writeHead(200, { 'Content-Type': 'text/html', 'cx-parse-me': true });
    res.end('<div><p>From the root</p><div id="frag1" cx-url="{{server:local}}/nestedfrag1" class="block"></div></div>')
  });

  router.get('/nestedfrag1', function (req, res) {
    res.writeHead(200, { 'Content-Type': 'text/html', 'cx-parse-me': true });
    res.end('<div><div id="frag2" cx-url="{{server:local}}/nestedsub/2" class="block"></div><div id="frag3" cx-url="{{server:local}}/nestedsub/3" class="block"></div></div>')
  });

  router.get('/nestedsub/:id', function (req, res) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<div><p>Another fragment with id: ' + req.params.id + '</p></div>')
  });

  router.get('/slow', function (req, res) {
    setTimeout(function () {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('This is a slow service');
    }, 200);
  });

  router.post('/post', function (req, res) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('POST Data: ' + req.body.test + '<br/><pre>' + JSON.stringify(req.headers) + '</pre>');
  });

  router.put('/put', function (req, res) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('PUT Data: ' + req.body.test + '<br/><pre>' + JSON.stringify(req.headers) + '</pre>');
  });

  router.get('/cdn/:environment/:version/html/:file', function (req, res) {
    res.writeHead(200);
    res.end('Environment: ' + req.params.environment + ', Version: ' + req.params.version + ', File: ' + req.params.file);
  });


}));

server.listen(5001, function () {
  console.log('Example backend server on http://localhost:5001');
});
