/**
 * CHG-172 (owner review, the approved sample, badge 16): the plant tree. A row is its level, the name with the path under it,
 * and CPM once, on the loop's device (it sat on the device and each of its four signals, with "+ child · Edit · Delete" on every
 * row; those moved into the node panel). A row selects its node; the twisty opens it, and children load when a node opens.
 */
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CHILD_TYPE, TYPE_NAMES, fetchAssets, type AssetNode } from './plantModel';

const NodeRow: React.FC<{
  node: AssetNode;
  depth: number;
  selectedId: string | null;
  onSelect: (node: AssetNode) => void;
}> = ({ node, depth, selectedId, onSelect }) => {
  const [expanded, setExpanded] = useState(false);
  const childType = CHILD_TYPE[node.type];
  const children = useQuery({
    queryKey: ['plant-model', 'children', node.id],
    enabled: expanded && childType !== null,
    staleTime: 30_000,
    queryFn: () => fetchAssets(`parentId=${node.id}&take=1000`),
  });
  const on = node.id === selectedId;
  const indent = { paddingInlineStart: `calc(var(--traverse-space-3) + ${depth} * var(--traverse-space-5))` };
  const nested = { paddingInlineStart: `calc(var(--traverse-space-8) + ${depth} * var(--traverse-space-5))` };

  return (
    <>
      <div className={`cpm-admin-node${on ? ' cpm-admin-node--selected' : ''}`} style={indent} aria-current={on ? 'true' : undefined}
        onClick={() => onSelect(node)}>
        {childType === null ? <span aria-hidden="true" /> : (
          <button type="button" className="cpm-admin-node__twist" aria-label={`${expanded ? 'Collapse' : 'Expand'} ${node.name}`}
            aria-expanded={expanded} onClick={e => { e.stopPropagation(); setExpanded(x => !x); }}>
            {expanded ? '▾' : '▸'}
          </button>
        )}
        <span className="cpm-admin-node__level">{TYPE_NAMES[node.type]}</span>
        <button type="button" className="cpm-admin-rowlink" onClick={e => { e.stopPropagation(); onSelect(node); }}>
          <strong>{node.name}</strong>
          <span className="cpm-event-row__sub cpm-mono">{node.contextualPath}</span>
        </button>
        {node.template === 'CpmLoop' ? <span className="cpm-admin-mark">CPM</span> : <span />}
      </div>
      {expanded && children.isLoading && <p className="cpm-copy cpm-admin-node__note" style={nested}>Loading…</p>}
      {expanded && (children.data ?? []).map(c => (
        <NodeRow key={c.id} node={c} depth={depth + 1} selectedId={selectedId} onSelect={onSelect} />
      ))}
      {expanded && children.data?.length === 0 && <p className="cpm-copy cpm-admin-node__note" style={nested}>No children yet.</p>}
    </>
  );
};

export const PlantTree: React.FC<{
  nodes: AssetNode[];
  selectedId: string | null;
  onSelect: (node: AssetNode) => void;
}> = ({ nodes, selectedId, onSelect }) => (
  <div className="cpm-admin-tree">
    {nodes.map(n => <NodeRow key={n.id} node={n} depth={0} selectedId={selectedId} onSelect={onSelect} />)}
  </div>
);

export default PlantTree;
