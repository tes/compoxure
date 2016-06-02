/**
 * Simple static benchmark for Compoxure, using simple proxy and backend.
 */
var async = require('async');
var request = require('request');
var nrequests = 5000;

function runBackendBenchmark(next) {

  var count = 0, timing = Date.now();
  async.whilst(
    function () { return count < nrequests; },
    function (callback) {
      request({
        url: 'http://localhost:5001/backend.html',
        headers: { 'Accept': 'text/html' }
      }, function (error, response) {
        if (!error && response.statusCode == 200) {
          count++;
          callback();
        }
      });
    },
    function (err) {
      next(err, (Date.now() - timing));
    }
  );

}

function runProxyBenchmark(next) {

  var count = 0, timing = Date.now();
  async.whilst(
    function () { return count < nrequests; },
    function (callback) {
      count++;
      request({
        url: 'http://localhost:5000/backend.html',
        headers: { 'Accept': 'text/html' }
      }, function (error, response) {
        if (!error && response.statusCode == 200) {
          callback();
        }
      });
    },
    function (err) {
      next(err, (Date.now() - timing));
    }
  );

}

var cluster = require('cluster');
if (cluster.isMaster) {
  cluster.fork({ mode: 'proxy', logging: false });
  cluster.fork({ mode: 'backend', logging: false });
  cluster.fork({ mode: 'benchmark' });
} else {
  if (process.env.mode == 'proxy') { require('./proxy'); }
  if (process.env.mode == 'backend') { require('./backend'); }
  if (process.env.mode == 'benchmark') {
    setTimeout(function () {
      console.log('Running backend benchmark ...')
      runBackendBenchmark(function (err, backendTiming) {
        console.log('Running compoxure proxy benchmark ...')
        runProxyBenchmark(function (err, proxyTiming) {
          console.log('Backend: ' + Math.floor(backendTiming / 1000) + ' s, at ' + Math.floor(nrequests / (backendTiming / 1000)) + ' req/s');
          console.log('Proxy: ' + Math.floor(proxyTiming / 1000) + ' s, at ' + Math.floor(nrequests / (proxyTiming / 1000)) + ' req/s');
          console.log('Difference: ' + Math.floor(Math.floor(nrequests / (proxyTiming / 1000)) / Math.floor(nrequests / (backendTiming / 1000)) * 100) + '%');
          console.log('ctrl-c to exit');
        });
      });
    }, 1000);
  }
}
