'use client';

// The published-HMI launcher (/displays) — the operator's way into the runtime.
//
// DisplayList is the AUTHORING surface (its cards open /designer/:id). Operators and Viewers have no
// Designer access, so they need an entry point that opens the runtime viewer instead. This is it:
// published displays only, no create/edit affordances.
//
// How control rooms actually navigate (and what the standards say):
//   · by HIERARCHY — the ISA-101 display hierarchy (Clause 6.3); the L1–L4 naming is Hollifield's
//     High Performance HMI Handbook, which ISA-101 accommodates.
//   · directly — ASM 5.2/5.3 (Priority 1): primary displays must be *directly accessible*, and reachable
//     *without depending on a menu directory*. So: level chips + search, not a folder tree.
//   · by muscle memory — an operator works 4–6 displays for a whole shift → Favourites + Recents.
//     (No standard requires these; they are a product decision, and we say so.)
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../../store/authStore';
import { apiJson } from '../../api/apiFetch';
import { relativeTime, absoluteTime } from '../../utils/relativeTime';
import './Designer.css';

const API_BASE = import.meta.env.VITE_DISPLAY_SERVICE_URL || '/api/displays';

interface DisplaySummary {
  id: string;
  name: string;
  category: string;
  description?: string;
  hierarchyPath?: string;
  publishedVersion?: number | null;
  draftVersion: number;
  updatedAt: string;
  publishedAt?: string | null;
  publishedBy?: string | null;
  level?: number | null;
  hasThumbnail?: boolean;
}

const LEVELS: Array<{ n: number; label: string; hint: string }> = [
  { n: 1, label: 'L1 Overview',   hint: 'Operation overview — the whole span of control, no control actions' },
  { n: 2, label: 'L2 Unit',       hint: 'Unit control — everything needed for most tasks on one unit' },
  { n: 3, label: 'L3 Detail',     hint: 'Unit detail — full detail on one piece of equipment' },
  { n: 4, label: 'L4 Diagnostic', hint: 'Support / diagnostic — sensors, components, point detail' },
];

const FAV_KEY = 'ams-display-favourites';
const RECENT_KEY = 'ams-display-recents';
const readIds = (k: string): string[] => {
  try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch { return []; }
};

