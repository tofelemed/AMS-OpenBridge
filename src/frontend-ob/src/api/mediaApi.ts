// Phase 3 — image/SVG media upload for image symbols (and the future graphics library).
// The bytes live in display-service; a symbol stores only the returned id (config-only).
import { apiFetch } from './apiFetch';

const API_BASE = (import.meta.env.VITE_DISPLAY_SERVICE_URL as string | undefined) || '/api/displays';

/** Public URL for a stored media asset (served by display-service, through the same proxy). */
export function mediaUrl(id: string): string {
  return `${API_BASE}/media/${id}`;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export interface UploadedMedia { id: string; contentType: string; byteSize: number; }

/** Upload an image/SVG file; returns its id. Server enforces type/size/SVG-sanitisation. */
export async function uploadMedia(file: File): Promise<UploadedMedia> {
  const dataBase64 = await fileToDataUrl(file); // data: URL — server strips the prefix
  const res = await apiFetch(`${API_BASE}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contentType: file.type, dataBase64, fileName: file.name }),
  });
  if (!res.ok) throw new Error((await res.text()) || 'Upload failed');
  return res.json();
}
