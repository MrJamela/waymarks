/**
 * waymarks.js — Main entry point
 *
 * This is the first file Foundry loads when the module starts. It is
 * responsible for three things:
 *
 *   1. INIT — Registering all settings and telling Foundry what this module
 *      needs before any game data is loaded.
 *
 *   2. SOCKET SETUP — Registering the real-time message handlers that let
 *      players and GMs communicate with each other (e.g. a player asking
 *      the GM to create a note on their behalf).
 *
 *   3. READY — Starting the renderer once everything is loaded and exposing
 *      the public API.
 *
 * It also registers a few Foundry hooks for ongoing events (scene deletion,
 * scene controls rendering) and exports two socket emit helpers that
 * WaymarkRenderer uses to broadcast changes to other connected clients.
 *
 * Everything else (note storage, DOM rendering, UI windows) lives in the
 * other files and is imported here.
 */
import { NoteManager }           from "./NoteManager.js";
import { WaymarkRenderer }       from "./WaymarkRenderer.js";
import { THEMES }                from "./WaymarkThemes.js";
import { WaymarkThemePickerApp } from "./WaymarkThemePickerApp.js";
import { WaymarkPermissionsApp } from "./WaymarkPermissionsApp.js";
import { WaymarkLayout }         from "./WaymarkLayout.js";

const MODULE_ID = "waymarks";

// The single WaymarkRenderer instance. Created during the "ready" hook and
// kept here so the socket handlers and public API can call renderAll() on it.
let universalLayer = null;

// ─── Init ──────────────────────────────────────────────────────────────────
// The "init" hook fires very early — before any game data is loaded.
// This is where Foundry expects modules to register their settings.

Hooks.once("init", () => {

  // Delegate to NoteManager (currently a no-op since storage is journal-based)
  // and WaymarkLayout to register their respective settings.
  NoteManager.registerSettings();
  WaymarkLayout.registerSetting();

  // ── Theme settings ─────────────────────────────────────────────────────
  // These are world-scoped (shared by everyone) and hidden from the settings
  // UI (config: false) because they're controlled via the Theme Picker dialog
  // rather than the standard settings form.
  //
  // Each one triggers a full re-render when changed so all connected clients
  // immediately see the new theme or color.

  // The active theme key — e.g. "sticky", "terminal", "dh_teal"
  game.settings.register(MODULE_ID, "theme", {
    name: "WAYMARKS.Settings.Theme",
    hint: "WAYMARKS.Settings.ThemeHint",
    scope: "world", config: false, type: String,
    choices: Object.fromEntries(Object.entries(THEMES).map(([k,v]) => [k, v.label])),
    default: "sticky",
    onChange: () => universalLayer?.renderAll(),
  });

  // World-level primary color override (empty string = use theme default)
  game.settings.register(MODULE_ID, "themeColor1", {
    name: "WAYMARKS.Settings.ThemeColor1", scope: "world", config: false, type: String, default: "",
    onChange: () => universalLayer?.renderAll(),
  });

  // World-level secondary color override
  game.settings.register(MODULE_ID, "themeColor2", {
    name: "WAYMARKS.Settings.ThemeColor2", scope: "world", config: false, type: String, default: "",
    onChange: () => universalLayer?.renderAll(),
  });

  // World-level font override (empty string = use theme default font)
  game.settings.register(MODULE_ID, "themeFont", {
    name: "WAYMARKS.Settings.ThemeFont", scope: "world", config: false, type: String, default: "",
    onChange: () => universalLayer?.renderAll(),
  });

  // Tracks which theme the saved colors belong to. When the GM switches to a
  // new theme, we check this — if it doesn't match the new theme, the saved
  // colors are stale leftovers from the old theme and get discarded.
  game.settings.register(MODULE_ID, "themeColorOwner", {
    name: "WAYMARKS.Settings.ThemeColorOwner", scope: "world", config: false, type: String, default: "",
  });

  // Registers the "Open Theme Picker" button in Configure Settings → Waymarks.
  // restricted: true means only GMs see it.
  game.settings.registerMenu(MODULE_ID, "themePickerMenu", {
    name: "WAYMARKS.Settings.ThemePickerName", label: "WAYMARKS.Settings.ThemePickerLabel",
    hint: "WAYMARKS.Settings.ThemePickerHint",
    icon: "fas fa-palette", type: WaymarkThemePickerApp, restricted: true,
  });

  // ── Player permission settings ─────────────────────────────────────────
  // These ARE shown in the settings UI (config: true) because GMs need to
  // be able to toggle them easily. All default to false (disabled).

  // When enabled, players see the toolbar button and can create their own notes.
  // Requires a GM to be online because note creation is relayed through the GM.
  game.settings.register(MODULE_ID, "playerCreate", {
    name: "WAYMARKS.Settings.PlayerCreate",
    hint: "WAYMARKS.Settings.PlayerCreateHint",
    scope: "world", config: true, type: Boolean, default: false,
    // Re-render the scene controls toolbar so the button appears/disappears immediately
    onChange: () => ui.controls?.render(),
  });

  // When enabled, players who have Owner access on a note can edit its content,
  // color, and font size.
  game.settings.register(MODULE_ID, "playerEdit", {
    name: "WAYMARKS.Settings.PlayerEdit",
    hint: "WAYMARKS.Settings.PlayerEditHint",
    scope: "world", config: true, type: Boolean, default: false,
    // Rebuild all elements so canEdit closures reflect the new setting immediately
    onChange: () => universalLayer?.rebuildAll(),
  });

  // When enabled, players who have Owner access on a note can pin/unpin it.
  game.settings.register(MODULE_ID, "playerPin", {
    name: "WAYMARKS.Settings.PlayerPin",
    hint: "WAYMARKS.Settings.PlayerPinHint",
    scope: "world", config: true, type: Boolean, default: false,
    // Rebuild all elements so canPin closures reflect the new setting immediately
    onChange: () => universalLayer?.rebuildAll(),
  });

  console.log("Waymarks | Initialized");
});

