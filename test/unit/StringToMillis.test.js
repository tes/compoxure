'use strict';

var expect = require('expect.js');
var utils = require('../../src/utils');

describe('Utility Library', function () {

  it('Should be able to concert simple time strings to millisecond values', function () {
    expect(utils.timeToMillis("1000")).to.be.equal(1000);
    expect(utils.timeToMillis("1s")).to.be.equal(1000);
    expect(utils.timeToMillis("1m")).to.be.equal(1000 * 60);
    expect(utils.timeToMillis("1ms")).to.be.equal(1);
    expect(utils.timeToMillis("1h")).to.be.equal(1000 * 60 * 60);
    expect(utils.timeToMillis("5d")).to.be.equal(1000 * 60 * 60 * 24 * 5);
  });

});
