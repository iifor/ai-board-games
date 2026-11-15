/** JSON 已经通过语法和结构校验。按顶层 events 数组的对象边界切出原始文本，保留空格、转义和换行。 */
export function eventSourceText(json: string): string[] {
  const events: string[] = [];
  let depth = 0, array = false, key = false, start = 0;
  for (const token of json.matchAll(/"(?:\\[\s\S]|[^"\\])*"|[[\]{}:,]/g)) {
    const value = token[0], pos = token.index;
    if (value.startsWith('"')) {
      if (depth === 1) key = JSON.parse(value) === 'events';
      continue;
    }
    if (value === '[' || value === '{') {
      if (depth === 1 && key && value === '[') { array = true; events.length = 0; }
      if (array && depth === 2) start = pos;
      depth++;
      key = false;
    } else if (value === ']' || value === '}') {
      depth--;
      if (array && depth === 2) events.push(json.slice(start, pos + 1));
      if (depth === 1) array = false;
    } else if (value === ',') key = false;
  }
  return events;
}
