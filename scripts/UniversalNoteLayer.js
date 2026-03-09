/**
 * UniversalNoteLayer
 * Manages the DOM rendering of all Waymark notes.
 */
import { NoteManager } from "./NoteManager.js";
import { WaymarkElement } from "./WaymarkElement.js";
import { WaymarkLayout } from "./WaymarkLayout.js";
import { emitRenderAll, emitSendToGM } from "./waymarks.js";
import { WaymarkPermissionsApp } from "./WaymarkPermissionsApp.js";

const MODULE_ID = "waymarks";

export class UniversalNoteLayer {

  constructor() {
    /** @type {Map<string, WaymarkElement>} */
    this._elements = new Map();
    this._container = null;
    this._hooks = [];
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────────

  mount() {
    this._container = document.getElementById("interface");
    if (!this._container) return;

    this._on("canvasReady",        () => this.renderAll());
    this._on("createJournalEntry", () => this.renderAll());
    this._on("deleteJournalEntry", () => this.renderAll());

    // Debounced rebuild map: noteId → timeout id
    this._pendingRebuild = new Map();

    // When a waymark entry updates, debounce the rebuild so that multiple
    // rapid hook fires (Foundry fires updateJournalEntry 2-3x per ownership
    // change) only result in one final rebuild using the freshest entry.
    this._on("updateJournalEntry", (entry, changes) => {
      if (!entry.getFlag(MODULE_ID, "isWaymark")) return;
      const note = entry.getFlag(MODULE_ID, "noteData");
      if (!note) return;

      // Only do a full rebuild when ownership changes, or when a player note
      // needs to appear on the GM screen (sentToGM=true, not yet rendered).
      const ownershipChanged = !!(changes && changes.ownership);
      const needsGMRender = game.user.isGM && note.sentToGM && note.createdBy !== game.user.id && !this._elements.has(note.id);

      if (!ownershipChanged && !needsGMRender) {
        // Just sync the existing element with fresh note data
        const el = this._elements.get(note.id);
        if (el) el.sync(note);
        return;
      }

      // Cancel any pending rebuild for this note
      if (this._pendingRebuild.has(note.id)) {
        clearTimeout(this._pendingRebuild.get(note.id));
      }

      // Schedule rebuild on next tick — by then Foundry's cache will be settled
      const tid = setTimeout(() => {
        this._pendingRebuild.delete(note.id);

        // Re-fetch entry from settled cache
        const freshEntry = game.journal.find(j => {
          if (!j.getFlag(MODULE_ID, "isWaymark")) return false;
          const nd = j.getFlag(MODULE_ID, "noteData");
          return nd && nd.id === note.id;
        });
        if (!freshEntry) { this._removeElement(note.id); return; }

        const activeSceneId = (canvas && canvas.scene) ? canvas.scene.id : null;
        const freshNote = freshEntry.getFlag(MODULE_ID, "noteData");
        const activeNote = freshNote || note;
        const inScope = activeNote.sceneId === null || activeNote.sceneId === activeSceneId;

        // Use NoteManager.getActiveNotes as the single source of truth for
        // visibility — avoids duplicating GM ownership logic here.
        const visibleIds = new Set(NoteManager.getActiveNotes().map(n => n.id));
        const canSee = visibleIds.has(activeNote.id);

        console.log(`Waymarks | rebuild (ownership changed) [${activeNote.id}]`, {
          isGM: game.user.isGM,
          ownership: freshEntry.ownership,
          canSee,
          inScope,
        });

        // If the player re-sent the note, clear any previous GM dismiss
        if (game.user.isGM && activeNote?.sentToGM) {
          sessionStorage.removeItem(`waymarks.dismissed.${activeNote.id}`);
        }
        const isDismissed = !!sessionStorage.getItem(`waymarks.dismissed.${activeNote.id}`);
        this._removeElement(activeNote.id);
        if (inScope && canSee && !isDismissed) this._addElement(activeNote, freshEntry);
      }, 50);

      this._pendingRebuild.set(note.id, tid);
    });

    this.renderAll();
  }

  teardown() {
    for (const el of this._elements.values()) el.destroy();
    this._elements.clear();
    for (const [hook, id] of this._hooks) Hooks.off(hook, id);
    this._hooks = [];
    this._container = null;
  }

  _on(hook, fn) {
    const id = Hooks.on(hook, fn);
    this._hooks.push([hook, id]);
  }

  // ─── Rendering ───────────────────────────────────────────────────────────

  renderAll() {
    if (!this._container) return;

    const notes = NoteManager.getActiveNotes();
    const incomingIds = new Set(notes.map(n => n.id));

    // Remove elements that are no longer in the active set
    for (const id of [...this._elements.keys()]) {
      if (!incomingIds.has(id)) this._removeElement(id);
    }

    // Add elements that aren't rendered yet.
    // Don't rebuild existing ones — permission changes come through
    // updateJournalEntry with a fresh entry, not through renderAll.
    for (const note of notes) {
      const isDismissed = !!sessionStorage.getItem(`waymarks.dismissed.${note.id}`);
      if (!this._elements.has(note.id) && !isDismissed) {
        this._addElement(note);
      }
    }
  }

  // entry is optional: when passed from updateJournalEntry hook it's the
  // freshest version; otherwise we look it up from game.journal.
  _addElement(note, entry = null) {
    const isGM = game.user.isGM;

    if (!entry) {
      entry = game.journal.find(j => {
        if (!j.getFlag(MODULE_ID, "isWaymark")) return false;
        const nd = j.getFlag(MODULE_ID, "noteData");
        return nd && nd.id === note.id;
      });
    }

    // Merge in this client's saved position/size (overrides shared data)
    const layout = WaymarkLayout.load(note.id);
    if (layout) note = { ...note, ...layout };

    // Resolve what this user can do with this note
    const isOwner = entry && entry.testUserPermission(game.user, "OWNER");
    const playerEditEnabled = game.settings.get(MODULE_ID, "playerEdit");

    console.log(`Waymarks | _addElement [${note.id}]`, {
      isGM,
      userId: game.user.id,
      noteCreatedBy: note.createdBy,
      createdByMe: !note.createdBy || note.createdBy === game.user.id,
      entryFound: !!entry,
      entryOwnership: entry ? entry.ownership : null,
      isOwner,
      playerEditEnabled,
      canEdit: isGM || (playerEditEnabled && isOwner),
    });

    const canEdit   = isGM || (playerEditEnabled && isOwner);
    const canPin    = isGM || (
      game.settings.get(MODULE_ID, "playerPin") && isOwner
    );
    // Who created this note determines delete rights — not Foundry ownership.
    // createdBy null means GM-created (old notes or direct GM creation).
    const createdByMe = !note.createdBy || note.createdBy === game.user.id;
    const canDelete      = createdByMe;
    const canDismiss     = !createdByMe && entry && entry.testUserPermission(game.user, "OBSERVER");
    const canManagePerms = isGM;
    const canSendToGM    = !isGM && createdByMe;

    const el = new WaymarkElement(note, {
      canEdit,
      canPin,
      canDelete,
      canDismiss,
      canManagePerms,
      canSendToGM,
      onPermissions: (id) => {
        new WaymarkPermissionsApp(id).render(true);
      },
      onSendToGM: (id) => {
        emitSendToGM(id);
      },
      onUpdate: async (id, updates) => {
        if (!canEdit) return;
        await NoteManager.updateNote(id, updates);
        // updateJournalEntry hook fires on all clients automatically —
        // no socket needed here. Socket is only for create/delete/pin.
      },
      onUpdateLocal: (id, updates) => {
        // Position/size — local only, no server write, no socket
        WaymarkLayout.save(id, updates);
      },
      onDelete: async (id) => {
        if (!canDelete) return;
        await NoteManager.deleteNote(id);
        WaymarkLayout.clear(id);
        this._removeElement(id);
        emitRenderAll();
      },
      onDismiss: (id) => {
        // Player-side only: hide this note from view without deleting it.
        // Stored in sessionStorage so it comes back on next reload/renderAll.
        sessionStorage.setItem(`waymarks.dismissed.${id}`, "1");
        this._removeElement(id);
      },
      onSync: () => {
        this.renderAll();
      },
      onPin: async (id) => {
        if (!canPin) return;
        await NoteManager.pinToScene(id);
        emitRenderAll();
      },
      onUnpin: async (id) => {
        if (!canPin) return;
        await NoteManager.unpinFromScene(id);
        emitRenderAll();
      },
    });
    this._elements.set(note.id, el);
    this._container.appendChild(el.element);
  }

  _removeElement(id) {
    const el = this._elements.get(id);
    if (!el) return;
    el.destroy();
    this._elements.delete(id);
  }
}
