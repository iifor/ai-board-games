import { CodeOutlined, FileTextOutlined } from '@ant-design/icons';

const slot = /({{\s*[\w.]+\s*}})/g;
type Part = { text: string; variable?: string };

// Annotate only when literal boundaries identify a substitution unambiguously.
// The server's text stays authoritative, including for historical requests.
function segments(source: string, rendered?: string): Part[] {
  const parts = source.split(slot);
  if (rendered === undefined) return parts.map((text, i) => i % 2 ? { text, variable: text } : { text });
  const plain = [{ text: rendered }];
  const start = parts[0] ?? '';
  if (parts.length < 3 || !rendered.startsWith(start)) return plain;
  const result: Part[] = [{ text: start }];
  let cursor = start.length;
  for (let i = 1; i < parts.length; i += 2) {
    const variable = parts[i], next = parts[i + 1];
    if (variable === undefined || next === undefined) return plain;
    const last = i + 2 === parts.length;
    const end = last ? rendered.length - next.length : rendered.indexOf(next, cursor);
    if (end < cursor || !rendered.startsWith(next, end) || (!last && (!next || rendered.indexOf(next, end + 1) !== -1))) return plain;
    result.push({ text: rendered.slice(cursor, end), variable }, { text: next });
    cursor = end + next.length;
  }
  return result;
}

interface Props { title: string; text: string; template?: string | undefined; variant: 'source' | 'rendered' }
export function PromptText({ title, text, template, variant }: Props) {
  const parts = variant === 'source' ? segments(text) : template ? segments(template, text) : [{ text }];
  return <section className={'prompt-text prompt-text-' + variant}>
    <h3>{variant === 'source' ? <CodeOutlined /> : <FileTextOutlined />}{title}</h3>
    <pre>{parts.map((part, i) => part.variable
      ? <mark key={i} title={part.variable}>{part.text}</mark> : part.text)}</pre>
  </section>;
}
