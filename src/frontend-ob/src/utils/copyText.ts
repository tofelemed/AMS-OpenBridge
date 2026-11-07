/**
 * Copy text to the clipboard. `navigator.clipboard` exists only in a secure context, and the plant runs on http,
 * so it falls back to a hidden textarea and `document.execCommand('copy')`. True when the text was copied.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* denied: try the fallback */ }
  const box = document.createElement('textarea');
  box.value = text;
  box.setAttribute('readonly', '');
  box.style.position = 'fixed';
  box.style.opacity = '0';
  document.body.appendChild(box);
  try {
    box.select();
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    document.body.removeChild(box);
  }
}
