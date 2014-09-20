document.addEventListener("DOMContentLoaded", function() {
  renderStats();
});

function renderStats() {

	var tooltips = [];
	for(key in cxStats) {
		var selector = '[cx-url="' + key + '"]';
		var fragment = document.querySelector(selector);
		tooltips.push({
			contentText: cxHtml[key],
			targetSelector: selector,
			color: getColor(cxStats[key].status)
		});
		fragment.classList.add('cx-stats-fragment-' + cxStats[key].status);
	}


	html5tooltips(tooltips);
}

function getColor(status) {
	if(status == 'OK') return 'grass';
	if(status == 'ERROR') return 'scarlet';
	if(status == 'STALE') return 'terra-cotta';
}