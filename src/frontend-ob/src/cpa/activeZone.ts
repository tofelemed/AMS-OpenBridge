/**
 * The zone the shell resolved, for formatters that have no hook (RD5). Old pages call `fmtDateTime`
 * from about 39 files; without this they would print the browser zone under a header that names
 * the site zone. New pages take the zone from useCpaContext instead.
 */
let active: string | undefined;

export const setActiveZone = (zone: string): void => { active = zone; };

export const activeZone = (): string | undefined => active;
