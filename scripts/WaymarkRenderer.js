/**
 * WaymarkRenderer
 *
 * The conductor. Sits between the data layer (NoteManager) and the display
 * layer (WaymarkElement) and keeps them in sync.
 *
 * There is one WaymarkRenderer instance for the entire module, created when
 * Foundry finishes loading. It is responsible for: *
 *   1. Listening to Foundry hooks (journal changes, scene changes) and
 *      deciding whether the screen needs to be updated.
 *   2. Maintaining a map of every note currently on screen, keyed by note ID.
 *   3. Adding notes to the screen when they become visible.
 *   4. Removing notes from the screen when they stop being visible.
 *   5. Wiring up the callbacks that WaymarkElement uses to communicate
 *      back up to NoteManager and the socket layer.
 *
 * WaymarkRenderer deliberately does NOT build any DOM itself — that's
 * WaymarkElement's job. WaymarkRenderer just decides which notes should
 * exist, creates and destroys WaymarkElement instances accordingly, and
 * passes them the right callbacks and permission flags.
 */
import { NoteManager }        from "./NoteManager.js";
import { WaymarkElement }     from "./WaymarkElement.js";
import { WaymarkLayout }      from "./WaymarkLayout.js";
import { emitRenderAll, emitSendToGM } from "./waymarks.js";
import { WaymarkPermissionsApp }  from "./WaymarkPermissionsApp.js";
import { WaymarkThemePickerApp }  from "./WaymarkThemePickerApp.js";

const MODULE_ID = "waymarks";

export class WaymarkRenderer {

