/**
 * NoteManager
 * Handles all CRUD operations and persistence for Waymarks notes.
 *
 * Storage strategy:
 *   - Each note is a JournalEntry with a module flag carrying note data.
 *   - Notes live in a "Waymarks" folder, with subfolders per scene.
 *   - Unpinned notes live in "Waymarks/No Scene".
 *   - Pinned notes live in "Waymarks/<Scene Name>".
 *
 * Identification:
 *   - Every Waymarks JournalEntry has flag: waymarks.isWaymark = true
 *   - Note data is stored in flag: waymarks.noteData = { ...WaymarkNote }
 *
 * The public API is intentionally the same as the settings-based version
 * so the rendering layer needs no changes.
 */
import { THEMES } from "./WaymarkThemes.js";

export class NoteManager {
  static MODULE_ID    = "waymarks";
  static ROOT_FOLDER  = "Waymarks";
  static NO_SCENE_FOLDER = "No Scene";

  // ─── Settings ────────────────────────────────────────────────────────────

  static registerSettings() {
    // No settings needed for Journal-based storage.
    // Keeping this method so waymarks.js doesn't need to change.
  }

  // ─── Folder helpers ──────────────────────────────────────────────────────

  /**
   * Find or create the root "Waymarks" folder.
   * @returns {Promise<Folder>}
   */
  static async _getRootFolder() {
    let folder = game.folders.find(
      f => f.type === "JournalEntry" && f.name === NoteManager.ROOT_FOLDER && !f.folder
    );
    if (!folder) {
      folder = await Folder.create({
        name: NoteManager.ROOT_FOLDER,
        type: "JournalEntry",
        folder: null,
      });
    }
    return folder;
  }

  /**
   * Find or create a subfolder under Waymarks root.
   * @param {string} name  — subfolder name, e.g. "No Scene" or a scene name
   * @returns {Promise<Folder>}
   */
  static async _getSubfolder(name) {
    const root = await NoteManager._getRootFolder();
    let sub = game.folders.find(
      f => f.type === "JournalEntry" && f.name === name && (f.folder ? f.folder.id : null) === root.id
    );
    if (!sub) {
      sub = await Folder.create({
        name,
        type: "JournalEntry",
        folder: root.id,
      });
    }
    return sub;
  }

  /**
   * Return the correct subfolder for a given sceneId (or No Scene).
   * @param {string|null} sceneId
   * @returns {Promise<Folder>}
   */
  static async _folderForScene(sceneId) {
    if (!sceneId) return NoteManager._getSubfolder(NoteManager.NO_SCENE_FOLDER);
    const scn = game.scenes.get(sceneId);
    const sceneName = scn ? scn.name : "Unknown Scene";
    return NoteManager._getSubfolder(sceneName);
  }

  // ─── Read ────────────────────────────────────────────────────────────────

  /**
   * Return all notes visible in the current context:
   * universal (no scene) notes + notes pinned to the active scene.
   * @returns {WaymarkNote[]}
   */
  static getActiveNotes() {
    const activeSceneId = (canvas && canvas.scene) ? canvas.scene.id : null;
    const isGM = game.user.isGM;
    const userId = game.user.id;

    return game.journal
      .filter(j => {
        if (!j.getFlag(NoteManager.MODULE_ID, "isWaymark")) return false;

        if (isGM) {
          // Foundry's testUserPermission always returns true for GMs, so we
          // must enforce visibility manually based on ownership.
          const nd = j.getFlag(NoteManager.MODULE_ID, "noteData");
          if (!nd) return false;
          const ownership = j.ownership || {};
          const createdBy = nd.createdBy;

          // Own note (or legacy null-createdBy note): always visible
          if (!createdBy || createdBy === userId) return true;

          // Another user's note: only visible if this GM has an explicit
          // ownership entry >= OBSERVER (2), or the note was sent to GM.
          // This applies equally to player-created and other-GM-created notes —
          // the creating GM must use the permissions dialog to share with others.
          const explicitLevel = ownership[userId];
          if (explicitLevel !== undefined && explicitLevel >= 2) return true;
          if (nd.sentToGM) return true;

          return false;
        } else {
          // Players use normal Foundry permission check
          return j.testUserPermission(game.user, "OBSERVER");
        }
      })
      .map(j => j.getFlag(NoteManager.MODULE_ID, "noteData"))
      .filter(n => {
        if (!n) return false;
        if (n.sceneId !== null && n.sceneId !== activeSceneId) return false;
        return true;
      });
  }

  // ─── Write ───────────────────────────────────────────────────────────────

  /**
   * Create a new note as a JournalEntry and persist it.
   * @param {Partial<WaymarkNote>} data
   * @returns {Promise<WaymarkNote>}
   */
  static async createNote(data = {}) {
    const note = NoteManager._buildNote(data);
    const folder = await NoteManager._folderForScene(note.sceneId);

    await JournalEntry.create({
      name: `Waymark-${note.id}`,
      folder: folder.id,
      pages: [],
      flags: {
        [NoteManager.MODULE_ID]: {
          isWaymark: true,
          noteData: note,
        },
      },
    });

    return note;
  }

