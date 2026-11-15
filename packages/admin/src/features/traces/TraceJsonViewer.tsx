import type { MatchTraceDto, TraceNodeDetailDto } from '@battle/shared';
import { App, Button, Segmented } from 'antd';
import { useMemo, useState } from 'react';
import { JSONTree, type LabelRenderer } from 'react-json-tree';
import { TraceDataReading } from './reading/TraceDataReading';
import './TraceJsonViewer.css';

const theme = {
  base00: '#f5f7fa', base03: '#526478', base07: '#1d2d42',
  base08: '#824582', base09: '#8f451d', base0B: '#236843', base0D: '#205c96',
};

const renderLabel: LabelRenderer = ([key], _type, expanded, expandable) => expandable
  ? <button type="button" className="trace-json-key" aria-label={String(key)} aria-expanded={expanded}>{key}: </button>
  : <>{key}: </>;

export default function TraceJsonViewer({ detail, match }: { detail: TraceNodeDetailDto; match: MatchTraceDto['match'] }) {
  const { message } = App.useApp();
  const [mode, setMode] = useState<'read' | 'tree' | 'text'>('read');
  const text = useMemo(() => mode === 'text' ? JSON.stringify(detail, null, 2) : null, [detail, mode]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text ?? JSON.stringify(detail, null, 2));
      message.success('已复制完整 JSON');
    } catch {
      setMode('text');
      message.error('复制失败，可在原文中手动选择并复制');
    }
  }
  return <div className="trace-json-viewer">
    <div className="trace-json-toolbar">
      <Segmented aria-label="JSON 展示方式" value={mode} onChange={setMode}
        options={[{ value: 'read', label: '阅读视图' }, { value: 'tree', label: '树形' }, { value: 'text', label: '原文' }]} />
      <Button size="small" onClick={copy}>复制完整 JSON</Button>
    </div>
    <div key={mode} className={'trace-json-scroll' + (mode === 'read' ? ' trace-read-scroll' : '')} role="region"
      aria-label={{ read: '节点阅读视图', tree: 'JSON 树形视图', text: '节点原始 JSON' }[mode]} tabIndex={0}>
      {mode === 'read' ? <TraceDataReading detail={detail} match={match} /> : mode === 'tree'
        ? <JSONTree data={detail} hideRoot theme={theme} invertTheme={false} collectionLimit={50}
            shouldExpandNodeInitially={(_, __, level) => level < 2} labelRenderer={renderLabel}
            getItemString={(_, value) => Array.isArray(value) ? `[${value.length} 项]` : `{${Object.keys(value as object).length} 个字段}`} />
        : <pre>{text}</pre>}
    </div>
  </div>;
}
