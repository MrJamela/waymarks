/**
 * NoteManager
 *
 * The single place where all note data is read from and written to Foundry.
 * Nothing outside this class should touch JournalEntry flags directly —
 * all reads and writes go through these methods.
 *
 * How notes are stored:
 *   Each Waymark note is a Foundry JournalEntry. The actual note data
 *   (position, content, color, etc.) lives in a module flag on that entry:
 *     entry.flags.waymarks.noteData = { id, title, content, x, y, ... }
 *
 *   A second flag marks the entry as belonging to Waymarks so we can
 *   quickly tell our entries apart from regular journal entries:
 *     entry.flags.waymarks.isWaymark = true
 *
 * How notes are organised in the Journal sidebar:
 *   Notes are grouped into folders so GMs can see them clearly:
 *     Waymarks/
 *       No Scene/    ← universal notes (visible everywhere)
 *       Tavern/      ← notes pinned to the "Tavern" scene
 *       Dungeon/     ← notes pinned to the "Dungeon" scene
 *       ...
 *
 *   When a note is pinned or unpinned, its JournalEntry is moved between
 *   these folders. The folder structure is created on demand.
 */
import { THEMES } from "./WaymarkThemes.js";

export class NoteManager {

  // ─── Constants ─────────────────────────────────────────────────────────────
  // Centralised so if we ever rename the module or the folder, it's one change.

  static MODULE_ID = "waymarks";
  static ROOT_FOLDER = "Waymarks";
  static NO_SCENE_FOLDER = "No Scene";

  // ─── Settings ──────────────────────────────────────────────────────────────

  /**
   * Placeholder kept so waymarks.js can call NoteManager.registerSettings()
   * during init without needing to know whether there's anything to register.
   * Previously this registered world settings when notes were stored in settings
   * rather than JournalEntries. Now storage is journal-based so there's nothing
   * to register here, but removing the call would require changing waymarks.js.
   */
  static registerSettings() {
    // Reserved: Journal-based storage needs no settings. Retained as a stable
    // extension point so future settings can be added without touching the init hook.
  }

  // ─── Folder helpers ────────────────────────────────────────────────────────
  // These are internal utilities for keeping JournalEntries organised.
  // They create folders on demand so we never have to worry about whether
  // the folder exists before writing a note.

  /**
   * Finds the top-level "Waymarks" folder in the Journal sidebar, or creates
   * it if it doesn't exist yet. This is the parent of all scene subfolders.
   *
   * @returns {Promise<Folder>}
   */
  static async _getRootFolder() {
    // Look for an existing top-level JournalEntry folder named "Waymarks"
    let folder = game.folders.find(
      f => f.type === "JournalEntry" && f.name === NoteManager.ROOT_FOLDER && !f.folder
    );
    if (!folder) {
      folder = await Folder.create({
        name: NoteManager.ROOT_FOLDER,
        type: "JournalEntry",
        folder: null,   // null = top level, no parent folder
      });
    }
    return folder;
  }