  constructor() {
    // Map of noteId → WaymarkElement for every note currently on screen
    this._elements = new Map();
    // The DOM element we append notes into (#interface in Foundry v13)
    this._container = null;
    // Tracks registered Foundry hooks so we can cleanly unregister them on teardown
    this._hooks = [];
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  /**
   * Starts the renderer. Finds the container element, registers all Foundry
   * hooks, and does the first render pass to populate the screen.
   * Called once from waymarks.js during the "ready" hook.
   */
  mount() {
    // Foundry's #interface div sits above the canvas and below the HUD —
    // it's the right place for our absolutely-positioned notes
    this._container = document.getElementById("interface");
    if (!this._container) return;

    // Re-render all notes when the canvas finishes loading a new scene —
    // pinned notes need to appear/disappear as scenes change
    this._on("canvasReady", () => this.renderAll());

    // Re-render when any journal entry is created or deleted, in case it
    // was a Waymark that needs to appear or disappear
    this._on("createJournalEntry", () => this.renderAll());
    this._on("deleteJournalEntry", () => this.renderAll());

    // Map used to debounce rapid repeated updates for the same note.
    // Keys are noteIds, values are setTimeout IDs.
    this._pendingRebuild = new Map();

    // ── updateJournalEntry ─────────────────────────────────────────────────
    // This is the most important hook. It fires every time any journal entry
    // is saved to the server — which includes every content edit, color change,
    // ownership change, and pin state change on any Waymark.
    //
    // Foundry sometimes fires this hook 2–3 times in rapid succession for a
    // single ownership change (once per field updated internally). We debounce
    // so we only react once, using the freshest data available after the dust settles.
    this._on("updateJournalEntry", (entry, changes) => {
      // Ignore any journal entries that aren't Waymarks
      if (!NoteManager._isWaymarkEntry(entry)) return;
      const note = entry.getFlag(MODULE_ID, "noteData");
      if (!note) return;

      // Decide how to respond based on what changed.
      // Ownership changes require a full rebuild because permissions affect
      // which buttons are visible — we can't just update the text content.
      const ownershipChanged = !!(changes && changes.ownership);

      // If a player sent a note to the GM and the GM hasn't seen it yet,
      // that also requires a full rebuild so the note appears on the GM's screen.
      const needsGMRender = game.user.isGM
        && note.sentToGM
        && note.createdBy !== game.user.id
        && !this._elements.has(note.id);

      if (!ownershipChanged && !needsGMRender) {
        // Simple content/color/font change — just update the existing element
        // in place rather than tearing it down and rebuilding it
        const el = this._elements.get(note.id);
        if (el) el.sync(note);
        return;
      }

      // For ownership changes we need to rebuild — but not immediately.
      // Cancel any previously scheduled rebuild for this note and schedule
      // a fresh one 50ms from now. If the hook fires again before the timeout
      // fires, we cancel and reschedule, so we always use the latest data.
      if (this._pendingRebuild.has(note.id)) {
        clearTimeout(this._pendingRebuild.get(note.id));
      }

      const tid = setTimeout(() => {
        this._pendingRebuild.delete(note.id);

        // Re-fetch the entry now that Foundry's internal cache has settled.
        // The entry object passed to the hook may have been the pre-update
        // version depending on timing.
        const freshEntry = NoteManager._findEntry(note.id);
        if (!freshEntry) {
          // The entry was deleted between when the hook fired and now
          this._removeElement(note.id);
          return;
        }

        const activeSceneId = (canvas && canvas.scene) ? canvas.scene.id : null;
        const freshNote = freshEntry.getFlag(MODULE_ID, "noteData");
        const activeNote = freshNote || note;

        // Is this note supposed to be visible in the current scene?
        const inScope = activeNote.sceneId === null || activeNote.sceneId === activeSceneId;

        // Does this user have permission to see it?
        const visibleIds = new Set(NoteManager.getActiveNotes().map(n => n.id));
        const canSee = visibleIds.has(activeNote.id);

        // If a player just re-sent their note to the GM, clear any previous
        // dismiss so the GM sees it again even if they dismissed it before
        if (game.user.isGM && activeNote?.sentToGM) {
          sessionStorage.removeItem(`waymarks.dismissed.${activeNote.id}`);
        }

        const isDismissed = !!sessionStorage.getItem(`waymarks.dismissed.${activeNote.id}`);

        // Remove the old element and add a fresh one if it should be visible
        this._removeElement(activeNote.id);
        if (inScope && canSee && !isDismissed) this._addElement(activeNote, freshEntry);

      }, 50);

      this._pendingRebuild.set(note.id, tid);
    });

    // Do the initial render pass now that hooks are set up
    this.renderAll();
  }

  /**
   * Shuts down the renderer cleanly.
   * Removes all note elements from the DOM, unregisters all Foundry hooks,
   * and clears internal state. Called if the module ever needs to reset.
   */
  teardown() {
    for (const el of this._elements.values()) el.destroy();
    this._elements.clear();
    for (const [hook, id] of this._hooks) Hooks.off(hook, id);
    this._hooks = [];
    this._container = null;
  }

  /**
   * Registers a Foundry hook and remembers it so teardown() can remove it.
   * All hook registrations go through this instead of calling Hooks.on()
   * directly, so nothing is ever left dangling.
   *
   * @param {string}   hook  — Foundry hook name
   * @param {Function} fn    — handler function
   */
  _on(hook, fn) {
    const id = Hooks.on(hook, fn);
    this._hooks.push([hook, id]);
  }

  // ─── Rendering ─────────────────────────────────────────────────────────────

  /**
   * Full teardown and rebuild of every note on screen.
   * Called when a setting changes that affects what buttons are visible —
   * specifically playerEdit and playerPin. Because permissions are computed
   * once per element in _addElement() and captured in closures, toggling
   * these settings would otherwise leave existing notes with stale
   * canEdit/canPin values until the next scene change or page refresh.
   * rebuildAll() forces every element to be destroyed and recreated with
   * fresh permission values.
   */
  rebuildAll() {
    for (const id of [...this._elements.keys()]) {
      this._removeElement(id);
    }
    this.renderAll();
  }

  /**
   *
   * This is intentionally simple: ask NoteManager for the current list of
   * visible notes, remove anything on screen that isn't in the list, and add
   * anything in the list that isn't already on screen.
   *
   * We deliberately do NOT rebuild existing elements here. If a note is already
   * on screen and just had its content changed, that update comes through the
   * updateJournalEntry hook and is handled by sync() instead. This avoids
   * destroying and rebuilding notes that are already correct.
   */
  renderAll() {
    if (!this._container) return;

    const notes = NoteManager.getActiveNotes();
    const incomingIds = new Set(notes.map(n => n.id));

    // Remove any elements that are no longer in the visible set
    for (const id of [...this._elements.keys()]) {
      if (!incomingIds.has(id)) this._removeElement(id);
    }

    // Add any notes that should be visible but don't have an element yet.
    // Skip dismissed notes — those were hidden by the player for this session.
    for (const note of notes) {
      const isDismissed = !!sessionStorage.getItem(`waymarks.dismissed.${note.id}`);
      if (!this._elements.has(note.id) && !isDismissed) {
        this._addElement(note);
      }
    }
  }

  /**
   * Creates a WaymarkElement for a note and adds it to the screen.
   *
   * This is where permissions are evaluated. Before creating the element we
   * figure out exactly what this user is allowed to do with this specific note,
   * then pass those permission flags and the appropriate callbacks to the element.
   *
   * The entry parameter is optional — when called from the updateJournalEntry
   * rebuild path we already have the freshest entry object, so we pass it in
   * directly. When called from renderAll() we look it up.
   *
   * @param {WaymarkNote}        note   — the note data to display
   * @param {JournalEntry|null}  entry  — the JournalEntry backing this note
   */
  _addElement(note, entry = null) {
    const isGM = game.user.isGM;

    // Look up the entry if it wasn't provided
    if (!entry) entry = NoteManager._findEntry(note.id);

    // Merge in this client's locally saved position and size.
    // This overrides the server-stored position so each player's note
    // stays where they dragged it on their own screen.
    const layout = WaymarkLayout.load(note.id);
    if (layout) note = { ...note, ...layout };

    // ── Permission evaluation ────────────────────────────────────────────
    // Determine what this specific user is allowed to do with this note.
    // GMs always get full access. Players get access based on their ownership
    // level and what the GM has enabled in module settings.

    const isOwner = entry && entry.testUserPermission(game.user, "OWNER");
    const playerEditEnabled = game.settings.get(MODULE_ID, "playerEdit");

    // Edit = change content, color, font size
    const canEdit = isGM || (playerEditEnabled && isOwner);

    // Pin = attach the note to the current scene (or detach it)
    const canPin = isGM || (game.settings.get(MODULE_ID, "playerPin") && isOwner);

    // Delete rights are based on who created the note, not Foundry ownership.
    // This means you can always delete your own notes even if someone else
    // has been given Owner access to them.
    const createdByMe = !note.createdBy || note.createdBy === game.user.id;
    const canDelete = createdByMe;

    // Dismiss = hide for this session only (for notes you can see but didn't create)
    const canDismiss = !createdByMe && entry && entry.testUserPermission(game.user, "OBSERVER");

    // Permissions dialog and Send-to-GM button are role-specific
    const canManagePerms = isGM;
    const canSendToGM = !isGM && createdByMe;

    // ── Create the element ────────────────────────────────────────────────
    // Pass permission flags and all callback functions to the element.
    // The element doesn't know anything about sockets or NoteManager —
    // it just calls these callbacks when things happen.

    const el = new WaymarkElement(note, {
      canEdit,
      canPin,
      canDelete,
      canDismiss,
      canManagePerms,
      canSendToGM,

      // Open the permissions ownership dialog for this note
      onPermissions: (id) => {
        new WaymarkPermissionsApp(id).render(true);
      },

      // Send note to GM via socket (player-only action)
      onSendToGM: (id) => {
        emitSendToGM(id);
      },

      // Write content/color/etc changes to the server.
      // The updateJournalEntry hook will propagate the change to all other
      // connected clients automatically — no socket needed here.
      onUpdate: async (id, updates) => {
        if (!canEdit) return;
        await NoteManager.updateNote(id, updates);
      },

      // Save position/size locally — this never goes to the server
      onUpdateLocal: (id, updates) => {
        WaymarkLayout.save(id, updates);
      },

      // Permanently delete the note for everyone, clear local layout data,
      // then tell all other clients to re-render via socket
      onDelete: async (id) => {
        if (!canDelete) return;
        await NoteManager.deleteNote(id);
        WaymarkLayout.clear(id);
        this._removeElement(id);
        emitRenderAll();
      },

      // Hide the note for this player for the rest of the session.
      // Stored in sessionStorage (cleared on page reload) so the note
      // comes back next time the player logs in.
      onDismiss: (id) => {
        sessionStorage.setItem(`waymarks.dismissed.${id}`, "1");
        this._removeElement(id);
      },

      // Open the theme picker dialog — the ⟳ button is the theme picker trigger
      onSync: () => {
        new WaymarkThemePickerApp().render(true);
      },

      // Pin note to current scene, then tell all clients to re-render
      // (they need to show/hide the note depending on which scene they're on)
      onPin: async (id) => {
        if (!canPin) return;
        await NoteManager.pinToScene(id);
        emitRenderAll();
      },

      // Unpin note from its scene, making it universal again
      onUnpin: async (id) => {
        if (!canPin) return;
        await NoteManager.unpinFromScene(id);
        emitRenderAll();
      },
    });

    // Add to our tracking map and insert into the DOM
    this._elements.set(note.id, el);
    this._container.appendChild(el.element);
  }

  /**
   * Removes a note element from the screen and from our tracking map.
   * Safe to call even if the note isn't currently on screen — just a no-op.
   *
   * @param {string} id  — the note's unique ID
   */
  _removeElement(id) {
    const el = this._elements.get(id);
    if (!el) return;
    el.destroy();               // removes from DOM
    this._elements.delete(id);  // removes from tracking map
  }
}
