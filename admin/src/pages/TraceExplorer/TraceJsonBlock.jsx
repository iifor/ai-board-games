import React from 'react';

export function TraceJsonBlock({ value }) {
  return (
    <div className="admin-trace-json-panel">
      <pre className="admin-trace-json">{renderJson(value ?? {})}</pre>
    </div>
  );
}

function renderJson(value, depth = 0) {
  if (value === null) return <span className="admin-json-null">null</span>;
  if (Array.isArray(value)) return renderArray(value, depth);
  if (typeof value === 'object') return renderObject(value, depth);
  if (typeof value === 'string') return <span className="admin-json-string">{JSON.stringify(value)}</span>;
  if (typeof value === 'number') return <span className="admin-json-number">{value}</span>;
  if (typeof value === 'boolean') return <span className="admin-json-boolean">{String(value)}</span>;
  return <span className="admin-json-null">{JSON.stringify(value)}</span>;
}

function renderObject(value, depth) {
  const entries = Object.entries(value);
  if (!entries.length) return <span>{'{}'}</span>;

  return (
    <>
      {'{'}
      {entries.map(([key, item], index) => (
        <React.Fragment key={`${key}-${index}`}>
          {'\n'}{indent(depth + 1)}
          <span className="admin-json-key">{JSON.stringify(key)}</span>
          <span className="admin-json-punctuation">: </span>
          {renderJson(item, depth + 1)}
          {index < entries.length - 1 ? <span className="admin-json-punctuation">,</span> : null}
        </React.Fragment>
      ))}
      {'\n'}{indent(depth)}{'}'}
    </>
  );
}

function renderArray(value, depth) {
  if (!value.length) return <span>{'[]'}</span>;

  return (
    <>
      {'['}
      {value.map((item, index) => (
        <React.Fragment key={index}>
          {'\n'}{indent(depth + 1)}
          {renderJson(item, depth + 1)}
          {index < value.length - 1 ? <span className="admin-json-punctuation">,</span> : null}
        </React.Fragment>
      ))}
      {'\n'}{indent(depth)}{']'}
    </>
  );
}

function indent(depth) {
  return '  '.repeat(depth);
}
