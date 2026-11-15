import type { MatchTraceDto, TraceNodeDto } from '@battle/shared';
import { Tree } from 'antd';
import { useLayoutEffect, useMemo, useRef, useState, type ComponentRef, type Key } from 'react';
import { useRemainingHeight } from '../../hooks/useRemainingHeight';
import { buildTraceTree, matchingBranches, type TraceBranch } from './traceTreeData';
import './TraceTree.css';

function Row({ row, measured, hit }: { row: TraceBranch; measured: boolean; hit: boolean }) {
  const group = row.type === 'round' || row.type === 'phase';
  const duration = row.longest === null ? '—' : row.longest.toLocaleString() + ' ms';
  return <span className="trace-tree-row" data-level={row.type}>
    <span className="trace-tree-name"><span title={row.title}>{hit ? <mark>{row.title}</mark> : row.title}</span>
      {row.hint && <small>{row.hint}</small>}
    </span>
    <span className="trace-tree-activity">
      {row.type === 'round' && <span>{row.children.length} 个阶段分组</span>}
      {row.type === 'phase' && <span>{row.records} 条记录</span>}
      {group && row.requests > 0 && <span>{row.requests} 个请求</span>}
      {row.calls > 0 && row.type !== 'call' && <span>{row.calls} 次模型调用</span>}
    </span>
    <span className="trace-tree-signals">{[...row.issues].map(reason =>
      <span key={reason} data-failure={reason.includes('失败')}>{reason}</span>)}</span>
    {measured && <span className="trace-tree-duration" data-empty={row.longest === null}>
      <span className="trace-tree-duration-label">{row.type === 'call' ? '耗时' : '最慢调用'} </span>{duration}
    </span>}
  </span>;
}

interface Props {
  nodes: readonly TraceNodeDto[];
  calls: MatchTraceDto['calls'];
  matches: ReadonlySet<number> | null;
  selectedId?: number | undefined;
  selectedCallId?: number | undefined;
  onOpen: (id: number, callId?: number) => void;
}

export function TraceTree({ nodes, calls, matches, selectedId, selectedCallId, onOpen }: Props) {
  const {ref, height} = useRemainingHeight(220, 32, '.match-workspace-tabs');
  const tree = useMemo(() => buildTraceTree(nodes, calls), [nodes, calls]);
  const visible = useMemo(() => {
    const expanded: string[] = [];
    return { rows: matches ? matchingBranches(tree, matches, expanded) : tree, expanded };
  }, [tree, matches]);
  const measured = calls.length > 0;
  const selection = nodes.find(n => n.id === selectedId);
  const call = selectedCallId === undefined ? undefined : calls.find(c => c.id === selectedCallId);
  let selectedKey = 'node-' + selectedId;
  if (selection?.kind === 'phase') selectedKey = JSON.stringify([selection.round, selection.phaseId, selection.visit]);
  if (selection?.kind === 'request' && call && selection.requestIds.includes(call.requestId)) selectedKey = 'call-' + call.id;
  const treeRef = useRef<ComponentRef<typeof Tree>>(null);
  const [expanded, setExpanded] = useState<Key[]>(() =>
    [...new Set([...tree.slice(0, 1).map(row => row.key), ...(selectedId === undefined ? [] : ancestorKeys(tree, selectedKey))])]);
  const initialKey = useRef(selectedId === undefined ? null : selectedKey);
  useLayoutEffect(() => {
    if (initialKey.current) treeRef.current?.scrollTo({key: initialKey.current});
    initialKey.current = null;
  }, []);
  const [collapsed, setCollapsed] = useState<Key[]>([]);
  const open = matches ? visible.expanded.filter(key => !collapsed.includes(key)) : expanded;
  const change = (keys: Key[]) => {
    if (matches) setCollapsed(visible.expanded.filter(key => !keys.includes(key)));
    else setExpanded(keys);
  };
  return <div className="trace-tree-panel" data-measured={measured}>
    <div className="trace-tree-head" aria-hidden="true">
      <span>轮次 / 阶段 / 节点</span><span>执行记录</span><span>异常记录</span>{measured && <span>最慢单次调用</span>}
    </div>
    <div ref={ref}>
      <Tree<TraceBranch> ref={treeRef} blockNode showLine={{ showLeafIcon: false }} height={height} itemHeight={40}
        treeData={visible.rows} expandedKeys={open} onExpand={change}
        selectedKeys={selectedId === undefined ? [] : [selectedKey]}
        titleRender={row => <Row row={row} measured={measured}
          hit={row.type !== 'call' && row.nodeId !== undefined && !!matches?.has(row.nodeId)} />}
        onSelect={(_, { node }) => {
          if (node.nodeId !== undefined) onOpen(node.nodeId, node.callId);
          else if (node.children.length) change(open.includes(node.key) ? open.filter(k => k !== node.key) : [...open, node.key]);
        }} />
    </div>
  </div>;
}

function ancestorKeys(rows: TraceBranch[], key: string): string[] {
  for (const row of rows) {
    if (row.children.some(child => child.key === key)) return [row.key];
    const path = ancestorKeys(row.children, key);
    if (path.length) return [row.key, ...path];
  }
  return [];
}
