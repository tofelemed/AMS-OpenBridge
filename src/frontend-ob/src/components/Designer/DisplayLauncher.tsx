'use client';

// Phase K — the published-HMI launcher (/displays).
//
// The existing DisplayList is an AUTHORING surface: its cards open /designer/:id. Operators and
// Viewers have no Designer access, so they need an entry point that opens the runtime viewer
// (/display/:id) instead. This is that page: published displays only, no create/edit affordances.
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../../store/authStore';
import { apiJson } from '../../api/apiFetch';
import './Designer.css';

const API_BASE = import.meta.env.VITE_DISPLAY_SERVICE_URL || '/api/displays';

interface DisplaySummary {
  id: string;
  name: string;
  category: string;
  description?: string;
  publishedVersion?: number | null;
  draftVersion: number;
  updatedAt: string;
}

export const DisplayLauncher: React.FC = () => {
  const navigate = useNavigate();
  const canEdit = useAuthStore(s => s.hasPermission('display.edit'));

  const { data, isLoading, error } = useQuery({
    queryKey: ['launcher-displays'],
    queryFn: () => apiJson<{ displays: DisplaySummary[] }>(API_BASE),
  });

  // Only published displays are runnable: an unpublished display has no live version to serve
  // (display-service 404s on ?stage=published), so showing it here would be a dead link.
  const published = (data?.displays ?? []).filter(d => d.publishedVersion != null);

  if (isLoading) return <div className="display-launcher__msg">Loading displays…</div>;
  if (error) return <div className="display-launcher__msg">Failed to load displays.</div>;

  return (
    <div className="display-launcher" data-testid="display-launcher">
      <header className="display-launcher__head">
        <h2 className="display-launcher__title">HMI Displays</h2>
        <span className="display-launcher__count" data-testid="launcher-count">
          {published.length} published
        </span>
      </header>

      {published.length === 0 && (
        <div className="display-launcher__msg">
          No published displays yet.
          {canEdit && ' Publish one from the HMI Designer to make it available here.'}
        </div>
      )}

      <div className="display-launcher__grid">
        {published.map(d => (
          <button
            key={d.id}
            className="display-launcher__card"
            data-testid="launcher-card"
            data-display-id={d.id}
            onClick={() => navigate(`/display/${d.id}`)}
          >
            <span className="display-launcher__card-name">{d.name}</span>
            <span className="display-launcher__card-meta">{d.category}</span>
            <span className="display-launcher__badge">Published v{d.publishedVersion}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default DisplayLauncher;
