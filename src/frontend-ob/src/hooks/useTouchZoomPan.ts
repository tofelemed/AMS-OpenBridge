// Phase 8 (U2/U3/A33) — touch zoom + pan for the runtime display on tablets/panels. The viewer's stage
// is fixed-size and was mouse-only; this adds pinch-to-zoom (two fingers) and one-finger pan, exposed as
// a CSS transform the caller applies to the stage. Double-tap resets. Mouse interaction is untouched.
import { useCallback, useRef, useState } from 'react';

interface Transform { scale: number; tx: number; ty: number; }

const MIN = 1, MAX = 5;

function dist(a: React.Touch, b: React.Touch) {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

export function useTouchZoomPan() {
  const [t, setT] = useState<Transform>({ scale: 1, tx: 0, ty: 0 });
  // Gesture bookkeeping across touch events.
  const gesture = useRef<{ startDist: number; startScale: number; startTx: number; startTy: number; px: number; py: number } | null>(null);
  const lastTap = useRef(0);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]];
      gesture.current = { startDist: dist(a, b), startScale: t.scale, startTx: t.tx, startTy: t.ty,
        px: (a.clientX + b.clientX) / 2, py: (a.clientY + b.clientY) / 2 };
    } else if (e.touches.length === 1) {
      const now = Date.now();
      if (now - lastTap.current < 300) { setT({ scale: 1, tx: 0, ty: 0 }); lastTap.current = 0; return; }
      lastTap.current = now;
      const a = e.touches[0];
      gesture.current = { startDist: 0, startScale: t.scale, startTx: t.tx, startTy: t.ty, px: a.clientX, py: a.clientY };
    }
  }, [t]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const g = gesture.current;
    if (!g) return;
    if (e.touches.length === 2 && g.startDist > 0) {
      const d = dist(e.touches[0], e.touches[1]);
      const scale = Math.min(MAX, Math.max(MIN, g.startScale * (d / g.startDist)));
      setT(prev => ({ ...prev, scale }));
      e.preventDefault();
    } else if (e.touches.length === 1 && g.startDist === 0 && t.scale > 1) {
      // One-finger pan only meaningful when zoomed in.
      const a = e.touches[0];
      setT({ scale: t.scale, tx: g.startTx + (a.clientX - g.px), ty: g.startTy + (a.clientY - g.py) });
      e.preventDefault();
    }
  }, [t.scale]);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 0) gesture.current = null;
  }, []);

  const reset = useCallback(() => setT({ scale: 1, tx: 0, ty: 0 }), []);

  return {
    transform: `translate(${t.tx}px, ${t.ty}px) scale(${t.scale})`,
    scale: t.scale,
    reset,
    handlers: { onTouchStart, onTouchMove, onTouchEnd },
  };
}
