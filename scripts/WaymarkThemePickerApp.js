/**
 * WaymarkThemePickerApp
 * Theme grid + live preview panel with color/font controls.
 */
import { THEMES } from "./WaymarkThemes.js";

const MODULE_ID = "waymarks";

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

export class WaymarkThemePickerApp extends FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id:        "waymark-theme-picker",
      title:     "Waymarks — Note Style",
      template:  `modules/${MODULE_ID}/templates/theme-picker.html`,
      width:     820,
      height:    "auto",
      resizable: true,
      closeOnSubmit: true,
    });
  }

  getData() {
    const currentTheme  = game.settings.get(MODULE_ID, "theme")            || "sticky";
    const savedColor1   = game.settings.get(MODULE_ID, "themeColor1")      || "";
    const savedColor2   = game.settings.get(MODULE_ID, "themeColor2")      || "";
    const colorOwner    = game.settings.get(MODULE_ID, "themeColorOwner")  || "";
    const currentFont   = game.settings.get(MODULE_ID, "themeFont")        || "";

    // Only use saved colors if they were saved for this theme — otherwise they're
    // stale leftovers from whichever theme was active before (e.g. green from Terminal).
    const colorsAreStale = colorOwner && colorOwner !== currentTheme;
    const currentColor1 = colorsAreStale ? "" : savedColor1;
    const currentColor2 = colorsAreStale ? "" : savedColor2;

    const themes = Object.entries(THEMES).map(([key, def]) => {
      const c1 = (currentTheme === key && currentColor1) ? currentColor1 : def.defaultPrimary;
      const c2 = (currentTheme === key && currentColor2) ? currentColor2 : (def.defaultSecondary || "");
      return {
        key,
        label:            def.label,
        font:             def.font,
        colorCount:       def.colorCount,
        primaryLabel:     (def.primaryLabel || "Primary Color"),
        secondaryLabel:   (def.secondaryLabel || "Secondary Color"),
        defaultPrimary:   def.defaultPrimary,
        defaultSecondary: (def.defaultSecondary || ""),
        color1: c1,
        color2: c2,
        selected: key === currentTheme,
        cssVarsStyle: _cssVarsInline(def, c1, c2),
      };
    });

    // Selected theme data for the live panel
    const selDef = THEMES[currentTheme] || THEMES.sticky;
    const selC1  = (currentColor1 || selDef.defaultPrimary);
    const selC2  = (currentColor2 || selDef.defaultSecondary || "");

    return {
      themes,
      currentTheme,
      currentColor1: selC1,
      currentColor2: selC2,
      currentFont,
      selDef: {
        key:            currentTheme,
        label:          selDef.label,
        colorCount:     selDef.colorCount,
        primaryLabel:   (selDef.primaryLabel || "Primary Color"),
        secondaryLabel: (selDef.secondaryLabel || "Secondary Color"),
        defaultPrimary:   selDef.defaultPrimary,
        defaultSecondary: (selDef.defaultSecondary || ""),
        cssVarsStyle: _cssVarsInline(selDef, selC1, selC2),
      },
      fonts: FONTS,
      currentFontOrTheme: currentFont || selDef.font,
    };
  }

  activateListeners(html) {
    super.activateListeners(html);

    // Inject Google Fonts link if not already present
    if (!document.getElementById("wm-gfonts")) {
      const link = document.createElement("link");
      link.id   = "wm-gfonts";
      link.rel  = "stylesheet";
      link.href = GFONTS_URL;
      document.head.appendChild(link);
    }

    // Inject shadowdark corner divs into any preview notes that need them
    html.find(".waymark-theme-shadowdark").each((_, el) => {
      if (!el.querySelector(".wm-corner-bl")) {
        const bl = document.createElement("div"); bl.className = "wm-corner-bl";
        const br = document.createElement("div"); br.className = "wm-corner-br";
        el.append(bl, br);
      }
    });

    // Render font options in their own typeface
    html.find(".wm-font-option").each((_, opt) => {
      opt.style.fontFamily = `"${opt.value}", sans-serif`;
    });

    // Theme card click → reset live panel to that theme's defaults
    html.find(".wm-theme-card").on("click", (e) => {
      const card = e.currentTarget;
      html.find(".wm-theme-card").removeClass("wm-theme-card--selected");
      card.classList.add("wm-theme-card--selected");

      const key = card.dataset.theme;
      const def = THEMES[key];
      if (!def) return;

      html.find("[name=theme]").val(key);

      // Reset controls to theme defaults
      html.find("[name=themeColor1]").val(def.defaultPrimary);
      html.find("[name=themeColor2]").val(def.defaultSecondary || "");
      html.find("[name=themeFont]").val("");

      // Update label text
      html.find(".wm-live-primary-label").text(def.primaryLabel || "Primary Color");
      html.find(".wm-live-secondary-label").text(def.secondaryLabel || "Secondary Color");

      // Show/hide secondary swatch
      if (def.colorCount === 2) html.find(".wm-live-color2-group").show();
      else html.find(".wm-live-color2-group").hide();

      // Update panel header label
      html.find(".wm-live-theme-name").text(def.label);

      this._updateLivePreview(html, key, def.defaultPrimary, def.defaultSecondary || "", def.font);
    });

    // Color / font change → update live preview only (don't touch the grid cards)
    html.find("[name=themeColor1], [name=themeColor2], [name=themeFont]").on("input change", () => {
      this._refreshLiveFromControls(html);
    });

    // Reset to Defaults → restore current theme's default colors and font
    html.find(".wm-reset-btn").on("click", (e) => {
      e.preventDefault();
      const key = html.find("[name=theme]").val();
      const def = THEMES[key];
      if (!def) return;
      html.find("[name=themeColor1]").val(def.defaultPrimary);
      html.find("[name=themeColor2]").val(def.defaultSecondary || "");
      html.find("[name=themeFont]").val("");
      this._updateLivePreview(html, key, def.defaultPrimary, def.defaultSecondary || "", def.font);
    });

    // Init secondary visibility
    const initKey = html.find("[name=theme]").val();
    const initDef = THEMES[initKey];
    if (initDef && initDef.colorCount !== 2) html.find(".wm-live-color2-group").hide();
  }

  _refreshLiveFromControls(html) {
    const key  = html.find("[name=theme]").val();
    const def  = THEMES[key];
    if (!def) return;
    const c1   = html.find("[name=themeColor1]").val() || def.defaultPrimary;
    const c2   = html.find("[name=themeColor2]").val() || (def.defaultSecondary || "");
    const font = html.find("[name=themeFont]").val()   || def.font;
    this._updateLivePreview(html, key, c1, c2, font);
  }

  _updateLivePreview(html, key, c1, c2, font) {
    const def     = THEMES[key];
    const preview = html.find(".wm-live-preview-note")[0];
    if (!preview || !def) return;

    // Set class for theme
    preview.className = preview.className.replace(/waymark-theme-\S+/g, "").trim();
    preview.classList.add(`waymark-theme-${key}`, "wm-live-preview-note");

    // Inject/remove shadowdark corner divs
    preview.querySelectorAll(".wm-corner-bl, .wm-corner-br").forEach(e => e.remove());
    if (key === "shadowdark") {
      const bl = document.createElement("div"); bl.className = "wm-corner-bl";
      const br = document.createElement("div"); br.className = "wm-corner-br";
      preview.append(bl, br);
    }

    // Apply CSS vars
    const vars = _buildCssVars(def, c1, c2);
    for (const [k, v] of Object.entries(vars)) preview.style.setProperty(k, v);
    preview.style.setProperty("--wm-font", `"${font}", sans-serif`);
    preview.style.fontFamily = `"${font}", sans-serif`;

    // Update content font too
    const content = preview.querySelector(".waymark-content");
    if (content) content.style.fontFamily = `"${font}", sans-serif`;
  }

  async _updateObject(event, formData) {
    const theme = formData.theme || "sticky";
    await game.settings.set(MODULE_ID, "theme",           theme);
    await game.settings.set(MODULE_ID, "themeColor1",     formData.themeColor1 || "");
    await game.settings.set(MODULE_ID, "themeColor2",     formData.themeColor2 || "");
    await game.settings.set(MODULE_ID, "themeFont",       formData.themeFont   || "");
    // Record which theme these colors belong to so stale colors from a previous
    // theme don't bleed into a newly-selected one.
    await game.settings.set(MODULE_ID, "themeColorOwner", theme);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function _buildCssVars(def, c1, c2) {
  // Use a temp element so each theme's applyColors runs its own logic
  // (terminal/neon compute near-black from glow color, etc.)
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

function _hex(hex) {
  const h = hex.replace("#","");
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}
function _toHex([r,g,b]) {
  return "#"+[r,g,b].map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,"0")).join("");
}
function _darken(hex,f)   { try { return _toHex(_hex(hex).map(v=>v*(1-f))); } catch { return hex; } }
function _brighten(hex,f) { try { return _toHex(_hex(hex).map(v=>v+(255-v)*Math.min(1,f-1))); } catch { return hex; } }
function _tint(hex,a)     { try { return _toHex(_hex(hex).map(v=>Math.round(v*a+255*(1-a)))); } catch { return hex; } }
