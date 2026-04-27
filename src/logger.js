const fs = require('fs');
const path = require('path');

class GameLogger {
  constructor() {
    this.events = [];
  }

  line(message = '') {
    console.log(message);
    this.events.push({ type: 'line', message });
  }

  event(type, payload) {
    this.events.push({ type, payload });
  }

  save(result) {
    const logsDir = path.join(process.cwd(), 'logs');
    fs.mkdirSync(logsDir, { recursive: true });

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = path.join(logsDir, `game-${stamp}.json`);
    fs.writeFileSync(
      filePath,
      JSON.stringify({ result, events: this.events }, null, 2),
      'utf8'
    );
    return filePath;
  }
}

module.exports = {
  GameLogger
};
