module.exports = function (req, res, next) {
  if (req.url === '/favicon.ico') {
    if (!res.headersSent) {
      res.writeHead(200, {
        'Content-Type': 'image/x-icon'
      });
    }
    return next({
      level: 'info',
      message: 'Dropped favicon request'
    });
  }
  next();
}
