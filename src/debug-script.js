/*jslint browser: true, boss:true */
(function (w, d) {

  var elBetweenDelimiters = function (first, last) {
    var els = [];
    var el = first;

    while (el = el.nextSibling) {
      if (el === last) {
        return els;
      }
      els.push(el);
    }
  };

  var markNodes = function (openTag) {
    var data = JSON.parse(openTag.innerHTML);
    var id = openTag.getAttribute('data-cx-open-id');
    var closeTag = d.querySelector('script[data-cx-close-id="' + id + '"]');
    var nodes = elBetweenDelimiters(openTag, closeTag);
    console.log('cx fragment', data, nodes);
    nodes.forEach(function (el) {
      el.cxDebugId = id;
      el.cxDebugData = data;
      el.cxDebugNodes = nodes;
    });
  };

  var openTags = d.querySelectorAll('script[type="cx-debug-open"]');
  Array.prototype.forEach.call(openTags, markNodes);

}(window, document));