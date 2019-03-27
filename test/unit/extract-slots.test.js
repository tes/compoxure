'use strict';

var _ = require('lodash');
var expect = require('expect.js');
var extractSlots = require('../../src/extract-slots');

describe('extractSlot', function () {
    it('is a function', function () {
      expect(typeof extractSlots).to.be.equal('function');
    });

    it('parses a simple mark-up', function (done) {
      var s = '<p></p><p cx-use-slot="content">this is the <b>content</b></p><p></p>';
      extractSlots(s, function (err, slots) {
        expect(slots).to.eql({ content: 'this is the <b>content</b>' });
        done();
      });
    });

    it('parses a custom tags', function (done) {
      var s = '<p></p><compoxure cx-use-slot="content">this is the <b>content</b></compoxure><p></p>';
      extractSlots(s, function (err, slots) {
        expect(slots).to.eql({ content: 'this is the <b>content</b>' });
        done();
      });
    });

    it('deals with self closed tags (xhtml style)', function (done) {
      var s = '<p></p><p cx-use-slot="content">this is the <b>con<br/>tent</b></p><p></p>';
      extractSlots(s, function (err, slots) {
        expect(slots).to.eql({ content: 'this is the <b>con<br/>tent</b>' });
        done();
      });
    });

    it('deals with self closed tags (html style)', function (done) {
      var s = '<p></p><p cx-use-slot="content">this is the <b>con<br>tent</b></p><p></p>';
      extractSlots(s, function (err, slots) {
        expect(slots).to.eql({ content: 'this is the <b>con<br/>tent</b>' });
        done();
      });
    });

    it('extract 2 slots', function (done) {
      var s = '<p></p><p cx-use-slot="content">this is the <b>content</b></p><p><div cx-use-slot="content2">foo bar</div></p>';
      extractSlots(s, function (err, slots) {
        expect(slots).to.eql({ content: 'this is the <b>content</b>',
          content2: 'foo bar' });
        done();
      });
    });

    it('extract 2 slots with same name', function (done) {
      var s = '<p></p><p cx-use-slot="content">this is the <b>content</b></p><p><div cx-use-slot="content">foo bar</div></p>';
      extractSlots(s, function (err, slots) {
        expect(slots).to.eql({
          content: 'this is the <b>content</b>foo bar',
        });
        done();
      });
    });

    it('extracts nested slots', function (done) {
      var s = '<div cx-use-slot="header" cx-replace-outer="true">Foo1</div><div cx-use-slot="footer">Foo2</div><div cx-use-slot="content"><span cx-use-slot="header" cx-replace-outer="true">Bar1</span><span cx-use-slot="footer" cx-replace-outer="true">Bar2</span>Leave behind me</div>';
      extractSlots(s, function (err, slots) {
        expect(slots).to.eql({
          header: 'Foo1Bar1',
          footer: 'Foo2Bar2',
          content: 'Leave behind me',
        });
        done();
      });
    });

    //
});
