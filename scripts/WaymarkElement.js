import { NoteManager } from "./NoteManager.js";
import { THEMES } from "./WaymarkThemes.js";

// Swatches shown in picker — used for both primary and secondary pickers
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

// Z-index management. Foundry App V1 windows (actor sheets etc.) use
// globalThis._maxZ starting around 100. We stay in the same range so
// clicking a note vs an actor sheet behaves naturally — last clicked wins.
// Buffer extension elements at 8,675,309 are non-interactive overlays
// (just a hover button) and don't interfere with clicking.
let _zCounter = 100;

function _nextZ() {
  // Read App V1's current max so we stay in sync with actor sheets etc.
  const v1Max = globalThis._maxZ ?? 100;
  if (v1Max > _zCounter) _zCounter = v1Max;
  return ++_zCounter;
}

export class WaymarkElement {
  constructor(note, { onUpdate, onUpdateLocal, onDelete, onDismiss, onPin, onUnpin, onSync, onPermissions, onSendToGM,
                      canEdit = true, canPin = true, canDelete = true, canDismiss = false, canManagePerms = false, canSendToGM = false }) {
    this._note          = { ...note };
    this._onUpdate      = onUpdate;
    this._onUpdateLocal = onUpdateLocal;
    this._onDelete      = onDelete;
    this._onDismiss     = onDismiss;
    this._onPin         = onPin;
    this._onUnpin       = onUnpin;
    this._onSync        = onSync;
    this._onPermissions = onPermissions;
    this._onSendToGM    = onSendToGM;
    this._canEdit        = canEdit;
    this._canPin         = canPin;
    this._canDelete      = canDelete;
    this._canDismiss     = canDismiss;
    this._canManagePerms = canManagePerms;
    this._canSendToGM    = canSendToGM;
    this._pickerOpen = false; // false | "primary" | "secondary"

    this.element = this._build();
    this._attachListeners();
  }

  // ─── Theme helpers ───────────────────────────────────────────────────────

  _getTheme() {
    const key = game.settings.get("waymarks", "theme") || "sticky";
    return { key, def: THEMES[key] || THEMES.sticky };
  }

  _getColor1() { return NoteManager.resolveColor1(this._note); }
  _getColor2() { return NoteManager.resolveColor2(this._note); }

  // ─── Build ───────────────────────────────────────────────────────────────

