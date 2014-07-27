'use strict';

module.exports = transform;

function transform(config, cxConfig) {

    return {
        query: cxConfig.query,
        func: function() {
            return function(node) {            	
                node.createWriteStream({ outer: true }).end("");
            };
        }
    };

}