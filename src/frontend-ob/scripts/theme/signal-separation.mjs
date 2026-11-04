#!/usr/bin/env node
// Gate: the process signals must stay distinguishable, for normal vision and for red-green colour
// blindness, in both themes (UI-038). No published standard assigns PV, SP or OP colours: ISA-101
// asks for consistency, reserved alarm colours and a documented site style. So this measures them.
//
// Distance is OKLab × 100. Lines also differ by style and carry a direct label (guide p.5, G05),
// so these are floors for the colour cue alone, on the pairs an operator compares.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const styles = path.resolve(here, '../../src/styles');
const tokens = fs.readFileSync(path.join(styles, 'traverse-tokens.css'), 'utf8');
const tones = fs.readFileSync(path.join(styles, 'tones.css'), 'utf8');

const FLOOR = 5; // PV against each other signal, in every vision type
const ALARM_FLOOR = 12; // any signal against the alarm colours: no pen may read as an alarm (ISA-101)

const themeBlock = t => new RegExp(`\\[data-theme="${t}"\\][^{]*\\{([\\s\\S]*?)\\n\\}`).exec(tokens)?.[1] ?? '';
const tokenHex = (t, name) => new RegExp(`--traverse-${name}:\\s*(#[0-9A-Fa-f]{6})`).exec(themeBlock(t))?.[1];
const signalToken = name => new RegExp(`--signal-${name}:\\s*var\\(--traverse-([a-z0-9-]+)\\)`).exec(tones)?.[1];

const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
const linear = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const oklab = ([r, g, b]) => {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const [a, c, d] = [l, m, s].map(Math.cbrt);
  return [0.2104542553 * a + 0.793617785 * c - 0.0040720468 * d, 1.9779984951 * a - 2.428592205 * c + 0.4505937099 * d, 0.0259040371 * a + 0.7827717662 * c - 0.808675766 * d];
};

// Machado, Oliveira and Fernandes 2009, severity 1.0, applied in linear RGB.
const VISION = {
  normal: null,
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
};

const seen = (hex, vision) => {
  const v = rgb(hex).map(linear);
  const M = VISION[vision];
  return oklab(M ? M.map(r => Math.min(1, Math.max(0, r[0] * v[0] + r[1] * v[1] + r[2] * v[2]))) : v);
};
const distance = (a, b, vision) => {
  const [x, y] = [seen(a, vision), seen(b, vision)];
  return 100 * Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};

const failures = [];
let lowest = Infinity;
for (const theme of ['day', 'night']) {
  const hex = {};
  for (const s of ['pv', 'sp', 'op', 'vp']) {
    const token = signalToken(s);
    if (!token) { failures.push(`--signal-${s} is not defined in tones.css`); continue; }
    hex[s] = tokenHex(theme, token);
  }
  if (failures.length) break;
  for (const other of ['sp', 'op', 'vp']) {
    for (const vision of Object.keys(VISION)) {
      const d = distance(hex.pv, hex[other], vision);
      lowest = Math.min(lowest, d);
      if (d < FLOOR) failures.push(`${theme}: PV and ${other.toUpperCase()} are ${d.toFixed(1)} apart for ${vision} (floor ${FLOOR})`);
    }
  }
  for (const s of Object.keys(hex)) {
    for (const status of ['status-danger-fg', 'status-warning-fg']) {
      const d = distance(hex[s], tokenHex(theme, status), 'normal');
      if (d < ALARM_FLOOR) failures.push(`${theme}: ${s.toUpperCase()} is ${d.toFixed(1)} from ${status} (floor ${ALARM_FLOOR})`);
    }
  }
  if (hex.pv.toLowerCase() === tokenHex(theme, 'action-primary').toLowerCase()) failures.push(`${theme}: PV is the primary action colour`);
}

if (failures.length) {
  console.error(`signal-separation: ${failures.length} failing\n${failures.join('\n')}`);
  process.exit(1);
}
console.log(`signal-separation: PV against SP, OP and VP, both themes, 3 vision types, lowest ${lowest.toFixed(1)} (floor ${FLOOR}), alarm colours clear`);
