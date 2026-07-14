import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { Modal, FormField } from '../shared/Modal';
import { apiFetch, apiJson } from '../../api/apiFetch';
import { relativeTime } from '../../utils/relativeTime';
import { useAuthStore } from '../../store/authStore';

const API_BASE = import.meta.env.VITE_DISPLAY_SERVICE_URL || '/api/displays';

/* OpenBridge tokens. These were raw hex ("OpenBridge-inspired") applied via inline style, which beats
   every stylesheet — so this page could never follow the day/night theme. Real tokens now. */
const T = {
  blue: 'var(--selected-enabled-background-color)',
  blueMid: 'var(--selected-hover-background-color)',
  blueLight: 'var(--container-section-color)',
  blueMuted: 'var(--border-divider-color)',
  bg: 'var(--container-backdrop-color)',
  card: 'var(--container-background-color)',
  border: 'var(--border-divider-color)',
  borderLight: 'var(--border-divider-color)',
  textPrimary: 'var(--element-active-color)',
  textSecondary: 'var(--element-neutral-color)',
  textMuted: 'var(--element-inactive-color)',
  success: 'var(--alert-running-color)',
  successBg: 'var(--container-section-color)',
  successBorder: 'var(--alert-running-color)',
  warning: 'var(--alert-warning-color)',
  warningBg: 'var(--container-section-color)',
  warningBorder: 'var(--alert-warning-color)',
  critical: 'var(--alert-alarm-color)',
  criticalBg: 'var(--container-section-color)',
  criticalBorder: 'var(--alert-alarm-color)',
  purple: 'var(--element-neutral-color)',
  purpleBg: 'var(--container-section-color)',
  purpleBorder: 'var(--border-divider-color)',
  radius: 'var(--border-radius-br-12)',
  radiusSm: 'var(--border-radius-br-8)',
  shadow: 'var(--shadow-flat)',
  shadowHover: 'var(--shadow-raised)',
} as const;

