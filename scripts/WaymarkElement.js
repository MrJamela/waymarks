/**
 * WaymarkElement
 *
 * Responsible for one individual note on screen — building its HTML,
 * keeping it visually up to date, and handling all user interaction with it.
 *
 * Each note is a plain <div> that sits on the Foundry interface layer (not
 * the canvas). WaymarkElement builds that div, attaches all the event
 * listeners, and exposes a sync() method so the renderer can push fresh
 * data from the server without destroying and rebuilding the element.
 *
 * WaymarkElement does NOT talk to the server directly. Instead it calls
 * callback functions (onUpdate, onDelete, onPin, etc.) that were passed in
 * by WaymarkRenderer. This keeps the display logic cleanly separated from
 * the storage logic.
 */
import { NoteManager } from "./NoteManager.js";
import { THEMES }       from "./WaymarkThemes.js";

// ─── Color swatch presets ─────────────────────────────────────────────────────
// These are the quick-pick color buttons shown in the per-note color picker panel.
// Primary swatches are lighter/brighter — suitable for note backgrounds.
// Secondary swatches are darker — suitable for frames and board backgrounds.

const SWATCHES_PRIMARY = [
  { label: "Yellow",  value: "#fef08a" },
  { label: "Pink",    value: "#fda4af" },
  { label: "Green",   value: "#86efac" },
  { label: "Blue",    value: "#93c5fd" },
  { label: "Orange",  value: "#fdba74" },
  { label: "Purple",  value: "#c4b5fd" },
  { label: "White",   value: "#f1f5f9" },
  { label: "Teal",    value: "#2a8a9a" },
  { label: "Gold",    value: "#c9a227" },
  { label: "Crimson", value: "#c0392b" },
];

const SWATCHES_SECONDARY = [
  { label: "Near Black", value: "#0a0a0a" },
  { label: "Dark Navy",  value: "#1a2035" },
  { label: "Dark Plum",  value: "#1a1520" },
  { label: "Chalkboard", value: "#2d4a3e" },
  { label: "Stone",      value: "#6b6560" },
  { label: "Parchment",  value: "#e8d5b0" },
  { label: "Dark Wood",  value: "#4a3120" },
  { label: "Off-White",  value: "#f5f0e8" },
];

// ─── Z-index counter ─────────────────────────────────────────────────────────
// Notes need to stack correctly — the last one you clicked should appear on top
// of other notes. We use a counter that cycles within a fixed band (10–99).
//
// We deliberately stay BELOW Foundry's window layer (which starts at 100) so
// that any Foundry window — settings, actor sheets, dialogs — always appears
// on top of notes naturally without us needing to fight over z-index.
// Clicking a note brings it in front of other notes, but never above Foundry UI.

const Z_MIN = 10;
const Z_MAX = 99;
let _zCounter = Z_MIN;

function _nextZ() {
  // Increment and wrap within the band so notes stay below Foundry windows
  _zCounter = _zCounter >= Z_MAX ? Z_MIN : _zCounter + 1;
  return _zCounter;
}

// ─── Class ────────────────────────────────────────────────────────────────────

export class WaymarkElement {

