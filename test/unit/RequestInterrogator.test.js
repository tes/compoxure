'use strict';

var _ = require('lodash');
var expect = require('expect.js');
var httpMocks = require('node-mocks-http');
var RequestInterrogator = require('../../src/parameters/RequestInterrogator');
var config = require('../common/testConfig.json');

describe('RequestInterrogator', function () {

  it('should generate the url object', function (done) {
    var req = httpMocks.createRequest({
      headers: {
        host: 'localhost:5000'
      },
      method: 'GET',
      url: '/teaching-resource/Queen-Elizabeth-II-Diamond-jubilee-2012-6206420'
    });
    req.connection = {};

    var interrogator = new RequestInterrogator(config.parameters, config.cdn || {}, { name: 'test' });

    interrogator.interrogateRequest(req, function (params) {
      var expectedPageUrl = 'http://localhost:5000/teaching-resource/Queen-Elizabeth-II-Diamond-jubilee-2012-6206420';
      expect(params).to.have.property('url:href', expectedPageUrl);
      expect(params).to.have.property('url:href:encoded', encodeURIComponent(expectedPageUrl));
      done();
    });
  });

  it('should extract parameters from the query', function (done) {
    var req = httpMocks.createRequest({
      method: 'GET',
      headers: {
        host: 'localhost:5000'
      },
      url: '/teaching-resource?storyCode=2206421'
    });
    req.connection = {};

    var interrogator = new RequestInterrogator({
      query: [{ key: 'storyCode', mapTo: 'resourceId' }]
    }, config.cdn || {}, { name: 'test' });

    interrogator.interrogateRequest(req, function (params) {
      expect(params).to.have.property('param:resourceId', '2206421');
      done();
    });
  });

  it('should only extract parameters from the query when they\'re not empty', function (done) {
    var req = httpMocks.createRequest({
      method: 'GET',
      headers: {
        host: 'localhost:5000'
      },
      url: '/teaching-resource?storyCode=2206421'
    });
    req.connection = {};

    var interrogator = new RequestInterrogator({
      query: [
        { key: 'storyCode', mapTo: 'resourceId' },
        { key: 'storycode', mapTo: 'resourceId' }
      ]
    }, config.cdn || {}, { name: 'test' });


    interrogator.interrogateRequest(req, function (params) {
      expect(params).to.have.property('param:resourceId', '2206421');

      req.url = '/teaching-resource?storycode=2206421'

      interrogator.interrogateRequest(req, function (params) {
        expect(params).to.have.property('param:resourceId', '2206421');
        done();
      });
    });
  });

  it('should extract parameters from the path', function (done) {
    var req = httpMocks.createRequest({
      method: 'GET',
      headers: {
        host: 'localhost:5000'
      },
      url: '/teaching-resource/Queen-Elizabeth-II-Diamond-jubilee-2012-6206420'
    });
    req.connection = {};

    var interrogator = new RequestInterrogator({
      urls: [{ pattern: '/teaching-resource/(.*)-(\\d+)', names: ['blurb', 'resourceId'] }]
    }, config.cdn || {}, { name: 'test' });

    interrogator.interrogateRequest(req, function (params) {
      expect(params).to.have.property('param:resourceId', '6206420');
      expect(params).to.have.property('param:blurb', 'Queen-Elizabeth-II-Diamond-jubilee-2012');
      done();
    });
  });

  it('should extract parameters from the path if multiple paths match', function (done) {
    var req = httpMocks.createRequest({
      method: 'GET',
      headers: {
        host: 'localhost:5000'
      },
      url: '/teaching-resource/Queen-Elizabeth-II-Diamond-jubilee-2012-6206420'
    });
    req.connection = {};

    var interrogator = new RequestInterrogator({
      urls: [
        { pattern: '/teaching-resource/.*-(\\d+)', names: ['resourceId'] },
        { pattern: '/teaching-resource/(.*)-\\d+', names: ['blurb'] }
      ]
    }, config.cdn || {}, { name: 'test' });

    interrogator.interrogateRequest(req, function (params) {
      expect(params).to.have.property('param:resourceId', '6206420');
      expect(params).to.have.property('param:blurb', 'Queen-Elizabeth-II-Diamond-jubilee-2012');
      done();
    });
  });

  it('should extract parameters, if multiple overlap it takes the last one', function (done) {
    var req = httpMocks.createRequest({
      method: 'GET',
      headers: {
        host: 'localhost:5000'
      },
      url: '/teaching-resource/Queen-Elizabeth-II-Diamond-jubilee-2012-6206420'
    });
    req.connection = {};

    var interrogator = new RequestInterrogator({
      urls: [
        { pattern: '/teaching-resource/.*-(\\d+)', names: ['resourceId'] },
        { pattern: '/teaching-resource/(.*)', names: ['blurb'] },
        { pattern: '/teaching-resource/(.*)-\\d+', names: ['blurb'] }
      ]
    }, config.cdn || {}, { name: 'test' });

    interrogator.interrogateRequest(req, function (params) {
      expect(params).to.have.property('param:resourceId', '6206420');
      expect(params).to.have.property('param:blurb', 'Queen-Elizabeth-II-Diamond-jubilee-2012');
      done();
    });
  });

  it('should extract url groups based on the path', function (done) {
    var req = httpMocks.createRequest({
      method: 'GET',
      headers: {
        host: 'localhost:5000'
      },
      url: '/teaching-resource/Queen-Elizabeth-II-Diamond-jubilee-2012-6206420'
    });
    req.connection = {};

    var interrogator = new RequestInterrogator(config.parameters, config.cdn || {}, { name: 'test' });

    interrogator.interrogateRequest(req, function (params) {
      expect(params).to.have.property('url:group', 'resources');
      done();
    });
  });

  it('should extract query parameters', function (done) {
    var req = httpMocks.createRequest({
      method: 'GET',
      headers: {
        host: 'localhost:5000'
      },
      url: '/teaching-resource/Queen-Elizabeth-II-Diamond-jubilee-2012-6206420?foo=bar'
    });
    req.connection = {};

    var interrogator = new RequestInterrogator(config.parameters, config.cdn || {}, { name: 'test' });

    interrogator.interrogateRequest(req, function (params) {
      expect(params).to.have.property('query:foo', 'bar');
      done();
    });
  });

  it('should extract headers', function (done) {
    var req = httpMocks.createRequest({
      method: 'GET',
      url: '/teaching-resource/Queen-Elizabeth-II-Diamond-jubilee-2012-6206420',
      headers: {
        'foo': 'bar',
        host: 'localhost:5000'
      }
    });
    req.connection = {};

    var interrogator = new RequestInterrogator(config.parameters, config.cdn || {}, { name: 'test' });

    interrogator.interrogateRequest(req, function (params) {
      expect(params).to.have.property('header:foo', 'bar');
      done();
    });
  });

  it('should extract cookies', function (done) {
    var req = httpMocks.createRequest({
      method: 'GET',
      headers: {
        host: 'localhost:5000'
      },
      url: '/teaching-resource/Queen-Elizabeth-II-Diamond-jubilee-2012-6206420',
      cookies: {
        'foo': 'bar'
      }
    });
    req.connection = {};

    var interrogator = new RequestInterrogator(config.parameters, config.cdn || {}, { name: 'test' });

    interrogator.interrogateRequest(req, function (params) {
      expect(params).to.have.property('cookie:foo', 'bar');
      done();
    });
  });

  it('should default user:userId if not logged in', function (done) {
    var req = httpMocks.createRequest({
      method: 'GET',
      headers: {
        host: 'localhost:5000'
      },
      url: '/teaching-resource/Queen-Elizabeth-II-Diamond-jubilee-2012-6206420'
    });
    req.connection = {};

    var interrogator = new RequestInterrogator(config.parameters, config.cdn || {}, { name: 'test' });

    interrogator.interrogateRequest(req, function (params) {
      expect(params).to.have.property('user:userId', '_');
      done();
    });
  });

  it('should get user from request', function (done) {

    var req = httpMocks.createRequest({
      method: 'GET',
      headers: {
        host: 'localhost:5000'
      },
      url: '/teaching-resource/Queen-Elizabeth-II-Diamond-jubilee-2012-6206420'
    });
    req.connection = {};
    req.user = {
      userId: 13579,
      displayName: 'will.i.am'
    };

    var interrogator = new RequestInterrogator(config.parameters, config.cdn || {}, { name: 'test' });

    interrogator.interrogateRequest(req, function (params) {
      _.forOwn(req.user, function (value, key) {
        expect(params).to.have.property('user:' + key, value);
      });
      done();
    });
  });


  it('should set a loggedIn flag to true if user is logged in', function (done) {
    var req = httpMocks.createRequest({
      method: 'GET',
      headers: {
        host: 'localhost:5000'
      },
      url: '/teaching-resource/Queen-Elizabeth-II-Diamond-jubilee-2012-6206420',
      user: {
        userId: 13579,
        displayName: 'will.i.am'
      }
    });
    req.connection = {};

    var interrogator = new RequestInterrogator(config.parameters, config.cdn || {}, { name: 'test' });

    interrogator.interrogateRequest(req, function (params) {
      expect(params).to.have.property('user:loggedIn', true);
      done();
    });
  });



  it('should set a loggedIn flag to false if user is not logged in', function (done) {
    var req = httpMocks.createRequest({
      method: 'GET',
      headers: {
        host: 'localhost:5000'
      },
      url: '/teaching-resource/Queen-Elizabeth-II-Diamond-jubilee-2012-6206420'
    });
    req.connection = {};

    var interrogator = new RequestInterrogator(config.parameters, config.cdn || {}, { name: 'test' });

    interrogator.interrogateRequest(req, function (params) {
      expect(params).to.have.property('user:loggedIn', false);
      done();
    });
  });

  it('should get parse the user agent and generate a phone device type', function (done) {

    var req = httpMocks.createRequest({
      method: 'GET',
      headers: {
        'user-agent': 'Mozilla/5.0(iPhone;U;CPUiPhoneOS4_0likeMacOSX;en-us)AppleWebKit/532.9(KHTML,likeGecko)Version/4.0.5Mobile/8A293Safari/6531.22.7'
      },
      url: '/teaching-resource/Queen-Elizabeth-II-Diamond-jubilee-2012-6206420'
    });
    req.connection = {};

    var interrogator = new RequestInterrogator(config.parameters, config.cdn || {}, { name: 'test' });

    interrogator.interrogateRequest(req, function (params) {
      expect(params).to.have.property('device:type', 'phone');
      done();
    });

  });

  it('should get parse the user agent and generate a desktop device type', function (done) {

    var req = httpMocks.createRequest({
      method: 'GET',
      headers: {
        'user-agent': 'Mozilla/5.0 ;Windows NT 6.1; WOW64; Trident/7.0; rv:11.0; like Gecko'
      },
      url: '/teaching-resource/Queen-Elizabeth-II-Diamond-jubilee-2012-6206420'
    });
    req.connection = {};

    var interrogator = new RequestInterrogator(config.parameters, config.cdn || {}, { name: 'test' });

    interrogator.interrogateRequest(req, function (params) {
      expect(params).to.have.property('device:type', 'desktop');
      done();
    });

  });

  it('should get parse the user agent and set to desktop if not known', function (done) {

    var req = httpMocks.createRequest({
      method: 'GET',
      headers: {},
      url: '/teaching-resource/Queen-Elizabeth-II-Diamond-jubilee-2012-6206420'
    });
    req.connection = {};

    var interrogator = new RequestInterrogator(config.parameters, config.cdn || {}, { name: 'test' });

    interrogator.interrogateRequest(req, function (params) {
      expect(params).to.have.property('device:type', 'desktop');
      done();
    });

  });

  it('should parse cdn url configuration using template variables', function (done) {

    var req = httpMocks.createRequest({
      method: 'GET',
      headers: {
        host: 'localhost:5000'
      },
      url: '/teaching-resource/Queen-Elizabeth-II-Diamond-jubilee-2012-6206420'
    });
    req.connection = {};

    var interrogator = new RequestInterrogator(config.parameters, config.cdn || {}, { name: 'test' });

    interrogator.interrogateRequest(req, function (params) {
      expect(params).to.have.property('cdn:url', 'http://localhost:5001/static/');
      done();
    });
  });

  it('should pass experiment variables through so they can be used', function (done) {
    var req = httpMocks.createRequest({
      headers: {
        host: 'localhost:5000'
      },
      experiments: {
        test: 'A'
      },
      method: 'GET',
      url: '/teaching-resource/Queen-Elizabeth-II-Diamond-jubilee-2012-6206420'
    });
    req.connection = {};

    var interrogator = new RequestInterrogator(config.parameters, config.cdn || {}, { name: 'test' });

    interrogator.interrogateRequest(req, function (params) {
      var expectedPageUrl = 'http://localhost:5000/teaching-resource/Queen-Elizabeth-II-Diamond-jubilee-2012-6206420';
      expect(params).to.have.property('experiments:test', 'A');
      done();
    });
  });

});
