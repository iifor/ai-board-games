import { Fragment } from 'react';

interface TraceJsonBlockProps {
  value: unknown;
}

export function TraceJsonBlock({ value }: TraceJsonBlockProps) {
  return (
    <div className="admin-trace-json-panel">
      <pre className="admin-trace-json">{renderJson(value ?? {})}</pre>
    </div>
  );
}

function renderJson(value: unknown, depth = 0): React.ReactNode {
  if (value === null) return <span className="admin-json-null">null</span>;
  if (Array.isArray(value)) return renderArray(value, depth);
  if (typeof value === 'object') return renderObject(value as Record<string, unknown>, depth);
  if (typeof value === 'string') return <span className="admin-json-string">{JSON.stringify(value)}</span>;
  if (typeof value === 'number') return <span className="admin-json-number">{value}</span>;
  if (typeof value === 'boolean') return <span className="admin-json-boolean">{String(value)}</span>;
  return <span className="admin-json-null">{JSON.stringify(value)}</span>;
}

function renderObject(value: Record<string, unknown>, depth: number): React.ReactNode {
  const entries = Object.entries(value);
  if (!entries.length) return <span>{'{}'}</span>;

  return (
    <>
      {'{'}
      {entries.map(([key, item], index) => (
        <Fragment key={`${key}-${index}`}>
          {'\n'}{indent(depth + 1)}
          <span className="admin-json-key">{JSON.stringify(key)}</span>
          <span className="admin-json-punctuation">: </span>
          {renderJson(item, depth + 1)}
          {index < entries.length - 1 ? <span className="admin-json-punctuation">,</span> : null}
        </Fragment>
      ))}
      {'\n'}{indent(depth)}{'}'}
    </>
  );
}

function renderArray(value: unknown[], depth: number): React.ReactNode {
  if (!value.length) return <span>{'[]'}</span>;

  return (
    <>
      {'['}
      {value.map((item, index) => (
        <Fragment key={index}>
          {'\n'}{indent(depth + 1)}
          {renderJson(item, depth + 1)}
          {index < value.length - 1 ? <span className="admin-json-punctuation">,</span> : null}
        </Fragment>
      ))}
      {'\n'}{indent(depth)}{']'}
    </>
  );
}

function indent(depth: number): string {
  return '  '.repeat(depth);
}
