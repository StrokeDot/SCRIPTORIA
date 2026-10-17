# SCRIPTORIA v0.1 — foundation

## Scope
SCRIPTORIA is dedicated to YouTube **scriptwriting**, not video editing. Channel profiles organize script libraries, and the video's thumbnail is a contextual visual cue. Each script stores its thesis/concept, opening hook, intended audience takeaway, editorial notes, status and main narration in one continuous editable document. Files associated with that video can be attached.

## Privacy and architecture
- React/TypeScript/Vite frontend with a Windows Tauri 2 shell.
- SQLite database and original reference/thumbnail files under SCRIPTORIA's own application data directory, distinct from NOEMA (`studio.scriptoria.app`).
- No API keys, AI model connections, ChatGPT account integration, cross-app file access or internet content uploads in v0.1.
- Thumbnail is saved as a private local PNG/JPEG/WebP copy, max 12 MB. Ref files max 50 MB; PDF, DOCX, EPUB, TXT, Markdown, JSON and image copies are stored with SHA-256.
- **References are stored, but not yet parsed into searchable passages.** **Thumbnails are displayed, but not yet analyzed by AI.**
- Autosave serializes updates with optimistic version checking; earlier script text periodically receives revision snapshots. No cloud sync or automatic updater yet.
- New identity, private data folder, independent installer and release workflow; no NOEMA script migration is performed yet.

## Next stage
1. Add project chat and AI connection with user-provided OpenAI API key or local vision-capable Ollama, clear opt-in for sending images/sources to an external provider.
2. Add indexed research passage retrieval and author's/channel memory with confirmed author positions distinguished from external claims.
3. Add approval-based AI insert/rewrite actions for specific script sections and gems.
4. Implement non-destructive export/import of video scripts and channel profiles from existing NOEMA databases.
5. Add tested signed updates and a portable backup/restore system.

## Development
`npm install`, then `npm run desktop:dev`. To build a Windows NSIS installer, use `npm run desktop:build` on Windows. Windows GitHub Actions should compile/tests on pushes and upload installer ZIP artifacts.

This repository is public: never commit research manuscripts, credentials, thumbnails or book/chat data. Those belong to local user storage.
