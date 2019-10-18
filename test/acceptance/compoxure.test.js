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

describe("Page Composer", function () {

  this.timeout(5000);
  this.slow(3000);

  before(function (done) {
    async.series([
      initStubServer,
      initStubServer2,
      initPageComposer,
      initPageComposerMinified
    ], done);
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
    pcServer.init(5000, 'localhost', createEventHandler())(next);
  }

  function initPageComposerMinified(next) {
    pcServer.init(5004, 'localhost', createEventHandler(), 'testConfigMinified')(next);
  }

  function getPageComposerUrl(path, search, minified) {

    var url = require('url').format({
      protocol: 'http',
      hostname: 'localhost',
      port: minified ? 5004 : 5000,
      pathname: path,
      search: search
    });

    return url;
  }

  it('should silently drop favicon requests', function (done) {
    request.get(getPageComposerUrl('favicon.ico'), { headers: { 'accept': 'image/x-icon' } }, function (err, response) {
      expect(response.statusCode).to.be(200);
      done();
    });
  });

  it('should ignore requests for anything other than html', function (done) {
    request.get(getPageComposerUrl(), { headers: { 'accept': 'text/plain' } }, function (err, response) {
      expect(response.statusCode).to.be(415);
      done();
    });
  });

  it('should process requests for any content type (thanks ie8)', function (done) {
    request.get(getPageComposerUrl(), { headers: { 'accept': '*/*' } }, function (err, response, content) {
      expect(err).to.be(null);
      var $ = cheerio.load(content);
      expect($('#declarative').text()).to.be.equal('Replaced');
      done();
    });
  });

  it('should respond status 200 if etag does NOT match, and have a body', function (done) {
    request.get(getPageComposerUrl('needs-content'), { headers: { 'accept': '*/*', 'If-None-Match': 'foobar' } }, function (err, response, content) {
      expect(err).to.be(null);
      expect(response.body.length) > 0;
      expect(response.statusCode).to.be(200);
      done();
    });
  });

  it('should respond status 304 if etag matches, and NOT have a body', function (done) {
    request.get(getPageComposerUrl('needs-content'), { headers: { 'accept': '*/*', 'If-None-Match': 'NTfJlUCxbFeEp5FACoS5Zs3n5zU' } }, function (err, response, content) {
      expect(err).to.be(null);
      expect(response.body.length).to.be.equal(0);
      expect(response.statusCode).to.be(304);
      done();
    });
  });

  it('should not die if given a poisoned url', function (done) {
    var targetUrl = getPageComposerUrl() + '?cid=271014_Primary-103466_email_et_27102014_%%%3dRedirectTo(%40RESOURCEURL1)%3d%%&mid=_&rid=%%External_ID%%&utm_source=ET&utm_medium=email&utm_term=27102014&utm_content=_&utm_campaign=271014_Primary_103466_%%%3dRedirectTo(%40RESOURCEURL1)%3d%%';
    request.get(targetUrl, { headers: { 'accept': 'text/html' } }, function (err, response) {
      expect(response.statusCode).to.be(200);
      done();
    });
  });

  it('should not return a 404 if any of the fragments return a 404', function (done) {
    var requestUrl = getPageComposerUrl('404backend');
    request.get(requestUrl, { headers: { 'accept': 'text/html' } }, function (err, response) {
      expect(response.statusCode).to.be(200);
      done();
    });
  });

  it('should not return a 404 if any of the fragments have ignore-404 or ignore-error', function (done) {
    var requestUrl = getPageComposerUrl('ignore404backend');
    request.get(requestUrl, { headers: { 'accept': 'text/html' } }, function (err, response) {
      expect(response.statusCode).to.be(200);
      done();
    });
  });

  it('should return a 404 if any of the fragments have ignore-404 = false', function (done) {
    var requestUrl = getPageComposerUrl('donotignore404backend');
    request.get(requestUrl, { headers: { 'accept': 'text/html' } }, function (err, response) {
      expect(response.statusCode).to.be(404);
      done();
    });
  });

  it('should return a 404 if the backend template returns a 404', function (done) {
    var requestUrl = getPageComposerUrl('404');
    request.get(requestUrl, { headers: { 'accept': 'text/html' } }, function (err, response) {
      expect(response.statusCode).to.be(404);
      done();
    });
  });

  it('should return a 500 if the backend template returns a 500', function (done) {
    var requestUrl = getPageComposerUrl('500');
    request.get(requestUrl, { headers: { 'accept': 'text/html' } }, function (err, response) {
      expect(response.statusCode).to.be(500);
      done();
    });
  });

  it('should return a 500 if the backend template returns no response at all', function (done) {
    var requestUrl = getPageComposerUrl('broken');
    request.get(requestUrl, { headers: { 'accept': 'text/html' } }, function (err, response) {
      expect(response.statusCode).to.be(500);
      done();
    });
  });

  it('should add no-cache, no-store, must-revalidate cache-control header if any fragments use cx-no-cache', function (done) {
    var requestUrl = getPageComposerUrl('noCacheBackendFromFragment');
    request.get(requestUrl, { headers: { 'accept': 'text/html' } }, function (err, response) {
      expect(response.headers['cache-control']).to.be.equal('private, s-maxage=0, no-cache, no-store, must-revalidate, max-age=0');
      done();
    });
  });

  it('should add default cache-control header if any fragments dont have a cache key', function (done) {
    var requestUrl = getPageComposerUrl('noCacheBackendFromFragmentNoKey');
    request.get(requestUrl, { headers: { 'accept': 'text/html' } }, function (err, response) {
      expect(response.headers['cache-control']).to.be.equal('private, no-cache, max-age=0, must-revalidate, no-store');
      expect(response.headers['cx-notice']).to.be.contain('cache-control defaulted due to fragment nocache:');
      // Order can change, so just check presence, logs all nocache fragments
      expect(response.headers['cx-notice']).to.be.contain('{{server:local}}/replaced');
      expect(response.headers['cx-notice']).to.be.contain('{{server:local}}/uuid');
      done();
    });
  });

  it('should pass through cache-control header from service if sent', function (done) {
    var requestUrl = getPageComposerUrl('noCacheBackend');
    request.get(requestUrl, { headers: { 'accept': 'text/html' } }, function (err, response) {
      expect(response.headers['cache-control']).to.be.equal('no-cache, no-store, must-revalidate, private, max-stale=0, post-check=0, pre-check=0');
      done();
    });
  });

  it('should default cache-control header', function (done) {
    var requestUrl = getPageComposerUrl('noCacheBackendNoHeader');
    request.get(requestUrl, { headers: { 'accept': 'text/html' } }, function (err, response) {
      expect(response.headers['cache-control']).to.be.equal('private, no-cache, max-age=0, must-revalidate, no-store');
      done();
    });
  });

  it('should allow case insensitve over-ride via addResponseHeaders', function (done) {
    var requestUrl = getPageComposerUrl('noCacheBackendWithHeader');
    request.get(requestUrl, { headers: { 'accept': 'text/html' } }, function (err, response) {
      expect(response.headers['cache-control']).to.be.equal('max-age=0');
      done();
    });
  });

  it('should allow use of template variables in addResponseHeaders', function (done) {
    var requestUrl = getPageComposerUrl('noCacheBackendWithHeader');
    request.get(requestUrl, { headers: { 'accept': 'text/html' } }, function (err, response) {
      expect(response.headers['surrogate-key']).to.be.equal('path:/noCacheBackendWithHeader');
      done();
    });
  });

  it('should use fragment\'s cache-control header overriding backend', function (done) {
    var requestUrl = getPageComposerUrl('noCacheBackendViaFragment');
    request.get(requestUrl, { headers: { 'accept': 'text/html' } }, function (err, response) {
      expect(response.headers['cache-control']).to.be.equal('private, no-cache, max-age=0, must-revalidate, no-store');
      done();
    });
  });

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

  it('should leave the content that was originally in the element if it is configured to do so', function (done) {
    var requestUrl = getPageComposerUrl('leave');
    request.get(requestUrl, { headers: { 'accept': 'text/html' } }, function (err, response, content) {
      var $ = cheerio.load(content);
      expect($('#faulty').text()).to.be.equal('Faulty service');
      done();
    });
  });

  it('should leave the HTML content that was originally in the element if it is configured to do so', function (done) {
    var requestUrl = getPageComposerUrl('leave');
    request.get(requestUrl, { headers: { 'accept': 'text/html' } }, function (err, response, content) {
      var $ = cheerio.load(content);
      expect($('#faultyhtml h1').text()).to.be.equal('Bob');
      expect($('#faultyhtml span').text()).to.be.equal('The builder');
      done();
    });
  });

  it('should fail gracefully if the service returns no response at all', function (done) {
    getSection('', '', '#broken', function (text) {
      expect(text).to.be.contain('socket hang up');
      done();
    });
  });

  it('should remove the element if cx-replace-outer is set', function (done) {
    request.get(getPageComposerUrl(), { headers: { 'accept': 'text/html' } }, function (err, response, content) {
      var $ = cheerio.load(content);
      expect($('#replace-outer-content').length).to.be.equal(0);
      expect($('#replace-outer').text()).to.be.equal('wrapping Replaced content');
      done();
    });
  });

  it('should use the experiment variables if they are available', function (done) {
    request.get(getPageComposerUrl(), { headers: { 'accept': 'text/html' } }, function (err, response, content) {
      var $ = cheerio.load(content);
      expect($('#experiment').text()).to.be.equal('A123');
      done();
    });
  });

  it('should use the options transformer if provided', function (done) {
    request.get(getPageComposerUrl('/transformer'), { headers: { 'accept': 'text/html' } }, function (err, response, content) {
      expect(content).to.be.equal('prefix-cache-key-suffix');
      done();
    });
  });

  it('should return fixed additional headers if configured', function (done) {
    request.get(getPageComposerUrl('/additionalHeaders'), { headers: { 'accept': 'text/html' } }, function (err, response, content) {
      expect(response.headers['x-robots-tag']).to.be.equal('noindex');
      done();
    });
  });

  it('should return pass through back end headers if configured', function (done) {
    request.get(getPageComposerUrl('/passThroughHeaders'), { headers: { 'accept': 'text/html' } }, function (err, response, content) {
      expect(response.headers['x-robots-tag']).to.be.equal('noindex,nofollow');
      done();
    });
  });

  it('should ignore a cx-url that is invalid', function (done) {
    getSection('', '', '#invalidurl', function (text) {
      expect(text).to.be.contain('Invalid URL invalid');
      done();
    });
  });

  it('should ignore a cx-url that is invalid unless it is cache', function (done) {
    getSection('', '', '#cacheurl1', function (text) {
      expect(text).to.be.equal('No content in cache at key: cache');
      done();
    });
  });

  it('should ignore a cx-url that is invalid unless it is cache, and get the content if cache is primed', function (done) {
    getSection('', '', '#cacheurl2', function (text) {
      expect(text).to.be.equal('Replaced');
      done();
    });
  });

  it('should allow simple mustache logic', function (done) {
    getSection('', '?logic=yes', '#testlogic', function (text) {
      expect(text).to.be.equal('Logic ftw!');
      done();
    });
  });

  it('should have access to current environment', function (done) {
    getSection('', '', '#environment', function (text) {
      expect(text).to.be.equal('test');
      done();
    });
  });

  it('should not cache segments that return no-store in Cache-control header', function (done) {
    getSection('', '', '#no-store', function (text) {
      var before = text;
      setTimeout(function () {
        getSection('', '', '#no-store', function (text) {
          expect(text).not.to.be.equal(before);
          done();
        });
      }, 1);
    });
  });

  it('should pass no-cache, no-store, must-revalidate in Cache-control header from fragment response to client response', function (done) {
    request.get(getPageComposerUrl('/noCacheBackendViaFragment'), function (err, response) {
      expect(response.headers['cache-control']).to.be.equal('private, no-cache, max-age=0, must-revalidate, no-store');
      done();
    });
  });

  it('should pass no-cache, no-store, must-revalidate in Cache-control header from fragment response to client response and log the decision', function (done) {
    request.get(getPageComposerUrl('/noCacheBackendViaFragment', '?cx-debug=true'), function (err, response, content) {
      expect(response.headers['cache-control']).to.be.equal('private, no-cache, max-age=0, must-revalidate, no-store');
      expect(content).match(/console\.log\('Forcing no-cache because a fragment is telling us not to cache'\)/);
      done();
    });
  });

  it('should honor max-age when sent through in fragments', function (done) {
    setTimeout(function () {
      getSection('', '', '#max-age', function (text) {
        setTimeout(function () {
          getSection('', '', '#max-age', function (text2) {
            expect(text2).to.be.equal(text);
            setTimeout(function () {
              getSection('', '', '#max-age', function (text3) {
                expect(text3).not.to.be.equal(text);
                done();
              });
            }, 1000);
          });
        }, 50);
      });
    }, 1000); // Allow previous test cache to clear
  });

  it('should pass through non GET requests directly to the backend service along with headers and cookies', function (done) {
    var j = request.jar();
    var cookie = request.cookie('PostCookie=Hello');
    j.setCookie(cookie, getPageComposerUrl(), function () {
      request.post(getPageComposerUrl('post'), {
        jar: j,
        headers: { 'accept': 'text/html' }
      }, function (err, response, content) {
        expect(content).to.be("POST Hello");
        done();
      });
    });
  });

  it('should pass a cookie to a url when using a template', function (done) {
    var j = request.jar();
    var cookie = request.cookie('geo=US');
    j.setCookie(cookie, getPageComposerUrl(), function () {
      request.get(getPageComposerUrl(), {
        jar: j,
        headers: { 'accept': 'text/html' }
      }, function (err, response, content) {
        var $ = cheerio.load(content);
        expect($('#country').text()).to.be.equal('US');
        done();
      });
    });
  });

  it('should NOT pass through GET requests that have text/html content type to a backend service', function (done) {
    request.get(getPageComposerUrl('post'), { headers: { 'accept': 'text/html' } }, function (err, response, content) {
      expect(content).to.be("GET /post");
      done();
    });
  });

  it('should select the correct backend if a selectorFn is invoked', function (done) {
    request.get(getPageComposerUrl() + '?selectFn=true', { headers: { 'accept': 'text/html' } }, function (err, response, content) {
      var $ = cheerio.load(content);
      expect($('#select').text()).to.be.equal("This is the backend selected by a selector fn");
      done();
    });
  });

  it('should pass through content when a 403 status code is served and parse it', function (done) {
    request.get(getPageComposerUrl('403backend'), { headers: { 'accept': 'text/html' } }, function (err, response, content) {
      expect(response.statusCode).to.be.equal(403);
      expect(content).to.contain('This is a 403 response from a backend!');
      expect(content).to.contain('Replaced');
      done();
    });
  });

  it('should pass through content when a 403 status code is served by a fragment and parse it', function (done) {
    request.get(getPageComposerUrl('403'), { headers: { 'accept': 'text/html' } }, function (err, response, content) {
      expect(response.statusCode).to.be.equal(403);
      expect(content).to.contain('This is a 403 response from a backend!');
      expect(content).to.contain('Replaced');
      done();
    });
  });

  it('should use the handler functions to respond to a 302 status code in a fragment', function (done) {
    request.get(getPageComposerUrl('302backend'), {
      headers: { 'accept': 'text/html' },
      followRedirect: false
    }, function (err, response, content) {
      expect(response.statusCode).to.be.equal(302);
      expect(response.headers.location).to.be.equal('/replaced');
      done();
    });
  });

  it('should use the handler functions to respond to a 302 status code in a backend template', function (done) {
    request.get(getPageComposerUrl('302'), {
      headers: { 'accept': 'text/html' },
      followRedirect: false
    }, function (err, response, content) {
      expect(response.statusCode).to.be.equal(302);
      expect(response.headers.location).to.be.equal('/replaced');
      done();
    });
  });

  it('should never cache a response with a non 200 code even if it has a cache key and ttl', function (done) {
    request.get(getPageComposerUrl('302cached'), {
      headers: { 'accept': 'text/html' },
      followRedirect: false
    }, function (err, response, content) {
      expect(response.statusCode).to.be.equal(302);
      expect(response.headers.location).to.be.equal('/A');
      setTimeout(function() {
        request.get(getPageComposerUrl('302cached'), {
          headers: { 'accept': 'text/html' },
          followRedirect: false
        }, function (err, response, content) {
          expect(response.statusCode).to.be.equal(302);
          expect(response.headers.location).to.be.equal('/B');
          done();
        });
      }, 200);
    });
  });

  it('should allow handler functions to respond and update fragments', function (done) {
    request.get(getPageComposerUrl('418backend'), { headers: { 'accept': 'text/html' } }, function (err, response, content) {
      expect(response.statusCode).to.be.equal(200);
      var $ = cheerio.load(response.body);
      var handledValue = $('#handler').text();
      expect(handledValue).to.be('Teapot');
      done();
    });
  });

  it('should pass x-tracer to downstreams', function (done) {
    var requestUrl = getPageComposerUrl('tracer');
    request.get(requestUrl, {
      headers: {
        'accept': 'text/html',
        'x-tracer': 'willie wonka'
      }
    }, function (err, response) {
      expect(response.body).to.be('willie wonka');
      done();
    });
  });

  it('should pass accept-language to downstreams', function (done) {
    var requestUrl = getPageComposerUrl('lang');
    request.get(requestUrl, { headers: { 'accept': 'text/html', 'Accept-Language': 'es' } }, function (err, response) {
      expect(response.body).to.be('es');
      done();
    });
  });

  it('should pass user-agent to downstreams', function (done) {
    var requestUrl = getPageComposerUrl('ua');
    var ua = 'Mozilla/5.0 ;iPhone; CPU iPhone OS 8_1_2 like Mac OS X; AppleWebKit/600.1.4 ;KHTML, like Gecko; Version/8.0 Mobile/12B440 Safari/600.1.4';
    request.get(requestUrl, { headers: { 'accept': 'text/html', 'user-agent': ua } }, function (err, response) {
      expect(response.body).to.be(ua);
      done();
    });
  });

  it('should pass x-device to downstreams', function (done) {
    var requestUrl = getPageComposerUrl('device');
    var ua = 'Mozilla/5.0 ;iPhone; CPU iPhone OS 8_1_2 like Mac OS X; AppleWebKit/600.1.4 ;KHTML, like Gecko; Version/8.0 Mobile/12B440 Safari/600.1.4';
    request.get(requestUrl, { headers: { 'accept': 'text/html', 'user-agent': ua } }, function (err, response) {
      expect(response.body).to.be('phone');
      done();
    });
  });

  it('should forward specified headers to downstreams', function (done) {
    var requestUrl = getPageComposerUrl('header/x-geoip-country-code');
    request.get(requestUrl, {
      headers: {
        'accept': 'text/html',
        'x-geoip-country-code': 'GB'
      }
    }, function (err, response) {
      expect(response.body).to.be('GB');
      done();
    });
  });

  it('should pass a default accept header of text/html', function (done) {
    var requestUrl = getPageComposerUrl('header/accept');
    request.get(requestUrl, { headers: { 'accept': 'text/html' } }, function (err, response) {
      expect(response.body).to.be('text/html');
      done();
    });
  });

  it('should allow fragments to over ride the accept header', function (done) {
    var requestUrl = getPageComposerUrl();
    request.get(requestUrl, { headers: { 'accept': 'text/html' } }, function (err, response) {
      var $ = cheerio.load(response.body);
      var acceptValue = $('#accept').text();
      expect(acceptValue).to.be('application/json');
      done();
    });
  });

  it('should pass set-cookie headers upstream from a backend', function (done) {
    var requestUrl = getPageComposerUrl('set-cookie');
    request.get(requestUrl, { headers: { 'accept': 'text/html' } }, function (err, response) {
      expect(response.headers['set-cookie']).to.contain('hello=world; Path=/');
      expect(response.headers['set-cookie']).to.contain('another=cookie; Path=/');
      expect(response.headers['set-cookie']).to.contain('hello=again; Path=/');
      done();
    });
  });

  it('should retrieve bundles via the cx-bundle directive and cdn configuration using service supplied version numbers if appropriate', function (done) {
    var requestUrl = getPageComposerUrl('bundles');
    request.get(requestUrl, { headers: { 'accept': 'text/html' } }, function (err, response) {
      expect(response.statusCode).to.be(200);
      var $ = cheerio.load(response.body);
      var bundles = $('.bundle');
      expect(bundles['1'].attribs.src).to.be('http://localhost:5001/static/service-one/100/js/top.js');
      expect(bundles['2'].attribs.src).to.be('http://localhost:5001/static/service-two/YOU_SPECIFIED_A_BUNDLE_THAT_ISNT_AVAILABLE_TO_THIS_PAGE/js/top.js');
      done();
    });
  });

  it('should retrieve bundles via the cx-bundle directive and use cdn resolution if provided', function (done) {
    var requestUrl = getPageComposerUrl('bundles');
    request.get(requestUrl, { headers: { 'accept': 'text/html' } }, function (err, response) {
      expect(response.statusCode).to.be(200);
      var $ = cheerio.load(response.body);
      var bundles = $('.resolved-bundle');
      expect(bundles['1'].attribs.src).to.be('http://localhost:5001/resolved-static/service-resolved/123/js/top.js');
      done();
    });
  });

  it('should set the link headers when config.minified', function (done) {
    var requestUrl = getPageComposerUrl('bundles', null, true);
    request.get(requestUrl, { headers: { 'accept': 'text/html' } }, function (err, response) {
      expect(response.statusCode).to.be(200);
      expect(response.headers.link).to.be('<http://localhost:5001/resolved-static/service-resolved/123/js/top.js>; rel=preload; as=script');
      // var $ = cheerio.load(response.body);
      // var bundles = $('.resolved-bundle');
      // expect($(bundles[0]).text()).to.be('RESOLVED service-resolved >> 123 >> top.js.html');
      done();
    });
  });

  it('should retrieve images via the cx-src directive and cdn configuration using service supplied version numbers if appropriate', function (done) {
    var requestUrl = getPageComposerUrl('bundles');
    request.get(requestUrl, { headers: { 'accept': 'text/html' } }, function (err, response) {
      expect(response.statusCode).to.be(200);
      var $ = cheerio.load(response.body);
      var image = $('.image');
      expect(image['0'].attribs.src).to.be('http://localhost:5001/static/service-one/100/img/image.png');
      done();
    });
  });

  it('should retrieve images via the cx-src directive and use cdn resolution if provided', function (done) {
    var requestUrl = getPageComposerUrl('bundles');
    request.get(requestUrl, { headers: { 'accept': 'text/html' } }, function (err, response) {
      expect(response.statusCode).to.be(200);
      var $ = cheerio.load(response.body);
      var image = $('.resolved-image');
      expect(image['0'].attribs.src).to.be('http://localhost:5001/resolved-static/service-resolved/123/img/image.png');
      done();
    });
  });

  it('should parse cx-library tags', function (done) {
    request.get(getPageComposerUrl(), { headers: { 'accept': 'text/html' } }, function (err, response) {
      expect(response.statusCode).to.be(200);
      var $ = cheerio.load(response.body);
      var library = $('#library script');
      expect(library['0'].attribs.src).to.be('http://localhost:5001/static/vendor/library/bootstrap-0.3.0.js');
      done();
    });
  });

  it('should use allow you to specify a host over-ride to use instead of the target host', function (done) {
    var requestUrl = getPageComposerUrl('differenthost');
    request.get(requestUrl, { headers: { 'accept': 'text/html' } }, function (err, response) {
      expect(response.statusCode).to.be(200);
      expect(response.body).to.be('tes.co.uk');
      done();
    });
  });

  it('should not completely die with broken cookies', function (done) {
    var brokenCookie = "__gads=ID=5217e5ce98e5a5f6:T=1413059056:S=ALNI_MZDmTo6sr27tzMt9RUR65K4xSUWzw; s_fid=79BC0100183D81BE-2708D64605382DEA; TSLCookie=585108831577993685E2ADCF228581BE11AD0DA8B9E378FB8C33DF9B01E21E48C8991D75B61F24E8D7CA2A6A04B2F64B67A6D53A6A375B00EEE705EEADB6ED3FBE04E19D385F5DC89793ADB6978BC6EC17D52A7ED4740D3266C3EDDFCAC2AD881762439AD0485C24B5511984A9D21387921B85193D2689CF6A9B3CCA8CEA4E8939D187CC7327ABC47111A1840C251B1C49DB823713CB866BE0D9958BAAD8CF06D05762525DAD7741272E479BC07CA3D2B35DA1EC2FF8C9284C2996811D4E704573AF8A9E1D4BE609B50A6AC5B29FDC31DCA8460164A44EAB83B730BE565DCC7470EA6C66; TESCookie=XynqF84fIQqO6TMaKPbxsVTGdTQ48cl3KrcYfm0DYZX6eVdcjL9ySX0YHGtk4pqaIJG7TqCiS0%2b6J0bUJgfQR2B7b4AfikEDSl6lrxOdFL9jZQ0vNZuHz9f3Gzr%2f5wu6FSvssSUjGS1paLLxB1UH0idMUHD6RqydZQDVxWpo0BeYg6ZsuSv9XeksslbTqs7FbMetUqSC0JwIRkXsFb6tve7YkunuEg%2fYvrW%2fcsNb1p%2bHXQTWXCKFEa10PMCpXo%2fNw5fV5ofp4svALCnLWUlpO4TDMopHrADRfS3FezOIgQWqES2VQQGBD8lRYWn7ijS%2bUxTzYWBF1b1NWAlGbRORyOAUaq7uS0zvlQ6VuHPca98%3d; TESCookieUser=4241009; tp_ex=0; s_campaign=031114_Secondary-124726_email_et_3112014_%25%25%3DRedirectTo%28%40TOPTENURL7%29%3D%25%25; ET:recipientid=%25%25External_ID%25%25; ET:messageid=_; .TesApplication=9DA9A85E2E258EE23C0537C87F7D4F0DDD37CB5FDDFB44DD230E5CC584B58586EA35644839CA7F75DF6EC079ECFE5B99BE7C3E36EE93A651BA365EE935D7A16EE08793AB021FC95537FD5079CD75BB56EE5A2D438CB8B2F47C3AA3C4EE0C9B2DBE361889F1DD75E0D2F967193449D61191A2F75BEF3D2608CC75620EAE313938BA52495555F785ED8B8FA393FC84D7360D19507576B1BDB0A999B31835360C84B8F023AED31CCA8910BC13FDEF3476006C9FD16C11FBC133E67F1EC958332DF86447EDEFDC3AD59EDC4CB183B49D1F081AC586178FD3D2BCD9BDB16E561F70BD94E73EE404024542DD2DAFA317DCD5B310A79ABC441B01B44A8E3D5FFE922BE389AE91E41FDCB5F2A4FFBC6994812E769BC657007A26414CC2BD7EE68AC3EDD630D076B28048B428ECF42598DEDE9427CA3CAA856CDD46ACE57B85E8846A8674E37D75BCB29ABAAEB227F8EE6C996D994E0B06DF; __utmt_UA-13200995-3=1; s_cc=true; s_sq=%5B%5BB%5D%5D; __utma=233401627.2136099593.1404067931.1416513050.1416513139.14; __utmb=233401627.5.10.1416513139; __utmc=233401627; __utmz=233401627.1416513139.14.12.utmcsr=ET|utmccn=031114_Secondary_124726_%%=RedirectTo(@TOPTENURL7)=%%|utmcmd=email|utmctr=3112014|utmcct=_; __atuvc=0%7C43%2C0%7C44%2C7%7C45%2C0%7C46%2C3%7C47; __atuvs=546e4672cc74592b002";
    pcServer.init(5003, 'localhost', createEventHandler(), 'noWhitelist')(function () {
      request.get('http://localhost:5003/', {
        headers: {
          'accept': 'text/html',
          'cookie': _.clone(brokenCookie)
        }
      }, function (err, response) {
        expect(response.statusCode).to.be(200);
        var $ = cheerio.load(response.body);
        var cookieValue = $('#cookie').text();
        expect(cookieValue).to.be(brokenCookie);
        done();
      });
    });
  });

  it('should only allow cookies to pass through that are whitelisted', function (done) {
    var requestUrl = getPageComposerUrl();
    var j = request.jar();
    j.setCookie(request.cookie('CompoxureCookie=Test'), getPageComposerUrl());
    j.setCookie(request.cookie('AnotherCookie=Test'), getPageComposerUrl());
    j.setCookie(request.cookie('TSLCookie=Test'), getPageComposerUrl());
    request.get(requestUrl, { jar: j, headers: { 'accept': 'text/html' } }, function (err, response) {
      expect(response.statusCode).to.be(200);
      var $ = cheerio.load(response.body);
      var cookieValue = $('#cookie').text();
      expect(cookieValue).to.be('CompoxureCookie=Test; TSLCookie=Test');
      done();
    });
  });

  it('should be able to whitelist even with broken cookies', function (done) {
    var brokenCookie = "__gads=ID=5217e5ce98e5a5f6:T=1413059056:S=ALNI_MZDmTo6sr27tzMt9RUR65K4xSUWzw; s_fid=79BC0100183D81BE-2708D64605382DEA; TSLCookie=585108831577993685E2ADCF228581BE11AD0DA8B9E378FB8C33DF9B01E21E48C8991D75B61F24E8D7CA2A6A04B2F64B67A6D53A6A375B00EEE705EEADB6ED3FBE04E19D385F5DC89793ADB6978BC6EC17D52A7ED4740D3266C3EDDFCAC2AD881762439AD0485C24B5511984A9D21387921B85193D2689CF6A9B3CCA8CEA4E8939D187CC7327ABC47111A1840C251B1C49DB823713CB866BE0D9958BAAD8CF06D05762525DAD7741272E479BC07CA3D2B35DA1EC2FF8C9284C2996811D4E704573AF8A9E1D4BE609B50A6AC5B29FDC31DCA8460164A44EAB83B730BE565DCC7470EA6C66; TESCookie=XynqF84fIQqO6TMaKPbxsVTGdTQ48cl3KrcYfm0DYZX6eVdcjL9ySX0YHGtk4pqaIJG7TqCiS0%2b6J0bUJgfQR2B7b4AfikEDSl6lrxOdFL9jZQ0vNZuHz9f3Gzr%2f5wu6FSvssSUjGS1paLLxB1UH0idMUHD6RqydZQDVxWpo0BeYg6ZsuSv9XeksslbTqs7FbMetUqSC0JwIRkXsFb6tve7YkunuEg%2fYvrW%2fcsNb1p%2bHXQTWXCKFEa10PMCpXo%2fNw5fV5ofp4svALCnLWUlpO4TDMopHrADRfS3FezOIgQWqES2VQQGBD8lRYWn7ijS%2bUxTzYWBF1b1NWAlGbRORyOAUaq7uS0zvlQ6VuHPca98%3d; TESCookieUser=4241009; tp_ex=0; s_campaign=031114_Secondary-124726_email_et_3112014_%25%25%3DRedirectTo%28%40TOPTENURL7%29%3D%25%25; ET:recipientid=%25%25External_ID%25%25; ET:messageid=_; .TesApplication=9DA9A85E2E258EE23C0537C87F7D4F0DDD37CB5FDDFB44DD230E5CC584B58586EA35644839CA7F75DF6EC079ECFE5B99BE7C3E36EE93A651BA365EE935D7A16EE08793AB021FC95537FD5079CD75BB56EE5A2D438CB8B2F47C3AA3C4EE0C9B2DBE361889F1DD75E0D2F967193449D61191A2F75BEF3D2608CC75620EAE313938BA52495555F785ED8B8FA393FC84D7360D19507576B1BDB0A999B31835360C84B8F023AED31CCA8910BC13FDEF3476006C9FD16C11FBC133E67F1EC958332DF86447EDEFDC3AD59EDC4CB183B49D1F081AC586178FD3D2BCD9BDB16E561F70BD94E73EE404024542DD2DAFA317DCD5B310A79ABC441B01B44A8E3D5FFE922BE389AE91E41FDCB5F2A4FFBC6994812E769BC657007A26414CC2BD7EE68AC3EDD630D076B28048B428ECF42598DEDE9427CA3CAA856CDD46ACE57B85E8846A8674E37D75BCB29ABAAEB227F8EE6C996D994E0B06DF; __utmt_UA-13200995-3=1; s_cc=true; s_sq=%5B%5BB%5D%5D; __utma=233401627.2136099593.1404067931.1416513050.1416513139.14; __utmb=233401627.5.10.1416513139; __utmc=233401627; __utmz=233401627.1416513139.14.12.utmcsr=ET|utmccn=031114_Secondary_124726_%%=RedirectTo(@TOPTENURL7)=%%|utmcmd=email|utmctr=3112014|utmcct=_; __atuvc=0%7C43%2C0%7C44%2C7%7C45%2C0%7C46%2C3%7C47; __atuvs=546e4672cc74592b002";
    var tslCookie = "TSLCookie=585108831577993685E2ADCF228581BE11AD0DA8B9E378FB8C33DF9B01E21E48C8991D75B61F24E8D7CA2A6A04B2F64B67A6D53A6A375B00EEE705EEADB6ED3FBE04E19D385F5DC89793ADB6978BC6EC17D52A7ED4740D3266C3EDDFCAC2AD881762439AD0485C24B5511984A9D21387921B85193D2689CF6A9B3CCA8CEA4E8939D187CC7327ABC47111A1840C251B1C49DB823713CB866BE0D9958BAAD8CF06D05762525DAD7741272E479BC07CA3D2B35DA1EC2FF8C9284C2996811D4E704573AF8A9E1D4BE609B50A6AC5B29FDC31DCA8460164A44EAB83B730BE565DCC7470EA6C66";
    var requestUrl = getPageComposerUrl();
    request.get(requestUrl, {
      headers: {
        'accept': 'text/html',
        'cookie': _.clone(brokenCookie)
      }
    }, function (err, response) {
      expect(response.statusCode).to.be(200);
      var $ = cheerio.load(response.body);
      var cookieValue = $('#cookie').text();
      expect(cookieValue).to.be(tslCookie);
      done();
    });

  });

  it('should create a default handler if none provided', function (done) {
    pcServer.init(5002, 'localhost')(function () {
      done();
    });
  });

  it('should add content tags as requested', function (done) {
    var requestUrl = getPageComposerUrl('needs-content');
    request.get(requestUrl, { headers: { 'accept': 'text/html' } }, function (err, response, content) {
      var $ = cheerio.load(content);
      expect($('#item').text()).to.be.equal('bar');
      expect($('#tag').text()).to.be.equal('home');
      done();
    });
  });

  it('should ignore content tags if no context', function (done) {
    var requestUrl = getPageComposerUrl('needs-content-no-context');
    request.get(requestUrl, { headers: { 'accept': 'text/html' } }, function (err, response, content) {
      var $ = cheerio.load(content);
      expect($('#item').text()).to.be.equal('default');
      expect($('#tag').text()).to.be.equal('default');
      done();
    });
  });

  it('should allow use of variables in a backend target', function (done) {
    var requestUrl = getPageComposerUrl('variabletarget');
    request.get(requestUrl, { headers: { 'accept': 'text/html' } }, function (err, response, content) {
      var $ = cheerio.load(content);
      expect($('#declarative').text()).to.be.equal('Replaced');
      expect(response.statusCode).to.be(200);
      done();
    });
  });

  it('should use cache', function (done) {
    var requestUrl = getPageComposerUrl('random');
    var randomContent;
    request.get(requestUrl, { headers: { 'accept': 'text/html' } }, function (err, response, content) {
      randomContent = content;
      setTimeout(function () {
        request.get(requestUrl, { headers: { 'accept': 'text/html' } }, function (err, response, content) {
          expect(content).to.be(randomContent);
          done();
        });
      }, 100);
    });
  });

  it('should use cx-no-cache query string parameter', function (done) {
    var requestUrl = getPageComposerUrl('random', 'cx-no-cache=true');
    var randomContent;
    request.get(requestUrl, { headers: { 'accept': 'text/html' } }, function (err, response, content) {
      randomContent = content;
      setTimeout(function () {
        request.get(requestUrl, { headers: { 'accept': 'text/html' } }, function (err, response, content) {
          expect(content).not.to.be(randomContent);
          done();
        });
      }, 100);
    });
  });

  it('should use not cache fragments when backend has no cache key', function (done) {
    var requestUrl = getPageComposerUrl('nocachekey-alternate500');
    request.get(requestUrl, { headers: { 'accept': 'text/html' } }, function (err, response, content) {
      expect(response.statusCode).to.be(200);
      setTimeout(function () {
        request.get(requestUrl, { headers: { 'accept': 'text/html' } }, function (err, response, content) {
          expect(response.statusCode).to.be(500);
          done();
        });
      }, 100);
    });
  });

  it('should use cached headers when a backend 500s', function (done) {
    var requestUrl = getPageComposerUrl('alternate500');
    request.get(requestUrl, { headers: { 'accept': 'text/html' } }, function (err, response, content) {
      expect(response.statusCode).to.be(200);
      setTimeout(function () {
        request.get(requestUrl, { headers: { 'accept': 'text/html' } }, function (err, response, content) {
          var $ = cheerio.load(content);
          expect(response.statusCode).to.be(200);
          expect($('.bundle')['1'].attribs.src).to.be('http://localhost:5001/static/service-one/100/js/top.js');
          done();
        });
      }, 50);
    });
  });

  it('should accept array of pattern (first pattern)', function (done) {
    var requestUrl = getPageComposerUrl('arrayOfPattern1');
    request.get(requestUrl, { headers: { 'accept': 'text/html' } }, function (err, response, content) {
      expect(response.statusCode).to.be(200);
      expect(response.body).to.be('arrayOfPattern');
      done();
    });
  });

  it('should accept array of pattern (second pattern)', function (done) {
    var requestUrl = getPageComposerUrl('arrayOfPattern2');
    request.get(requestUrl, { headers: { 'accept': 'text/html' } }, function (err, response, content) {
      expect(response.statusCode).to.be(200);
      expect(response.body).to.be('arrayOfPattern');
      done();
    });
  });

  it('should allow & parse an additional fragment (cx-parse-me header)', function (done) {
    var requestUrl = getPageComposerUrl('nested-fragment');
    request.get(requestUrl, { headers: { 'accept': 'text/html' } }, function (err, response, content) {
      expect(response.statusCode).to.be(200);
      var $ = cheerio.load(response.body);
      var expectedHTML = '<div><h1>Welcome</h1><p>Welcome content</p></div>';
      expect(response.body).to.be(expectedHTML);
      expect($('h1').text()).to.be('Welcome');
      expect($('p').text()).to.be('Welcome content');
      done();
    });
  });

  it('should allow & parse an additional fragment (cx-parse-me tag)', function (done) {
    var requestUrl = getPageComposerUrl('nested-fragment-2');
    request.get(requestUrl, { headers: { 'accept': 'text/html' } }, function (err, response, content) {
      expect(response.statusCode).to.be(200);
      var $ = cheerio.load(response.body);
      var expectedHTML = '<div><h1>Welcome</h1><p>Welcome content</p></div>';
      expect(response.body).to.be(expectedHTML);
      expect($('h1').text()).to.be('Welcome');
      expect($('p').text()).to.be('Welcome content');
      done();
    });
  });

  it('should allow & parse multiple fragments', function (done) {
    var requestUrl = getPageComposerUrl('multiple-fragment');
    request.get(requestUrl, { headers: { 'accept': 'text/html' } }, function (err, response, content) {
      var $ = cheerio.load(response.body);
      var expectedHTML = '<body>' +
        '<header class="header">Header</header>' +
        '<main class="main"><p>bla bla bla</p></main>' +
        '<footer class="footer">Footer</footer>' +
        '</body>';
      expect(response.body).to.be(expectedHTML);
      expect($('.header').text()).to.be('Header');
      expect($('.main p').text()).to.be('bla bla bla');
      expect($('.footer').text()).to.be('Footer');
      done();
    });
  });

  it('should allow & parse an deep nesting fragments', function (done) {
    var requestUrl = getPageComposerUrl('nested-nested-fragment');
    request.get(requestUrl, { headers: { 'accept': 'text/html' } }, function (err, response, content) {
      expect(response.statusCode).to.be(200);
      var $ = cheerio.load(response.body);
      var expectedHTML = '<body>' +
        '<header class="header">Header</header>' +
        '<main class="main"><p>bla bla bla</p></main>' +
        '<footer class="footer">Footer</footer>' +
        '</body>';
      expect(response.body).to.be(expectedHTML);
      expect($('.header').text()).to.be('Header');
      expect($('.main p').text()).to.be('bla bla bla');
      expect($('.footer').text()).to.be('Footer');
      done();
    });
  });

  it('should stop parsing once \`fragmentPasses\` limit is reached', function (done) {
    var requestUrl = getPageComposerUrl('default-limit');
    request.get(requestUrl, { headers: { 'accept': 'text/html' } }, function (err, response, content) {
      expect(response.statusCode).to.be(200);
      expect(response.body).to.contain('cx-url="{{server:local}}/fragment5"');
      done();
    });
  });

  it('should not parse returned fragments without indicating header', function (done) {
    var requestUrl = getPageComposerUrl('wont-parse');
    request.get(requestUrl, { headers: { 'accept': 'text/html' } }, function (err, response, content) {
      expect(response.statusCode).to.be(200);
      expect(response.body).to.contain('cx-url="{{server:local}}/fragment5"');
      done();
    });
  })

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

    it('should use cx-layout', function (done) {
      var requestUrl = getPageComposerUrl('use-layout');
      request.get(requestUrl, { headers: { 'accept': 'text/html' } }, function (err, response) {
        expect(response.statusCode).to.be(200);
        expect(response.body).to.be('<html>hello Service resolved 2<div>world</div></html>');
        done();
      });
    });

    it('should pass device header to layout service', function (done) {
      var requestUrl = getPageComposerUrl('use-layout-with-device');
      request.get(requestUrl, { headers: { 'accept': 'text/html', 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 9_1 like Mac OS X) AppleWebKit/601.1.46 (KHTML, like Gecko) Version/9.0 Mobile/13B143 Safari/601.1' } }, function (err, response) {
        expect(response.statusCode).to.be(200);
        expect(response.body).to.be('<html>hello Service resolved 2<div>device-mobile</div></html>');
        done();
      });
    });

    it('should pass cookies to layout service', function (done) {
      var requestUrl = getPageComposerUrl('use-layout-with-cookie');
      request.get(requestUrl, { headers: { 'accept': 'text/html', 'cookie': 'siteCountry=US' } }, function (err, response) {
        expect(response.statusCode).to.be(200);
        expect(response.body).to.be('<html>hello Service resolved 2<div>siteCountry=US</div></html>');
        done();
      });
    });

    it('should use cx-layout, layout can contain bundle', function (done) {
      var requestUrl = getPageComposerUrl('use-layout-with-bundle');
      request.get(requestUrl, { headers: { 'accept': 'text/html' } }, function (err, response) {
        expect(response.statusCode).to.be(200);
        var $ = cheerio.load(response.body);
        expect($('.bundle')['1'].attribs.src).to.be('http://localhost:5001/resolved-static/service-resolved/123/js/top.js');
        done();
      });
    });

    it('should use cx-layout, layout can contain bundle, handshake is in the layout', function (done) {
      var requestUrl = getPageComposerUrl('use-layout-with-bundle2');
      request.get(requestUrl, { headers: { 'accept': 'text/html' } }, function (err, response) {
        expect(response.statusCode).to.be(200);
        var $ = cheerio.load(response.body);
        expect($('.bundle')['1'].attribs.src).to.be('http://localhost:5001/static/service-resolved2/123/js/top.js');
        done();
      });
    });

    it('should return multiple fragments with multiple urls in cx-url with \'default\' strategy', function (done) {
      var requestUrl = getPageComposerUrl('cx-strategy-default');
      request.get(requestUrl, { headers: { 'accept': 'text/html' } }, function (err, response, content) {
        var $ = cheerio.load(response.body);
        expect($('.container').text()).to.be('Welcome content fragment-1Welcome content fragment-2');
        done();
      });
    });

    it('should return first non empty fragment with multiple urls in cx-url with \'first-non-empty\' strategy', function (done) {
      var requestUrl = getPageComposerUrl('cx-strategy-first-non-empty');
      request.get(requestUrl, { headers: { 'accept': 'text/html' } }, function (err, response, content) {
        var $ = cheerio.load(response.body);
        expect($('.container').text()).to.be('Welcome content fragment-2');
        done();
      });
    });

  });

  context('Browser extension', function () {
    var template =
      "<div id='declarative' cx-replace-outer='true' cx-url='{{server:local}}/replaced' cx-cache-ttl='1' cx-cache-key='replace:declarative:browser-extension' cx-timeout='1s' class='block'>" +
      "Content to be replaced via a directive" +
      "</div>";

    it('should NOT parse POST requests generated by compoxure browser extension, if not enabled in config', function (done) {
      var requestOpts = {
        headers: { 'Content-Type': 'text/compoxure' },
        body: template
      };
      request.post(getPageComposerUrl('post'), requestOpts, function (err, response, content) {
        expect(content).to.be('POST undefined');
        done();
      });
    });
  });

  context('Slot handling', function () {
    it('should process simple slot definitions', function (done) {
      var requestUrl = getPageComposerUrl('cx-simple-slot-use');
      request.get(requestUrl, { headers: { 'accept': 'text/html' } }, function (err, response, content) {
        var expectedHTML = '<html>Slot1:<div>Slot1</div>Slot2:<div>For slot 2</div></html>';
        var $ = cheerio.load(response.body);
        expect(response.body).to.be(expectedHTML);
        expect($('div').slice(0, 1).text()).to.be('Slot1');
        done();
      });
    });

    it('shouldn\'t handle slot use without the header', function (done) {
      var requestUrl = getPageComposerUrl('cx-additional-slot-use');
      request.get(requestUrl, { headers: { 'accept': 'text/html' } }, function (err, response, content) {
        var $ = cheerio.load(response.body);
        expect(response.body).to.be('<html>Slot1:<div>Slot1SLOT3</div>Slot2:<div>For slot 2</div></html>');
        done();
      });
    });

    it('should handle combining content into slots', function (done) {
      var requestUrl = getPageComposerUrl('cx-double-slot-use');
      request.get(requestUrl, { headers: { 'accept': 'text/html' } }, function (err, response, content) {
        var expectedHTML = '<html>Slot1:<div>THISTHAT</div>Slot2:<div></div></html>';
        var $ = cheerio.load(response.body);
        expect(response.body).to.be(expectedHTML);
        expect($('div').slice(0, 1).text()).to.be('THISTHAT');
        done();
      });
    });

    it('should handle sub requests using slots', function (done) {
      var requestUrl = getPageComposerUrl('cx-slot-sub-request');
      request.get(requestUrl, { headers: { 'accept': 'text/html' } }, function (err, response, content) {
        var expectedHTML = '<html>Slot1:<div><p id="foo">Foo</p></div>Slot2:<div>Bar</div></html>';
        var $ = cheerio.load(response.body);
        expect(response.body).to.be(expectedHTML);
        expect($('#foo').text()).to.be('Foo');
        done();
      });
    });

    it('should handle sub requests using slots while leaving body in place', function (done) {
      var requestUrl = getPageComposerUrl('cx-slot-sub-request-2');
      request.get(requestUrl, { headers: { 'accept': 'text/html' } }, function (err, response, content) {
        var expectedHTML = '<html>Header:<div>Foo1Bar1</div>Content:<div>Leave behind me</div>Footer:<div>Foo2Bar2</div></html>';
        var $ = cheerio.load(response.body);
        expect(response.body).to.be(expectedHTML);
        expect($('div').slice(0, 1).text()).to.be('Foo1Bar1');
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