  /**
   * Creates a new note element and immediately builds its DOM.
   *
   * @param {WaymarkNote} note       — the note data to display
   * @param {Object}      callbacks  — what to call when the user does things:
   *   onUpdate(id, changes)    — user edited content, color, font size, etc. (write to server)
   *   onUpdateLocal(id, layout) — user dragged or resized (write to local settings only)
   *   onDelete(id)             — user confirmed deletion
   *   onDismiss(id)            — player hid the note for this session
   *   onPin(id)                — user clicked the pin button (note not yet pinned)
   *   onUnpin(id)              — user clicked the pin button (note already pinned)
   *   onSync()                 — user clicked the sync button (force full re-render)
   *   onPermissions(id)        — user clicked the permissions button
   *   onSendToGM(id)           — player sent their note to the GM
   *
   *   canEdit        — whether this user can change the note's content and colors
   *   canPin         — whether this user can pin/unpin the note
   *   canDelete      — whether this user can permanently delete the note
   *   canDismiss     — whether this user can dismiss (hide) the note
   *   canManagePerms — whether the permissions button should be visible (GMs only)
   *   canSendToGM    — whether the send-to-GM button should be visible (players only)
   */
  constructor(note, {
    onUpdate, onUpdateLocal, onDelete, onDismiss, onPin, onUnpin,
    onSync, onPermissions, onSendToGM,
    canEdit = true, canPin = true, canDelete = true,
    canDismiss = false, canManagePerms = false, canSendToGM = false,
  }) {
    // Store the note data as a local copy. We update this copy immediately
    // when the user makes changes so the UI feels instant, even before the
    // server responds.
    this._note = { ...note };

    // Store all the callbacks
    this._onUpdate = onUpdate;
    this._onUpdateLocal = onUpdateLocal;
    this._onDelete = onDelete;
    this._onDismiss = onDismiss;
    this._onPin = onPin;
    this._onUnpin = onUnpin;
    this._onSync = onSync;
    this._onPermissions = onPermissions;
    this._onSendToGM = onSendToGM;

    // Store permission flags — used during build to show/hide buttons
    this._canEdit = canEdit;
    this._canPin = canPin;
    this._canDelete = canDelete;
    this._canDismiss = canDismiss;
    this._canManagePerms = canManagePerms;
    this._canSendToGM = canSendToGM;

    // Track whether the per-note color picker panel is currently open
    this._pickerOpen = false;

    // Build the DOM and wire up all the event listeners
    this.element = this._build();
    this._attachListeners();
  }

  // ─── Theme helpers ────────────────────────────────────────────────────────

  /**
   * Returns the current world theme key and its definition object.
   * Falls back to sticky if the saved key doesn't match a known theme.
   */
  _getTheme() {
    const key = game.settings.get("waymarks", "theme") || "sticky";
    return { key, def: THEMES[key] || THEMES.sticky };
  }

  /** Shorthand — resolves this note's effective primary color. */
  _getColor1() { return NoteManager.resolveColor1(this._note); }

  /** Shorthand — resolves this note's effective secondary color. */
  _getColor2() { return NoteManager.resolveColor2(this._note); }

  // ─── Build ────────────────────────────────────────────────────────────────