// ─── Socket setup ──────────────────────────────────────────────────────────
// Foundry's raw socket system doesn't reliably deliver messages from players
// to the GM. socketlib wraps it with a proper RPC (Remote Procedure Call)
// layer that works in both directions.
//
// We register named handlers here. When any client calls
// _socket.executeAsGM("createNoteAsGM", data), socketlib finds the active GM
// and runs the registered "createNoteAsGM" handler on their machine.

let _socket = null;

Hooks.once("socketlib.ready", () => {
  console.log("Waymarks | socketlib.ready fired");
  _socket = socketlib.registerModule(MODULE_ID);

  // Ownership level constants — used throughout the handlers below
  const { NONE, OBSERVER, OWNER } = CONST.DOCUMENT_OWNERSHIP_LEVELS;

  // ── createNoteAsGM ───────────────────────────────────────────────────────
  // Runs on the GM's machine when a player clicks the toolbar button.
  // Players can't create JournalEntries directly (no permission), so they
  // ask the GM to do it for them via this handler.
  //
  // After creating the note we immediately set up ownership so:
  //   - The creating player has Owner access (can edit their own note)
  //   - All GMs have None access (the note is private until the player shares it)
  // This is the "player private note" model — GMs don't see it until the
  // player explicitly hits "Send to GM".
  _socket.register("createNoteAsGM", async ({ noteData, userId }) => {
    // Respect the GM's setting — if player creation has been turned off
    // since this message was sent, ignore it
    if (!game.settings.get(MODULE_ID, "playerCreate")) return;

    const note = await NoteManager.createNote(noteData);

    const entry = NoteManager._findEntry(note.id);
    if (entry) {
      const ownership = { default: NONE };
      ownership[userId] = OWNER;
      // Explicitly set all GMs to None so they don't see the note by default
      for (const u of game.users.filter(u => u.isGM)) {
        ownership[u.id] = NONE;
      }
      await entry.update({ ownership });
    }

    // Tell only the creating player to re-render — other clients don't need
    // to know this note exists yet
    _socket.executeAsUser("renderAll", userId);
  });

  // ── sendNoteToGM ─────────────────────────────────────────────────────────
  // Runs on the GM's machine when a player clicks "Send to GM" on their note.
  // Marks the note as sent and grants all GMs Observer access so they can
  // see it in their next render pass.
  //
  // We only update GMs who currently have less than Observer access —
  // this preserves any GMs who were already given Owner access manually.
  _socket.register("sendNoteToGM", async ({ noteId, userId }) => {
    if (!game.user.isGM) return;
    const entry = NoteManager._findEntry(noteId);
    if (!entry) return;

    // Set the sentToGM flag so getActiveNotes() includes it for GMs even
    // before the ownership update propagates
    await NoteManager.updateNote(noteId, { sentToGM: true });

    const ownership = foundry.utils.deepClone(entry.ownership || {});
    for (const u of game.users.filter(u => u.isGM)) {
      if (ownership[u.id] == null || ownership[u.id] < OBSERVER) {
        ownership[u.id] = OBSERVER;
      }
    }
    await entry.update({ ownership });
    console.log("Waymarks | note sent to GM by", userId, noteId);
    // The updateJournalEntry hook fires automatically on all clients,
    // so no extra socket call is needed to trigger a re-render
  });

  // ── renderAll ────────────────────────────────────────────────────────────
  // A simple broadcast handler — any client can trigger a full re-render on
  // all other clients by calling _socket.executeForEveryone("renderAll").
  // Used after create, delete, and pin/unpin operations.
  _socket.register("renderAll", () => {
    universalLayer?.renderAll();
  });
});

