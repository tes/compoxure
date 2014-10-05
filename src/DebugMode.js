/**
 * Simple in memory stats object per request for displaying stats in developer mode
 */

var _ = require('lodash');
var fs = require('fs');
var Hogan = require('hogan.js');
var crypto = require('crypto');

function DebugMode() {
	var self = this;
    self.data = {}
}

module.exports = DebugMode;

DebugMode.prototype.add = function(fragmentUrl, data) {
	var self = this;
	var debugData = _.clone(data);
	var hash = crypto.createHash('md5').update(fragmentUrl).digest('hex');
	debugData.hash = hash;
    self.data[hash] = _.merge(debugData, self.data[hash] || {});
};

DebugMode.prototype.render = function() {
	var self = this;
	// sync read JS - ok as this is only used in dev or debug
	var js = fs.readFileSync(__dirname + '/client/cx-stats.js');
	var jsLib = fs.readFileSync(__dirname + '/client/cx-libs.js');
	var css = fs.readFileSync(__dirname + '/client/cx-stats.css');
	var htmlTemplate = Hogan.compile(fs.readFileSync(__dirname + '/client/cx-template.html').toString());

	// Run each fragment through the template;
	var output = ['<style>',css,'</style>','<script>','var cxStats = ' + JSON.stringify(self.data, null, 4),jsLib,js,'</script>'].join('\n');
	for(var key in self.data) {
		output += htmlTemplate.render(self.data[key]) + '\n';
	}
	return output;
};
