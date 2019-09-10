var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var ware = require('ware');
var debug = require('debug')('compoxure');
var utils = require('./src/utils');


module.exports = function(config, eventHandler, optionsTransformer) {

  eventHandler = eventHandler || {};
  eventHandler.logger = eventHandler.logger || function() {};
  eventHandler.stats = eventHandler.stats || function() {};
  eventHandler.inspection = eventHandler.inspection || function() {};

  optionsTransformer = optionsTransformer || function(req, options, next) { next(null, options); };

  var inspectionMiddleware = function(req, res, next) {
    try {
      eventHandler.inspection(req, utils.getBackendConfig(config, req.url, req));
    } catch (e) {
      debug('Caught eventHandler.inspection error', e);
      eventHandler.logger('error', 'Caught eventHandler.inspection error', { error: e });
    }
    next();
  };

  var backendProxyMiddleware = require('./src/middleware/proxy')(config, eventHandler, optionsTransformer);
  var cacheMiddleware = require('reliable-get/CacheMiddleware')(config);
  var selectBackend = require('./src/middleware/backend')(config);
  var rejectUnsupportedMediaType = require('./src/middleware/mediatypes');
  var passThrough = require('./src/middleware/passthrough')(config);
  var interrogateRequest = require('./src/middleware/interrorgator')(config, eventHandler);
  var cleanInvalidUri = require('./src/middleware/invalidurl')(eventHandler);
  var dropFavIcon = require('./src/middleware/favicon');

  var middleware = ware()
                    .use(cleanInvalidUri)
                    .use(dropFavIcon)
                    .use(inspectionMiddleware)
                    .use(cacheMiddleware)
                    .use(interrogateRequest)
                    .use(selectBackend)
                    .use(rejectUnsupportedMediaType)
                    .use(passThrough)
                    .use(cookieParser)
                    .use(bodyParser.text({type: 'text/compoxure'}))
                    .use(backendProxyMiddleware);

  return function(req, res) {
    middleware.run(req, res, function(err) {
        if(err) {
            debug('Caught compoxure error', err);
            // Just end fast - headers sent above if needed.
            res.end('');
        }
    });
  }

};