  _build() {
    const n  = this._note;
    const { key, def } = this._getTheme();

    const el = document.createElement("div");
    el.className  = `waymark-note waymark-theme-${key}`;
    el.dataset.id = n.id;
    el.style.cssText = `left:${n.x}px;top:${n.y}px;width:${n.width}px;height:${n.height}px;z-index:${_nextZ()};`;

    // Apply CSS variables for this theme
    def.applyColors(el, this._getColor1(), this._getColor2());

    // Font — use override if set, else theme default
    const fontOverride = game.settings.get("waymarks", "themeFont") || "";
    const fontName = fontOverride || def.font;
    el.style.setProperty("--wm-font", `"${fontName}", sans-serif`);

    if (n.collapsed) el.classList.add("waymark-note--collapsed");

    // ── Header ──────────────────────────────────────────────────────────────
    const header = document.createElement("div");
    header.className = "waymark-header";

    // Color button — shows primary color dot
    const colorBtn = document.createElement("button");
    colorBtn.className = "waymark-color-btn";
    colorBtn.title = "Change color";
    colorBtn.style.backgroundColor = this._getColor1();

    // Color picker panel
    const pickerPanel = this._buildPickerPanel(def, n);

    // Font controls
    const fontDown = document.createElement("button");
    fontDown.className = "waymark-font-btn waymark-font-btn--down";
    fontDown.textContent = "▼";
    fontDown.title = "Decrease font size";

    const fontLabel = document.createElement("span");
    fontLabel.className = "waymark-font-label";
    fontLabel.textContent = String(n.fontSize || 24);

    const fontUp = document.createElement("button");
    fontUp.className = "waymark-font-btn waymark-font-btn--up";
    fontUp.textContent = "▲";
    fontUp.title = "Increase font size";

    // Pin button
    const pinBtn = document.createElement("button");
    pinBtn.className = "waymark-pin-btn" + (n.sceneId ? " waymark-pin-btn--active" : "");
    pinBtn.title = n.sceneId ? "Unpin from scene" : "Pin to current scene";

    const pinIcon = document.createElement("span");
    pinIcon.className = "waymark-pin-icon";
    pinIcon.textContent = "📌";

    const pinLabel = document.createElement("span");
    pinLabel.className = "waymark-pin-label";
    pinLabel.textContent = n.sceneId ? (game.scenes.get(n.sceneId) ? game.scenes.get(n.sceneId).name : "Unknown Scene") : "";

    pinBtn.append(pinIcon, pinLabel);

    const spacer = document.createElement("div");
    spacer.className = "waymark-header-spacer";

    // Right group: sync, collapse, delete
    const syncBtn = document.createElement("button");
    syncBtn.className = "waymark-sync";
    syncBtn.textContent = "⟳";
    syncBtn.title = "Sync note";

    const collapseBtn = document.createElement("button");
    collapseBtn.className = "waymark-collapse";
    collapseBtn.textContent = n.collapsed ? "▼" : "▲";
    collapseBtn.title = n.collapsed ? "Expand" : "Collapse";

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "waymark-delete";
    deleteBtn.textContent = "✕";
    deleteBtn.title = this._canDelete ? "Delete waymark" : "Close note";

    const rightGroup = document.createElement("div");
    rightGroup.className = "waymark-right-group";

    const permsBtn = document.createElement("button");
    permsBtn.className = "waymark-perms";
    permsBtn.textContent = "👥";
    permsBtn.title = "Manage permissions";

    const sendBtn = document.createElement("button");
    sendBtn.className = "waymark-send-gm";
    sendBtn.textContent = "📤";
    sendBtn.title = "Send to GM";

    rightGroup.append(syncBtn, collapseBtn, sendBtn, permsBtn, deleteBtn);

    header.append(colorBtn, fontDown, fontLabel, fontUp, pinBtn, spacer, rightGroup);

    // Permission visibility
    if (!this._canEdit) {
      colorBtn.style.display  = "none";
      fontDown.style.display  = "none";
      fontLabel.style.display = "none";
      fontUp.style.display    = "none";
    }
    if (!this._canPin)         pinBtn.style.display   = "none";
    if (!this._canDelete && !this._canDismiss) deleteBtn.style.display = "none";
    if (!this._canManagePerms) permsBtn.style.display  = "none";
    if (!this._canSendToGM)    sendBtn.style.display   = "none";

    // ── Body ────────────────────────────────────────────────────────────────
    const textarea = document.createElement("textarea");
    textarea.className   = "waymark-content";
    textarea.placeholder = "Write something...";
    textarea.spellcheck  = false;
    textarea.style.fontSize = `${n.fontSize || 24}px`;
    textarea.value = n.content;
    if (!this._canEdit) {
      textarea.readOnly = true;
      textarea.style.cursor = "default";
    }

    // Author badge — only shown to users who didn't create the note
    const authorBadge = document.createElement("div");
    authorBadge.className = "waymark-author";
    if (n.createdBy && n.createdBy !== game.user.id) {
      const author = game.users.get(n.createdBy);
      if (author) {
        authorBadge.textContent = `— ${author.name}`;
      } else {
        authorBadge.style.display = "none";
      }
    } else {
      authorBadge.style.display = "none";
    }

    const resizeHandle = document.createElement("div");
    resizeHandle.className = "waymark-resize-handle";

    el.append(header, pickerPanel, textarea, authorBadge, resizeHandle);

    // Shadowdark needs real DOM elements for bottom corners (pseudo-elements can't reach both)
    if (key === "shadowdark") {
      const bl = document.createElement("div"); bl.className = "wm-corner-bl";
      const br = document.createElement("div"); br.className = "wm-corner-br";
      el.append(bl, br);
    }

    this._els = {
      header, colorBtn, pickerPanel, fontDown, fontUp, fontLabel,
      pinBtn, pinLabel, rightGroup, syncBtn, collapseBtn, sendBtn, permsBtn, deleteBtn,
      textarea, authorBadge, resizeHandle,
    };

    return el;
  }

