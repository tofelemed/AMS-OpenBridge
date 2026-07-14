// Display thumbnails.
//
// The display list rendered a fake grey box with the text "1920 × 1080" dressed up as a preview. No
// editor in the industry survey (Ignition, WinCC, FactoryTalk, InTouch, ArchestrA) actually ships
// display thumbnails, so there is no prior art to copy — this is our convention.
//
// How: we render DOM/SVG (never Konva), so a preview is a SERIALIZATION, not a rasterization — no
// html2canvas, no headless browser, no binary blobs in Postgres. We emit a *schematic* of the display:
// every symbol as its footprint, colored by kind, with text symbols drawn as text. That is deliberate:
//   · it is deterministic and tiny (a few KB), so a 200-card page stays fast;
//   · OpenBridge symbols are Web Components with SHADOW DOM, which does not serialize — a naive
//     XMLSerializer pass would silently produce empty boxes, which is worse than an honest schematic;
//   · it is generated from the DESIGN-MODE model, never from live data, so a thumbnail can never leak a
//     process value into a screenshot of the display list.
import type { CanvasItem } from './types';

const THUMB_W = 400;

/** Colour a symbol's footprint by what it *is*, so the schematic reads as a layout at a glance. */
function kindColor(type: string): string {
  if (/alarm/.test(type)) return 'var(--alert-alarm-color)';
  if (/trend|chart|graph/.test(type)) return 'var(--ams-pen-2)';
  if (/readout|numeric|digital|value|label|text/.test(type)) return 'var(--element-neutral-color)';
  if (/tank|pump|motor|valve|fan|equip|automation/.test(type)) return 'var(--selected-enabled-background-color)';
  return 'var(--element-inactive-color)';
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface ThumbnailInput {
  items: CanvasItem[];
  width: number;
  height: number;
  background: string;
}

/**
 * A schematic SVG preview of the display. Uses CSS custom properties for colour, so the thumbnail
 * follows day/night like everything else instead of baking in a palette.
 */
export function renderThumbnailSvg({ items, width, height, background }: ThumbnailInput): string {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const scale = THUMB_W / w;
  const thumbH = Math.round(h * scale);

  const shapes = items
    .filter(i => !i.hidden)
    .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
    .slice(0, 400)              // a 720-symbol import would otherwise produce a huge document
    .map(i => {
      const x = i.position?.x ?? 0;
      const y = i.position?.y ?? 0;
      const iw = Math.max(2, i.size?.width ?? 20);
      const ih = Math.max(2, i.size?.height ?? 20);
      const fill = kindColor(i.type);

      // Text-ish symbols read far better as their actual label than as a box.
      if (/label|text/.test(i.type) && i.label) {
        const fs = Math.max(8, Math.min(ih * 0.8, 20));
        return `<text x="${x}" y="${y + ih * 0.75}" font-size="${fs}" fill="${fill}" font-family="sans-serif">${esc(i.label.slice(0, 40))}</text>`;
      }
      return `<rect x="${x}" y="${y}" width="${iw}" height="${ih}" rx="3" fill="${fill}" fill-opacity="0.28" stroke="${fill}" stroke-width="1.5"/>`;
    })
    .join('');

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${THUMB_W}" height="${thumbH}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Display preview">`,
    `<rect width="${w}" height="${h}" fill="${esc(background)}"/>`,
    shapes,
    `</svg>`,
  ].join('');
}