interface Display {
  id: string;
  name: string;
  category: string;
  description?: string;
  hierarchyPath?: string;
  width: number;
  height: number;
  publishedVersion?: number;
  draftVersion: number;
  level?: number | null;
  hasThumbnail?: boolean;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

const CATEGORIES = ['overview', 'detail', 'faceplate', 'trend', 'alarm'] as const;

const CATEGORY_META: Record<string, { label: string; icon: string; color: string; bg: string; border: string }> = {
  overview:  { label: 'Overview',  icon: '🖥️', color: T.blue,     bg: T.blueLight,     border: T.blueMuted },
  detail:    { label: 'Detail',    icon: '🔍', color: T.success,  bg: T.successBg,     border: T.successBorder },
  faceplate: { label: 'Faceplate', icon: '📋', color: T.purple,   bg: T.purpleBg,      border: T.purpleBorder },
  trend:     { label: 'Trend',     icon: '📈', color: T.warning,  bg: T.warningBg,     border: T.warningBorder },
  alarm:     { label: 'Alarm',     icon: '🚨', color: T.critical, bg: T.criticalBg,    border: T.criticalBorder },
};

async function fetchDisplays(category?: string): Promise<{ displays: Display[]; total: number }> {
  const url = category ? `${API_BASE}?category=${category}` : API_BASE;
  const res = await apiFetch(url);
  if (!res.ok) throw new Error('Failed to load displays');
  return res.json();
}

async function createDisplay(data: { name: string; category: string; description?: string; ownerId: string }) {
  const res = await apiFetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // ownerId was the literal 'designer-user' for every display by every person — which makes owner-based
    // permissions meaningless. It is the real user now.
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create display');
  return res.json();
}

function formatRelativeDate(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

export const DisplayList: React.FC = () => {
  const navigate = useNavigate();
  const currentUser = useAuthStore(s => s.user?.username ?? 'unknown');
  const queryClient = useQueryClient();
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newDisplay, setNewDisplay] = useState({ name: '', category: 'overview', description: '' });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['displays', selectedCategory],
    queryFn: () => fetchDisplays(selectedCategory),
  });

  const createMutation = useMutation({
    mutationFn: createDisplay,
    onSuccess: (result) => {
      toast.success('Display created');
      queryClient.invalidateQueries({ queryKey: ['displays'] });
      setShowCreateModal(false);
      setNewDisplay({ name: '', category: 'overview', description: '' });
      navigate(`/designer/${result.id}`);
    },
    onError: () => toast.error('Failed to create display'),
  });

  const refreshLists = () => {
    queryClient.invalidateQueries({ queryKey: ['displays'] });
    queryClient.invalidateQueries({ queryKey: ['launcher-displays'] });
    queryClient.invalidateQueries({ queryKey: ['deleted-displays'] });
  };

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      apiJson(`${API_BASE}/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }),
    onSuccess: () => { toast.success('Renamed'); refreshLists(); },
    onError: (e: Error) => toast.error(`Rename failed: ${e.message}`),
  });

  // "Save As": copies the current draft into a new, UNPUBLISHED display owned by the caller.
  const duplicateMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      apiJson<{ id: string }>(`${API_BASE}/${id}/duplicate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
      }),
    onSuccess: (r) => { toast.success('Display duplicated'); refreshLists(); navigate(`/designer/${r.id}`); },
    onError: (e: Error) => toast.error(`Duplicate failed: ${e.message}`),
  });

  // Soft delete → recycle bin. Recoverable, which is why the toast offers Undo.
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`${API_BASE}/${id}`, { method: 'DELETE' }).then(r => {
      if (!r.ok) throw new Error(String(r.status));
      return id;
    }),
    onSuccess: (id) => {
      refreshLists();
      toast.info(
        <span>
          Display deleted.{' '}
          <button className="dl-undo" onClick={() => restoreMutation.mutate(id)}>Undo</button>
        </span>,
        { autoClose: 8000 },
      );
    },
    onError: (e: Error) => toast.error(`Delete failed: ${e.message}`),
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => apiJson(`${API_BASE}/${id}/restore`, { method: 'POST' }),
    onSuccess: () => { toast.success('Display restored'); refreshLists(); },
    onError: (e: Error) => toast.error(`Restore failed: ${e.message}`),
  });

  // The recycle bin itself (deleted displays were previously invisible AND unrecoverable via the API).
  const { data: deleted } = useQuery({
    queryKey: ['deleted-displays'],
    queryFn: () => apiJson<{ displays: Array<{ id: string; name: string; deletedAt: string }> }>(`${API_BASE}/deleted`),
  });

  const stats = useMemo(() => {
    const all = data?.displays ?? [];
    return {
      total: data?.total ?? all.length,
      published: all.filter(d => d.publishedVersion).length,
      drafts: all.filter(d => !d.publishedVersion || d.draftVersion > (d.publishedVersion ?? 0)).length,
    };
  }, [data]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', padding: '4px 0' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <h1 style={{
              fontSize: '28px', fontWeight: 600, margin: 0,
              color: T.textPrimary, letterSpacing: '-0.02em', lineHeight: 1.2,
            }}>
              HMI Designer
            </h1>
            <span style={{
              fontSize: '11px', fontWeight: 700, padding: '4px 10px',
              borderRadius: '20px', background: T.blueLight, color: T.blue,
              border: `1px solid ${T.blueMuted}`, letterSpacing: '0.04em',
            }}>
              ISA-101
            </span>
          </div>
          <p style={{ color: T.textSecondary, fontSize: '13.5px', margin: 0 }}>
            Create and manage operator displays · OpenBridge + custom SVG components
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '7px',
            background: T.blue, color: '#fff', border: 'none',
            borderRadius: T.radiusSm, padding: '9px 20px',
            fontSize: '13px', fontWeight: 600, cursor: 'pointer',
            fontFamily: 'inherit', boxShadow: '0 1px 4px rgba(49,89,143,0.25)',
            flexShrink: 0,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = T.blueMid; }}
          onMouseLeave={e => { e.currentTarget.style.background = T.blue; }}
        >
          <span style={{ fontSize: '16px', lineHeight: 1 }}>+</span>
          New Display
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
        {[
          { label: 'Total Displays', value: stats.total, color: T.blue },
          { label: 'Published', value: stats.published, color: T.success },
          { label: 'Draft Changes', value: stats.drafts, color: T.warning },
          { label: 'Categories', value: CATEGORIES.length, color: T.textSecondary },
        ].map(s => (
          <div
            key={s.label}
            style={{
              background: T.card, border: `1px solid ${T.border}`,
              borderRadius: T.radiusSm, padding: '14px 16px', boxShadow: T.shadow,
            }}
          >
            <div style={{ fontSize: '11px', fontWeight: 600, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
              {s.label}
            </div>
            <div style={{ fontSize: '26px', fontWeight: 700, color: s.color, fontVariantNumeric: 'tabular-nums' }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap',
        padding: '4px 0',
      }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: T.textMuted, marginRight: '4px' }}>Filter:</span>
        <FilterChip
          label="All"
          active={!selectedCategory}
          onClick={() => setSelectedCategory(undefined)}
        />
        {CATEGORIES.map(cat => {
          const meta = CATEGORY_META[cat];
          return (
            <FilterChip
              key={cat}
              label={meta.label}
              icon={meta.icon}
              active={selectedCategory === cat}
              onClick={() => setSelectedCategory(cat)}
              activeColor={meta.color}
              activeBg={meta.bg}
              activeBorder={meta.border}
            />
          );
        })}
      </div>

      {/* Content */}
      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState onRetry={() => refetch()} />
      ) : data?.displays.length === 0 ? (
        <EmptyState onCreate={() => setShowCreateModal(true)} category={selectedCategory} />
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '16px',
        }}>
          {data?.displays.map(display => (
            <div key={display.id} style={{ position: 'relative' }}>
              <DisplayCard
                display={display}
                onOpen={() => navigate(`/designer/${display.id}`)}
              />
              {/* Rename / Duplicate ("Save As") / Delete. None of these existed — a display could be
                  created and opened, and that was all. PI Vision puts exactly these on its home page. */}
              <div className="dl-card-actions">
                <button
                  className="dl-action" data-testid="card-rename"
                  title="Rename"
                  onClick={(e) => {
                    e.stopPropagation();
                    const name = window.prompt('Rename display', display.name);
                    if (name && name.trim() && name !== display.name) renameMutation.mutate({ id: display.id, name: name.trim() });
                  }}
                >Rename</button>
                <button
                  className="dl-action" data-testid="card-duplicate"
                  title="Duplicate (Save As)"
                  onClick={(e) => {
                    e.stopPropagation();
                    const name = window.prompt('Name for the copy', `${display.name} (copy)`);
                    if (name && name.trim()) duplicateMutation.mutate({ id: display.id, name: name.trim() });
                  }}
                >Duplicate</button>
                <button
                  className="dl-action dl-action--danger" data-testid="card-delete"
                  title="Delete (recoverable from the recycle bin)"
                  onClick={(e) => {
                    e.stopPropagation();
                    // Never delete on a bare click; name the display in the prompt.
                    if (window.confirm(`Delete "${display.name}"? It goes to the recycle bin and can be restored.`)) {
                      deleteMutation.mutate(display.id);
                    }
                  }}
                >Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Recycle bin — deletes are soft, so nothing is ever really gone. PI Vision keeps deleted
          displays indefinitely; under ISA-101 a display is a change-managed artifact. */}
      {(deleted?.displays.length ?? 0) > 0 && (
        <div className="dl-bin" data-testid="recycle-bin">
          <div className="dl-bin__title">Recycle bin ({deleted!.displays.length})</div>
          {deleted!.displays.map(d => (
            <div key={d.id} className="dl-bin__row">
              <span className="dl-bin__name">{d.name}</span>
              <span className="dl-bin__meta">deleted {relativeTime(d.deletedAt)}</span>
              <button
                className="dl-action" data-testid="bin-restore"
                onClick={() => restoreMutation.mutate(d.id)}
              >Restore</button>
            </div>
          ))}
        </div>
      )}

      {/* Create modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create New Display"
        subtitle="Define a new HMI screen for operators"
        icon={<span style={{ fontSize: '20px' }}>🎨</span>}
        footer={
          <>
            <ObcButton variant="flat" onClick={() => setShowCreateModal(false)}>
              Cancel
            </ObcButton>
            <ObcButton
              variant="normal"
              disabled={createMutation.isPending || !newDisplay.name.trim()}
              onClick={() => createMutation.mutate({ ...newDisplay, ownerId: currentUser })}
            >
              {createMutation.isPending ? 'Creating…' : 'Create Display'}
            </ObcButton>
          </>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate({ ...newDisplay, ownerId: currentUser });
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
        >
          <FormField label="Display Name" required hint="Shown in the display list and designer title bar">
            <input
              type="text"
              className="ob-input"
              style={{ width: '100%' }}
              value={newDisplay.name}
              onChange={(e) => setNewDisplay(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g. Houston Crude Overview"
              required
              autoFocus
            />
          </FormField>

          <FormField label="Category" hint="ISA-101 display type">
            <select
              className="ob-input"
              style={{ width: '100%' }}
              value={newDisplay.category}
              onChange={(e) => setNewDisplay(prev => ({ ...prev, category: e.target.value }))}
            >
              {CATEGORIES.map(cat => (
                <option key={cat} value={cat}>
                  {CATEGORY_META[cat].icon} {CATEGORY_META[cat].label}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Description" hint="Optional — helps operators find this display">
            <textarea
              className="ob-input"
              style={{ width: '100%', minHeight: '80px', resize: 'vertical' }}
              value={newDisplay.description}
              onChange={(e) => setNewDisplay(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Main overview for Houston crude unit…"
              rows={3}
            />
          </FormField>
        </form>
      </Modal>
    </div>
  );
};

/* ─── Sub-components ─────────────────────────────────────────────────────── */

interface FilterChipProps {
  label: string;
  icon?: string;
  active: boolean;
  onClick: () => void;
  activeColor?: string;
  activeBg?: string;
  activeBorder?: string;
}

const FilterChip: React.FC<FilterChipProps> = ({
  label, icon, active, onClick, activeColor = T.blue, activeBg = T.blueLight, activeBorder = T.blueMuted,
}) => (
  <button
    type="button"
    onClick={onClick}
    style={{
      display: 'inline-flex', alignItems: 'center', gap: '5px',
      padding: '6px 14px', fontSize: '12.5px', fontWeight: 600,
      borderRadius: T.radiusSm, cursor: 'pointer', fontFamily: 'inherit',
      border: `1.5px solid ${active ? activeBorder : T.border}`,
      background: active ? activeBg : T.card,
      color: active ? activeColor : T.textSecondary,
      transition: 'all 130ms ease',
    }}
  >
    {icon && <span>{icon}</span>}
    {label}
  </button>
);

/** The card preview: the display's own SVG schematic, generated on publish (never a fake box). */
const DisplayThumb: React.FC<{ id: string; has?: boolean }> = ({ id, has }) => {
  const { data } = useQuery({
    queryKey: ['thumb', id],
    queryFn: async () => {
      const r = await apiFetch(`${API_BASE}/${id}/thumbnail`);
      return r.ok ? r.text() : '';
    },
    enabled: !!has,
    staleTime: 5 * 60_000,
  });
  if (!has || !data) {
    return (
      <span style={{ fontSize: '11px', color: T.textMuted }}>
        No preview — publish to generate one
      </span>
    );
  }
  return (
    <div
      style={{ width: '100%', height: '100%', overflow: 'hidden' }}
      dangerouslySetInnerHTML={{ __html: data }}
    />
  );
};

interface DisplayCardProps {
  display: Display;
  onOpen: () => void;
}

const DisplayCard: React.FC<DisplayCardProps> = ({ display, onOpen }) => {
  const meta = CATEGORY_META[display.category] ?? CATEGORY_META.overview;
  const hasUnpublishedDraft = display.publishedVersion
    ? display.draftVersion > display.publishedVersion
    : true;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onOpen(); }}
      style={{
        background: T.card,
        border: `1px solid ${T.border}`,
        borderRadius: T.radius,
        overflow: 'hidden',
        cursor: 'pointer',
        boxShadow: T.shadow,
        transition: 'box-shadow 180ms ease, transform 180ms ease, border-color 180ms ease',
        borderLeft: `4px solid ${meta.color}`,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.boxShadow = T.shadowHover;
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.borderColor = meta.border;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = T.shadow;
        e.currentTarget.style.transform = 'none';
        e.currentTarget.style.borderColor = T.border;
      }}
    >
      {/* Real preview — this used to be a grey box with the text "1920 × 1080" in it, dressed up as a
          thumbnail. It is now the display's actual SVG schematic, regenerated on publish. */}
      <div style={{
        height: '120px',
        background: `linear-gradient(145deg, ${T.bg} 0%, ${T.borderLight} 100%)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderBottom: `1px solid ${T.borderLight}`,
        position: 'relative',
      }}>
        <DisplayThumb id={display.id} has={display.hasThumbnail} />
        <span style={{
          position: 'absolute', top: '10px', right: '10px',
          fontSize: '10px', fontWeight: 700, padding: '3px 8px',
          borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '0.05em',
          background: meta.bg, color: meta.color, border: `1px solid ${meta.border}`,
        }}>
          {meta.icon} {meta.label}
        </span>
      </div>

      {/* Info */}
      <div style={{ padding: '14px 16px' }}>
        <div style={{
          fontSize: '15px', fontWeight: 600, color: T.textPrimary,
          marginBottom: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {display.name}
        </div>

        {display.description && (
          <p style={{
            fontSize: '12.5px', color: T.textSecondary, margin: '0 0 10px',
            lineHeight: 1.45,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {display.description}
          </p>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <VersionBadge label={`Draft v${display.draftVersion}`} variant={hasUnpublishedDraft ? 'draft' : 'muted'} />
            {display.publishedVersion && (
              <VersionBadge label={`Pub v${display.publishedVersion}`} variant="published" />
            )}
          </div>
          <span style={{ fontSize: '11px', color: T.textMuted }}>
            {formatRelativeDate(display.updatedAt)}
          </span>
        </div>
      </div>
    </div>
  );
};

const VersionBadge: React.FC<{ label: string; variant: 'draft' | 'published' | 'muted' }> = ({ label, variant }) => {
  const styles = {
    draft:     { bg: T.warningBg, color: T.warning, border: T.warningBorder },
    published: { bg: T.successBg, color: T.success, border: T.successBorder },
    muted:     { bg: T.bg, color: T.textMuted, border: T.border },
  }[variant];

  return (
    <span style={{
      fontSize: '10px', fontWeight: 700, padding: '2px 8px',
      borderRadius: '20px', background: styles.bg, color: styles.color,
      border: `1px solid ${styles.border}`,
    }}>
      {label}
    </span>
  );
};

const LoadingState: React.FC = () => (
  <div style={{
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '16px',
  }}>
    {[1, 2, 3].map(i => (
      <div
        key={i}
        style={{
          height: '220px', borderRadius: T.radius,
          background: `linear-gradient(90deg, ${T.borderLight} 25%, ${T.bg} 50%, ${T.borderLight} 75%)`,
          backgroundSize: '200% 100%',
          animation: 'shimmer 1.4s infinite',
        }}
      />
    ))}
    <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
  </div>
);

const ErrorState: React.FC<{ onRetry: () => void }> = ({ onRetry }) => (
  <div style={{
    background: T.criticalBg, border: `1px solid ${T.criticalBorder}`,
    borderRadius: T.radiusSm, padding: '32px', textAlign: 'center',
  }}>
    <div style={{ fontSize: '32px', marginBottom: '12px' }}>⚠️</div>
    <div style={{ fontSize: '15px', fontWeight: 600, color: T.critical, marginBottom: '6px' }}>
      Failed to load displays
    </div>
    <p style={{ fontSize: '13px', color: T.textSecondary, margin: '0 0 16px' }}>
      Check that the display service is running and reachable.
    </p>
    <ObcButton variant="normal" onClick={onRetry}>Retry</ObcButton>
  </div>
);

const EmptyState: React.FC<{ onCreate: () => void; category?: string }> = ({ onCreate, category }) => (
  <div style={{
    background: T.card, border: `1px dashed ${T.border}`,
    borderRadius: T.radius, padding: '48px 24px', textAlign: 'center',
  }}>
    <div style={{ fontSize: '40px', marginBottom: '12px', opacity: 0.6 }}>🎨</div>
    <div style={{ fontSize: '16px', fontWeight: 600, color: T.textPrimary, marginBottom: '6px' }}>
      {category ? `No ${CATEGORY_META[category]?.label ?? category} displays` : 'No displays yet'}
    </div>
    <p style={{ fontSize: '13px', color: T.textSecondary, margin: '0 0 20px', maxWidth: '360px', marginInline: 'auto' }}>
      Create your first HMI display with drag-and-drop components, tag bindings, and live preview.
    </p>
    <ObcButton variant="normal" onClick={onCreate}>+ Create Display</ObcButton>
  </div>
);

export default DisplayList;
