/**
 * WaymarkThemePickerApp
 * Theme grid + live preview panel with color/font controls.
 * ApplicationV2 with HandlebarsApplicationMixin.
 */
import { THEMES, _hex, _toHex, _darken, _brighten, _tint } from "./WaymarkThemes.js";

const MODULE_ID = "waymarks";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

// All fonts — names rendered in their own face in the dropdown
const FONTS = [
  "Amatic SC",
  "Caveat",
  "Cinzel",
  "Courier Prime",
  "Crimson Text",
  "EB Garamond",
  "Exo 2",
  "IM Fell English",
  "Josefin Sans",
  "Libre Baskerville",
  "Lora",
  "Patrick Hand",
  "Permanent Marker",
  "Playfair Display",
  "Satisfy",
  "Share Tech Mono",
  "Special Elite",
  "Spectral",
  "Teko",
  "Uncial Antiqua",
];

// Google Fonts URL covering the selected fonts
const GFONTS_URL = "https://fonts.googleapis.com/css2?family=Amatic+SC:wght@400;700&family=Caveat:wght@400;600&family=Cinzel:wght@400;700&family=Courier+Prime&family=Crimson+Text:ital,wght@0,400;0,600;1,400&family=EB+Garamond:ital,wght@0,400;0,600;1,400&family=Exo+2:wght@400;600&family=IM+Fell+English&family=Josefin+Sans:wght@400;600&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=Lora:ital,wght@0,400;0,600;1,400&family=Patrick+Hand&family=Permanent+Marker&family=Playfair+Display:wght@400;700&family=Satisfy&family=Share+Tech+Mono&family=Special+Elite&family=Spectral:ital,wght@0,400;0,600;1,400&family=Teko:wght@400;600&family=Uncial+Antiqua&display=swap";

