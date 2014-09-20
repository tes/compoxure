document.addEventListener("DOMContentLoaded", function() {
  renderStats();
});

function renderStats() {

	var tooltips = [];
	for(key in cxStats) {
		var selector = '[cx-url="' + key + '"]';
		var fragment = document.querySelector(selector);
		if(fragment) {
			var stick = fragment.offsetLeft < 500 ? "right" : "left";
			tooltips.push({
				contentText: cxHtml[key],
				targetSelector: selector,
				color: getColor(cxStats[key].status),
				stickTo: stick
			});
			fragment.classList.add('cx-stats-fragment-' + cxStats[key].status);
		}
	}

	html5tooltips(tooltips);
}

function getColor(status) {
	if(status == 'OK') return 'grass';
	if(status == 'ERROR') return 'scarlet';
	if(status == 'STALE') return 'terra-cotta';
}