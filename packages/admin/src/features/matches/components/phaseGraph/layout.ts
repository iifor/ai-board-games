import dagre, { type GraphEdge, type GraphLabel, type Node } from '@dagrejs/dagre';
import type { PhaseGraphDto, PhaseNodeDto } from '@battle/shared';
import { phaseLabel } from '../../../traces/labels';

const kinds: Record<string, string> = {
  announce: '播报', compute: '结算', act: '行动', vote: '投票', speak: '发言', reveal: '揭示', judge: '评审',
  terminal: '终点', return: '返回', reference: '跳转目标',
};
export const kindLabel = (kind: string) => kinds[kind] ?? kind;
export const nodeTitle = (p: PhaseNodeDto) => p.title || phaseLabel(p.id);
export const NODE_WIDTH = 170;
export const NODE_HEIGHT = 58;

export function layoutRules(spec: PhaseGraphDto) {
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({ rankdir: 'TB', ranksep: 40, nodesep: 28, marginx: 28, marginy: 28 });
  graph.setDefaultEdgeLabel(() => ({}));
  const phases = new Map(spec.phases.map(p => [p.id, p]));
  for (const p of spec.phases) {
    for (const id of p.next) {
      if (phases.has(id)) continue;
      const target = SPECIAL_TARGETS[id] ?? {kind:'reference', title:id};
      phases.set(id, {id, ...target, next: []});
    }
  }
  for (const id of phases.keys()) graph.setNode(id, {width: NODE_WIDTH, height: NODE_HEIGHT});
  for (const p of spec.phases) for (const target of p.next) graph.setEdge(p.id, target);
  dagre.layout(graph);
  const bounds: GraphLabel = graph.graph();
  const nodes = [...phases.values()].map(phase => {
    const {x, y}: Node = graph.node(phase.id);
    return {phase, x, y};
  });
  const edges = graph.edges().map(edge => {
    const {points}: GraphEdge = graph.edge(edge);
    return {from: edge.v, to: edge.w, points: points.map(p => p.x + ',' + p.y).join(' ')};
  });
  return { width: bounds.width ?? 0, height: bounds.height ?? 0, nodes, edges };
}

const SPECIAL_TARGETS: Readonly<Record<string, {kind:string; title:string}>> = {
  end: {kind:'terminal', title:'结束'},
  return: {kind:'return', title:'返回主流程'},
};