  // ─── Picker panel builder ─────────────────────────────────────────────────

  _buildPickerPanel(def, n) {
    const panel = document.createElement("div");
    panel.className = "waymark-color-panel waymark-color-panel--hidden";

    const twoColors = def.colorCount === 2;

    // Primary section
    panel.innerHTML = `
      <div class="waymark-picker-section">
        <div class="waymark-picker-label">${def.primaryLabel || "Color"}</div>
        <div class="waymark-swatches waymark-swatches--primary">
          ${SWATCHES_PRIMARY.map(s =>
            `<button class="waymark-swatch" data-slot="1" data-color="${s.value}"
                     style="background:${s.value}" title="${s.label}"></button>`
          ).join("")}
        </div>
        <div class="waymark-custom-row">
          <label class="waymark-custom-label">Custom</label>
          <input type="color" class="waymark-custom-input waymark-custom-input--1"
                 value="${this._getColor1()}">
          <button class="waymark-color-reset waymark-color-reset--1" title="Reset to theme default">↺</button>
        </div>
      </div>
      ${twoColors ? `
      <div class="waymark-picker-section waymark-picker-section--secondary">
        <div class="waymark-picker-label">${def.secondaryLabel || "Secondary"}</div>
        <div class="waymark-swatches waymark-swatches--secondary">
          ${SWATCHES_SECONDARY.map(s =>
            `<button class="waymark-swatch" data-slot="2" data-color="${s.value}"
                     style="background:${s.value}" title="${s.label}"></button>`
          ).join("")}
        </div>
        <div class="waymark-custom-row">
          <label class="waymark-custom-label">Custom</label>
          <input type="color" class="waymark-custom-input waymark-custom-input--2"
                 value="${this._getColor2()}">
          <button class="waymark-color-reset waymark-color-reset--2" title="Reset to theme default">↺</button>
        </div>
      </div>` : ""}
    `;

    return panel;
  }

  // ─── Apply theme vars ─────────────────────────────────────────────────────

  _applyThemeVars() {
    const { key, def } = this._getTheme();
    const el = this.element;
    // Update theme class
    el.className = el.className.replace(/waymark-theme-\S+/, `waymark-theme-${key}`);
    def.applyColors(el, this._getColor1(), this._getColor2());
    const fontOverride = game.settings.get("waymarks", "themeFont") || "";
    el.style.setProperty("--wm-font", `"${fontOverride || def.font}", sans-serif`);
    // Update color dot
    this._els.colorBtn.style.backgroundColor = this._getColor1();
  }

  // ─── Sync ────────────────────────────────────────────────────────────────

  sync(note) {
    const localX = this._note.x, localY = this._note.y;
    const localW = this._note.width, localH = this._note.height;
    this._note = { ...note, x: localX, y: localY, width: localW, height: localH };

    this._applyThemeVars();

    const { fontLabel, pinBtn, textarea } = this._els;
    fontLabel.textContent = String(note.fontSize || 24);
    pinBtn.classList.toggle("waymark-pin-btn--active", !!note.sceneId);
    pinBtn.title = note.sceneId ? "Unpin from scene" : "Pin to current scene";
    this._els.pinLabel.textContent = note.sceneId
      ? (game.scenes.get(note.sceneId) ? game.scenes.get(note.sceneId).name : "Unknown Scene") : "";

    const isTyping = document.activeElement === textarea;
    if (!isTyping) textarea.value = note.content;
    textarea.style.fontSize = `${note.fontSize || 24}px`;
  }

  // ─── Listeners ───────────────────────────────────────────────────────────