  /**
   * Builds the complete DOM structure for a note and returns the root element.
   * Called once at construction time. The structure is:
   *
   *   .waymark-note
   *     .waymark-header        ← drag bar + all control buttons
   *     .waymark-color-panel   ← color picker (hidden by default)
   *     textarea.waymark-content
   *     .waymark-author        ← "— Player Name" badge
   *     .waymark-resize-handle ← bottom-right drag corner
   *     .wm-corner-bl/br       ← Shadowdark theme only
   */
  _build() {
    const n = this._note;
    const { key, def } = this._getTheme();

    // ── Root element ────────────────────────────────────────────────────────
    // Absolutely positioned on the interface layer.
    // Position, size, and z-index are all set as inline styles.
    const el = document.createElement("div");
    el.className = `waymark-note waymark-theme-${key}`;
    el.dataset.id = n.id;
    el.style.cssText = `left:${n.x}px;top:${n.y}px;width:${n.width}px;height:${n.height}px;z-index:${_nextZ()};`;

    // Apply this theme's CSS variables (colors, font) to the element
    def.applyColors(el, this._getColor1(), this._getColor2());
    const fontOverride = game.settings.get("waymarks", "themeFont") || "";
    el.style.setProperty("--wm-font", `"${fontOverride || def.font}", sans-serif`);
    // Set text color based on whether the background is dark or light.
    // --wm-auto-text is used by themes that don't have a fixed text color baked
    // into their CSS (sticky, indexcard, classified, tavern). If the user picks
    // a dark background color the text flips to white so it stays readable.
    el.style.setProperty("--wm-auto-text", NoteManager.isDark(this._getColor1()) ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.8)");

    // If the note was saved in a collapsed state, apply that class immediately
    if (n.collapsed) el.classList.add("waymark-note--collapsed");

    // ── Header ──────────────────────────────────────────────────────────────
    // The drag bar across the top of the note. Contains all control buttons.
    const header = document.createElement("div");
    header.className = "waymark-header";

    // Color dot — clicking opens the per-note color picker panel
    const colorBtn = document.createElement("button");
    colorBtn.className = "waymark-color-btn";
    colorBtn.title = game.i18n.localize("WAYMARKS.Button.ChangeColor");
    colorBtn.style.backgroundColor = this._getColor1();

    // The color picker panel itself (built separately, hidden by default)
    const pickerPanel = this._buildPickerPanel(def, n);

    // Font size controls — down arrow, numeric label, up arrow
    const fontDown = document.createElement("button");
    fontDown.className = "waymark-font-btn waymark-font-btn--down";
    fontDown.textContent = "▼";
    fontDown.title = game.i18n.localize("WAYMARKS.Button.DecreaseFontSize");

    const fontLabel = document.createElement("span");
    fontLabel.className = "waymark-font-label";
    fontLabel.textContent = String(n.fontSize || 24);

    const fontUp = document.createElement("button");
    fontUp.className = "waymark-font-btn waymark-font-btn--up";
    fontUp.textContent = "▲";
    fontUp.title = game.i18n.localize("WAYMARKS.Button.IncreaseFontSize");

    // Pin button — the icon turns fully opaque when the note is pinned,
    // and the scene name appears next to it as a reminder
    const pinBtn = document.createElement("button");
    pinBtn.className = "waymark-pin-btn" + (n.sceneId ? " waymark-pin-btn--active" : "");
    pinBtn.title = n.sceneId ? game.i18n.localize("WAYMARKS.Button.UnpinFromScene") : game.i18n.localize("WAYMARKS.Button.PinToScene");

    const pinIcon = document.createElement("span");
    pinIcon.className = "waymark-pin-icon";
    pinIcon.textContent = "📌";

    const pinLabel = document.createElement("span");
    pinLabel.className = "waymark-pin-label";
    pinLabel.textContent = n.sceneId
      ? (game.scenes.get(n.sceneId) ? game.scenes.get(n.sceneId).name : game.i18n.localize("WAYMARKS.Author.UnknownScene"))
      : "";

    pinBtn.append(pinIcon, pinLabel);

    // Spacer — pushes the title input and right-side buttons to the correct positions
    const spacer = document.createElement("div");
    spacer.className = "waymark-header-spacer";

    // Title input — optional short label. Subtle when the note is open,
    // expands to fill the header bar when the note is collapsed.
    const titleInput = document.createElement("input");
    titleInput.type = "text";
    titleInput.className = "waymark-title";
    titleInput.placeholder = game.i18n.localize("WAYMARKS.Button.TitlePlaceholder");
    titleInput.value = n.title || "";
    titleInput.spellcheck = false;
    if (!this._canEdit) titleInput.readOnly = true;

    // Right-side button group: sync, collapse, send-to-GM, permissions, delete
    const syncBtn = document.createElement("button");
    syncBtn.className = "waymark-sync";
    syncBtn.textContent = "⟳";
    syncBtn.title = game.i18n.localize("WAYMARKS.Button.OpenThemePicker");

    const collapseBtn = document.createElement("button");
    collapseBtn.className = "waymark-collapse";
    collapseBtn.textContent = n.collapsed ? "▼" : "▲";
    collapseBtn.title = n.collapsed ? game.i18n.localize("WAYMARKS.Button.Expand") : game.i18n.localize("WAYMARKS.Button.Collapse");

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "waymark-delete";
    deleteBtn.textContent = "✕";
    deleteBtn.title = this._canDelete ? game.i18n.localize("WAYMARKS.Button.DeleteWaymark") : game.i18n.localize("WAYMARKS.Button.CloseNote");

    const permsBtn = document.createElement("button");
    permsBtn.className = "waymark-perms";
    permsBtn.textContent = "👥";
    permsBtn.title = game.i18n.localize("WAYMARKS.Button.ManagePermissions");

    const sendBtn = document.createElement("button");
    sendBtn.className = "waymark-send-gm";
    sendBtn.textContent = "📤";
    sendBtn.title = game.i18n.localize("WAYMARKS.Button.SendToGM");

    const rightGroup = document.createElement("div");
    rightGroup.className = "waymark-right-group";
    rightGroup.append(syncBtn, collapseBtn, sendBtn, permsBtn, deleteBtn);

    // Assemble the header left-to-right
    header.append(colorBtn, fontDown, fontLabel, fontUp, pinBtn, spacer, titleInput, rightGroup);

    // Hide buttons this user doesn't have permission to use.
    // We hide rather than not create them so the DOM structure stays consistent.
    if (!this._canEdit) {
      colorBtn.style.display = "none";
      fontDown.style.display = "none";
      fontLabel.style.display = "none";
      fontUp.style.display = "none";
    }
    if (!this._canPin)                        pinBtn.style.display = "none";
    if (!this._canDelete && !this._canDismiss) deleteBtn.style.display = "none";
    if (!this._canManagePerms)                permsBtn.style.display = "none";
    if (!this._canSendToGM)                   sendBtn.style.display = "none";

    // ── Body ────────────────────────────────────────────────────────────────
    // The main textarea where note content is typed.
    const textarea = document.createElement("textarea");
    textarea.className = "waymark-content";
    textarea.placeholder = game.i18n.localize("WAYMARKS.Button.ContentPlaceholder");
    textarea.spellcheck = false;
    textarea.style.fontSize = `${n.fontSize || 24}px`;
    textarea.value = n.content;
    if (!this._canEdit) {
      // Read-only notes still show the cursor so players know they can click
      // to read, but any attempt to type is blocked
      textarea.readOnly = true;
      textarea.style.cursor = "default";
    }

    // ── Author badge ────────────────────────────────────────────────────────
    // Shows "— PlayerName" in the bottom-right corner of notes you didn't create.
    // Hidden if you created the note (it's obvious it's yours) or if the creator
    // no longer exists in the game.
    const authorBadge = document.createElement("div");
    authorBadge.className = "waymark-author";
    if (n.createdBy && n.createdBy !== game.user.id) {
      const author = game.users.get(n.createdBy);
      if (author) {
        authorBadge.textContent = game.i18n.format("WAYMARKS.Author.Badge", { name: author.name });
      } else {
        authorBadge.style.display = "none";
      }
    } else {
      authorBadge.style.display = "none";
    }

    // ── Resize handle ────────────────────────────────────────────────────────
    // The small invisible grab zone in the bottom-right corner.
    // CSS gives it a visual triangle indicator.
    const resizeHandle = document.createElement("div");
    resizeHandle.className = "waymark-resize-handle";

    // ── Assemble ────────────────────────────────────────────────────────────
    el.append(header, pickerPanel, textarea, authorBadge, resizeHandle);

    // The Shadowdark theme has ornate corner brackets. CSS can do the top two
    // with ::before and ::after pseudo-elements, but there's no equivalent for
    // the bottom two, so we inject real DOM elements for those.
    if (key === "shadowdark") {
      const bl = document.createElement("div"); bl.className = "wm-corner-bl";
      const br = document.createElement("div"); br.className = "wm-corner-br";
      el.append(bl, br);
    }

    // Store references to all interactive elements so other methods can
    // reach them without querying the DOM every time
    this._els = {
      header, colorBtn, pickerPanel, fontDown, fontUp, fontLabel,
      pinBtn, pinLabel, rightGroup, syncBtn, collapseBtn, sendBtn, permsBtn, deleteBtn,
      textarea, titleInput, authorBadge, resizeHandle,
    };

    return el;
  }