/** The card's preview. A real SVG schematic of the display, generated on publish. */
const Thumb: React.FC<{ id: string; has?: boolean }> = ({ id, has }) => {
  const { data } = useQuery({
    queryKey: ['thumb', id],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/${id}/thumbnail`, {
        headers: { Authorization: `Bearer ${useAuthStore.getState().accessToken ?? ''}` },
      });
      return r.ok ? r.text() : '';
    },
    enabled: !!has,
    staleTime: 5 * 60_000,
  });

  if (!has || !data) {
    // An honest empty state — not a fake "1920 × 1080" grey box pretending to be a preview.
    return <div className="dl-thumb dl-thumb--none">No preview yet — publish to generate one</div>;
  }
  // Server-side validated (no <script>, no onload) and we author it ourselves on publish.
  return <div className="dl-thumb" dangerouslySetInnerHTML={{ __html: data }} />;
};

export const DisplayLauncher: React.FC = () => {
  const navigate = useNavigate();
  const canEdit = useAuthStore(s => s.hasPermission('display.edit'));
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState<number | 'all'>('all');
  const [area, setArea] = useState<string>('all');
  const [favs, setFavs] = useState<string[]>(() => readIds(FAV_KEY));
  const [recents, setRecents] = useState<string[]>(() => readIds(RECENT_KEY));

  const { data, isLoading, error } = useQuery({
    // take=200: the endpoint defaults to 50 and the published filter is client-side, so with more than
    // 50 displays the published ones silently vanished from the launcher.
    queryKey: ['launcher-displays'],
    queryFn: () => apiJson<{ displays: DisplaySummary[]; total: number }>(`${API_BASE}?take=200`),
  });

  const published = useMemo(
    () => (data?.displays ?? []).filter(d => d.publishedVersion != null),
    [data],
  );

  // Process areas come from hierarchyPath (ASM 1.3: organise by the process equipment hierarchy).
  const areas = useMemo(() => {
    const roots = published
      .map(d => d.hierarchyPath?.split('/')[0])
      .filter((x): x is string => !!x);
    return ['all', ...Array.from(new Set(roots)).sort()];
  }, [published]);

  const toggleFav = (id: string) => {
    setFavs(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      localStorage.setItem(FAV_KEY, JSON.stringify(next));
      return next;
    });
  };

  const open = (id: string) => {
    const next = [id, ...recents.filter(x => x !== id)].slice(0, 6);
    setRecents(next);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    navigate(`/display/${id}`);
  };

  // Prune favourites/recents that point at displays that no longer exist or are unpublished.
  useEffect(() => {
    if (!published.length) return;
    const live = new Set(published.map(d => d.id));
    const f = favs.filter(id => live.has(id));
    const r = recents.filter(id => live.has(id));
    if (f.length !== favs.length) { setFavs(f); localStorage.setItem(FAV_KEY, JSON.stringify(f)); }
    if (r.length !== recents.length) { setRecents(r); localStorage.setItem(RECENT_KEY, JSON.stringify(r)); }
  }, [published]); // eslint-disable-line react-hooks/exhaustive-deps

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return published.filter(d =>
      (level === 'all' || d.level === level) &&
      (area === 'all' || (d.hierarchyPath ?? '').startsWith(area)) &&
      (!q || d.name.toLowerCase().includes(q)
          || (d.description ?? '').toLowerCase().includes(q)
          || (d.hierarchyPath ?? '').toLowerCase().includes(q)));
  }, [published, search, level, area]);

  const byId = useMemo(() => new Map(published.map(d => [d.id, d])), [published]);
  const favDisplays = favs.map(id => byId.get(id)).filter((d): d is DisplaySummary => !!d);
  const recentDisplays = recents.map(id => byId.get(id)).filter((d): d is DisplaySummary => !!d);

  if (isLoading) return <div className="display-launcher__msg">Loading displays…</div>;
  if (error) return <div className="display-launcher__msg">Failed to load displays.</div>;

  const Card: React.FC<{ d: DisplaySummary }> = ({ d }) => (
    <a
      className="display-launcher__card"
      data-testid="launcher-card"
      data-display-id={d.id}
      href={`/display/${d.id}`}
      onClick={e => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; // let the browser open a tab
        e.preventDefault();
        open(d.id);
      }}
    >
      <Thumb id={d.id} has={d.hasThumbnail} />
      <span className="display-launcher__card-head">
        <span className="display-launcher__card-name">{d.name}</span>
        <button
          className={`dl-star${favs.includes(d.id) ? ' active' : ''}`}
          data-testid="launcher-fav"
          title={favs.includes(d.id) ? 'Remove from favourites' : 'Add to favourites'}
          onClick={e => { e.preventDefault(); e.stopPropagation(); toggleFav(d.id); }}
        >★</button>
      </span>
      {d.description && <span className="display-launcher__card-desc">{d.description}</span>}
      <span className="display-launcher__card-meta">
        {d.level ? `L${d.level}` : d.category}
        {d.hierarchyPath ? ` · ${d.hierarchyPath}` : ''}
      </span>
      <span className="display-launcher__card-foot">
        <span className="display-launcher__badge">Published v{d.publishedVersion}</span>
        <span
          className="display-launcher__published"
          data-testid="launcher-published-at"
          title={`Published ${absoluteTime(d.publishedAt)}${d.publishedBy ? ` by ${d.publishedBy}` : ''}`}
        >
          {relativeTime(d.publishedAt)}{d.publishedBy ? ` · ${d.publishedBy}` : ''}
        </span>
      </span>
    </a>
  );

  return (
    <div className="display-launcher" data-testid="display-launcher">
      <header className="display-launcher__head">
        <h2 className="display-launcher__title">HMI Displays</h2>
        <span className="display-launcher__count" data-testid="launcher-count">
          {visible.length} of {published.length} published
        </span>
        <span className="trend-dialog__spacer" />
        <input
          className="display-launcher__search"
          data-testid="launcher-search"
          placeholder="Search name, area…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </header>

      {/* ISA-101 hierarchy level — primary displays reachable directly (ASM 5.2/5.3), no menu directory. */}
      <div className="display-launcher__filters" data-testid="level-chips">
        <button
          className={`display-launcher__chip${level === 'all' ? ' active' : ''}`}
          onClick={() => setLevel('all')}
        >All levels</button>
        {LEVELS.map(l => (
          <button
            key={l.n}
            className={`display-launcher__chip${level === l.n ? ' active' : ''}`}
            data-testid={`level-${l.n}`}
            title={l.hint}
            onClick={() => setLevel(l.n)}
          >{l.label}</button>
        ))}
        {areas.length > 2 && (
          <>
            <span className="dt-div" />
            {areas.map(a => (
              <button
                key={a}
                className={`display-launcher__chip${area === a ? ' active' : ''}`}
                onClick={() => setArea(a)}
              >{a === 'all' ? 'All areas' : a}</button>
            ))}
          </>
        )}
      </div>

      {favDisplays.length > 0 && (
        <section data-testid="favourites">
          <div className="display-launcher__section">Favourites</div>
          <div className="display-launcher__grid">{favDisplays.map(d => <Card key={`f-${d.id}`} d={d} />)}</div>
        </section>
      )}

      {recentDisplays.length > 0 && (
        <section data-testid="recents">
          <div className="display-launcher__section">Recent</div>
          <div className="display-launcher__grid">{recentDisplays.map(d => <Card key={`r-${d.id}`} d={d} />)}</div>
        </section>
      )}

      <div className="display-launcher__section">
        {level === 'all' && area === 'all' && !search ? 'All displays' : 'Matching displays'}
      </div>

      {visible.length === 0 && (
        <div className="display-launcher__msg">
          {published.length === 0
            ? <>No published displays yet.{canEdit && ' Publish one from the HMI Designer to make it available here.'}</>
            : 'No displays match that filter.'}
        </div>
      )}

      <div className="display-launcher__grid">
        {visible.map(d => <Card key={d.id} d={d} />)}
      </div>
    </div>
  );
};

export default DisplayLauncher;
