function slugify(text: string): string {
  return String(text || '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w一-龥-]/g, '');
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function extractBetween(text: string, startMarker: string, endMarker: string): string {
  const start = text.indexOf(startMarker);
  if (start === -1) return '';
  const from = start + startMarker.length;
  const end = text.indexOf(endMarker, from);
  return text.slice(from, end === -1 ? text.length : end);
}

function chooseMemoryExample(role: string, examples: string[] = []): string {
  if (!examples.length) return '';
  const keyword =
    role === 'keyFigure' ? '关键人物' : role === 'cover' ? '掩护者' : '调查方';
  return examples.find((item) => item.includes(keyword)) || examples[0];
}

export { slugify, clone, extractBetween, chooseMemoryExample };