  // ─── Color picker panel ────────────────────────────────────────────────────

  /**
   * Builds the color picker panel that drops down when the color dot is clicked.
   * This is separate from _build() because the markup is complex enough to
   * warrant its own method.
   *
   * For single-color themes (colorCount === 1) only the primary section is shown.
   * For two-color themes (colorCount === 2) both sections are shown.
   *
   * Each section has:
   *   - A row of preset color swatches for quick selection
   *   - A native <input type="color"> for any custom color
   *   - A reset button to clear the per-note override and fall back to the world default
   */
  _buildPickerPanel(def, n) {
    const panel = document.createElement("div");
    panel.className = "waymark-color-panel waymark-color-panel--hidden";

    const twoColors = def.colorCount === 2;

    // Build the HTML as a template string. The secondary section is only
    // included when the theme uses two colors.
    panel.innerHTML = `
      <div class="waymark-picker-section">
        <div class="waymark-picker-label">${game.i18n.localize(def.primaryLabel) || game.i18n.localize("WAYMARKS.Picker.Custom")}</div>
        <div class="waymark-swatches waymark-swatches--primary">
          ${SWATCHES_PRIMARY.map(s =>
            `<button class="waymark-swatch" data-slot="1" data-color="${s.value}"
                     style="background:${s.value}" title="${s.label}"></button>`
          ).join("")}
        </div>
        <div class="waymark-custom-row">
          <label class="waymark-custom-label">${game.i18n.localize("WAYMARKS.Picker.Custom")}</label>
          <input type="color" class="waymark-custom-input waymark-custom-input--1"
                 value="${this._getColor1()}">
          <button class="waymark-color-reset waymark-color-reset--1" title="${game.i18n.localize('WAYMARKS.Picker.ResetToTheme')}">↺</button>
        </div>
      </div>
      ${twoColors ? `
      <div class="waymark-picker-section waymark-picker-section--secondary">
        <div class="waymark-picker-label">${game.i18n.localize(def.secondaryLabel) || game.i18n.localize("WAYMARKS.Picker.Custom")}</div>
        <div class="waymark-swatches waymark-swatches--secondary">
          ${SWATCHES_SECONDARY.map(s =>
            `<button class="waymark-swatch" data-slot="2" data-color="${s.value}"
                     style="background:${s.value}" title="${s.label}"></button>`
          ).join("")}
        </div>
        <div class="waymark-custom-row">
          <label class="waymark-custom-label">${game.i18n.localize("WAYMARKS.Picker.Custom")}</label>
          <input type="color" class="waymark-custom-input waymark-custom-input--2"
                 value="${this._getColor2()}">
          <button class="waymark-color-reset waymark-color-reset--2" title="${game.i18n.localize('WAYMARKS.Picker.ResetToTheme')}">↺</button>
        </div>
      </div>` : ""}
    `;

    return panel;
  }

