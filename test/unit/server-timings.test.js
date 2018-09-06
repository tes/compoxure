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
      utils.appendServerTimings(res, 'label', 'test timing', 123);
      expect(res.getHeader('Server-Timing')).to.be('cx-label;desc="test timing"; dur=123');
    });
    it('uses decimals', function () {
      var res = getRes();
      utils.appendServerTimings(res, 'label', 'test timing', 123.45);
      expect(res.getHeader('Server-Timing')).to.be('cx-label;desc="test timing"; dur=123.45');
    });
    it('appends', function () {
      var res = getRes();
      res.setHeader('Server-Timing', 'xxx')
      utils.appendServerTimings(res, 'label', 'test timing', 123.45);
      expect(res.getHeader('Server-Timing')).to.be('xxx,cx-label;desc="test timing"; dur=123.45');
    });
});
