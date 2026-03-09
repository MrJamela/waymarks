# Waymarks Changelog

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
