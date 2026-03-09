/**
 * WaymarkPermissionsApp
 * Mirrors Foundry's native DocumentOwnershipConfig layout.
 * FormApplication V1 (safe until v16).
 */

const MODULE_ID = "waymarks";

export class WaymarkPermissionsApp extends FormApplication {

  constructor(noteId) {
    super({}, {});
    this._noteId = noteId;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id:            "waymark-permissions",
      title:         "Waymark — Ownership",
      template:      `modules/${MODULE_ID}/templates/permissions.html`,
      width:         420,
      height:        "auto",
      closeOnSubmit: true,
      classes:       ["sheet"],
    });
  }

  getData() {
    const entry = this._findEntry();
    if (!entry) return { users: [], defaultLevel: 0, levels: [], userLevels: [] };

    const ownership = entry.ownership ?? {};
    const defaultLevel = ownership.default ?? 0;

    // All users except the current GM opening the dialog
    const users = game.users
      .filter(u => u.id !== game.user.id)
      .map(u => ({
        id:    u.id,
        name:  u.name,
        isGM:  u.isGM,
        color: u.color?.css ?? u.color ?? "#aaaaaa",
        level: ownership[u.id] ?? -20,
      }));

    return {
      defaultLevel,
      users,
      levels: [
        { value: 0, label: "None" },
        { value: 2, label: "Observer" },
        { value: 3, label: "Owner" },
      ],
      userLevels: [
        { value: -20, label: "Default" },
        { value: 0,   label: "None" },
        { value: 2,   label: "Observer" },
        { value: 3,   label: "Owner" },
      ],
    };
  }

  async _updateObject(_event, formData) {
    const entry = this._findEntry();
    if (!entry) return;

    const ownership = foundry.utils.deepClone(entry.ownership ?? {});
    ownership.default = Number(formData.default ?? 0);

    for (const [key, val] of Object.entries(formData)) {
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

  _findEntry() {
    return game.journal.find(j => {
      if (!j.getFlag(MODULE_ID, "isWaymark")) return false;
      const nd = j.getFlag(MODULE_ID, "noteData");
      return nd?.id === this._noteId;
    });
  }
}