// ─── Ready ─────────────────────────────────────────────────────────────────
// The "ready" hook fires after all game data is fully loaded and every
// connected player is synced. Safe to access game.actors, game.journal, etc.

Hooks.once("ready", () => {

  // Create and start the renderer — this does the first render pass and
  // registers all the ongoing hooks (canvasReady, updateJournalEntry, etc.)
  universalLayer = new WaymarkRenderer();
  universalLayer.mount();
  console.log("Waymarks | Ready");

  // ── Public API ────────────────────────────────────────────────────────────
  // Exposes a small set of methods on the module object so GMs and macro
  // authors can interact with Waymarks programmatically from the console
  // or from macros, without needing to import internal classes.
  //
  // Accessible as: game.modules.get("waymarks").api
  const mod = game.modules.get(MODULE_ID);
  if (mod) mod.api = {
    createNote:      (data)        => NoteManager.createNote(data),
    updateNote:      (id, updates) => NoteManager.updateNote(id, updates),
    deleteNote:      (id)          => NoteManager.deleteNote(id),
    getNotes:        ()            => NoteManager.getActiveNotes(),
    openPermissions: (noteId)      => new WaymarkPermissionsApp(noteId).render(true),
    refresh:         ()            => universalLayer?.renderAll(),
  };
});

// ─── Scene deleted → unpin orphaned notes ─────────────────────────────────
// When a scene is deleted, any notes pinned to it would become orphans —
// permanently hidden because their sceneId no longer matches any scene.
// We catch this and unpin them so they become universal notes instead.
// Only runs on the GM since only GMs can modify JournalEntries.

Hooks.on("deleteScene", async (scene) => {
  if (!game.user.isGM) return;
  const orphans = game.journal.filter(j =>
    NoteManager._isWaymarkEntry(j) &&
    (j.getFlag(MODULE_ID, "noteData") || {}).sceneId === scene.id
  );
  for (const entry of orphans) {
    await NoteManager.unpinFromScene(entry.getFlag(MODULE_ID, "noteData").id);
  }
});

// ─── Scene controls toolbar button ────────────────────────────────────────
// Injects the sticky note button into Foundry's left-side scene controls.
// renderSceneControls fires every time any control group is rendered — we
// guard with app.control?.name === "tokens" so the button only appears in
// the Token Controls group.
//
// We also re-render controls on canvasReady to handle the player login case:
// when a player joins a world where playerCreate is already enabled, the
// controls may render before app.control is fully set, so the button gets
// skipped on that first pass. canvasReady fires once everything is settled.

Hooks.on("canvasReady", () => {
  if (ui.controls) ui.controls.render();
});

Hooks.on("renderSceneControls", (app, html) => {
  const isGM = game.user.isGM;
  const playerCreate = game.settings.get(MODULE_ID, "playerCreate");

  // Neither a GM nor a player with create permission — nothing to do
  if (!isGM && !playerCreate) return;

  // Only inject into the Token Controls group.
  // NOTE: These are internal UI selectors (#scene-controls-tools, control name
  // "tokens"/"token") that are undocumented and must be re-verified on each
  // major Foundry version. The hook silently no-ops if the structure changes.
  // v13 uses "tokens" (plural); v14 may differ — we accept both as a fallback.
  const activeControl = app.control?.name ?? app.activeControl;
  if (activeControl !== "tokens" && activeControl !== "token") return;

  const root = html instanceof HTMLElement ? html : html[0];
  const toolsMenu = root.querySelector("#scene-controls-tools");
  if (!toolsMenu) return;

  // Remove any previously injected button before re-adding it —
  // prevents duplicates if the hook fires multiple times
  toolsMenu.querySelectorAll(".waymarks-tool").forEach(el => el.remove());

  const li = document.createElement("li");
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "control ui-control tool icon button fa-solid fa-note-sticky waymarks-tool";
  btn.setAttribute("aria-label", game.i18n.localize("WAYMARKS.Button.AddWaymark"));
  btn.title = game.i18n.localize("WAYMARKS.Button.AddWaymark");
  btn.addEventListener("click", () => _handleCreateWaymark());
  li.append(btn);
  toolsMenu.append(li);
});

