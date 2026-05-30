/**
 * WaymarkPermissionsApp
 *
 * The dialog that opens when a GM clicks the 👥 button on a note.
 * It lets the GM set who can see or edit that specific note on a per-user basis.
 *
 * Foundry has a built-in concept of "ownership levels" for documents:
 *   NONE     — the user has no access (can't see the note at all)
 *   OBSERVER — the user can see the note but not edit it
 *   OWNER    — the user can see and edit the note
 *
 * There's also a special "Default" option (-20 internally) which means
 * "don't give this user an explicit level — just use whatever the document's
 * default access level is." This is how new users get access without the GM
 * having to explicitly configure every note for every player.
 *
 * This app is a Foundry ApplicationV2 — the v13 way of building UI windows.
 * It uses a Handlebars template (permissions.html) to render the form.
 */

import { NoteManager } from "./NoteManager.js";

const MODULE_ID = "waymarks";

// Pull in the v13 application base classes
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

// Named constants for ownership levels — much clearer than writing 0, 2, 3
const { NONE, OBSERVER, OWNER } = CONST.DOCUMENT_OWNERSHIP_LEVELS;

export class WaymarkPermissionsApp extends HandlebarsApplicationMixin(ApplicationV2) {

  // ─── Configuration ─────────────────────────────────────────────────────────

  /**
   * DEFAULT_OPTIONS tells Foundry how to create and display this window.
   *
   * tag: "form" means Foundry treats the whole window as a form element,
   * so we don't need to write a <form> tag in the HTML template.
   *
   * handler points to the static method that runs when the form is submitted.
   * closeOnSubmit: true means the window closes automatically after saving.
   * submitOnChange: false means it only saves when the user clicks Save Changes,
   * not every time they change a dropdown.
   */
  static DEFAULT_OPTIONS = {
    id: "waymark-permissions",
    tag: "form",
    form: {
      handler: WaymarkPermissionsApp.#onSubmitForm,
      closeOnSubmit: true,
      submitOnChange: false,
    },
    position: {
      width: 420,
      height: "auto",   // grows to fit however many users are in the game
    },
    window: {
      title: "WAYMARKS.Perms.WindowTitle",
    },
  };

  /**
   * PARTS tells Foundry which HTML template to use for the window content.
   * The template is rendered with the data from _prepareContext().
   */
  static PARTS = {
    form: {
      template: `modules/${MODULE_ID}/templates/permissions.html`,
    },
  };

  // ─── Constructor ───────────────────────────────────────────────────────────

  /**
   * We override the constructor so we can store which note this dialog
   * is for. noteId is passed in when the dialog is opened, e.g.:
   *   new WaymarkPermissionsApp("abc123").render(true)
   */
  constructor(noteId, options = {}) {
    super(options);
    this._noteId = noteId;
  }

  // ─── Data preparation ──────────────────────────────────────────────────────

  /**
   * Prepares the data that gets handed to the Handlebars template.
   * Everything the template needs to render the form must be returned here.
   *
   * The template will use this data to build a dropdown for each user
   * showing their current access level, plus a dropdown for the default
   * level that applies to anyone not explicitly listed.
   */
  async _prepareContext(options) {
    // Always call super first — it sets up base context Foundry needs
    const context = await super._prepareContext(options);

    const entry = NoteManager._findEntry(this._noteId);

    // If the note was deleted between when the button was clicked and now,
    // return empty data so the template renders a harmless blank dialog
    if (!entry) return { ...context, users: [], defaultLevel: NONE, levels: [], userLevels: [] };

    // The ownership object is a map of userId → access level.
    // It also has a "default" key for anyone not explicitly listed.
    const ownership = entry.ownership ?? {};
    const defaultLevel = ownership.default ?? NONE;

    // Build the user list — everyone except the GM who opened the dialog,
    // since you can't change your own permissions on your own note.
    // Build {value: label} choice objects for Foundry's built-in selectOptions
    // helper, which avoids depending on a custom `eq` helper that Foundry core
    // does not ship. Keys are strings because selectOptions does string comparison
    // for selected state; we cast level values to String in the user map too.
    const defaultChoices = {
      [String(NONE)]:     game.i18n.localize("WAYMARKS.Perms.LevelNone"),
      [String(OBSERVER)]: game.i18n.localize("WAYMARKS.Perms.LevelObserver"),
      [String(OWNER)]:    game.i18n.localize("WAYMARKS.Perms.LevelOwner"),
    };
    const userChoices = {
      "-20":              game.i18n.localize("WAYMARKS.Perms.LevelDefault"),
      [String(NONE)]:     game.i18n.localize("WAYMARKS.Perms.LevelNone"),
      [String(OBSERVER)]: game.i18n.localize("WAYMARKS.Perms.LevelObserver"),
      [String(OWNER)]:    game.i18n.localize("WAYMARKS.Perms.LevelOwner"),
    };

    const users = game.users
      .filter(u => u.id !== game.user.id)
      .map(u => ({
        id: u.id,
        name: u.name,
        isGM: u.isGM,
        color: u.color?.css ?? u.color ?? "#aaaaaa",
        // Cast to String so selectOptions selected comparison works correctly
        level: String(ownership[u.id] ?? -20),
      }));

    return {
      ...context,
      // Cast defaultLevel to String for the same reason
      defaultLevel: String(defaultLevel),
      users,
      defaultChoices,
      userChoices,
    };
  }

  // ─── Form submission ───────────────────────────────────────────────────────

  /**
   * Runs when the GM clicks Save Changes.
   *
   * Reads the form values, builds a new ownership object, and writes it
   * to the JournalEntry. Foundry's updateJournalEntry hook then fires on
   * all clients, which triggers WaymarkRenderer to rebuild the affected
   * note so each player's buttons and access update immediately.
   *
   * This is a static private method (the # prefix means private, static
   * means it belongs to the class not an instance). Foundry calls it with
   * `this` set to the app instance, which is why we can use this._noteId.
   *
   * @this {WaymarkPermissionsApp}
   */
  static async #onSubmitForm(event, form, formData) {
    event.preventDefault();

    const entry = NoteManager._findEntry(this._noteId);
    if (!entry) return;

    const data = formData.object;

    // Start from a copy of the current ownership so we preserve any users
    // who aren't shown in the dialog (e.g. users added after the dialog opened)
    const ownership = foundry.utils.deepClone(entry.ownership ?? {});

    // Apply the "All Players" default level
    ownership.default = Number(data.default ?? NONE);

    // Apply each individual user's level.
    // If a user was set to "Default" (-20), we delete their explicit entry
    // entirely so they fall through to the document default.
    // Otherwise we write their chosen level as a number.
    for (const [key, val] of Object.entries(data)) {
      if (key === "default") continue;
      const numeric = Number(val);
      if (numeric === -20) {
        delete ownership[key];
      } else {
        ownership[key] = numeric;
      }
    }

    await entry.update({ ownership });
  }
}