  _attachListeners() {
    const { header, colorBtn, pickerPanel, fontDown, fontUp,
            pinBtn, syncBtn, collapseBtn, sendBtn, permsBtn, deleteBtn, textarea, resizeHandle } = this._els;
    const el = this.element;

    // Capture phase so this fires before any child listener calls stopPropagation
    el.addEventListener("mousedown", () => this._bringToFront(), true);

    header.addEventListener("mousedown", (e) => {
      if (e.target.closest("button, input")) return;
      e.stopPropagation();
      this._onDragStart(e);
    });

    header.addEventListener("dblclick", (e) => {
      if (e.target.closest("button, input")) return;
      this._toggleCollapse();
    });

    // ── Color button ──────────────────────────────────────────────────────
    colorBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this._pickerOpen ? this._closePicker() : this._openPicker();
    });

    // Swatches (primary slot=1, secondary slot=2)
    pickerPanel.querySelectorAll(".waymark-swatch").forEach((swatch) => {
      swatch.addEventListener("click", (e) => {
        e.stopPropagation();
        const slot = swatch.dataset.slot;
        if (slot === "2") this._applyColor2(swatch.dataset.color);
        else              this._applyColor1(swatch.dataset.color);
      });
    });

    // Custom color inputs
    const ci1 = pickerPanel.querySelector(".waymark-custom-input--1");
    if (ci1) {
      ci1.addEventListener("input",     (e) => this._applyColor1(e.target.value));
      ci1.addEventListener("change",    (e) => this._applyColor1(e.target.value));
      ci1.addEventListener("mousedown", (e) => e.stopPropagation());
    }
    const ci2 = pickerPanel.querySelector(".waymark-custom-input--2");
    if (ci2) {
      ci2.addEventListener("input",     (e) => this._applyColor2(e.target.value));
      ci2.addEventListener("change",    (e) => this._applyColor2(e.target.value));
      ci2.addEventListener("mousedown", (e) => e.stopPropagation());
    }

    // Reset buttons — clears per-note override, falls back to world default
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

    // ── Font size ─────────────────────────────────────────────────────────
    const MIN_FONT = 10, MAX_FONT = 32;
    fontDown.addEventListener("click", (e) => {
      e.stopPropagation();
      this._applyFontSize(Math.max(MIN_FONT, (this._note.fontSize || 24) - 1));
    });
    fontUp.addEventListener("click", (e) => {
      e.stopPropagation();
      this._applyFontSize(Math.min(MAX_FONT, (this._note.fontSize || 24) + 1));
    });

    // ── Pin ───────────────────────────────────────────────────────────────
    pinBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this._note.sceneId ? this._onUnpin(this._note.id) : this._onPin(this._note.id);
    });

    // ── Sync ─────────────────────────────────────────────────────────────
    syncBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (this._onSync) this._onSync();
    });

    // ── Send to GM ────────────────────────────────────────────────────────
    sendBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (this._onSendToGM) this._onSendToGM(this._note.id);
    });

    // ── Permissions ───────────────────────────────────────────────────────
    permsBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      console.log("Waymarks | permsBtn clicked, _onPermissions=", !!this._onPermissions);
      if (this._onPermissions) this._onPermissions(this._note.id);
    });

    // ── Collapse ──────────────────────────────────────────────────────────
    collapseBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this._toggleCollapse();
    });

    // ── Delete / Dismiss ──────────────────────────────────────────────────
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (this._canDelete) {
        if (this._deletePending) return;
        this._confirmDelete();
      } else if (this._canDismiss) {
        this._onDismiss(this._note.id);
      }
    });

    // ── Textarea ──────────────────────────────────────────────────────────
    textarea.addEventListener("blur", () => {
      const val = textarea.value;
      if (val !== this._note.content) {
        this._note.content = val;
        this._onUpdate(this._note.id, { content: val });
      }
    });
    textarea.addEventListener("mousedown", (e) => e.stopPropagation());

    // ── Resize ────────────────────────────────────────────────────────────
    resizeHandle.addEventListener("mousedown", (e) => this._onResizeStart(e));
  }

  // ─── Picker ──────────────────────────────────────────────────────────────

  _openPicker() {
    this._els.pickerPanel.classList.remove("waymark-color-panel--hidden");
    this._pickerOpen = true;
  }

  _closePicker() {
    this._els.pickerPanel.classList.add("waymark-color-panel--hidden");
    this._pickerOpen = false;
  }

  // ─── Z-index ─────────────────────────────────────────────────────────────

  _bringToFront() {
    this.element.style.zIndex = String(_nextZ());
  }

  // ─── Color ───────────────────────────────────────────────────────────────

  _applyColor1(hex) {
    this._note.color = hex;
    this._applyThemeVars();
    this._onUpdate(this._note.id, { color: hex });
  }

  _applyColor2(hex) {
    this._note.color2 = hex;
    this._applyThemeVars();
    this._onUpdate(this._note.id, { color2: hex });
  }

  // ─── Font size ───────────────────────────────────────────────────────────

  _applyFontSize(size) {
    this._note.fontSize = size;
    this._els.textarea.style.fontSize = `${size}px`;
    this._els.fontLabel.textContent   = String(size);
    this._onUpdate(this._note.id, { fontSize: size });
  }

  // ─── Collapse ────────────────────────────────────────────────────────────

  _toggleCollapse() {
    const collapsed = !this._note.collapsed;
    this._note.collapsed = collapsed;
    this.element.classList.toggle("waymark-note--collapsed", collapsed);
    this._els.collapseBtn.textContent = collapsed ? "▼" : "▲";
    this._els.collapseBtn.title       = collapsed ? "Expand" : "Collapse";
    this._onUpdate(this._note.id, { collapsed });
  }

  // ─── Delete ──────────────────────────────────────────────────────────────

  async _confirmDelete() {
    this._deletePending = true;
    try {
      const confirmed = await new Promise(resolve => {
        const d = new Dialog({
          title: "Delete Waymark",
          content: "<p>Delete this waymark? This cannot be undone.</p>",
          buttons: {
            yes: { icon: '<i class="fas fa-check"></i>', label: "Delete",  callback: () => resolve(true)  },
            no:  { icon: '<i class="fas fa-times"></i>', label: "Cancel",  callback: () => resolve(false), default: true },
          },
          default: "no",
          close: () => resolve(false),
        }, { zIndex: 9999999 });
        d.render(true);
      });
      if (confirmed) this._onDelete(this._note.id);
    } finally {
      this._deletePending = false;
    }
  }

  // ─── Drag ────────────────────────────────────────────────────────────────

  _onDragStart(e) {
    if (e.button !== 0) return;
    e.preventDefault();

    const startX = e.clientX - this._note.x;
    const startY = e.clientY - this._note.y;

    const onMove = (ev) => {
      this._note.x = ev.clientX - startX;
      this._note.y = ev.clientY - startY;
      this.element.style.left = `${this._note.x}px`;
      this.element.style.top  = `${this._note.y}px`;
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup",   onUp);
      this._onUpdateLocal(this._note.id, { x: this._note.x, y: this._note.y });
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup",   onUp);
  }

  // ─── Resize ──────────────────────────────────────────────────────────────

  _onResizeStart(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX, startY = e.clientY;
    const startW = this._note.width, startH = this._note.height;
    const MIN = 200;

    const onMove = (ev) => {
      this._note.width  = Math.max(MIN, startW + (ev.clientX - startX));
      this._note.height = Math.max(MIN, startH + (ev.clientY - startY));
      this.element.style.width  = `${this._note.width}px`;
      this.element.style.height = `${this._note.height}px`;
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup",   onUp);
      this._onUpdateLocal(this._note.id, { width: this._note.width, height: this._note.height });
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup",   onUp);
  }

  // ─── Teardown ────────────────────────────────────────────────────────────

  destroy() {
    this.element.remove();
  }
}
