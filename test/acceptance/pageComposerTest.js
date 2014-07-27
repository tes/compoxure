'use strict';

var expect = require('expect.js');
var async = require('async');
var config = require('module-tsl-config').init();
var endpoints = require('module-tsl-endpoints');
var environment = require('module-tsl-environment');
var redisFactory = require('module-tsl-redis');
var request = require('request');
var http = require('http');
var cheerio = require('cheerio');
var stubServer = require('../common/stubServer');

describe("Page Composer", function(){

    var redisClient;
    var pageComposer;

    before(function(done){
        async.series([
            initRedis,
            initStubServer,
            initPageComposer
        ], done);
    });

    function initStubServer(next) {
        var parsedUrl = require('url').parse(config.backend[0].target);
        stubServer.init('pageComposerTest.html', parsedUrl.port, parsedUrl.hostname)(next);
    }

    function initRedis(next) {
        var redisEndpoint = endpoints.getSync('page-composer/cache', environment);
        redisClient = redisFactory.createClient(redisEndpoint);
        redisClient.info(next);
    }

    function initPageComposer(next) {
        process.send = function() { next(); };
        pageComposer = require('../../app');
    }

    function getPageComposerUrl(path) {
        return require('url').format({
            protocol: 'http',
            hostname: config.server.host,
            port: config.server.port,
            pathname: path
        });
    }

    beforeEach(function(done) {
        redisClient.flushdb(done);
    });

    after(function(done){
        redisClient.flushdb(function() {
            stubServer.close();
            done();
        });
    });

    it('should not replace unspecified sections', function(done) {
        getSection('#keepme', function(text) {
            expect(text).to.be.equal('Keep me');
            done();
        });
    });

    it('should replace specified sections', function(done) {
        getSection('#replacement1', function(text) {
            expect(text).to.be.equal('Replaced');
            done();
        });
    });

    it('should replace specified sections with nested selectors', function(done) {
        getSection('#replacement6 > h2', function(text) {
            expect(text).to.be.equal('Replaced');
            done();
        });
    });

    it('should remove specified sections', function(done) {
        getSection('#removal1', function(text) {
            expect(text).to.be.equal('');
            done();
        });
    });

    it('should remove specified sections with nested selectors', function(done) {
        getSection('.removal2 > h2', function(text) {
            expect(text).to.be.equal('');
            done();
        });
    });

    it('should not cache by default', function(done) {
        getSection('#replacement2', function(originalText) {
            expect(originalText).not.to.be.equal('Replaced');
            getSection('#replacement2', function(newText) {
                expect(originalText).not.to.be.equal(newText);
                done();
            });
        });
    });

    it('should cache when configured', function(done) {
        getSection('#replacement3', function(originalText) {
            expect(originalText).not.to.be.equal('Replaced');
            getSection('#replacement3', function(newText) {
                expect(originalText).to.be.equal(newText);
                done();
            });
        });
    });

    it('should cache when authenticated if auth not part of cache key', function(done) {
        getSection('#replacement4', function(originalText) {
            expect(originalText).not.to.be.equal('Replaced');
            getSectionAuth('#replacement4', 'user1', function(newText) {
                expect(originalText).to.be.equal(newText);
                done();
            });
        });
    });

    it('should cache per user when authenticated if same user and user part of cache key', function(done) {
        getSectionAuth('#replacement5', 'user1', function(originalText) {
            expect(originalText).not.to.be.equal('Replaced');
            getSectionAuth('#replacement5', 'user2', function(newText) {
                expect(originalText).not.to.be.equal(newText);
                done();
            });
        });
    });

    it('should remove specified sections defined in the backend specific transformations', function(done) {
        getSection('#backendreplacement', function(text) {
            expect(text).to.be.equal('Replaced');
            done();
        });
    });

    it('should replace specified declarative sections', function(done) {
        getSection('#declarative', function(text) {
            expect(text).to.be.equal('Replaced');
            done();
        });
    });

    it('should ignore requests for anything other than html', function(done) {
        request.get(getPageComposerUrl(),{headers: {'accept': 'text/plain'}}, function(err, response) {
            expect(response.statusCode).to.be(415);
            done();
        });
    });

    it('should process requests for any content type (thanks ie8)', function(done) {
        request.get(getPageComposerUrl(), {headers: {'accept': '*/*'}}, function(err, response, content) {
            expect(err).to.be(null);
            var $ = cheerio.load(content);
            expect($('#declarative').text()).to.be.equal('Replaced');
            done();
        });
    });

    it('should return a 404 if any of the fragments return a 404', function(done) {

        var requestUrl = getPageComposerUrl('404backend');
        request.get(requestUrl,{headers: {'accept': 'text/html'}}, function(err, response) {
            expect(response.statusCode).to.be(404);
            done();
        });
    });

    function getSection(query, next) {
        request.get(getPageComposerUrl(),{headers: {'accept': 'text/html'}}, function(err, response, content) {
            expect(err).to.be(null);
            var $ = cheerio.load(content);
            next($(query).text());
        });
    }

    function getSectionAuth(query, userId, next) {
        var j = request.jar();
        var cookie = request.cookie('TSLCookie=' + userId);
        j.setCookie(cookie, getPageComposerUrl());
        request.get(getPageComposerUrl(), { jar: j, headers: {'accept': 'text/html'} }, function(err, response, content) {
            expect(err).to.be(null);
            var $ = cheerio.load(content);
            next($(query).text());
        });
    }
});