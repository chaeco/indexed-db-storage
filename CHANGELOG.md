# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-09-04

### Added

- **Data migration hook** — `StorageOptions.onUpgrade(ctx)` runs inside the upgrade transaction after index schema changes are applied; new databases (`oldVersion === 0`) can be seeded. `StorageOptions.version` forces an upgrade event for data-only migrations. Sync throws / failed migration requests abort the upgrade and reject `init()`.
- **Cross-store atomic transactions** — `runInTransaction(mode, scope, { stores: [...] })` spans multiple stores of the same database; `tx.forStore(name)` returns the operation set for another store. Write events are routed to the owning instance (`source: 'remote'` via BroadcastChannel for same-tab cross-store writes).
- **Backup & restore** — `exportData()` returns all records; `importData(items, { clearBefore })` restores via one `bulkPut` transaction.
- **Auto-reconnect (autoOpen)** — after yielding a connection to a cross-tab upgrade, the instance re-opens automatically at the new version; operations started during reconnection wait for it instead of failing. Multi-store apps no longer need manual re-init after schema evolution.
- **`cleanup` write events** — auto-cleanup deletions now emit `onWrite` events with the deleted primary keys, so UIs no longer hold stale views.
- **Friendly `DataCloneError`** — clone failures (e.g. Vue `reactive()` proxies) are rethrown with a clear fix hint (`toRaw()` / JSON copy), original error preserved as `cause`. Sync clone failures inside `bulkAdd`/`bulkPut` now abort the transaction (all-or-nothing held).

## [0.1.0] - 2026-09-03

### Added

- **Bulk operations** — `bulkAdd(items)` / `bulkPut(items)` / `bulkDelete(keys)` run in a single transaction (all-or-nothing); N records cost one transaction instead of N. `getMany(keys)` batch-reads in one transaction (`undefined` for missing keys).
- **Atomic transactions** — `runInTransaction(mode, scope)` shares one `IDBTransaction` across a scoped operation set (`get`/`getMany`/`save`/`update`/`bulkAdd`/`bulkPut`/`delete`/`bulkDelete`/`count`/`query`); any failure rolls back everything. Scoped writes are emitted as `onWrite` events only after the transaction commits. Note: awaiting non-IDB async inside the scope lets the transaction auto-commit (spec behavior).
- **Keyset pagination** — `query()` accepts `after`/`before` key cursors (mutually exclusive with `range`) for infinite-scroll paging without offset scan cost; `before` + `direction: 'prev'` supports descending pages.
- **Streaming & bulk delete** — `iterate(onItem, options)` streams records through a cursor (return `false` to stop, memory-safe for large exports); `deleteMany(options)` deletes by query conditions in one transaction and returns the number deleted (`sort` + `limit` enables "delete oldest N").
- **Keys-only queries** — `queryKeys(options)` returns primary keys without deserializing record values.
- **Cross-tab write events** — `onWrite(listener)` subscribes to write events (`add`/`put`/`delete`/`bulkAdd`/`bulkPut`/`bulkDelete`/`clear`) from this tab and other tabs via `BroadcastChannel`; returns an unsubscribe function.
- **Storage quota & persistence** — static `requestPersistence()` / `isPersistent()` / `estimate()` wrappers (return `null` when unsupported).
- **Typed `filter`** — `QueryOptions<T>` is now generic, so `filter` callbacks receive the typed record instead of an implicit `any`.

### Optimized

- **Index-driven queries (Dexie-style)** — the first range-compatible `where` condition (`eq`/`gt`/`gte`/`lt`/`lte`/`between`) whose field maps to an index or inline primary key is compiled to `IDBKeyRange` and pushed down to the cursor source; scan cost drops from O(all records) to O(matches). Invalid keys (NaN/objects/…) safely fall back to JS filtering.
- **Index-aware sorting** — single-field sorts on an indexed field traverse the index cursor directly (`advance(offset)` + early termination at `limit`) instead of collecting and sorting in memory.
- **Bounded `getAll`** — `limit` on the getAll path now uses `getAll(range, offset + limit)` to cap fetched records.
- **Hot-loop precompilation** — `where` conditions are compiled (array-normalized, paths split) once per query instead of per cursor record.

### Fixed

