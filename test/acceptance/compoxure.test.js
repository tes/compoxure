'use strict';

var expect = require('expect.js');
var async = require('async');
var request = require('request');
var http = require('http');
var cheerio = require('cheerio');
var config = require('../common/testConfig.json');
var stubServer = require('../common/stubServer');
var pcServer = require('../common/pcServer');

describe("Page Composer", function(){

    var pageComposer;

    before(function(done){
        async.series([
            initStubServer,
            initPageComposer
        ], done);
    });

    function initStubServer(next) {
        stubServer.init('pageComposerTest.html', 5001,'localhost')(next);
    }

    function initPageComposer(next) {
        pcServer.init(5000, 'localhost')(next);
    }

    function getPageComposerUrl(path) {
        return require('url').format({
            protocol: 'http',
            hostname: 'localhost',
            port: 5000,
            pathname: path
        });
    }

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

    it('should fail quietly if the backend is configured to do so', function(done) {
        var requestUrl = getPageComposerUrl('quiet');
        request.get(requestUrl,{headers: {'accept': 'text/html'}}, function(err, response, content) {
            var $ = cheerio.load(content);
            expect($('#faulty').text()).to.be.equal('');
            done();
        });
    });

    it('should fail loudly if the backend is configured to do so', function(done) {
        var requestUrl = getPageComposerUrl();
        request.get(requestUrl,{headers: {'accept': 'text/html'}}, function(err, response, content) {
            var $ = cheerio.load(content);
            expect($('#faulty').text()).to.be.equal('Error: Service http://localhost:5001/500 FAILED due to status code 500');
            done();
        });
    });

    it('should ignore a cx-url that is invalid', function(done) {
        getSection('#invalidurl', function(text) {
            expect(text).to.be.equal('Error: Invalid CX url: invalid');
            done();
        });
    });

    it('should ignore a cx-url that is invalid unless it is cache', function(done) {
        getSection('#cacheurl1', function(text) {
            expect(text).to.be.equal('');
            done();
        });
    });

    it('should ignore a cx-url that is invalid unless it is cache, and get the content if cache is primed', function(done) {
        getSection('#cacheurl2', function(text) {
            expect(text).to.be.equal('Replaced');
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