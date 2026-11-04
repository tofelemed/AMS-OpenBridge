/**
 * Cursor sync between panels: `echarts.connect` on a group name, counted so the group is released
 * with its last panel. Within one panel, `axisPointer.link` already links the grids.
 */
import { connect, disconnect } from 'echarts';

const members = new Map<string, number>();

/** Joins a group and returns the release. */
export function joinTrendGroup(chart: { group: string }, group: string): () => void {
  chart.group = group;
  const count = members.get(group) ?? 0;
  members.set(group, count + 1);
  if (count === 0) connect(group);
  return () => {
    const left = (members.get(group) ?? 1) - 1;
    if (left > 0) {
      members.set(group, left);
      return;
    }
    members.delete(group);
    disconnect(group);
  };
}
