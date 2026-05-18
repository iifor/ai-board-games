const { hashText } = require('./promptComposer');

const resultCache = new Map();

async function cachedLlmCall(cacheParts, producer) {
  const key = Array.isArray(cacheParts)
    ? hashText(cacheParts.map((item) => JSON.stringify(item)).join('\n'))
    : hashText(cacheParts);
  if (resultCache.has(key)) return { value: resultCache.get(key), cached: true };
  const value = await producer();
  resultCache.set(key, value);
  return { value, cached: false };
}

module.exports = {
  cachedLlmCall
};
