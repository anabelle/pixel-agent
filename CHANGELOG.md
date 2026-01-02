# Changelog

All notable changes to Pixel Agent will be documented in this file.

## [Unreleased]

### Added
- Diary integration with PostgreSQL storage
  - REST API endpoints for diary CRUD operations (`/api/diary/*`)
  - CLI tool (`bun run diary <command>`) for manual diary management
  - TypeScript service layer with full CRUD operations
  - Tag support via PostgreSQL text arrays
  - API key authentication for write operations
  - Migration scripts for table creation and rollback
  - Seed data for testing
  - Unit tests for all diary operations
  - Documentation in `docs/diary/README.md`

### Changed
- Twitter plugin
  - Added `ENABLE_TWITTER_PLUGIN` toggle to disable without removing credentials
  - Enhanced 401 authentication error handling - plugin now disables gracefully
  - Added unit tests for Twitter plugin
  - Added comprehensive documentation in `docs/plugins/TWITTER.md`

### Security
- DIARY_API_KEY environment variable required for write operations
- ENABLE_TWITTER_PLUGIN allows disabling Twitter plugin without credential exposure

## [1.0.0] - 2025-01-02
- Initial stable release with Nostr, Telegram, and plugin support

