var expect = require('expect.js');

var createBackendMiddleware = require('../../src/middleware/backend');

describe('Middleware', function () {
  describe('Backend', function () {
    it('accepts config without backend', function () {
      expect(function() {
        createBackendMiddleware({});
      }).to.not.throwException();
    });
    it('accepts config without duplicate backend names', function () {
      expect(function() {
        createBackendMiddleware({ backend: [
          {},
          { name: 'foo' },
          { name: 'bar' },
        ] });
      }).to.not.throwException();
    });
    it('accepts config with multiple unnamed backends', function () {
      expect(function() {
        createBackendMiddleware({ backend: [
          {},
          {},
          { name: 'foo' },
          { name: 'bar' },
        ] });
      }).to.not.throwException();
    });
    it('rejects config with duplicate backend names', function () {
      expect(function() {
        createBackendMiddleware({ backend: [
          { name: 'foo' },
          { name: 'foo' },
          { name: 'bar' },
          { name: 'bar' },
        ] });
      }).to.throwException(/foo, bar/);
    });
  });
});
