/**
 * WaymarkThemes
 *
 * The single source of truth for all visual themes. Each theme is an object
 * that describes how it looks and how to apply its colors to a note element.
 *
 * How theming works:
 *   1. The user picks a theme in the Theme Picker.
 *   2. The theme key (e.g. "sticky") is saved as a world setting.
 *   3. When a note is rendered, WaymarkElement calls applyColors() on the
 *      theme object, which writes CSS variables onto the note's DOM element.
 *   4. The CSS stylesheet reads those variables (--wm-color1, --wm-color2, etc.)
 *      and uses them to paint backgrounds, borders, text, and glows.
 *
 * Each theme object has these fields:
 *   label          — display name shown in the Theme Picker
 *   font           — default Google Font for this theme
 *   colorCount     — 1 if the theme has one color picker, 2 if it has two
 *   primaryLabel   — what to call the first color in the UI (e.g. "Board Color")
 *   secondaryLabel — what to call the second color (only for colorCount: 2)
 *   defaultPrimary / defaultSecondary — the out-of-the-box color values
 *   applyColors()  — sets CSS variables on the note element
 */

export const THEMES = {

  // ─── 1. Sticky Note ────────────────────────────────────────────────────────
  // Classic yellow sticky note. One color: the note body background.
  sticky: {
    label: "WAYMARKS.Theme.Sticky",
    font:           "Patrick Hand",
    colorCount:     1,
    primaryLabel: "WAYMARKS.Theme.PrimaryLabel.NoteColor",
    defaultPrimary: "#fef08a",
    applyColors(el, primary) {
      el.style.setProperty("--wm-color1", primary);
    },
  },

  // ─── 2. Index Card ─────────────────────────────────────────────────────────
  // White card with a coloured header bar across the top.
  // One color: the header bar color.
  indexcard: {
    label: "WAYMARKS.Theme.Indexcard",
    font:           "Courier Prime",
    colorCount:     1,
    primaryLabel: "WAYMARKS.Theme.PrimaryLabel.HeaderColor",
    defaultPrimary: "#c0392b",
    applyColors(el, primary) {
      el.style.setProperty("--wm-color1", primary);
    },
  },

  // ─── 3. Chalkboard ─────────────────────────────────────────────────────────
  // A wooden-framed chalkboard. Two colors: the wooden frame and the board itself.
  chalkboard: {
    label: "WAYMARKS.Theme.Chalkboard",
    font:            "Patrick Hand",
    colorCount:      2,
    primaryLabel: "WAYMARKS.Theme.PrimaryLabel.FrameColor",
    secondaryLabel: "WAYMARKS.Theme.SecondaryLabel.BoardColor",
    defaultPrimary:   "#5a3e2b",
    defaultSecondary: "#2d4a3e",
    applyColors(el, primary, secondary) {
      el.style.setProperty("--wm-color1", primary);
      el.style.setProperty("--wm-color2", secondary);
    },
  },

  // ─── 4. Terminal ───────────────────────────────────────────────────────────
  // A hacker-style terminal with a glowing color on a near-black background.
  // One color: the glow/text color. The background is always near-black, but
  // slightly tinted with the glow color so it doesn't look completely dead.
  terminal: {
    label: "WAYMARKS.Theme.Terminal",
    font:           "Share Tech Mono",
    colorCount:     1,
    primaryLabel: "WAYMARKS.Theme.PrimaryLabel.GlowColor",
    defaultPrimary: "#00ff41",
    applyColors(el, primary) {
      el.style.setProperty("--wm-color1", primary);
      // Compute a very dark background tinted by the glow color.
      // We take each RGB channel, scale it down to near-zero, then add a small
      // fixed offset (10) so it's dark but not pure black.
      const [r,g,b] = _hex(primary);
      const bg = _toHex([Math.round(10 + r*0.03), Math.round(10 + g*0.03), Math.round(10 + b*0.03)]);
      el.style.setProperty("--wm-color1-dark", bg);
    },
  },

  // ─── 5. Neon ───────────────────────────────────────────────────────────────
  // Similar to Terminal but with a purple-hued glow and a slightly less dark
  // base background (offset 13 vs 10) to give it a slightly warmer feel.
  neon: {
    label: "WAYMARKS.Theme.Neon",
    font:           "Share Tech Mono",
    colorCount:     1,
    primaryLabel: "WAYMARKS.Theme.PrimaryLabel.NeonColor",
    defaultPrimary: "#b400ff",
    applyColors(el, primary) {
      el.style.setProperty("--wm-color1", primary);
      const [r,g,b] = _hex(primary);
      const bg = _toHex([Math.round(13 + r*0.03), Math.round(13 + g*0.03), Math.round(13 + b*0.03)]);
      el.style.setProperty("--wm-color1-dark", bg);
    },
  },

  // ─── 6. Classified ─────────────────────────────────────────────────────────
  // A government document look — off-white paper with a colored accent stripe
  // at the top and monospaced text. One color: the accent/stamp color.
  classified: {
    label: "WAYMARKS.Theme.Classified",
    font:           "Share Tech Mono",
    colorCount:     1,
    primaryLabel: "WAYMARKS.Theme.PrimaryLabel.AccentColor",
    defaultPrimary: "#cc0000",
    applyColors(el, primary) {
      el.style.setProperty("--wm-color1", primary);
    },
  },

  // ─── 7. Tavern Notice ──────────────────────────────────────────────────────
  // A notice pinned to a tavern board — parchment on dark wood.
  // Two colors: the parchment and the wood background.
  // Also computes --wm-color1-dark (a slightly darkened parchment) for the
  // header gradient so it blends into the parchment body naturally.
  tavern: {
    label: "WAYMARKS.Theme.Tavern",
    font:            "Uncial Antiqua",
    colorCount:      2,
    primaryLabel: "WAYMARKS.Theme.PrimaryLabel.ParchmentColor",
    secondaryLabel: "WAYMARKS.Theme.SecondaryLabel.WoodColor",
    defaultPrimary:   "#e8d5b0",
    defaultSecondary: "#4a3120",
    applyColors(el, primary, secondary) {
      el.style.setProperty("--wm-color1", primary);
      el.style.setProperty("--wm-color1-dark", _darken(primary, 0.15));
      el.style.setProperty("--wm-color2", secondary);
    },
  },

  // ─── 8. Stone Tablet ───────────────────────────────────────────────────────
  // Ancient carved stone. Two colors: the engraved text/ink color and
  // the stone surface itself.
  stone: {
    label: "WAYMARKS.Theme.Stone",
    font:            "Cinzel",
    colorCount:      2,
    primaryLabel: "WAYMARKS.Theme.PrimaryLabel.TextColor",
    secondaryLabel: "WAYMARKS.Theme.SecondaryLabel.StoneColor",
    defaultPrimary:   "#d4c4a8",
    defaultSecondary: "#6b6560",
    applyColors(el, primary, secondary) {
      el.style.setProperty("--wm-color1", primary);
      el.style.setProperty("--wm-color2", secondary);
    },
  },

  // ─── 9. Shadowdark ─────────────────────────────────────────────────────────
  // Stark black-and-grey aesthetic matching the Shadowdark RPG.
  // Two colors: the ink/border color and the background.
  shadowdark: {
    label: "WAYMARKS.Theme.Shadowdark",
    font:            "Cinzel",
    colorCount:      2,
    primaryLabel: "WAYMARKS.Theme.PrimaryLabel.InkBorderColor",
    secondaryLabel:  "Background Color",
    defaultPrimary:   "#cccccc",
    defaultSecondary: "#0a0a0a",
    applyColors(el, primary, secondary) {
      el.style.setProperty("--wm-color1", primary);
      el.style.setProperty("--wm-color2", secondary);
    },
  },

  // ─── 10–12. Daggerheart variants ───────────────────────────────────────────
  // Three themes styled for the Daggerheart RPG — each uses the same layout
  // but with different default colors. Two colors: the glowing border and
  // the dark background.
  //
  // These themes also compute two derived variables:
  //   --wm-color1-bright  a lighter version of the border color for highlights
  //   --wm-text           a soft tinted version of the border color for body text
  //   (so text doesn't disappear into the dark background)

  dh_teal: {
    label: "WAYMARKS.Theme.DhTeal",
    font:            "Josefin Sans",
    colorCount:      2,
    primaryLabel: "WAYMARKS.Theme.PrimaryLabel.BorderGlow",
    secondaryLabel:  "Background",
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
    label: "WAYMARKS.Theme.DhGold",
    font:            "Josefin Sans",
    colorCount:      2,
    primaryLabel: "WAYMARKS.Theme.PrimaryLabel.BorderGlow",
    secondaryLabel:  "Background",
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
    label: "WAYMARKS.Theme.DhDespair",
    font:            "Josefin Sans",
    colorCount:      2,
    primaryLabel: "WAYMARKS.Theme.PrimaryLabel.BorderGlow",
    secondaryLabel:  "Background",
    defaultPrimary:   "#8a3a5a",
    defaultSecondary: "#1a1520",
    applyColors(el, primary, secondary) {
      el.style.setProperty("--wm-color1", primary);
      // Despair uses a slightly stronger brighten (1.6 vs 1.4) because the
      // magenta hue needs more lift to read as a highlight against dark purple.
      el.style.setProperty("--wm-color1-bright", _brighten(primary, 1.6));
      el.style.setProperty("--wm-color2", secondary);
      // Slightly more saturated tint (0.65 vs 0.6) for the same reason.
      el.style.setProperty("--wm-text", _tint(primary, 0.65));
    },
  },
};

