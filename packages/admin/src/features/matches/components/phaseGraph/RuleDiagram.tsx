import type { PhaseGraphDto } from '@battle/shared';
import { Button, Select, Space } from 'antd';
import { useId, useMemo, useState } from 'react';
import { kindLabel, layoutRules, nodeTitle, NODE_HEIGHT, NODE_WIDTH } from './layout';
import { MAX_SCALE, MIN_SCALE, useRuleViewport } from './useRuleViewport';
import { RuleOverview } from './RuleOverview';

export function RuleDiagram({ spec, current }: {spec: PhaseGraphDto; current: string | null}) {
  const model = useMemo(() => layoutRules(spec), [spec]);
  const [chosen, setChosen] = useState<string>();
  const marker = useId().replace(/:/g, '');
  const selected = model.nodes.find(n => n.phase.id === (chosen ?? current)) ?? model.nodes.find(n => n.phase.id === spec.start) ?? model.nodes[0];
  const { viewport, board, scale, zoom, center, focus: centerPhase, dragProps } = useRuleViewport(selected);
  const [overview, setOverview] = useState(false);
  const focus = (id: string) => {
    const node = model.nodes.find(n => n.phase.id === id);
    if (!node) return;
    setChosen(id);
    centerPhase(node);
  };
  if (!selected) return <p>这个玩法尚无阶段定义。</p>;
  const targetName = (id: string) => {
    const node = model.nodes.find(n => n.phase.id === id);
    return node ? nodeTitle(node.phase) : id;
  };
  const predecessors = model.edges.filter(e => e.to === selected.phase.id).map(e => e.from);
  const targets = (ids: readonly string[]) => ids.length ? [...new Set(ids)].map(id =>
    <button key={id} className="phase-target" onClick={() => focus(id)}>{targetName(id)}</button>) : '无';

  return <div className="phase-rule">
    <div className="phase-canvas-tools">
      <Select showSearch={{optionFilterProp:'label'}} aria-label="定位规则阶段" placeholder="查找阶段名称或 ID"
        value={selected.phase.id} onChange={focus} getPopupContainer={trigger => trigger.parentElement!}
        options={model.nodes.map(({phase}) => ({value:phase.id, label:nodeTitle(phase) === phase.id ? phase.id : nodeTitle(phase) + ' · ' + phase.id}))} />
      <div className="phase-canvas-actions"><Space.Compact>
        <Button aria-label="缩小阶段图" disabled={scale <= MIN_SCALE} onClick={() => zoom(scale - .25)}>−</Button>
        <Button aria-label="恢复原始比例" title="恢复 100%" onClick={() => zoom(1)}>{Math.round(scale * 100)}%</Button>
        <Button aria-label="放大阶段图" disabled={scale >= MAX_SCALE} onClick={() => zoom(scale + .25)}>＋</Button>
        <Button aria-pressed={overview} type={overview ? 'primary' : 'default'} onClick={() => setOverview(v => !v)}>全图导航</Button>
      </Space.Compact></div>
    </div>
    <div className="phase-viewport" ref={viewport} tabIndex={0} aria-label="规则流程图" {...dragProps}>
      <div className="phase-board" ref={board} style={{ width:model.width * scale, height:model.height * scale }}>
        <div className="phase-layer" style={{width:model.width, height:model.height, transform:'scale(' + scale + ')'}}>
          <svg width={model.width} height={model.height} aria-hidden="true">
            <defs>{['normal','active'].map(state => <marker key={state} id={marker+state} markerWidth="8" markerHeight="8" refX="8" refY="4" orient="auto" markerUnits="userSpaceOnUse">
              <path d="M0 0 L8 4 L0 8 z" fill={state === 'active' ? '#2563ad' : '#8594a6'}/>
            </marker>)}</defs>
            {model.edges.map(e => {
              const active = e.from === selected.phase.id || e.to === selected.phase.id;
              return <polyline key={JSON.stringify([e.from,e.to])} points={e.points} data-active={active}
                markerEnd={'url(#'+marker+(active ? 'active' : 'normal')+')'} />;
            })}
          </svg>
          {model.nodes.map(({phase,x,y}) => <button type="button" key={phase.id} className="phase-node"
            style={{left:x - NODE_WIDTH/2,top:y - NODE_HEIGHT/2,width:NODE_WIDTH,height:NODE_HEIGHT}}
            aria-pressed={phase.id === selected.phase.id} data-current={phase.id === current}
            title={nodeTitle(phase) + ' · ' + phase.id} onClick={() => focus(phase.id)}>
            <small>{kindLabel(phase.kind)}{phase.id === spec.start && ' · 起点'}{phase.id === current && ' · 当前'}</small>
            <strong>{nodeTitle(phase)}</strong>
          </button>)}
        </div>
      </div>
    </div>
    <aside className="phase-inspector" aria-label="选中阶段">
      {overview && <RuleOverview model={model} selected={selected.phase.id} scale={scale}
        board={board} viewport={viewport} onNavigate={center} />}
      <small>{kindLabel(selected.phase.kind)}{selected.phase.id === spec.start && ' · 起点'}</small>
      <strong>{nodeTitle(selected.phase)}</strong><code>{selected.phase.id}</code>
      <dl><dt>上一阶段</dt><dd>{targets(predecessors)}</dd><dt>可能的下一阶段</dt><dd>{targets(selected.phase.next)}</dd></dl>
      {current && model.nodes.some(n => n.phase.id === current) &&
        <Button size="small" onClick={() => focus(current)}>定位当前阶段</Button>}
    </aside>
  </div>;
}
