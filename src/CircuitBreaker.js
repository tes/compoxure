/*
 * Simple circuit breaker to wrap third party service calls.
 * To disable, simply do not configure the 'circuitbreaker' section of the
 * configuration file.
 * 
 * Each circuit breaker is keyed off the hostname and path of the service.
 * 
 */

var url = require('url');
var sf = require('sf');
var CircuitBreaker = require('circuit-breaker-js');
var breakers = {};

module.exports = function(options, config, eventHandler, command, next) {

    var parsedUrl = url.parse(options.url);
    var cbKey = parsedUrl.host;

    if(config.circuitbreaker && config.circuitbreaker.includePath) cbKey += parsedUrl.pathname;

    setupBreaker(cbKey);

    var cbCommand = function(success, failed) {
      command(function(err, arg1, arg2, arg3) {
        if(!err) { success() } else { failed() };
        next(err,  arg1, arg2, arg3);
      });
    };

    var fallback = function() {
      var message = sf('Service at {cbKey} has circuit breaker engaged.', {
            cbKey: cbKey
      });
      next({statusCode: 500, message:message});
    };

    breakers[cbKey].run(cbCommand, fallback);

    function setupBreaker() {

        if(!config.circuitbreaker) {
            breakers[cbKey] = {
                run: function(command, fallback) {
                    command(function() {}, function() {});
                }
            }
            return;
        }

        var cbOptions = {
            windowDuration: config.circuitbreaker.windowDuration || 10000,
            numBuckets: config.circuitbreaker.numBuckets || 10,
            errorThreshold: config.circuitbreaker.errorThreshold || 50,
            volumeThreshold: config.circuitbreaker.volumeThreshold || 10,
            onCircuitOpen: onCircuitOpen,
            onCircuitClose: onCircuitClose
        }

        breakers[cbKey] = breakers[cbKey] || new CircuitBreaker(cbOptions);

    }

    function onCircuitOpen(metrics) {
        eventHandler.logger('error', 'CIRCUIT BREAKER OPEN for host ' + cbKey,{
            tracer:options.tracer,
            pcType:options.type,
            circuitTotalCount: metrics.totalCount,
            circuitErrorCount: metrics.errorCount,
            circuitErrorPercentage:metrics.errorPercentage});
    }

    function onCircuitClose(metrics) {
        eventHandler.logger('info', 'CIRCUIT BREAKER CLOSED for host ' + cbKey,{
            tracer:options.tracer,
            pcType:options.type,
            circuitTotalCount: metrics.totalCount,
            circuitErrorCount: metrics.errorCount,
            circuitErrorPercentage:metrics.errorPercentage});
    }

}