- **Index schema upgrades were silently ignored** — adding or changing an index in `StoreConfig` for an existing store never took effect; `initDatabase` now diffs the store's indexes against the config on every open and bumps the version to create new indexes or rebuild changed ones (keyPath/unique/multiEntry).
- **`versionchange` yielded nothing** — connections now auto-close on `versionchange` (Dexie's default) so another tab's upgrade is no longer blocked forever; the instance clears its stale connection reference and reports "not initialized" on next use.
- **Compound `keyPath` + `where` crashed** — querying a single member of an array keyPath threw `NotFoundError` instead of falling back to a full scan.
- **`indexName` + `range` + `where` combination** — the index-driven path no longer takes over the cursor source when the caller explicitly passes `indexName` (the range is bound to that index).
- **`queryKeys` contract** — always returns primary keys (spec: `IDBIndex.getAllKeys()` returns primary keys); the where path no longer lets index pushdown silently change the key type.

## [0.0.6] - 2026-08-19

### Changed

- **Build system → Rollup** — replaced `tsc` emit with a unified `rollup` bundle (single ESM `dist/index.js` + bundled `dist/index.d.ts`). `moduleResolution` is now `bundler`.

## [0.0.5] - 2026-08-14

### Added

- **Project website** — `website/` landing page (unified Chaeco dark-terminal style) with live terminal demo, advanced-query reference, and install CTA.
- **GitHub Pages workflow** — `.github/workflows/pages.yml` deploys `website/` to GitHub Pages.
- **package-lock version sync** — the lockfile self-version was stale (0.0.1) and is now aligned with the package version.

## [0.0.4] - 2026-08-02

### Optimized
- **Cursor query performance**: `query()` with `where`/`filter` and **no sort** now early-terminates cursor traversal once `offset + limit` records are collected, avoiding full-store scans on large datasets.

### Improved
- **Test coverage**: Added `test/database.test.ts` with 5 test cases covering store creation, index creation, upgrade path (store not found), and store reuse scenarios. Database module statement coverage from 52.77% → 83.33%.
- **Config**: Added `"type": "module"` to `package.json` to eliminate ESLint module-type warning.

### Fixed
- **Documentation**: Updated `README.zh-CN.md` test count from 44 to 83 (now 90); corrected `CHANGELOG.md` `cleanupInterval` description to match the actual validation code.

## [0.0.3] - 2026-01-29

### Improved
- **Stability & Error Handling**: 
  - Refined singleton instance protection to prevent multiple initializations.
  - Added race condition protection in `init()` using a generation counter to prevent connection leaks during concurrent calls.
  - Added strict `NaN` guards in `query()` to prevent silent matching failures (NaN no longer matches "nan" strings).
  - Validated `cleanupInterval` to ensure it is a finite positive number.
- **Query Operators**:
  - `between` operator now handles inverted ranges (start > end) by automatically swapping them and issuing a warning.
  - Unified all warning logs with `[IndexedDBStorage]` prefix for better filtering.
- **Documentation**:
  - All documentation files (`README.md`, `docs/advanced-query.md`, `examples/README.md`) are now English-first with Chinese translations in `*.zh-CN.md`.
  - Clarified the difference between `close()` (connection closure) and `destroy()` (database deletion) in JSDoc.
- **Testing**:
  - Reached 100% logic coverage and ~95% line coverage.
  - Added `test/config-manager.test.ts` for comprehensive validation testing.
  - Isolated test databases to prevent intermittent failures in concurrent test runs.

## [0.0.2] - 2026-01-28

### Added

- 🔍 **Powerful Advanced Querying**
  - **Where Conditions**: Support for 11 query operators:
    - Comparison: `eq`, `ne`, `gt`, `gte`, `lt`, `lte`
    - Range: `between`, `in`
    - String operations: `contains`, `startsWith`, `endsWith`
  - **Multi-Condition Querying**: Support for multiple `where` conditions (AND logic).
  - **Multi-Field Sorting**: Support for single and multi-field sorting (asc/desc).
  - **Custom Filtering**: Support for a `filter` function for complex scenarios.
  - **Nested Field Querying**: Support for dot-notation (e.g., `user.address.city`).
  - **Combined Querying**: Seamlessly combine `where`, `sort`, `filter`, `limit`, and `offset`.

- 📚 **Full Documentation & Examples**
  - New Advanced Query example page ([advanced-query.html](examples/advanced-query.html)).
  - New Advanced Query quick reference ([docs/advanced-query.md](docs/advanced-query.md)).
  - Expanded README with advanced usage instructions.

- ✅ **Test Coverage**
  - Added 20 advanced query test cases.

### Enhanced

- Optimized query performance using cursor-based iteration.
- Fully backward compatible with `range` and `indexName` queries.

## [0.0.1] - 2024-12-20

### Added
- Initial release.
- Universal data storage based on IndexedDB.
- Full CRUD support (save, query, get, update, delete, clear).
- Auto-cleanup configuration.
- Singleton pattern for connection management.
- Full TypeScript support.
