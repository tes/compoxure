/**
 * Simple in memory stats object per request for displaying stats in developer mode
 */

var _ = require('lodash');
var fs = require('fs');
var Hogan = require('hogan.js');

module.exports = DebugMode;

function DebugMode() {
	var self = this;
    self.data = {}
}

DebugMode.prototype.add = function(fragmentUrl, data) {
	var self = this;
	var data = _.clone(data);
    self.data[fragmentUrl] = _.merge(data, self.data[fragmentUrl] || {});
};

DebugMode.prototype.render = function() {
	var self = this;
	// sync read JS - ok as this is only used in dev or debug
	var js = fs.readFileSync(__dirname + '/client/cx-stats.js');
	var jsLib = fs.readFileSync(__dirname + '/client/cx-libs.js');
	var css = fs.readFileSync(__dirname + '/client/cx-stats.css');
	var htmlTemplate = Hogan.compile(fs.readFileSync(__dirname + '/client/cx-template.html').toString());

	// Run each fragment through the template;
	var html = {};
	for(key in self.data) {
		html[key] = htmlTemplate.render(self.data[key])
	}
	var output = ["<style>",css,"</style>","<script>","var cxStats = " + JSON.stringify(self.data, null, 4), "var cxHtml = " + JSON.stringify(html, null, 4),jsLib,js,"</script>"].join("\n");
	return output;
};