// ─── Note creation helpers ─────────────────────────────────────────────────

/**
 * Calculates where to place a newly created note so it appears roughly in
 * the centre of the usable canvas area — the space between the left controls,
 * the right sidebar, and the bottom hotbar.
 *
 * We use Foundry's own UI application element references (ui.controls,
 * ui.sidebar) rather than querying the DOM by ID, because some modules
 * can inflate the #ui-left container's bounding rect to incorrect values.
 * The application references always reflect the actual rendered bounds.
 *
 * Math.max(0, ...) guards against edge cases where the usable area calculates
 * as negative (e.g. a very small window), so the note always spawns on screen.
 */
function _centerPosition() {
  const controlsEl = ui.controls?.element;
  const sidebarEl = ui.sidebar?.element;
  // ui.hotbar.element may be an HTMLElement or a jQuery-like array depending
  // on the Foundry version — normalize to HTMLElement, then fall back to raw DOM
  const hb = ui.hotbar?.element;
  const hotbarEl = (hb instanceof HTMLElement ? hb : hb?.[0])
    ?? document.getElementById("hotbar")
    ?? document.getElementById("ui-bottom");

  // How far from each edge the usable area starts
  const leftOffset = controlsEl ? controlsEl.getBoundingClientRect().right : 60;
  const rightOffset = sidebarEl ? window.innerWidth - sidebarEl.getBoundingClientRect().left : 310;
  const bottomOffset = hotbarEl ? window.innerHeight - hotbarEl.getBoundingClientRect().top : 64;

  const noteW = 300, noteH = 200;
  const availW = window.innerWidth - leftOffset - rightOffset;
  const availH = window.innerHeight - bottomOffset;

  return {
    x: Math.round(leftOffset + Math.max(0, availW / 2) - noteW / 2),
    y: Math.round(Math.max(0, availH / 2) - noteH / 2),
  };
}

/**
 * Called when the toolbar button is clicked.
 *
 * GMs create the note directly and then tell everyone to re-render.
 *
 * Players can't create JournalEntries themselves, so instead they send a
 * socket message asking the GM to create it on their behalf. If no GM is
 * currently online the request can't be fulfilled and the player gets a
 * warning notification.
 */
async function _handleCreateWaymark() {
  const pos = _centerPosition();

  if (game.user.isGM) {
    // GM creates directly, then broadcasts to all clients
    await NoteManager.createNote({ ...pos, createdBy: game.user.id });
    _socket?.executeForEveryone("renderAll");
  } else {
    // Player must relay through the GM
    const gm = game.users.find(u => u.isGM && u.active);
    if (!gm) {
      ui.notifications.warn(game.i18n.localize("WAYMARKS.Notify.NeedGM"));
      return;
    }
    console.log("Waymarks | player requesting createNote via socketlib", { pos, userId: game.user.id, socketReady: !!_socket });
    if (!_socket) {
      ui.notifications.error(game.i18n.localize("WAYMARKS.Notify.SocketNotReady"));
      return;
    }
    _socket.executeAsGM("createNoteAsGM", { noteData: { ...pos, createdBy: game.user.id }, userId: game.user.id });
  }
}

// ─── Exported socket emit helpers ─────────────────────────────────────────
// These are called by WaymarkRenderer to broadcast events to other clients.
// They live here (not in WaymarkRenderer) because _socket is private to
// this file — only this file knows how to send socket messages.

/**
 * Tells all connected clients to do a full re-render.
 * Falls back to a local render if the socket isn't ready yet
 * (can happen briefly during startup).
 */
export function emitRenderAll() {
  if (_socket) {
    _socket.executeForEveryone("renderAll");
  } else {
    universalLayer?.renderAll();
  }
}

/**
 * Tells the GM that a player wants to share their note.
 * The GM's machine runs the "sendNoteToGM" socket handler which grants
 * all GMs Observer access so they can see the note.
 */
export function emitSendToGM(noteId) {
  if (_socket) _socket.executeAsGM("sendNoteToGM", { noteId, userId: game.user.id });
}
