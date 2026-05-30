/**
 * WaymarkLayout
 *
 * Responsible for remembering where each note is positioned and how big it is
 * on each individual player's screen. This is purely local — it never gets
 * sent to the server or shared with other players. Each person can drag their
 * notes around without affecting what anyone else sees.
 *
 * Storage: one Foundry client-scoped setting holding a single object whose
 * keys are note IDs and whose values are { x, y, width, height }. Storing
 * everything in one setting rather than one-setting-per-note keeps the
 * Foundry settings registry from getting cluttered.
 */

const MODULE_ID = "waymarks";
const SETTING_KEY = "noteLayout";

export class WaymarkLayout {

  // ─── Setup ───────────────────────────────────────────────────────────────

  /**
   * Registers the Foundry client setting that holds all layout data.
   * Must be called once during the module's init hook, before any notes
   * try to load or save their positions.
   *
   * scope: "client" means the data is saved per-browser, not on the server.
   * config: false means it won't show up in the Configure Settings UI.
   */
  static registerSetting() {
    game.settings.register(MODULE_ID, SETTING_KEY, {
      scope: "client",
      config: false,
      type: Object,
      default: {},
    });
  }

  // ─── Internal ────────────────────────────────────────────────────────────

  /**
   * Reads the entire layout map from the Foundry setting.
   * Returns an empty object if the setting hasn't been written yet or if
   * something goes wrong reading it — so callers never have to deal with null.
   *
   * @returns {Object} map of noteId → { x, y, width, height }
   */
  static _getAll() {
    try {
      return game.settings.get(MODULE_ID, SETTING_KEY) ?? {};
    } catch {
      return {};
    }
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  /**
   * Saves position and/or size for a note. Only the fields you pass in get
   * updated — so passing just { x, y } won't wipe out a previously saved
   * width or height. This is called every time a note is dragged or resized.
   *
   * @param {string} id            - The note's unique ID
   * @param {Object} layout        - Any combination of x, y, width, height
   */
  static save(id, { x, y, width, height } = {}) {
    // Load the full map, merge in only the fields we received, write it back
    const all = WaymarkLayout._getAll();
    const existing = all[id] || {};
    const updated = { ...existing };
    if (x      !== undefined) updated.x = x;
    if (y      !== undefined) updated.y = y;
    if (width  !== undefined) updated.width = width;
    if (height !== undefined) updated.height = height;
    all[id] = updated;
    game.settings.set(MODULE_ID, SETTING_KEY, all);
  }

  /**
   * Returns the saved position and size for a note, or null if none has been
   * saved yet. The caller merges this on top of the server-stored note data
   * so the local position wins over the shared default.
   *
   * @param {string} id
   * @returns {{ x, y, width, height } | null}
   */
  static load(id) {
    const all = WaymarkLayout._getAll();
    return all[id] ?? null;
  }

  /**
   * Removes the saved layout for a note. Called when a note is permanently
   * deleted so we don't accumulate stale entries for notes that no longer exist.
   *
   * @param {string} id
   */
  static clear(id) {
    const all = WaymarkLayout._getAll();
    if (!all[id]) return;   // Nothing to remove
    delete all[id];
    game.settings.set(MODULE_ID, SETTING_KEY, all);
  }
}
