# Waymarks Changelog

## v0.8.3
### Added
- **Internationalization** — All user-facing strings moved to `lang/en.json`. Settings names and hints, button titles and placeholders, dialog text, theme names, picker labels, notifications, and author badges all route through `game.i18n.localize()` / `game.i18n.format()`. Key namespace: `WAYMARKS.*`.

### Changed
- **Compatibility** — `module.json` verified through Foundry v14. Minimum remains v13. No v14-only APIs introduced.
- **Permissions dialog** — Replaced custom `eq` Handlebars helper (not shipped by Foundry core) with the built-in `selectOptions` helper. Eliminates "Missing helper: eq" errors in worlds whose game system doesn't register it.
- **Scene controls injection** — Guard now accepts both `"tokens"` (v13) and `"token"` (v14 fallback). Added comment flagging these as internal selectors requiring re-verification on major Foundry versions.
- **Pointer events** — `WaymarkElement` drag, resize, and all `stopPropagation` guards converted from `mouse*` to `pointer*` events for touch and stylus support and to prevent stranded listeners when the pointer is released off-window.
- **Hotbar reference** — `_centerPosition()` now uses `ui.hotbar?.element` (normalized to `HTMLElement`) before falling back to raw DOM queries, consistent with the `ui.controls` and `ui.sidebar` approach.
- **Optional chaining** — Replaced `x && x.method()` guard idioms with `x?.method()` throughout `waymarks.js`.
- **`NoteManager.registerSettings`** — Comment updated to mark the method as an intentional stable extension point, not transitional dead code.

### Fixed
- **`isDark()` guard** — Now returns `false` early for non-string or short hex values instead of producing `NaN` channels.
- **`_hex()` guard** — Returns `[0, 0, 0]` for non-string or short inputs, protecting all downstream color math (`_darken`, `_brighten`, `_tint`, terminal/neon background computation).

## v0.8.2
### Changed
- Added plain-English block comments throughout all seven script files explaining what each class, method, and logical block does and why.
### Fixed
- **Toolbar button not appearing** — The `renderSceneControls` guard was checking `app.activeControl === "token"` but Foundry v13 uses `"tokens"` (plural). Also replaced the deprecated `app.activeControl` with `app.control?.name`.
- **Game Settings dialog appearing behind notes** — Replaced the MutationObserver z-index approach with a fixed z-index band (10–99) for notes, keeping them permanently below Foundry's window layer (100+).
- **Text color not flipping on dark backgrounds** — `NoteManager.isDark()` existed but was never called. Now wired up in `WaymarkElement` to set `--wm-auto-text` so sticky, index card, classified, and tavern themes flip to white text when the user picks a dark background color.
- **Permission closures going stale after setting changes** — `playerEdit` and `playerPin` settings now trigger `rebuildAll()` when toggled, so notes immediately reflect the new permissions without requiring a scene change or refresh. Added `rebuildAll()` method to `WaymarkRenderer`.

## v0.8.1
### Fixed
- **Magic ownership numbers in socketlib handlers** — `createNoteAsGM` and `sendNoteToGM` were using raw `0`, `2`, `3` for ownership levels. Both now use `CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE`, `OBSERVER`, and `OWNER`, destructured once at the top of the `socketlib.ready` hook. Removed two remaining debug `console.log` calls from those handlers.

## v0.8.0
### Changed
- **`UniversalNoteLayer` renamed to `WaymarkRenderer`** — The old name implied a Foundry canvas layer; notes live on the HTML interface layer. All references updated.
- **`WaymarkLayout` migrated to `game.settings` client scope** — Note positions and sizes are now stored via Foundry's settings API (`scope: "client"`) instead of raw `localStorage`. All layout data is stored as a single object keyed by note ID. Properly namespaced and lifecycle-managed by Foundry. (Note: existing `localStorage` positions will not carry over automatically.)
- **`WaymarkThemePickerApp` migrated to `HandlebarsApplicationMixin(ApplicationV2)`** — Replaced deprecated `FormApplication` with the v13 application pattern. Removed jQuery from `activateListeners`. Template updated to remove outer `<form>` tag.
- **`WaymarkPermissionsApp` migrated to `HandlebarsApplicationMixin(ApplicationV2)`** — Same migration as above. Template updated to remove outer `<form>` tag and `data-dtype` attributes.
- **`NoteManager._isWaymarkEntry()` added** — Centralises the `isWaymark` flag check so storage details stay inside `NoteManager`. `WaymarkRenderer` and `waymarks.js` now use this helper instead of reading the flag directly.
- **`NoteManager._findEntry()` used everywhere** — `WaymarkRenderer` and `waymarks.js` no longer duplicate the journal scan logic inline.
- **JournalEntry name synced with note title** — `NoteManager.createNote()` uses the title as the entry name if provided. `NoteManager.updateNote()` keeps the entry name in sync when the title changes. Falls back to `Waymark-{id}` when no title is set.

