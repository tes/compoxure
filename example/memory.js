var fs = require('fs');
function bytesToSize(bytes) {
  return Math.round(bytes / Math.pow(1024, 2), 2);
}
fs.writeFileSync(__dirname + '/memory.csv', 'rss,total,used,change' + '\n');
var previousHeap = 0;
function memoryPerSecond() {
  var mem = process.memoryUsage();
  var variance = mem.heapUsed - previousHeap;
  if (variance < 0) {
    variance = '-' + bytesToSize(-variance);
  } else {
    variance = bytesToSize(variance);
  }
  var data = [bytesToSize(mem.rss), bytesToSize(mem.heapTotal), bytesToSize(mem.heapUsed), variance].join(',');
  fs.appendFileSync(__dirname + '/memory.csv', data + '\n');
  previousHeap = mem.heapUsed;
  setTimeout(memoryPerSecond, 1000);
}
memoryPerSecond();
