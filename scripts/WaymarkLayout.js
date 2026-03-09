/**
 * WaymarkLayout
 * Stores per-client position and size for each note in localStorage.
 * This data is never written to the server — each player arranges
 * notes independently on their own screen.
 */
export class WaymarkLayout {
  static _key(id) {
    return `waymarks.layout.${id}`;
  }

  /** Save position/size for a note. */
  static save(id, { x, y, width, height } = {}) {
    const existing = WaymarkLayout.load(id) || {};
    const updated = { ...existing };
    if (x      !== undefined) updated.x      = x;
    if (y      !== undefined) updated.y      = y;
    if (width  !== undefined) updated.width  = width;
    if (height !== undefined) updated.height = height;
    localStorage.setItem(WaymarkLayout._key(id), JSON.stringify(updated));
  }

  /** Load saved position/size for a note, or null if none saved. */
  static load(id) {
    const raw = localStorage.getItem(WaymarkLayout._key(id));
    if (!raw) return null;
    try { return JSON.parse(raw); }
    catch { return null; }
  }

  /** Remove saved layout when a note is deleted. */
  static clear(id) {
    localStorage.removeItem(WaymarkLayout._key(id));
  }
}
