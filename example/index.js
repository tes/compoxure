var cluster = require('cluster');
if (cluster.isMaster) {
  require('./proxy');
  cluster.fork();
} else {
  require('./backend');
}