  /**
   * Finds or creates a named subfolder directly inside the Waymarks root.
   * Used for "No Scene" and each pinned scene's folder.
   *
   * @param {string} name  e.g. "No Scene" or "Tavern"
   * @returns {Promise<Folder>}
   */
  static async _getSubfolder(name) {
    const root = await NoteManager._getRootFolder();
    // Look for a JournalEntry folder with this name whose parent is the root
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
   * Returns the correct subfolder for a note given its sceneId.
   * If sceneId is null, the note is universal → goes in "No Scene".
   * If sceneId points to a real scene, the folder is named after that scene.
   * If the scene no longer exists (deleted), falls back to "Unknown Scene".
   *
   * @param {string|null} sceneId
   * @returns {Promise<Folder>}
   */
  static async _folderForScene(sceneId) {
    if (!sceneId) return NoteManager._getSubfolder(NoteManager.NO_SCENE_FOLDER);
    const scn = game.scenes.get(sceneId);
    const sceneName = scn ? scn.name : game.i18n.localize("WAYMARKS.Author.UnknownScene");
    return NoteManager._getSubfolder(sceneName);
  }

  // ─── Read ──────────────────────────────────────────────────────────────────

  /**
   * Returns all notes that should currently be visible on screen for this user.
   * "Visible" means:
   *   - The note is either universal (no scene) or pinned to the active scene
   *   - The user has permission to see it
   *
   * GMs get special handling because Foundry's built-in permission check
   * always returns true for GMs — meaning a GM would see every note ever
   * created by every other GM. Instead we check ownership manually:
   *   - GMs always see their own notes
   *   - GMs see another user's note only if they've been explicitly granted
   *     Observer access via the permissions dialog, or the player sent it to GM
   *
   * Players use Foundry's normal permission check (OBSERVER or higher).
   *
   * @returns {WaymarkNote[]}
   */
  static getActiveNotes() {
    const activeSceneId = (canvas && canvas.scene) ? canvas.scene.id : null;
    const isGM = game.user.isGM;
    const userId = game.user.id;
    const { OBSERVER } = CONST.DOCUMENT_OWNERSHIP_LEVELS;

    return game.journal
      .filter(j => {
        // Skip anything that isn't a Waymark
        if (!j.getFlag(NoteManager.MODULE_ID, "isWaymark")) return false;

        if (isGM) {
          // Can't use testUserPermission for GMs — it always returns true.
          // Instead, check ownership manually.
          const nd = j.getFlag(NoteManager.MODULE_ID, "noteData");
          if (!nd) return false;

          const ownership = j.ownership || {};
          const createdBy = nd.createdBy;

          // GMs always see notes they created (or old notes with no createdBy)
          if (!createdBy || createdBy === userId) return true;

          // For notes created by someone else, the GM must have been explicitly
          // granted Observer access or the player must have hit "Send to GM"
          const explicitLevel = ownership[userId];
          if (explicitLevel !== undefined && explicitLevel >= OBSERVER) return true;
          if (nd.sentToGM) return true;

          return false;

        } else {
          // Normal Foundry permission check for players
          return j.testUserPermission(game.user, "OBSERVER");
        }
      })
      // Extract just the noteData object from each matching entry
      .map(j => j.getFlag(NoteManager.MODULE_ID, "noteData"))
      .filter(n => {
        // Drop any entries that somehow have no noteData
        if (!n) return false;
        // A pinned note only appears on the scene it's pinned to
        if (n.sceneId !== null && n.sceneId !== activeSceneId) return false;
        return true;
      });
  }

  // ─── Write ─────────────────────────────────────────────────────────────────

  /**
   * Creates a new note and saves it to the server as a JournalEntry.
   * Builds a complete note object from defaults + whatever data was passed in,
   * then writes it into the appropriate folder.
   *
   * The JournalEntry name is set to the note's title if one was given,
   * otherwise it falls back to "Waymark-{id}" so the journal sidebar
   * always shows something readable.
   *
   * @param {Partial<WaymarkNote>} data  — any fields to override the defaults
   * @returns {Promise<WaymarkNote>}     — the full note object that was saved
   */
  static async createNote(data = {}) {
    const note = NoteManager._buildNote(data);
    const folder = await NoteManager._folderForScene(note.sceneId);

    await JournalEntry.create({
      name: note.title ? note.title : `Waymark-${note.id}`,
      folder: folder.id,
      pages: [],   // Waymarks don't use journal pages — data lives in flags
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
   * Updates one or more fields on an existing note.
   * Merges the updates into the current note data and writes the result back
   * to the JournalEntry's flags. If the title is being changed, the
   * JournalEntry name is updated at the same time so the sidebar stays in sync.
   *
   * This is a single server call — both the flag and the name update together.
   *
   * @param {string}              id       — the note's unique ID
   * @param {Partial<WaymarkNote>} updates  — only the fields to change
   * @returns {Promise<WaymarkNote|null>}   — the full updated note, or null if not found
   */
  static async updateNote(id, updates) {
    const entry = NoteManager._findEntry(id);
    if (!entry) return null;

    const current = entry.getFlag(NoteManager.MODULE_ID, "noteData");
    const updated = { ...current, ...updates };

    // Build the update object. We always update the noteData flag.
    // If the title changed, also update the JournalEntry name so the sidebar
    // reflects the new title without needing a separate call.
    const entryUpdates = { [`flags.${NoteManager.MODULE_ID}.noteData`]: updated };
    if ("title" in updates) {
      entryUpdates.name = updates.title?.trim() || `Waymark-${id}`;
    }

    await entry.update(entryUpdates);
    return updated;
  }

  /**
   * Permanently deletes a note's JournalEntry from the server.
   * After this, the note is gone for all users.
   *
   * @param {string} id
   * @returns {Promise<boolean>}  true if deleted, false if the note wasn't found
   */
  static async deleteNote(id) {
    const entry = NoteManager._findEntry(id);
    if (!entry) return false;
    await entry.delete();
    return true;
  }

  /**
   * Pins a note to whichever scene is currently active.
   * "Pinned" means the note only appears when that scene is loaded.
   *
   * Physically moves the JournalEntry into the scene's subfolder so it's
   * easy for GMs to see which scene a note belongs to in the sidebar.
   * Also writes the sceneId into the note's data so the renderer knows
   * whether to show it.
   *
   * @param {string} id
   * @returns {Promise<WaymarkNote|null>}
   */
  static async pinToScene(id) {
    const sceneId = (canvas && canvas.scene) ? canvas.scene.id : null;
    if (!sceneId) {
      ui.notifications.warn(game.i18n.localize("WAYMARKS.Notify.NoPinScene"));
      return null;
    }

    const entry = NoteManager._findEntry(id);
    if (!entry) return null;

    const folder = await NoteManager._folderForScene(sceneId);
    const current = entry.getFlag(NoteManager.MODULE_ID, "noteData");
    const pinned = { ...current, sceneId };

    // Update both the folder (sidebar organisation) and noteData (renderer logic)
    await entry.update({
      folder: folder.id,
      [`flags.${NoteManager.MODULE_ID}.noteData`]: pinned,
    });

    return pinned;
  }

  /**
   * Removes a note's scene pin so it becomes universal again.
   * Moves the JournalEntry back to the "No Scene" folder and clears
   * the sceneId from the note data.
   *
   * @param {string} id
   * @returns {Promise<WaymarkNote|null>}
   */
  static async unpinFromScene(id) {
    const entry = NoteManager._findEntry(id);
    if (!entry) return null;

    const folder = await NoteManager._getSubfolder(NoteManager.NO_SCENE_FOLDER);
    const current = entry.getFlag(NoteManager.MODULE_ID, "noteData");
    const unpinned = { ...current, sceneId: null };

    await entry.update({
      folder: folder.id,
      [`flags.${NoteManager.MODULE_ID}.noteData`]: unpinned,
    });

    return unpinned;
  }

  // ─── Internal helpers ──────────────────────────────────────────────────────

  /**
   * Builds a complete note object by merging caller-supplied data over the
   * default values. Every field has a sensible default so callers only need
   * to pass in what they care about (e.g. just x and y for a newly created note).
   *
   * The spread order matters: defaults first, then data on top, so anything
   * the caller passes in wins over the defaults.
   *
   * @param {Partial<WaymarkNote>} data
   * @returns {WaymarkNote}
   */
  static _buildNote(data) {
    return {
      id: foundry.utils.randomID(),
      title: "",      // optional label shown in collapsed header bar
      content: "",
      color: null,    // null = use world theme default
      color2: null,    // null = use world theme default
      createdBy: null,    // user.id of the creator; null = legacy GM note
      x: data.x || 100,
      y: data.y || 100,
      width: 300,
      height: 200,
      fontSize: 24,
      collapsed: false,
      sceneId: null,
      ...data,            // caller overrides go last
    };
  }

  /**
   * Resolves the effective primary color for a note, following this priority:
   *   1. Per-note color (set by the user via the color dot)
   *   2. World-level color override (set in the Theme Picker)
   *   3. The theme's built-in default color
   *
   * null means "not explicitly set at this level — fall through to the next".
   *
   * @param {WaymarkNote} note
   * @returns {string}  hex color
   */
  static resolveColor1(note) {
    if (note.color != null) return note.color;
    const theme = NoteManager.resolveTheme();
    const stored = game.settings.get(NoteManager.MODULE_ID, "themeColor1");
    if (stored != null && stored !== "") return stored;
    return theme.defaultPrimary;
  }

  /**
   * Same priority chain as resolveColor1 but for the secondary color.
   * Falls back to pure black if the theme has no secondary default.
   *
   * @param {WaymarkNote} note
   * @returns {string}  hex color
   */
  static resolveColor2(note) {
    if (note.color2 != null) return note.color2;
    const theme = NoteManager.resolveTheme();
    const stored = game.settings.get(NoteManager.MODULE_ID, "themeColor2");
    if (stored != null && stored !== "") return stored;
    return theme.defaultSecondary || "#000000";
  }

  /**
   * Looks up the currently active theme object from THEMES.
   * Falls back to the sticky theme if the saved key doesn't match anything.
   *
   * @returns {object}  a theme definition from WaymarkThemes.js
   */
  static resolveTheme() {
    const key = game.settings.get(NoteManager.MODULE_ID, "theme") || "sticky";
    return THEMES[key] || THEMES.sticky;
  }

  /**
   * Quick check for whether a JournalEntry belongs to Waymarks.
   * Centralised here so no other file needs to know which flag name we use —
   * if we ever change the flag key, this is the only place to update.
   *
   * @param {JournalEntry} entry
   * @returns {boolean}
   */
  static _isWaymarkEntry(entry) {
    return !!entry?.getFlag(NoteManager.MODULE_ID, "isWaymark");
  }

  /**
   * Finds the JournalEntry that holds a specific note's data.
   * Searches the full journal collection and matches on the note ID stored
   * inside the noteData flag.
   *
   * Returns undefined if no matching entry is found (note was deleted,
   * or the ID is wrong).
   *
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
   * Returns true if a hex color is dark enough that white text would be more
   * readable on it than black text. Uses the WCAG relative luminance formula,
   * which weights the green channel most heavily because human eyes are most
   * sensitive to green light.
   *
   * The 0.45 threshold is slightly above the standard 0.179 midpoint —
   * it errs toward white text sooner, which reads better at small font sizes.
   *
   * @param {string} hex
   * @returns {boolean}
   */
  static isDark(hex) {
    // Guard against null, undefined, or short strings that would produce NaN
    if (typeof hex !== "string" || hex.length < 7) return false;
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    // WCAG relative luminance: green contributes ~72%, red ~21%, blue ~7%
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return luminance < 0.45;
  }
}

// ─── Type definition ─────────────────────────────────────────────────────────
// This is JSDoc only — not enforced at runtime, but helps editors provide
// autocomplete and catch typos when working with note objects.

/**
 * @typedef {Object} WaymarkNote
 * @property {string}      id        - Unique identifier, also used as JournalEntry name suffix
 * @property {string}      title     - Optional short label, shown in the collapsed header bar
 * @property {string}      content   - Plain text body of the note
 * @property {string|null} color     - Per-note primary color override, or null to use world default
 * @property {string|null} color2    - Per-note secondary color override, or null to use world default
 * @property {string|null} createdBy - user.id of whoever created this note; null for legacy GM notes
 * @property {number}      x         - Left position in pixels on the interface layer
 * @property {number}      y         - Top position in pixels on the interface layer
 * @property {number}      width     - Width in pixels
 * @property {number}      height    - Height in pixels
 * @property {number}      fontSize  - Font size in px
 * @property {boolean}     collapsed - Whether the note is collapsed to its header bar
 * @property {string|null} sceneId   - Scene ID if pinned to a scene, null if universal
 * @property {boolean}     [sentToGM] - Set to true when a player sends their note to the GM
 */
