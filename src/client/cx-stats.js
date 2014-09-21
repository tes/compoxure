document.addEventListener("DOMContentLoaded", function() {
  renderStats();
});

function renderStats() {

	var tooltips = [];
	for(key in cxStats) {
		var upUrl = cxStats[key].options.unparsedUrl;
		var selector = '[cx-url="' + upUrl + '"]';
		var fragment = document.querySelector(selector);
		if(fragment) {
			fragment.classList.add('cx-stats-fragment-' + cxStats[key].status);
			fragment.insertAdjacentHTML('afterbegin', '<a id="cx-debug-' + key + '" class="cx-debug-icon" href="#cx-fragment-' + key + '"></a>');
			$("#cx-debug-" + key).leanModal({ top : 200, overlay : 0.6, closeButton: ".modal_close" });
		}
	}

}

function getColor(status) {
	if(status == 'OK') return 'grass';
	if(status == 'ERROR') return 'scarlet';
	if(status == 'STALE') return 'terra-cotta';
}