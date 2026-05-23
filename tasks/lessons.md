# GemForge — Lessons Learned

## Session Log

---

### 2026-05-05 — Vite `--overwrite` flag deletes ALL non-Vite files
**Mistake:** Used `npx create-vite ./ --overwrite` which deleted `SYSTEM_PROMPT.md`, `tasks/`, and `.agent/` directories.
**Root Cause:** The `--overwrite` flag removes all files in the target directory before scaffolding.
**Rule:** ALWAYS scaffold Vite into a temp directory first, then copy files over. Never use `--overwrite` on an existing project root with important files.
**Status:** Active

---

_Updated after every user correction or significant learning._
