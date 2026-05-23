const { isSessionCancelled, isSpeechWaitPayload, getEventPhaseKey } = require('./session');
const { prepareOutgoingEvent, collectPreparedAudioResources } = require('./media');

const IMMEDIATE_EVENT_TYPES = new Set(['thinking']);

function createPreparedSender(session, options = {}) {
  const queue = [];
  let drainPromise = null;
  const audioResources = new Set();
  const prefetchCount = Number(options.prefetchCount) || 2;
  const phaseLookahead = Number.isInteger(options.phaseLookahead) ? options.phaseLookahead : null;

  async function enqueue(event) {
    if (phaseLookahead != null) {
      while (queue.length && exceedsPhaseLookahead([...queue.map((item) => item.event), event], phaseLookahead)) {
        try {
          await queue[0].done;
        } catch (error) {
          if (isSessionCancelled(error)) return;
          throw error;
        }
      }
    }
    const item = {};
    item.event = event;
    item.prepared = prepareOutgoingEvent(event);
    item.done = new Promise((resolve, reject) => {
      item.resolve = resolve;
      item.reject = reject;
    });
    item.done.catch(() => {});
    queue.push(item);
    if (!drainPromise) {
      drainPromise = drain();
      drainPromise.catch(() => {});
    }
    if (phaseLookahead == null && queue.length > prefetchCount) {
      try {
        await queue[0].done;
      } catch (error) {
        if (isSessionCancelled(error)) return;
        throw error;
      }
    }
  }

  async function drain() {
    try {
      while (queue.length) {
        const item = queue[0];
        try {
          const prepared = await item.prepared;
          collectPreparedAudioResources(prepared, audioResources);
          if (IMMEDIATE_EVENT_TYPES.has(prepared.type)) {
            await session.send(prepared);
          } else {
            await session.sendAndWait(prepared);
          }
          item.resolve();
        } catch (error) {
          item.reject(error);
          throw error;
        } finally {
          queue.shift();
        }
      }
    } finally {
      drainPromise = null;
    }
  }

  return {
    enqueue,
    getAudioResources() {
      return [...audioResources];
    },
    async flush() {
      if (!drainPromise) return;
      try {
        await drainPromise;
      } catch (error) {
        if (isSessionCancelled(error)) return;
        throw error;
      }
    },
    async send(event) {
      await enqueue(event);
      if (!drainPromise) return;
      try {
        await drainPromise;
      } catch (error) {
        if (isSessionCancelled(error)) return;
        throw error;
      }
    }
  };
}

function exceedsPhaseLookahead(events, phaseLookahead) {
  const phaseKeys = [];
  for (const event of events) {
    const key = getEventPhaseKey(event);
    if (!key || phaseKeys.includes(key)) continue;
    phaseKeys.push(key);
  }
  return phaseKeys.length > phaseLookahead + 1;
}

module.exports = { createPreparedSender, exceedsPhaseLookahead };
