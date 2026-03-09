/**
 * Waymarks — main entry point  (v0.4.0)
 *
 * v0.4.0 additions:
 *  - playerCreate setting — lets players create their own notes via GM socket relay
 *  - Toolbar button visible to players when playerCreate is enabled
 *  - WaymarkPermissionsApp — GM can set per-player access on each note
 */
import { NoteManager }           from "./NoteManager.js";
import { UniversalNoteLayer }    from "./UniversalNoteLayer.js";
import { THEMES }                from "./WaymarkThemes.js";
import { WaymarkThemePickerApp } from "./WaymarkThemePickerApp.js";
import { WaymarkPermissionsApp } from "./WaymarkPermissionsApp.js";

const MODULE_ID = "waymarks";

let universalLayer = null;

// ─── Init ──────────────────────────────────────────────────────────────────

Hooks.once("init", () => {
  NoteManager.registerSettings();

  // ── Theme settings ──────────────────────────────────────────────────────
  game.settings.register(MODULE_ID, "theme", {
    name: "Note Style",
    hint: "Visual theme for all Waymarks.",
    scope: "world", config: false, type: String,
    choices: Object.fromEntries(Object.entries(THEMES).map(([k,v]) => [k, v.label])),
    default: "sticky",
    onChange: () => universalLayer && universalLayer.renderAll(),
  });

  game.settings.register(MODULE_ID, "themeColor1", {
    name: "Primary Color", scope: "world", config: false, type: String, default: "",
    onChange: () => universalLayer && universalLayer.renderAll(),
  });

  game.settings.register(MODULE_ID, "themeColor2", {
    name: "Secondary Color", scope: "world", config: false, type: String, default: "",
    onChange: () => universalLayer && universalLayer.renderAll(),
  });

  game.settings.register(MODULE_ID, "themeFont", {
    name: "Font Override", scope: "world", config: false, type: String, default: "",
    onChange: () => universalLayer && universalLayer.renderAll(),
  });

  game.settings.register(MODULE_ID, "themeColorOwner", {
    // Tracks which theme the saved themeColor1/2 belong to, so stale colors
    // from a previously-active theme don't bleed into a newly-selected one.
    name: "Theme Color Owner", scope: "world", config: false, type: String, default: "",
  });

  game.settings.registerMenu(MODULE_ID, "themePickerMenu", {
    name: "Note Style & Colors", label: "Open Theme Picker",
    hint: "Choose a visual theme, colors, and font for your Waymarks.",
    icon: "fas fa-palette", type: WaymarkThemePickerApp, restricted: true,
  });

  // ── Permission settings ─────────────────────────────────────────────────
  game.settings.register(MODULE_ID, "playerCreate", {
    name: "Allow Players to Create Waymarks",
    hint: "Players can create new Waymarks using the toolbar button. The GM must be online.",
    scope: "world", config: true, type: Boolean, default: false,
    onChange: () => ui.controls && ui.controls.render(),
  });

  game.settings.register(MODULE_ID, "playerEdit", {
    name: "Allow Players to Edit Waymarks",
    hint: "Players with Owner permission on a Waymark can edit its content, color, and font size.",
    scope: "world", config: true, type: Boolean, default: false,
  });

  game.settings.register(MODULE_ID, "playerPin", {
    name: "Allow Players to Pin Waymarks to Scenes",
    hint: "Players with Owner permission can pin and unpin Waymarks to scenes.",
    scope: "world", config: true, type: Boolean, default: false,
  });

  console.log("Waymarks | Initialized");
});

// ─── Socket setup (socketlib) ──────────────────────────────────────────────
// Raw game.socket.emit() from players does not reach the GM in Foundry v13.
// socketlib provides a proper RPC layer that works in both directions.

let _socket = null;

Hooks.once("socketlib.ready", () => {
  console.log("Waymarks | socketlib.ready fired");
  _socket = socketlib.registerModule(MODULE_ID);

  // Handler: runs on GM to create a note on behalf of a player
  _socket.register("createNoteAsGM", async ({ noteData, userId }) => {
    if (!game.settings.get(MODULE_ID, "playerCreate")) return;

    console.log("Waymarks | GM creating note for player", userId, noteData);
    const note = await NoteManager.createNote(noteData);

    // Set ownership explicitly: player gets Owner, GM gets None (level 0).
    // This prevents the note from appearing on GM screens until the player
    // explicitly sends it via the Send to GM button.
    const entry = NoteManager._findEntry(note.id);
    if (entry) {
      const ownership = { default: 0 };
      ownership[userId] = 3;
      // Set all GM users to 0 (no access)
      for (const u of game.users.filter(u => u.isGM)) {
        ownership[u.id] = 0;
      }
      await entry.update({ ownership });
    }
    // Notify only the creating player to render
    _socket.executeAsUser("renderAll", userId);
  });

  // Handler: player sends their note to the GM
  _socket.register("sendNoteToGM", async ({ noteId, userId }) => {
    if (!game.user.isGM) return;
    const entry = NoteManager._findEntry(noteId);
    if (!entry) return;

    // Mark the note as sent in its data so GMs can see it via getActiveNotes
    await NoteManager.updateNote(noteId, { sentToGM: true });

    // Also grant all GMs Observer access explicitly
    const ownership = foundry.utils.deepClone(entry.ownership || {});
    for (const u of game.users.filter(u => u.isGM)) {
      if (ownership[u.id] == null || ownership[u.id] < 2) ownership[u.id] = 2;
    }
    await entry.update({ ownership });
    console.log("Waymarks | note sent to GM by", userId, noteId);
    // updateJournalEntry hook propagates render to GM clients
  });

  // Handler: runs on all clients to re-render
  _socket.register("renderAll", () => {
    universalLayer && universalLayer.renderAll();
  });
});