  // ─── Theme application ────────────────────────────────────────────────────

  /**
   * Re-applies the current theme's CSS variables to the note element.
   * Called whenever the color changes (swatch click, custom input, reset)
   * so the note updates visually in real time without a full rebuild.
   * Also updates the color dot in the header to match.
   *
   * After applying colors, checks whether the primary background color is
   * dark enough that white text would be more readable than black text,
   * and sets --wm-auto-text accordingly. The CSS uses this variable for
   * themes whose text color isn't already determined by their design.
   */
  _applyThemeVars() {
    const { key, def } = this._getTheme();
    const el = this.element;
    const color1 = this._getColor1();
    // Swap the theme CSS class (in case the world theme changed while the note is open)
    el.className = el.className.replace(/waymark-theme-\S+/, `waymark-theme-${key}`);
    def.applyColors(el, color1, this._getColor2());
    const fontOverride = game.settings.get("waymarks", "themeFont") || "";
    el.style.setProperty("--wm-font", `"${fontOverride || def.font}", sans-serif`);
    // Flip text to white when the background color is dark
    el.style.setProperty("--wm-auto-text", NoteManager.isDark(color1) ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.8)");
    // Keep the color dot in sync with the current primary color
    this._els.colorBtn.style.backgroundColor = color1;
  }

  // ─── Sync ─────────────────────────────────────────────────────────────────

  /**
   * Pushes fresh note data from the server into the existing DOM element.
   * Called by WaymarkRenderer when it receives an updateJournalEntry hook
   * and the change doesn't require a full rebuild (e.g. content edit, font
   * size change, pin state change).
   *
   * Position and size are intentionally NOT updated here — those are stored
   * locally per-client, so remote changes to x/y/width/height are ignored.
   * This prevents other players' drag actions from jumping your note around.
   *
   * Title and content are only updated if the field isn't currently focused —
   * we don't want to overwrite text the user is actively typing.
   *
   * @param {WaymarkNote} note  — the fresh note data from the server
   */
  sync(note) {
    // Preserve local position and size — these are client-owned
    const localX = this._note.x,     localY = this._note.y;
    const localW = this._note.width,  localH = this._note.height;
    this._note = { ...note, x: localX, y: localY, width: localW, height: localH };

    this._applyThemeVars();

    const { fontLabel, pinBtn, textarea, titleInput } = this._els;

    // Update the font size display label
    fontLabel.textContent = String(note.fontSize || 24);

    // Update the pin button state and scene name label
    pinBtn.classList.toggle("waymark-pin-btn--active", !!note.sceneId);
    pinBtn.title = note.sceneId ? game.i18n.localize("WAYMARKS.Button.UnpinFromScene") : game.i18n.localize("WAYMARKS.Button.PinToScene");
    this._els.pinLabel.textContent = note.sceneId
      ? (game.scenes.get(note.sceneId) ? game.scenes.get(note.sceneId).name : "Unknown Scene")
      : "";

    // Only overwrite the title/content fields if the user isn't currently editing them
    if (document.activeElement !== titleInput) titleInput.value = note.title || "";
    if (document.activeElement !== textarea)   textarea.value = note.content;
    textarea.style.fontSize = `${note.fontSize || 24}px`;
  }