export class WaymarkThemePickerApp extends HandlebarsApplicationMixin(ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id: "waymark-theme-picker",
    tag: "form",
    form: {
      handler: WaymarkThemePickerApp.#onSubmitForm,
      closeOnSubmit: true,
      submitOnChange: false,
    },
    position: {
      width: 820,
      height: "auto",
    },
    window: {
      title: game.i18n.localize("WAYMARKS.Settings.ThemePickerName"),
      resizable: true,
    },
  };

  static PARTS = {
    form: {
      template: `modules/${MODULE_ID}/templates/theme-picker.html`,
    },
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    const currentTheme = game.settings.get(MODULE_ID, "theme")            || "sticky";
    const savedColor1 = game.settings.get(MODULE_ID, "themeColor1")      || "";
    const savedColor2 = game.settings.get(MODULE_ID, "themeColor2")      || "";
    const colorOwner = game.settings.get(MODULE_ID, "themeColorOwner")  || "";
    const currentFont = game.settings.get(MODULE_ID, "themeFont")        || "";

    const colorsAreStale = colorOwner && colorOwner !== currentTheme;
    const currentColor1 = colorsAreStale ? "" : savedColor1;
    const currentColor2 = colorsAreStale ? "" : savedColor2;

    const themes = Object.entries(THEMES).map(([key, def]) => {
      const c1 = (currentTheme === key && currentColor1) ? currentColor1 : def.defaultPrimary;
      const c2 = (currentTheme === key && currentColor2) ? currentColor2 : (def.defaultSecondary || "");
      return {
        key,
        label: game.i18n.localize(def.label),
        font: def.font,
        colorCount: def.colorCount,
        primaryLabel: game.i18n.localize(def.primaryLabel || "WAYMARKS.Picker.Custom"),
        secondaryLabel: game.i18n.localize(def.secondaryLabel || "WAYMARKS.Picker.Custom"),
        defaultPrimary: def.defaultPrimary,
        defaultSecondary: (def.defaultSecondary || ""),
        color1: c1,
        color2: c2,
        selected: key === currentTheme,
        cssVarsStyle: _cssVarsInline(def, c1, c2),
      };
    });

    const selDef = THEMES[currentTheme] || THEMES.sticky;
    const selC1 = (currentColor1 || selDef.defaultPrimary);
    const selC2 = (currentColor2 || selDef.defaultSecondary || "");

    return {
      ...context,
      themes,
      currentTheme,
      currentColor1: selC1,
      currentColor2: selC2,
      currentFont,
      selDef: {
        key: currentTheme,
        label: game.i18n.localize(selDef.label),
        colorCount: selDef.colorCount,
        primaryLabel: game.i18n.localize(selDef.primaryLabel || "WAYMARKS.Picker.Custom"),
        secondaryLabel: game.i18n.localize(selDef.secondaryLabel || "WAYMARKS.Picker.Custom"),
        defaultPrimary: selDef.defaultPrimary,
        defaultSecondary: (selDef.defaultSecondary || ""),
        cssVarsStyle: _cssVarsInline(selDef, selC1, selC2),
      },
      // Build {value: label} map for selectOptions — values equal labels for fonts
      fontChoices: Object.fromEntries(FONTS.map(f => [f, f])),
      currentFontOrTheme: currentFont || selDef.font,
    };
  }

  _onRender(context, options) {
    const html = this.element;

    // Inject Google Fonts link if not already present
    if (!document.getElementById("wm-gfonts")) {
      const link = document.createElement("link");
      link.id = "wm-gfonts";
      link.rel = "stylesheet";
      link.href = GFONTS_URL;
      document.head.appendChild(link);
    }

    // Inject shadowdark corner divs into preview notes that need them
    html.querySelectorAll(".waymark-theme-shadowdark").forEach(el => {
      if (!el.querySelector(".wm-corner-bl")) {
        const bl = document.createElement("div"); bl.className = "wm-corner-bl";
        const br = document.createElement("div"); br.className = "wm-corner-br";
        el.append(bl, br);
      }
    });

    // Apply each font option's own typeface to itself so the dropdown
    // shows a preview of each font. selectOptions generates standard
    // <option> elements — we style them by matching value to font name.
    html.querySelectorAll(".wm-font-select option").forEach(opt => {
      if (opt.value) opt.style.fontFamily = `"${opt.value}", sans-serif`;
    });

    // Theme card click → reset live panel to that theme's defaults
    html.querySelectorAll(".wm-theme-card").forEach(card => {
      card.addEventListener("click", () => {
        html.querySelectorAll(".wm-theme-card").forEach(c => c.classList.remove("wm-theme-card--selected"));
        card.classList.add("wm-theme-card--selected");

        const key = card.dataset.theme;
        const def = THEMES[key];
        if (!def) return;

        html.querySelector("[name=theme]").value = key;
        html.querySelector("[name=themeColor1]").value = def.defaultPrimary;
        html.querySelector("[name=themeColor2]").value = def.defaultSecondary || "";
        html.querySelector("[name=themeFont]").value = "";

        const primaryLabel = html.querySelector(".wm-live-primary-label");
        const secondaryLabel = html.querySelector(".wm-live-secondary-label");
        if (primaryLabel) primaryLabel.textContent = game.i18n.localize(def.primaryLabel || "WAYMARKS.Picker.Custom");
        if (secondaryLabel) secondaryLabel.textContent = game.i18n.localize(def.secondaryLabel || "WAYMARKS.Picker.Custom");

        const color2Group = html.querySelector(".wm-live-color2-group");
        if (color2Group) color2Group.style.display = def.colorCount === 2 ? "" : "none";

        const themeName = html.querySelector(".wm-live-theme-name");
        if (themeName) themeName.textContent = game.i18n.localize(def.label);

        this._updateLivePreview(html, key, def.defaultPrimary, def.defaultSecondary || "", def.font);
      });
    });

    // Color / font change → update live preview
    ["[name=themeColor1]", "[name=themeColor2]", "[name=themeFont]"].forEach(sel => {
      html.querySelector(sel)?.addEventListener("input",  () => this._refreshLiveFromControls(html));
      html.querySelector(sel)?.addEventListener("change", () => this._refreshLiveFromControls(html));
    });

    // Reset to Defaults
    html.querySelector(".wm-reset-btn")?.addEventListener("click", (e) => {
      e.preventDefault();
      const key = html.querySelector("[name=theme]").value;
      const def = THEMES[key];
      if (!def) return;
      html.querySelector("[name=themeColor1]").value = def.defaultPrimary;
      html.querySelector("[name=themeColor2]").value = def.defaultSecondary || "";
      html.querySelector("[name=themeFont]").value = "";
      this._updateLivePreview(html, key, def.defaultPrimary, def.defaultSecondary || "", def.font);
    });

    // Init secondary color visibility
    const initKey = html.querySelector("[name=theme]")?.value;
    const initDef = THEMES[initKey];
    const color2Group = html.querySelector(".wm-live-color2-group");
    if (initDef && color2Group) {
      color2Group.style.display = initDef.colorCount !== 2 ? "none" : "";
    }
  }

  _refreshLiveFromControls(html) {
    const key = html.querySelector("[name=theme]").value;
    const def = THEMES[key];
    if (!def) return;
    const c1 = html.querySelector("[name=themeColor1]").value || def.defaultPrimary;
    const c2 = html.querySelector("[name=themeColor2]").value || (def.defaultSecondary || "");
    const font = html.querySelector("[name=themeFont]").value   || def.font;
    this._updateLivePreview(html, key, c1, c2, font);
  }

  _updateLivePreview(html, key, c1, c2, font) {
    const def = THEMES[key];
    const preview = html.querySelector(".wm-live-preview-note");
    if (!preview || !def) return;

    preview.className = preview.className.replace(/waymark-theme-\S+/g, "").trim();
    preview.classList.add(`waymark-theme-${key}`, "wm-live-preview-note");

    preview.querySelectorAll(".wm-corner-bl, .wm-corner-br").forEach(e => e.remove());
    if (key === "shadowdark") {
      const bl = document.createElement("div"); bl.className = "wm-corner-bl";
      const br = document.createElement("div"); br.className = "wm-corner-br";
      preview.append(bl, br);
    }

    const vars = _buildCssVars(def, c1, c2);
    for (const [k, v] of Object.entries(vars)) preview.style.setProperty(k, v);
    preview.style.setProperty("--wm-font", `"${font}", sans-serif`);
    preview.style.fontFamily = `"${font}", sans-serif`;

    const content = preview.querySelector(".waymark-content");
    if (content) content.style.fontFamily = `"${font}", sans-serif`;
  }

  /**
   * @this {WaymarkThemePickerApp}
   */
  static async #onSubmitForm(event, form, formData) {
    event.preventDefault();
    const data = formData.object;
    const theme = data.theme || "sticky";
    await game.settings.set(MODULE_ID, "theme",           theme);
    await game.settings.set(MODULE_ID, "themeColor1",     data.themeColor1 || "");
    await game.settings.set(MODULE_ID, "themeColor2",     data.themeColor2 || "");
    await game.settings.set(MODULE_ID, "themeFont",       data.themeFont   || "");
    await game.settings.set(MODULE_ID, "themeColorOwner", theme);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function _buildCssVars(def, c1, c2) {
  const tmp = document.createElement("div");
  def.applyColors(tmp, c1, c2 || "");
  const vars = {};
  const PROPS = ["--wm-color1","--wm-color2","--wm-color1-dark","--wm-color1-bright","--wm-text"];
  for (const p of PROPS) {
    const v = tmp.style.getPropertyValue(p);
    if (v) vars[p] = v;
  }
  if (!vars["--wm-color1"]) vars["--wm-color1"] = c1;
  vars["--wm-font"] = `"${def.font}", sans-serif`;
  return vars;
}

function _cssVarsInline(def, c1, c2) {
  return Object.entries(_buildCssVars(def, c1, c2)).map(([k,v]) => `${k}:${v}`).join(";");
}
