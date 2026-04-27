function initSse(response) {
  response.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  response.write('\n');

  return {
    send(event) {
      response.write(`data: ${JSON.stringify(event)}\n\n`);
    },
    close() {
      response.end();
    }
  };
}

module.exports = {
  initSse
};