  // ─── Event listeners ──────────────────────────────────────────────────────

  /**
   * Wires up all user interaction for the note. Called once after _build().
   * Each section handles one interactive part of the note.
   */
  _attachListeners() {
    const {
      header, colorBtn, pickerPanel, fontDown, fontUp,
      pinBtn, syncBtn, collapseBtn, sendBtn, permsBtn,
      deleteBtn, textarea, titleInput, resizeHandle,
    } = this._els;
    const el = this.element;

    // Any pointerdown on the note (including its children) brings it to the front.
    // We use capture phase so this fires before any child that calls stopPropagation.
    el.addEventListener("pointerdown", () => this._bringToFront(), true);

    // Dragging: pressing and holding on the header bar (but not on buttons or inputs)
    // starts a drag. Double-clicking the header toggles collapse.
    header.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button, input")) return;
      e.stopPropagation();
      this._onDragStart(e);
    });
    header.addEventListener("dblclick", (e) => {
      if (e.target.closest("button, input")) return;
      this._toggleCollapse();
    });

    // ── Color button ────────────────────────────────────────────────────────
    // Toggles the color picker panel open/closed
    colorBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this._pickerOpen ? this._closePicker() : this._openPicker();
    });

    // Swatch buttons — data-slot tells us whether it's the primary (1) or secondary (2) color
    pickerPanel.querySelectorAll(".waymark-swatch").forEach((swatch) => {
      swatch.addEventListener("click", (e) => {
        e.stopPropagation();
        swatch.dataset.slot === "2"
          ? this._applyColor2(swatch.dataset.color)
          : this._applyColor1(swatch.dataset.color);
      });
    });

    // Custom color inputs — update live as the user drags the color picker
    // "input" fires while dragging, "change" fires on final pick
    const ci1 = pickerPanel.querySelector(".waymark-custom-input--1");
    if (ci1) {
      ci1.addEventListener("input",     (e) => this._applyColor1(e.target.value));
      ci1.addEventListener("change",    (e) => this._applyColor1(e.target.value));
      ci1.addEventListener("pointerdown", (e) => e.stopPropagation());
    }
    const ci2 = pickerPanel.querySelector(".waymark-custom-input--2");
    if (ci2) {
      ci2.addEventListener("input",     (e) => this._applyColor2(e.target.value));
      ci2.addEventListener("change",    (e) => this._applyColor2(e.target.value));
      ci2.addEventListener("pointerdown", (e) => e.stopPropagation());
    }

    // Reset buttons — clear the per-note color override so the note falls back
    // to the world theme default. Also updates the custom input to show the new value.
    const reset1 = pickerPanel.querySelector(".waymark-color-reset--1");
    if (reset1) {
      reset1.addEventListener("click", (e) => {
        e.stopPropagation();
        this._note.color = null;
        this._onUpdate(this._note.id, { color: null });
        this._applyThemeVars();
        if (ci1) ci1.value = this._getColor1();
      });
    }
    const reset2 = pickerPanel.querySelector(".waymark-color-reset--2");
    if (reset2) {
      reset2.addEventListener("click", (e) => {
        e.stopPropagation();
        this._note.color2 = null;
        this._onUpdate(this._note.id, { color2: null });
        this._applyThemeVars();
        if (ci2) ci2.value = this._getColor2();
      });
    }

    // ── Font size ────────────────────────────────────────────────────────────
    // Clamps between MIN_FONT and MAX_FONT on every click
    const MIN_FONT = 10, MAX_FONT = 32;
    fontDown.addEventListener("click", (e) => {
      e.stopPropagation();
      this._applyFontSize(Math.max(MIN_FONT, (this._note.fontSize || 24) - 1));
    });
    fontUp.addEventListener("click", (e) => {
      e.stopPropagation();
      this._applyFontSize(Math.min(MAX_FONT, (this._note.fontSize || 24) + 1));
    });

    // ── Pin ──────────────────────────────────────────────────────────────────
    // Toggles between pinned and unpinned based on current state
    pinBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this._note.sceneId ? this._onUnpin(this._note.id) : this._onPin(this._note.id);
    });

    // ── Sync / Theme Picker ───────────────────────────────────────────────────
    // Opens the world theme picker dialog
    syncBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (this._onSync) this._onSync();
    });

    // ── Send to GM ────────────────────────────────────────────────────────────
    // Players only — makes this note visible to the GM
    sendBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (this._onSendToGM) this._onSendToGM(this._note.id);
    });

    // ── Permissions ───────────────────────────────────────────────────────────
    // GMs only — opens the ownership dialog for this note
    permsBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (this._onPermissions) this._onPermissions(this._note.id);
    });

    // ── Collapse ──────────────────────────────────────────────────────────────
    collapseBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this._toggleCollapse();
    });

    // ── Delete / Dismiss ───────────────────────────────────────────────────────
    // Owners get a delete confirmation dialog.
    // Observers (non-owners who can see the note) get a dismiss that hides it
    // for their session without deleting it for everyone.
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (this._canDelete) {
        // Guard against double-clicks while the confirmation dialog is open
        if (this._deletePending) return;
        this._confirmDelete();
      } else if (this._canDismiss) {
        this._onDismiss(this._note.id);
      }
    });

    // ── Title ─────────────────────────────────────────────────────────────────
    // Saves on blur (leaving the field) or Enter key. Only saves if the value
    // actually changed to avoid unnecessary server writes.
    titleInput.addEventListener("blur", () => {
      const val = titleInput.value;
      if (val !== (this._note.title || "")) {
        this._note.title = val;
        this._onUpdate(this._note.id, { title: val });
      }
    });
    // Prevent the mousedown from bubbling up to the header's drag handler
    titleInput.addEventListener("pointerdown", (e) => e.stopPropagation());
    titleInput.addEventListener("keydown",   (e) => { if (e.key === "Enter") titleInput.blur(); });

    // ── Textarea ──────────────────────────────────────────────────────────────
    // Same pattern as title — saves on blur, only if changed
    textarea.addEventListener("blur", () => {
      const val = textarea.value;
      if (val !== this._note.content) {
        this._note.content = val;
        this._onUpdate(this._note.id, { content: val });
      }
    });
    textarea.addEventListener("pointerdown", (e) => e.stopPropagation());

    // ── Resize ────────────────────────────────────────────────────────────────
    resizeHandle.addEventListener("pointerdown", (e) => this._onResizeStart(e));
  }

  // ─── Picker open/close ────────────────────────────────────────────────────

  /** Shows the color picker panel by removing the hidden class. */
  _openPicker() {
    this._els.pickerPanel.classList.remove("waymark-color-panel--hidden");
    this._pickerOpen = true;
  }

  /** Hides the color picker panel. */
  _closePicker() {
    this._els.pickerPanel.classList.add("waymark-color-panel--hidden");
    this._pickerOpen = false;
  }

  // ─── Z-index ──────────────────────────────────────────────────────────────

  /** Moves this note in front of all other notes and Foundry windows. */
  _bringToFront() {
    this.element.style.zIndex = String(_nextZ());
  }

  // ─── Color application ────────────────────────────────────────────────────

  /**
   * Applies a new primary color to the note immediately and saves it to the server.
   * Stores the color on the local note copy first so _applyThemeVars() reads the
   * new value right away without waiting for the server response.
   */
  _applyColor1(hex) {
    this._note.color = hex;
    this._applyThemeVars();
    this._onUpdate(this._note.id, { color: hex });
  }

  /** Same as _applyColor1 but for the secondary color. */
  _applyColor2(hex) {
    this._note.color2 = hex;
    this._applyThemeVars();
    this._onUpdate(this._note.id, { color2: hex });
  }

  // ─── Font size ────────────────────────────────────────────────────────────

  /**
   * Updates the font size on the textarea and the header label, then saves to server.
   * @param {number} size  — already clamped by the caller
   */
  _applyFontSize(size) {
    this._note.fontSize = size;
    this._els.textarea.style.fontSize = `${size}px`;
    this._els.fontLabel.textContent = String(size);
    this._onUpdate(this._note.id, { fontSize: size });
  }

  // ─── Collapse ─────────────────────────────────────────────────────────────

  /**
   * Toggles the collapsed state. The CSS class does the actual hiding —
   * we just toggle it and update the button arrow to match.
   */
  _toggleCollapse() {
    const collapsed = !this._note.collapsed;
    this._note.collapsed = collapsed;
    this.element.classList.toggle("waymark-note--collapsed", collapsed);
    this._els.collapseBtn.textContent = collapsed ? "▼" : "▲";
    this._els.collapseBtn.title = collapsed ? game.i18n.localize("WAYMARKS.Button.Expand") : game.i18n.localize("WAYMARKS.Button.Collapse");
    this._onUpdate(this._note.id, { collapsed });
  }

  // ─── Delete confirmation ──────────────────────────────────────────────────

  /**
   * Shows Foundry's built-in confirmation dialog before deleting.
   * Uses _deletePending to prevent the dialog opening twice if the user
   * double-clicks the delete button.
   *
   * The try/finally ensures _deletePending is always cleared even if
   * something goes wrong showing the dialog.
   */
  async _confirmDelete() {
    this._deletePending = true;
    try {
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: game.i18n.localize("WAYMARKS.Dialog.DeleteTitle") },
        content: game.i18n.localize("WAYMARKS.Dialog.DeleteBody"),
        yes: { callback: () => true },
        no: { callback: () => false, default: true },
      });
      if (confirmed) this._onDelete(this._note.id);
    } finally {
      this._deletePending = false;
    }
  }

  // ─── Drag ─────────────────────────────────────────────────────────────────

  /**
   * Handles the start of a drag operation on the note header.
   *
   * We record the mouse offset from the note's current position at the moment
   * the drag starts. Then on every mousemove we subtract that offset from the
   * current mouse position to get the new note position. This keeps the note
   * anchored under the exact spot where the user clicked, rather than jumping
   * to have its top-left corner under the cursor.
   *
   * We attach pointermove and pointerup to the document (not the note element) so
   * the drag continues working even if the pointer moves outside the note.
   * Both listeners remove themselves when the pointer is released.
   *
   * Position is only saved to local settings (not the server) — each client
   * arranges notes independently.
   */
  _onDragStart(e) {
    if (e.button !== 0) return;   // Left button only
    e.preventDefault();

    const startX = e.clientX - this._note.x;
    const startY = e.clientY - this._note.y;

    const onMove = (ev) => {
      this._note.x = ev.clientX - startX;
      this._note.y = ev.clientY - startY;
      this.element.style.left = `${this._note.x}px`;
      this.element.style.top = `${this._note.y}px`;
    };
    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      this._onUpdateLocal(this._note.id, { x: this._note.x, y: this._note.y });
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }

  // ─── Resize ───────────────────────────────────────────────────────────────

  /**
   * Same pattern as drag, but for the resize handle in the bottom-right corner.
   * Records the mouse position and note size at the start, then on each move
   * calculates the new size as: original size + how far the mouse has moved.
   * Clamped to a minimum of 200px in each dimension so the note can't be
   * shrunk to the point where it's unusable.
   *
   * Size is only saved locally, same as position.
   */
  _onResizeStart(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX, startY = e.clientY;
    const startW = this._note.width, startH = this._note.height;
    const MIN = 200;

    const onMove = (ev) => {
      this._note.width = Math.max(MIN, startW + (ev.clientX - startX));
      this._note.height = Math.max(MIN, startH + (ev.clientY - startY));
      this.element.style.width = `${this._note.width}px`;
      this.element.style.height = `${this._note.height}px`;
    };
    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      this._onUpdateLocal(this._note.id, { width: this._note.width, height: this._note.height });
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }

  // ─── Teardown ─────────────────────────────────────────────────────────────

  /**
   * Removes the note element from the DOM. Called by WaymarkRenderer when a
   * note is deleted, unpinned from the current scene, or becomes invisible
   * to this user. All event listeners are automatically garbage-collected
   * when the element is removed.
   */
  destroy() {
    this.element.remove();
  }
}