// ─── Ready ─────────────────────────────────────────────────────────────────

Hooks.once("ready", () => {
  universalLayer = new UniversalNoteLayer();
  universalLayer.mount();
  console.log("Waymarks | Ready");

  // Force Foundry dialogs above all other windows including notes.
  // DialogV2 renders as native <dialog> tag; App V1 Dialog renders as
  // <div class="app ... dialog">. We watch for both and bump their z-index.
  new MutationObserver(mutations => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        const isDialogTag = node.tagName === "DIALOG";
        const isDialogDiv = node.tagName === "DIV" && node.classList.contains("app") && node.classList.contains("dialog");
        if (!isDialogTag && !isDialogDiv) continue;
        setTimeout(() => {
          let max = globalThis._maxZ ?? 100;
          document.querySelectorAll(".app, .application, .waymark-note").forEach(el => {
            const z = parseInt(el.style.zIndex) || 0;
            if (z > max) max = z;
          });
          node.style.zIndex = String(max + 1000);
        }, 0);
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
});

// ─── Scene deleted → unpin orphaned notes ──────────────────────────────────

Hooks.on("deleteScene", async (scene) => {
  if (!game.user.isGM) return;
  const orphans = game.journal.filter(j =>
    j.getFlag(MODULE_ID, "isWaymark") &&
    (j.getFlag(MODULE_ID, "noteData") || {}).sceneId === scene.id
  );
  for (const entry of orphans) {
    await NoteManager.unpinFromScene(entry.getFlag(MODULE_ID, "noteData").id);
  }
});

// ─── Journal entry updated → re-render on all clients ─────────────────────
// Fires on every client when a waymark JournalEntry changes (ownership,
// noteData flags, etc.) so all clients immediately see the updated state.

Hooks.on("updateJournalEntry", (entry, changes) => {
  if (!entry.getFlag(MODULE_ID, "isWaymark")) return;
  universalLayer && universalLayer.renderAll();
});

// ─── Scene Controls Button ─────────────────────────────────────────────────

Hooks.on("renderSceneControls", (app, html) => {
  const isGM         = game.user.isGM;
  const playerCreate = game.settings.get(MODULE_ID, "playerCreate");
  if (!isGM && !playerCreate) return;

  const $html = html instanceof jQuery ? html : $(html);
  const toolsMenu = $html.find("#scene-controls-tools");
  if (toolsMenu.length === 0) return;

  toolsMenu.find(".waymarks-tool").remove();

  const $li  = $("<li></li>");
  const $btn = $(`
    <button type="button"
            class="control ui-control tool icon button fa-solid fa-note-sticky waymarks-tool"
            aria-label="Add Waymark" title="Add Waymark">
    </button>
  `);

  $btn.on("click", () => _handleCreateWaymark());
  $li.append($btn);
  toolsMenu.append($li);
});

// ─── Create helpers ────────────────────────────────────────────────────────

function _centerPosition() {
  const sidebar  = document.getElementById("sidebar")  || document.getElementById("ui-right");
  const controls = document.getElementById("controls") || document.getElementById("ui-left");
  const hotbar   = document.getElementById("hotbar")   || document.getElementById("ui-bottom");

  const leftOffset   = controls ? controls.getBoundingClientRect().right : 60;
  const rightOffset  = sidebar  ? window.innerWidth - sidebar.getBoundingClientRect().left : 310;
  const bottomOffset = hotbar   ? window.innerHeight - hotbar.getBoundingClientRect().top : 64;

  return {
    x: Math.round(leftOffset + (window.innerWidth - leftOffset - rightOffset) / 2 - 150),
    y: Math.round((window.innerHeight - bottomOffset) / 2 - 100),
  };
}

async function _handleCreateWaymark() {
  const pos = _centerPosition();

  if (game.user.isGM) {
    await NoteManager.createNote({ ...pos, createdBy: game.user.id });
    _socket && _socket.executeForEveryone("renderAll");
  } else {
    const gm = game.users.find(u => u.isGM && u.active);
    if (!gm) {
      ui.notifications.warn("Waymarks: A GM must be online to create notes.");
      return;
    }
    console.log("Waymarks | player requesting createNote via socketlib", { pos, userId: game.user.id, socketReady: !!_socket });
    if (!_socket) { ui.notifications.error("Waymarks: socketlib not ready."); return; }
    _socket.executeAsGM("createNoteAsGM", { noteData: { ...pos, createdBy: game.user.id }, userId: game.user.id });
  }
}

// ─── Public emit helper (used by UniversalNoteLayer) ──────────────────────

export function emitRenderAll() {
  if (_socket) {
    _socket.executeForEveryone("renderAll");
  } else {
    // Fallback if socketlib not yet ready
    universalLayer && universalLayer.renderAll();
  }
}

export function emitSendToGM(noteId) {
  if (_socket) _socket.executeAsGM("sendNoteToGM", { noteId, userId: game.user.id });
}

// ─── Public API ────────────────────────────────────────────────────────────

Hooks.once("ready", () => {
  const mod = game.modules.get(MODULE_ID);
  if (mod) mod.api = {
    createNote:      (data)   => NoteManager.createNote(data),
    deleteNote:      (id)     => NoteManager.deleteNote(id),
    openPermissions: (noteId) => new WaymarkPermissionsApp(noteId).render(true),
    refresh:         ()       => universalLayer && universalLayer.renderAll(),
  };
});
