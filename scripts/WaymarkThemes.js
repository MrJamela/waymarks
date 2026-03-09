/**
 * WaymarkThemes
 *
 * Defines all themes: their CSS class, preset colors, font, and
 * which color roles they use (primary only vs primary + secondary).
 *
 * Each theme declares a `applyColors(el, primary, secondary)` function
 * that sets CSS variables on the note element. The CSS then uses those
 * variables to paint the correct parts of the note.
 */

export const THEMES = {
  sticky: {
    label:       "Sticky Note",
    font:        "Patrick Hand",
    colorCount:  1,
    primaryLabel:   "Note Color",
    defaultPrimary: "#fef08a",
    applyColors(el, primary) {
      el.style.setProperty("--wm-color1", primary);
    },
  },

  indexcard: {
    label:       "Index Card",
    font:        "Courier Prime",
    colorCount:  1,
    primaryLabel:   "Header Color",
    defaultPrimary: "#c0392b",
    applyColors(el, primary) {
      el.style.setProperty("--wm-color1", primary);
    },
  },

  chalkboard: {
    label:       "Chalkboard",
    font:        "Patrick Hand",
    colorCount:  2,
    primaryLabel:   "Frame Color",
    secondaryLabel: "Board Color",
    defaultPrimary:   "#5a3e2b",
    defaultSecondary: "#2d4a3e",
    applyColors(el, primary, secondary) {
      el.style.setProperty("--wm-color1", primary);
      el.style.setProperty("--wm-color2", secondary);
    },
  },

  terminal: {
    label:       "Terminal",
    font:        "Share Tech Mono",
    colorCount:  1,
    primaryLabel:   "Glow Color",
    defaultPrimary: "#00ff41",
    applyColors(el, primary) {
      el.style.setProperty("--wm-color1", primary);
      // Always near-black background — just tint it very slightly with the glow color
      const [r,g,b] = _hex(primary);
      const bg = _toHex([Math.round(10 + r*0.03), Math.round(10 + g*0.03), Math.round(10 + b*0.03)]);
      el.style.setProperty("--wm-color1-dark", bg);
    },
  },

  neon: {
    label:       "Neon",
    font:        "Share Tech Mono",
    colorCount:  1,
    primaryLabel:   "Neon Color",
    defaultPrimary: "#b400ff",
    applyColors(el, primary) {
      el.style.setProperty("--wm-color1", primary);
      const [r,g,b] = _hex(primary);
      const bg = _toHex([Math.round(13 + r*0.03), Math.round(13 + g*0.03), Math.round(13 + b*0.03)]);
      el.style.setProperty("--wm-color1-dark", bg);
    },
  },

  classified: {
    label:       "Classified",
    font:        "Share Tech Mono",
    colorCount:  1,
    primaryLabel:   "Accent Color",
    defaultPrimary: "#cc0000",
    applyColors(el, primary) {
      el.style.setProperty("--wm-color1", primary);
    },
  },

  tavern: {
    label:       "Tavern Notice",
    font:        "Uncial Antiqua",
    colorCount:  2,
    primaryLabel:   "Parchment Color",
    secondaryLabel: "Wood Color",
    defaultPrimary:   "#e8d5b0",
    defaultSecondary: "#4a3120",
    applyColors(el, primary, secondary) {
      el.style.setProperty("--wm-color1", primary);
      el.style.setProperty("--wm-color1-dark", _darken(primary, 0.15));
      el.style.setProperty("--wm-color2", secondary);
    },
  },

  stone: {
    label:       "Stone Tablet",
    font:        "Cinzel",
    colorCount:  2,
    primaryLabel:   "Text Color",
    secondaryLabel: "Stone Color",
    defaultPrimary:   "#d4c4a8",
    defaultSecondary: "#6b6560",
    applyColors(el, primary, secondary) {
      el.style.setProperty("--wm-color1", primary);
      el.style.setProperty("--wm-color2", secondary);
    },
  },

  shadowdark: {
    label:       "Shadowdark",
    font:        "Cinzel",
    colorCount:  2,
    primaryLabel:   "Ink / Border Color",
    secondaryLabel: "Background Color",
    defaultPrimary:   "#cccccc",
    defaultSecondary: "#0a0a0a",
    applyColors(el, primary, secondary) {
      el.style.setProperty("--wm-color1", primary);
      el.style.setProperty("--wm-color2", secondary);
    },
  },

  dh_teal: {
    label:       "Daggerheart — Teal",
    font:        "Josefin Sans",
    colorCount:  2,
    primaryLabel:   "Border / Glow",
    secondaryLabel: "Background",
    defaultPrimary:   "#2a8a9a",
    defaultSecondary: "#1a2035",
    applyColors(el, primary, secondary) {
      el.style.setProperty("--wm-color1", primary);
      el.style.setProperty("--wm-color1-bright", _brighten(primary, 1.4));
      el.style.setProperty("--wm-color2", secondary);
      el.style.setProperty("--wm-text", _tint(primary, 0.6));
    },
  },

  dh_gold: {
    label:       "Daggerheart — Gold",
    font:        "Josefin Sans",
    colorCount:  2,
    primaryLabel:   "Border / Glow",
    secondaryLabel: "Background",
    defaultPrimary:   "#c9a227",
    defaultSecondary: "#1e1a2e",
    applyColors(el, primary, secondary) {
      el.style.setProperty("--wm-color1", primary);
      el.style.setProperty("--wm-color1-bright", _brighten(primary, 1.4));
      el.style.setProperty("--wm-color2", secondary);
      el.style.setProperty("--wm-text", _tint(primary, 0.6));
    },
  },

  dh_despair: {
    label:       "Daggerheart — Despair",
    font:        "Josefin Sans",
    colorCount:  2,
    primaryLabel:   "Border / Glow",
    secondaryLabel: "Background",
    defaultPrimary:   "#8a3a5a",
    defaultSecondary: "#1a1520",
    applyColors(el, primary, secondary) {
      el.style.setProperty("--wm-color1", primary);
      el.style.setProperty("--wm-color1-bright", _brighten(primary, 1.6));
      el.style.setProperty("--wm-color2", secondary);
      el.style.setProperty("--wm-text", _tint(primary, 0.65));
    },
  },
};

// ─── Color math helpers ───────────────────────────────────────────────────────

/** Parse hex → [r,g,b] 0-255 */
function _hex(hex) {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0,2),16),
    parseInt(h.slice(2,4),16),
    parseInt(h.slice(4,6),16),
  ];
}

/** [r,g,b] → hex */
function _toHex([r,g,b]) {
  return "#" + [r,g,b].map(v => Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,"0")).join("");
}

/** Mix hex color with near-black at low alpha to produce a dark tinted background */
function _nearBlack(hex, tint) {
  return _toHex(_hex(hex).map(v => Math.round(v * tint)));
}

/** Darken toward black by factor (0=unchanged, 1=black) */
function _darken(hex, factor) {
  return _toHex(_hex(hex).map(v => v * (1 - factor)));
}

/** Brighten toward white */
function _brighten(hex, factor) {
  return _toHex(_hex(hex).map(v => v + (255 - v) * Math.min(1, factor - 1)));
}

/** Mix hex color with white at `alpha` (0=white, 1=full color) — produces a tint */
function _tint(hex, alpha) {
  return _toHex(_hex(hex).map(v => Math.round(v * alpha + 255 * (1 - alpha))));
}
