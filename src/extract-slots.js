var htmlparser = require('htmlparser2');
var Core = require('parxer/lib/core');
var voidElements = require('parxer/lib/void');
var attr = require('parxer/lib/attr');

function extractSlots(content, callback) {
    var currentSlot;
    var depth;
    var selfClosing;
    var slots = {};

    var config = {};
    // Defaults
    config.prefix = config.prefix || 'cx-';
    config.rawSuffix = config.rawSuffix || '-raw';

    var parser = new htmlparser.Parser({
        onopentag: function(tagname, attribs) {
            var useSlot = attr.getAttr(config.prefix + 'use-slot', attribs);
            if (useSlot){
                currentSlot = attribs[useSlot];
                depth = 1;
                slots[currentSlot] = slots[currentSlot] || '';
            } else if (currentSlot) {
                if(voidElements[tagname]) {
                    selfClosing = true;
                } else {
                    selfClosing = false;
                }
                depth++;
                slots[currentSlot] += Core.createTag(tagname, attribs, selfClosing);
            }
        },
        onprocessinginstruction: function(name, data) {
            if (currentSlot) {
                slots[currentSlot] += '<' + data + '>';
            }
        },
        ontext:function(data) {
            if (currentSlot) {
                slots[currentSlot] += data;
            }
        },
        oncomment: function(data) {
            if (currentSlot) {
                slots[currentSlot] += '<!--' + data;
            }
        },
        oncommentend: function() {
            if (currentSlot) {
                slots[currentSlot] += '-->';
            }
        },
        onclosetag: function(tagname) {
            if (currentSlot) {
                depth--;
                if (depth === 0) {
                    currentSlot = undefined;
                    return;
                }
                if (!selfClosing) {
                    slots[currentSlot] += '</' + tagname + '>';
                } else {
                    selfClosing = false;
                }
            }
        },
        onend: function() {
            callback(null, slots);
        },
        recognizeSelfClosing: true
    });
    parser.end(content);
}

module.exports = extractSlots;
