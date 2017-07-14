'use strict';

var expect = require('expect.js');
var async = require('async');
var request = require('request');
var _ = require('lodash');
var http = require('http');
var cheerio = require('cheerio');
var stubServer = require('../common/stubServer');
var stubServer2 = require('../common/stubServer2');
var pcServer = require('../common/pcServer');

describe("Page Composer - Keyed Backend Config", function () {

  var runningServers;

  this.timeout(5000);
  this.slow(3000);

  before(function (done) {
    async.series([
      initStubServer,
      initStubServer2,
      initPageComposer
    ], function(err, servers) {
      runningServers = servers;
      done();
    });
  });

  after(function (done) {
    async.map(runningServers, function(server, cb) {
      server.close();
      cb();
    }, done);
  });

  function createEventHandler() {
    return {
      logger: function (level, message, data) {
      },
      stats: function (type, key, value) {
      }
    }
  }

  function initStubServer(next) {
    stubServer.init('pageComposerTest.html', 5001, 'localhost')(next);
  }

  function initStubServer2(next) {
    stubServer2.init('pageComposerTest.html', 6001, 'localhost')(next);
  }

  function initPageComposer(next) {
    pcServer.init(5000, 'localhost', createEventHandler(), 'testConfigKeys')(next);
  }

  function getPageComposerUrl(path, search) {

    var url = require('url').format({
      protocol: 'http',
      hostname: 'localhost',
      port: 5000,
      pathname: path,
      search: search
    });

    return url;
  }

  it('should fail quietly if the backend is configured to do so', function (done) {
    var requestUrl = getPageComposerUrl('quiet');
    request.get(requestUrl, { headers: { 'accept': 'text/html' } }, function (err, response, content) {
      var $ = cheerio.load(content);
      expect($('#faulty').text()).to.be.equal('Faulty service');
      done();
    });
  });

  it('should fail loudly if the backend is configured to do so', function (done) {
    var requestUrl = getPageComposerUrl();
    request.get(requestUrl, { headers: { 'accept': 'text/html' } }, function (err, response, content) {
      var $ = cheerio.load(content);
      expect($('#faulty').text()).to.be.contain('status code 500');
      done();
    });
  });

  context('x-compoxure-backend headers', function() {

    it('should use allow you to specify a server via x-compoxure-backend headers that has backend config as defaults', function (done) {
      var requestUrl = getPageComposerUrl('');
      request.get(requestUrl, { headers: { 'x-compoxure-backend': 'different', 'x-compoxure-backend-target': 'http://localhost:6001', 'accept': 'text/html' } }, function (err, response) {
        expect(response.statusCode).to.be(200);
        expect(response.headers['x-guid']).to.not.be(undefined);
        expect(response.body).to.be('I am from the second stub server!');
        done();
      });
    });

    it('should use allow you to specify a server via x-compoxure-backend headers that doesnt have backend config', function (done) {
      var requestUrl = getPageComposerUrl('');
      request.get(requestUrl, { headers: { 'x-compoxure-backend-target': 'http://localhost:6001', 'accept': 'text/html' } }, function (err, response) {
        expect(response.statusCode).to.be(200);
        expect(response.headers['x-guid']).to.be(undefined);
        expect(response.body).to.be('I am from the second stub server!');
        done();
      });
    });

  });

  function getSection(path, search, query, next) {
    var url = getPageComposerUrl(path, search);
    request.get(url, { headers: { 'accept': 'text/html' } }, function (err, response, content) {
      expect(err).to.be(null);
      var $ = cheerio.load(content);
      next($(query).text());
    });
  }

  function getSectionAuth(query, userId, next) {
    var j = request.jar();
    var cookie = request.cookie('TSLCookie=' + userId);
    j.setCookie(cookie, getPageComposerUrl());
    request.get(getPageComposerUrl(), {
      jar: j,
      headers: { 'accept': 'text/html' }
    }, function (err, response, content) {
      expect(err).to.be(null);
      var $ = cheerio.load(content);
      next($(query).text());
    });
  }
});
