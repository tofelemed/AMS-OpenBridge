/**
 * Escape text for an HTML string (ECharts tooltip formatters return HTML). Anything a user can type —
 * a loop's PV unit, a description — must pass through this before it is concatenated into markup.
 */
const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const escapeHtml = (s: string | null | undefined): string =>
  (s ?? '').replace(/[&<>"']/g, c => ENTITIES[c]);

/**
 * The registry's PV-unit allowlist (mirror of cplm-api `PvUnitPattern`): letters, digits, space and
 * ° % / . - · ² ³ µ ( ) ^ *, at most 24 characters. The server is the authority; this gives the form its message.
 */
export const PV_UNIT_PATTERN = /^[\p{L}\p{N} °%/.\-·²³µ()^*]{1,24}$/u;
export const isValidPvUnit = (u: string): boolean => PV_UNIT_PATTERN.test(u.trim());
