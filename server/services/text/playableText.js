const PLAYABLE_TEXT_CONFIG = {
  maxChars: 50
};

const STRONG_DELIMITERS = '。！？!?；;\n';
const SOFT_DELIMITERS = '，,、：:';
const HARD_SPLIT_BOUNDARIES = '，,、：:。！？!?；; ';

function splitPlayableTextSegments(value, options = {}) {
  const maxChars = normalizeMaxChars(options.maxChars);
  const source = normalizePlayableWhitespace(value, { keepNewLines: true });

  if (!source) return [];

  const sentenceSegments = splitByDelimiters(source, STRONG_DELIMITERS);

  const atomicSegments = sentenceSegments.flatMap((segment) =>
    splitLongSegment(segment, maxChars)
  );

  return mergeShortSegments(atomicSegments, maxChars)
    .map((displayText, index) => ({
      index,
      displayText,
      text: displayText,
      speechText: stripSpeechParentheses(displayText)
    }))
    .filter((item) => item.displayText || item.speechText);
}

function splitPlayableDisplaySegments(value, options = {}) {
  return splitPlayableTextSegments(value, options).map((item) => item.displayText);
}

function splitLongSegment(value, maxChars) {
  const text = trimPlayableSegment(value);

  if (!text) return [];
  if (getTextLength(text) <= maxChars) return [text];

  const softSegments = splitByDelimiters(text, SOFT_DELIMITERS);

  if (softSegments.length > 1) {
    return mergeShortSegments(softSegments, maxChars).flatMap((segment) => {
      if (getTextLength(segment) <= maxChars) return [segment];
      return hardSplitSegment(segment, maxChars);
    });
  }

  return hardSplitSegment(text, maxChars);
}

function mergeShortSegments(segments, maxChars) {
  const result = [];
  let current = '';

  for (const rawSegment of segments) {
    const segment = trimPlayableSegment(rawSegment);
    if (!segment) continue;

    if (!current) {
      current = segment;
      continue;
    }

    const merged = joinPlayableText(current, segment);

    if (getTextLength(merged) <= maxChars) {
      current = merged;
    } else {
      result.push(current);
      current = segment;
    }
  }

  if (current) result.push(current);

  return result;
}

function splitByDelimiters(value, delimiters) {
  const text = String(value || '');
  const delimiterSet = new Set(Array.from(delimiters));
  const result = [];

  let buffer = '';
  let bracketStack = [];
  let pendingSplit = false;

  for (const char of toTextUnits(text)) {
    buffer += char;

    if (delimiterSet.has(char)) {
      if (bracketStack.length === 0) {
        pushBuffer();
      } else {
        pendingSplit = true;
      }
      continue;
    }

    bracketStack = updateBracketStack(bracketStack, char);

    if (pendingSplit && bracketStack.length === 0) {
      pushBuffer();
      pendingSplit = false;
    }
  }

  pushBuffer();

  return result;

  function pushBuffer() {
    const segment = trimPlayableSegment(buffer);
    if (segment) result.push(segment);
    buffer = '';
  }
}

function hardSplitSegment(value, maxChars) {
  const chars = toTextUnits(value);
  const result = [];

  let start = 0;

  while (start < chars.length) {
    let end = Math.min(start + maxChars, chars.length);

    if (end < chars.length) {
      const betterEnd = findBetterSplitIndex(chars, start, end);
      if (betterEnd > start) {
        end = betterEnd;
      }
    }

    const chunk = trimPlayableSegment(chars.slice(start, end).join(''));
    if (chunk) result.push(chunk);

    start = end;
  }

  return result;
}

function findBetterSplitIndex(chars, start, end) {
  const boundarySet = new Set(Array.from(HARD_SPLIT_BOUNDARIES));
  const minEnd = start + Math.floor((end - start) * 0.6);

  for (let index = end - 1; index >= minEnd; index -= 1) {
    if (boundarySet.has(chars[index])) {
      return index + 1;
    }
  }

  return end;
}

function stripSpeechParentheses(value) {
  let text = String(value || '');
  let previous = '';

  while (text && text !== previous) {
    previous = text;
    text = text.replace(/\([^()]*\)|（[^（）]*）|\[[^\[\]]*\]|【[^【】]*】/g, '');
  }

  return normalizePlayableWhitespace(text);
}

function normalizePlayableWhitespace(value, options = {}) {
  const { keepNewLines = false } = options;

  let text = String(value || '').replace(/\r\n?/g, '\n');

  if (keepNewLines) {
    return text
      .replace(/[^\S\n]+/g, ' ')
      .replace(/\n{2,}/g, '\n')
      .trim();
  }

  return text.replace(/\s+/g, ' ').trim();
}

function trimPlayableSegment(value) {
  return normalizePlayableWhitespace(value);
}

function joinPlayableText(left, right) {
  if (!left) return right;
  if (!right) return left;

  if (shouldInsertSpace(left, right)) {
    return `${left} ${right}`;
  }

  return `${left}${right}`;
}

function shouldInsertSpace(left, right) {
  return /[a-zA-Z0-9)]$/.test(left) && /^[a-zA-Z0-9(]/.test(right);
}

function normalizeMaxChars(value) {
  const maxChars = Number(value) || PLAYABLE_TEXT_CONFIG.maxChars;
  return Math.max(1, Math.floor(maxChars));
}

function getTextLength(value) {
  return toTextUnits(value).length;
}

function toTextUnits(value) {
  const text = String(value || '');

  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    const segmenter = new Intl.Segmenter('zh', {
      granularity: 'grapheme'
    });

    return Array.from(segmenter.segment(text), (item) => item.segment);
  }

  return Array.from(text);
}

function updateBracketStack(stack, char) {
  const openToClose = {
    '(': ')',
    '（': '）',
    '[': ']',
    '【': '】',
    '《': '》',
    '“': '”',
    '‘': '’',
    '「': '」',
    '『': '』'
  };

  if (openToClose[char]) {
    return [...stack, openToClose[char]];
  }

  if (stack.length && char === stack[stack.length - 1]) {
    return stack.slice(0, -1);
  }

  return stack;
}

module.exports = {
  PLAYABLE_TEXT_CONFIG,
  splitPlayableDisplaySegments,
  splitPlayableTextSegments,
  stripSpeechParentheses
};