  /**
   * Update an existing note's data in its JournalEntry flag.
   * @param {string} id
   * @param {Partial<WaymarkNote>} updates
   * @returns {Promise<WaymarkNote|null>}
   */
  static async updateNote(id, updates) {
    const entry = NoteManager._findEntry(id);
    if (!entry) return null;

    const current = entry.getFlag(NoteManager.MODULE_ID, "noteData");
    const updated = { ...current, ...updates };
    await entry.setFlag(NoteManager.MODULE_ID, "noteData", updated);
    return updated;
  }

  /**
   * Delete a note's JournalEntry.
   * @param {string} id
   * @returns {Promise<boolean>}
   */
  static async deleteNote(id) {
    const entry = NoteManager._findEntry(id);
    if (!entry) return false;
    await entry.delete();
    return true;
  }

  /**
   * Pin a note to the current scene — moves its JournalEntry to the scene subfolder.
   * @param {string} id
   * @returns {Promise<WaymarkNote|null>}
   */
  static async pinToScene(id) {
    const sceneId = (canvas && canvas.scene) ? canvas.scene.id : null;
    if (!sceneId) {
      ui.notifications.warn("Waymarks: No active scene to pin to.");
      return null;
    }

    const entry = NoteManager._findEntry(id);
    if (!entry) return null;

    const folder = await NoteManager._folderForScene(sceneId);
    const current = entry.getFlag(NoteManager.MODULE_ID, "noteData");
    const pinned  = { ...current, sceneId };

    await entry.update({
      folder: folder.id,
      [`flags.${NoteManager.MODULE_ID}.noteData`]: pinned,
    });

    return pinned;
  }

  /**
   * Unpin a note from its scene — moves its JournalEntry back to "No Scene".
   * @param {string} id
   * @returns {Promise<WaymarkNote|null>}
   */
  static async unpinFromScene(id) {
    const entry = NoteManager._findEntry(id);
    if (!entry) return null;

    const folder   = await NoteManager._getSubfolder(NoteManager.NO_SCENE_FOLDER);
    const current  = entry.getFlag(NoteManager.MODULE_ID, "noteData");
    const unpinned = { ...current, sceneId: null };

    await entry.update({
      folder: folder.id,
      [`flags.${NoteManager.MODULE_ID}.noteData`]: unpinned,
    });

    return unpinned;
  }

  // ─── Internal helpers ────────────────────────────────────────────────────

  static _buildNote(data) {
    return {
      id:        foundry.utils.randomID(),
      content:   "",
      color:     null,   // null = use world theme default
      color2:    null,   // null = use world theme default
      createdBy: null,   // user.id of the creator; null = GM
      x:         data.x || 100,
      y:         data.y || 100,
      width:     300,
      height:    200,
      fontSize:  24,
      collapsed: false,
      sceneId:   null,
      ...data,
    };
  }

  /**
   * Resolve the effective primary color for a note.
   * Per-note color overrides world setting; world setting overrides theme default.
   * null means "not explicitly set — use theme default".
   */
  static resolveColor1(note) {
    if (note.color  != null) return note.color;
    const theme = NoteManager.resolveTheme();
    // World override only if explicitly set (non-null stored)
    const stored = game.settings.get(NoteManager.MODULE_ID, "themeColor1");
    if (stored != null && stored !== "") return stored;
    return theme.defaultPrimary;
  }

  static resolveColor2(note) {
    if (note.color2 != null) return note.color2;
    const theme = NoteManager.resolveTheme();
    const stored = game.settings.get(NoteManager.MODULE_ID, "themeColor2");
    if (stored != null && stored !== "") return stored;
    return theme.defaultSecondary || "#000000";
  }

  static resolveTheme() {
    const key = game.settings.get(NoteManager.MODULE_ID, "theme") || "sticky";
    return THEMES[key] || THEMES.sticky;
  }

  /**
   * Find the JournalEntry for a given note id.
   * @param {string} id
   * @returns {JournalEntry|undefined}
   */
  static _findEntry(id) {
    return game.journal.find(j => {
      if (!j.getFlag(NoteManager.MODULE_ID, "isWaymark")) return false;
      const nd = j.getFlag(NoteManager.MODULE_ID, "noteData");
      return nd && nd.id === id;
    });
  }

  /**
   * Returns true if a hex color is dark enough to warrant white text.
   * Uses the WCAG relative luminance formula.
   * @param {string} hex
   * @returns {boolean}
   */
  static isDark(hex) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return luminance < 0.45;
  }
}

/**
 * @typedef {Object} WaymarkNote
 * @property {string}      id        - Unique identifier (matches JournalEntry name suffix)
 * @property {string}      content   - Plain text content
 * @property {string}      color     - Hex color string for background
 * @property {number}      x         - Left position in pixels
 * @property {number}      y         - Top position in pixels
 * @property {number}      width     - Width in pixels
 * @property {number}      height    - Height in pixels
 * @property {number}      fontSize  - Font size in px
 * @property {boolean}     collapsed - Whether collapsed to header only
 * @property {string|null} sceneId   - Scene id if pinned, null if universal
 */
