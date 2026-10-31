/**
 * 从模型文本中取出 JSON 对象：兼容代码块包裹、前后多余文字。
 * 取不出时返回原文，交给引擎的 schema 校验判定不合法并带原因重问。
 */
export function extractJson(content: string): unknown {
  const trimmed = content.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed)?.[1]?.trim();
  for (const candidate of [trimmed, fenced]) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate);
    } catch {
      // 尝试下一种形式
    }
  }
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return content;
    }
  }
  return content;
}
