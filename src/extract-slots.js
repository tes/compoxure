var htmlparser = require('htmlparser2');
var Core = require('parxer/lib/core');
var voidElements = require('parxer/lib/void');
var attr = require('parxer/lib/attr');

function extractSlots(content, callback) {
    var currentSlot;
    var selfClosing;
    var slots = {};
    var slotStack = [];
    var selfClosingStack = [];

    var config = {};
    // Defaults
    config.prefix = config.prefix || 'cx-';
    config.rawSuffix = config.rawSuffix || '-raw';

    var parser = new htmlparser.Parser({
        onopentag: function(tagname, attribs) {
          currentSlot = slotStack.length ? slotStack[slotStack.length - 1] : undefined;
            var useSlot = attr.getAttr(config.prefix + 'use-slot', attribs);
            if (useSlot){
              currentSlot = attribs[useSlot];
                slots[currentSlot] = slots[currentSlot] || '';
            } else if (currentSlot) {
                if(voidElements[tagname]) {
                    selfClosing = true;
                } else {
                    selfClosing = false;
                }
                slots[currentSlot] += Core.createTag(tagname, attribs, selfClosing);
            }
            // Keep track of the stack
            slotStack.push(currentSlot);
            selfClosingStack.push(selfClosing);
          },
        onprocessinginstruction: function(name, data) {
            if (currentSlot) {
                slots[currentSlot] += '<' + data + '>';
            }
        },
        ontext:function(data) {
          currentSlot = slotStack.length ? slotStack[slotStack.length - 1] : undefined;
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
            currentSlot = slotStack.pop();
            selfClosing = selfClosingStack.pop();

            if (currentSlot) {
                if (slotStack.length===0 || !slotStack[slotStack.length - 1] || slotStack[slotStack.length - 1] !== currentSlot) {
                  currentSlot = slotStack.length ? slotStack[slotStack.length - 1] : undefined;
                  return;
                }
                if (!selfClosing) {
                  slots[currentSlot] += '</' + tagname + '>';
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