## v0.7.0
### Changed
- **Color math helpers** — `_hex`, `_toHex`, `_darken`, `_brighten`, `_tint` are now exported from `WaymarkThemes.js` and imported by `WaymarkThemePickerApp.js`. Removed the duplicate definitions that previously existed in both files.
- **Ownership constants** — `WaymarkPermissionsApp` now uses `CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE / OBSERVER / OWNER` instead of magic numbers `0`, `2`, `3`.
- **Dialog z-index** — Removed the `z-index: 9999999 !important` brute-force rule on `#waymark-permissions`. The `MutationObserver` in `waymarks.js` now handles all dialog layering consistently.
- **MutationObserver scope** — Narrowed from `document.body` to `#interface`, reducing unnecessary wake-ups on every DOM change across the full page.
- **`globalThis._maxZ` removed** — Both `waymarks.js` and `WaymarkElement.js` now use `foundry.applications.api.ApplicationV2._maxZ`, the canonical v13 approach.

### Fixed
- Removed duplicate `updateJournalEntry` hook from `waymarks.js` — `UniversalNoteLayer` already handles this more precisely with debouncing.
- Removed duplicate `.waymark-note--collapsed` CSS block that was missing the author badge and title rules.
- Removed `WaymarkPermissionsApp._findEntry()` — now delegates to `NoteManager._findEntry()`.
- Removed debug `console.log` statements from `WaymarkElement` permissions button, `UniversalNoteLayer._addElement()`, and ownership rebuild handler.
- Removed dead `_nearBlack()` function from `WaymarkThemes.js`.

## v0.6.3
### Fixed
- **Note spawn position conflict with other modules** — Raw DOM queries for `#ui-left` can return inflated bounding rects when other modules inject elements alongside the controls panel. Replaced with `ui.controls.element` and `ui.sidebar.element` — Foundry's own UI application objects — which always return accurate bounds regardless of what other modules do to the DOM.

## v0.6.2
### Fixed
- **Toolbar button appearing on all control groups** — The sticky note button was injecting into every scene control menu (Tiles, Drawings, etc.) instead of only Token Controls. Fixed by guarding the `renderSceneControls` hook with an `app.activeControl === "token"` check.

## v0.6.1
### Added
- **Note titles** — Optional title field in the note header bar. Type a title to label your note; it remains visible when the note is collapsed, giving each note a clear identity at a glance. Titles sync across all clients in real time.

## v0.6.0
### Changed
- **Toolbar button** — Replaced deprecated jQuery (`$()`, `.find()`, `.on()`) in the `renderSceneControls` hook with plain DOM API, aligning with Foundry v13 best practices.
- **Delete confirmation** — Replaced deprecated V12 `Dialog` class with `foundry.applications.api.DialogV2.confirm()`.
- **Public API** — Added missing `getNotes()` and `updateNote(id, updates)` methods to the module API (`game.modules.get("waymarks").api`).
### Fixed
- Merged duplicate `Hooks.once('ready')` blocks into a single block.

## v0.5.0
### Fixed
- **GM note privacy** — Notes created by one GM were incorrectly visible to all other connected GMs. Fixed by replacing `testUserPermission()` (which always returns `true` for GMs in Foundry v13) with a manual ownership check. A GM now only sees notes they created, or notes where they've been explicitly granted Observer or higher access via the permissions dialog.
- **Author badge invisible** — The `— Author` signature at the bottom of notes was being rendered in the note's background colour (e.g. yellow text on yellow sticky note). Fixed by using `var(--wm-text, currentColor)` so the badge inherits the theme's text colour correctly.

## v0.4.0
### Added
- **Player note creation** — new `playerCreate` world setting. When enabled, players see the toolbar button and can create their own Waymarks via GM socket relay (GM must be online).
- **Allow Players to Edit Waymarks** — new `playerEdit` world setting. Players with Owner permission can edit a note's content, colour, and font size.
- **Allow Players to Pin Waymarks to Scenes** — new `playerPin` world setting. Players with Owner permission can pin and unpin their notes to scenes.
- **Per-note permissions dialog** — GMs see a 👥 button on every note header. Opens "Waymark — Ownership" to set each user's access: None / Can View (Observer) / Can Edit (Owner).
- Notes created by a player automatically grant that player Owner access.
- `openPermissions(noteId)` added to the public module API.
- **Player dismiss** — Players who can view but not edit a note see a ✕ dismiss button instead of permanent delete, hiding the note for their session.
- **Send to GM** — Players can send their note to the GM, granting all GMs Observer access and setting the `sentToGM` flag.

### Changed
- Toolbar button now visible to players when `playerCreate` is enabled (previously GM-only).

## v0.3.0
### Added
- Full theme system with 12 themes: Sticky Note, Index Card, Chalkboard, Terminal, Neon, Classified, Tavern Notice, Stone Tablet, Shadowdark, and three Daggerheart variants.
- Custom Theme Picker UI with live preview and per-theme colour/font controls.
- 20 curated Google Fonts available as font overrides.
- Reset to Defaults button in the Theme Picker.
- Dual colour picker per note (primary + secondary where applicable).
- Shadowdark ornate corner bracket decorations.

### Fixed
- Theme colour bleeding — switching themes no longer carries over the previous theme's custom colours. A `themeColorOwner` setting tracks which theme saved colours belong to.

## v0.2.0
### Added
- Journal Entry storage backend (replaces world settings).
- Scene pinning — notes can be pinned to a specific scene.
- Per-client local position/size via localStorage.
- Socket relay for create/delete/pin across all clients.

## v0.1.0
- Initial release. Basic sticky note functionality with GM-only controls.