// ─── Color math helpers ───────────────────────────────────────────────────────
//
// These are small utility functions for manipulating hex color strings.
// They're used by applyColors() above to derive secondary colors from the
// user's chosen primary. They're also exported so WaymarkThemePickerApp can
// use them when building the live preview without duplicating the logic.

/**
 * Converts a hex color string like "#ff8800" into an array of three numbers
 * [r, g, b] each in the 0–255 range. This makes it easy to do math on
 * the individual color channels.
 *
 * @param {string} hex  e.g. "#ff8800"
 * @returns {[number, number, number]}
 */
export function _hex(hex) {
  // Guard against non-strings or short values that would produce NaN channels
  if (typeof hex !== "string") return [0, 0, 0];
  const h = hex.replace("#", "");
  if (h.length < 6) return [0, 0, 0];
  return [
    parseInt(h.slice(0,2), 16),
    parseInt(h.slice(2,4), 16),
    parseInt(h.slice(4,6), 16),
  ];
}

/**
 * Converts an [r, g, b] array back into a hex color string.
 * Each channel is clamped to 0–255 and zero-padded to two characters.
 *
 * @param {[number, number, number]} rgb
 * @returns {string}  e.g. "#ff8800"
 */
export function _toHex([r,g,b]) {
  return "#" + [r,g,b]
    .map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Darkens a color toward black by a given factor.
 * factor 0 = unchanged, factor 1 = pure black.
 * Used for subtle depth effects like the Tavern header gradient.
 *
 * @param {string} hex
 * @param {number} factor  0–1
 * @returns {string}
 */
export function _darken(hex, factor) {
  return _toHex(_hex(hex).map(v => v * (1 - factor)));
}

/**
 * Brightens a color toward white.
 * factor 1 = unchanged, higher values push toward white.
 * Used for highlight accents in the Daggerheart themes.
 *
 * @param {string} hex
 * @param {number} factor  >= 1
 * @returns {string}
 */
export function _brighten(hex, factor) {
  return _toHex(_hex(hex).map(v => v + (255 - v) * Math.min(1, factor - 1)));
}

/**
 * Mixes a color with white at a given opacity.
 * alpha 0 = pure white, alpha 1 = the original color.
 * Used to produce readable pastel text colors from vivid border colors
 * in the Daggerheart themes, where full-saturation text on a dark background
 * would be too intense.
 *
 * @param {string} hex
 * @param {number} alpha  0–1
 * @returns {string}
 */
export function _tint(hex, alpha) {
  return _toHex(_hex(hex).map(v => Math.round(v * alpha + 255 * (1 - alpha))));
}
