# Changelog

## 0.2.3 - 2026-11-27

Experimental team-collaboration MVP.

### Added

- Automatic room rediscovery after network and application visibility recovery.
- Bounded exponential retry scheduling for opened collaborative sessions.
- Diagnostics for retry attempts, last retry time, and retry errors.
- Manual rediscovery command as a fallback; healthy WebRTC channels are not intentionally interrupted.
- Offline IndexedDB restart/reopen merge coverage.

### Verified

- TypeScript type checking.
- 49 Vitest tests across 10 test files.
- Plugin production build.
- Signaling supervisor tests: health, duplicate-start protection, child-crash recovery, parent-exit cleanup, stale-lock recovery, graceful stop, and occupied-port protection.
- Maintainer-reported two-device offline restart and automatic recovery test.

### Scope

- Experimental desktop MVP for configured plain-Markdown collaboration folders.
- YAML frontmatter, attachments, complete Vault/file-tree synchronization, stable document identity across rename/move, member authentication, and full multi-document lifecycle management remain outside this release.

