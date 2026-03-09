# Contributing to Waymarks

Thanks for your interest in contributing! Here's how to get involved.

---

## Reporting Bugs

Use the [Bug Report template](.github/ISSUE_TEMPLATE/bug_report.md) when opening an issue. Please include:

- Your Foundry VTT version
- Your socketlib version
- A clear description of what happened vs. what you expected
- Steps to reproduce
- Any browser console errors (F12 → Console)

---

## Suggesting Features

Open a [Feature Request](.github/ISSUE_TEMPLATE/feature_request.md) issue. Describe:

- The problem it solves or the workflow it improves
- How you'd expect it to work
- Any alternatives you've considered

---

## Submitting a Pull Request

1. **Fork** the repository
2. **Create a branch** — use a descriptive name like `fix/permissions-save` or `feat/note-titles`
3. **Make your changes** — keep commits focused and atomic
4. **Test** — verify in Foundry VTT v13 with at least one GM and one player account
5. **Update** `CHANGELOG.md` under `[Unreleased]` with a summary of your changes
6. **Open a PR** — describe what changed and why

---

## Code Style

- ES modules (`import`/`export`) throughout — no CommonJS
- No build step, no bundler — plain JavaScript that runs directly in Foundry
- Foundry Application v1 (`FormApplication`) for settings dialogs — safe through v16
- All cross-client communication via **socketlib** — do not use `game.socket.emit()` directly
- Notes are stored as JournalEntry documents with `waymarks` module flags — never use client-side storage for persistent note data
- GM-only guards at the top of any hook handler that modifies world data
- Avoid adding new external dependencies beyond socketlib

---

## Architecture Notes

| File | Responsibility |
|------|---------------|
| `waymarks.js` | Entry point: settings, hooks, socketlib setup, toolbar button |
| `NoteManager.js` | CRUD operations on note JournalEntries, settings helpers |
| `UniversalNoteLayer.js` | DOM overlay layer, renders and reconciles WaymarkElement instances |
| `WaymarkElement.js` | Individual note DOM element, drag/resize, toolbar, user interaction |
| `WaymarkLayout.js` | Position and size state management |
| `WaymarkThemes.js` | Theme definitions (colors, fonts, CSS class names) |
| `WaymarkThemePickerApp.js` | Theme picker FormApplication |
| `WaymarkPermissionsApp.js` | Ownership permissions FormApplication |

---

## Questions?

Open a [Discussion](https://github.com/MrJamela/waymarks/discussions) if you're unsure whether something is a bug or a feature, or want to talk through an idea before building it.
