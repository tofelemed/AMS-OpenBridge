export function computeLogicalAlarmFamilyId(
  serverId: string,
  sourceName: string,
  conditionName: string | null | undefined,
  subConditionName: string | null | undefined,
): string {
  const norm = (s: string | null | undefined) => (s ?? '').trim();
  return `${norm(serverId)}|${norm(sourceName)}|${norm(conditionName)}|${norm(subConditionName)}`;
}

export const INSTANCE_KEY_SCHEMA_VERSION = 1;

export const TIME_AUTHORITY = {
  SOE: 'eventTime',
  DURATION: 'activeTime',
  INGEST_AUDIT: 'ingestTime',
} as const;
