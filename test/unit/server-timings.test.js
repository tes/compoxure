'use strict';

var expect = require('expect.js');
var utils = require('../../src/utils');

function getRes() {
  var headers = {};
  return {
    getHeader: function (name) {
      return headers[name];
    },
    setHeader: function (name, value) {
      headers[name] = value;
    }
  };
}

describe('appendServerTimings', function () {
    it('is a function', function () {
      expect(typeof utils.appendServerTimings).to.be.equal('function');
    });
    it('append to header', function () {
      var res = getRes();
      utils.appendServerTimings(res, 'test timing', 123);
      expect(res.getHeader('Server-Timing').match(/tt-[0-9a-z]{4}=123; "test timing"/)).to.be.ok();
    });
    it('uses decimals', function () {
      var res = getRes();
      utils.appendServerTimings(res, 'test timing', 123.45);
      expect(res.getHeader('Server-Timing').match(/tt-[0-9a-z]{4}=123.45; "test timing"/)).to.be.ok();
    });
    it('appends', function () {
      var res = getRes();
      res.setHeader('Server-Timing', 'xxx')
      utils.appendServerTimings(res, 'test timing', 123.45);
      expect(res.getHeader('Server-Timing').match(/xxx,tt-[0-9a-z]{4}=123.45; "test timing"/)).to.be.ok();
    });
});
