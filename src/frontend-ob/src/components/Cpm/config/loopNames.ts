/** The name a plant gave a loop, without the registry's stand-in ("Flow controller (FCS0101)"). Shared by the Gate Configuration pages. */
import { serviceName } from '../loopName';

// a phrase ending in a device word, optionally followed by a station code like "(FCS0101)" or "· FCS0101"
const DEVICE_PHRASE = /^(?:[a-z]+ )*(?:controller|indicator|transmitter|loop)(?: *(?:\([A-Z]{2,4}\d+\)|· *[A-Z]{2,4}\d+))?$/i;
const STATION_ONLY = /^\(?[A-Z]{2,4}\d+\)?$/;

export function realName(loop: { loopId: string; displayName?: string | null }): string {
  const name = serviceName(loop);
  if (!name || name === loop.loopId) return '';
  return DEVICE_PHRASE.test(name) || STATION_ONLY.test(name) ? '' : name;
}
