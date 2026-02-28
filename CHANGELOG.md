# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.3] - 2026-01-29

### Improved
- **Stability & Error Handling**: 
  - Refined singleton instance protection to prevent multiple initializations.
  - Added race condition protection in `init()` using a generation counter to prevent connection leaks during concurrent calls.
  - Added strict `NaN` guards in `query()` to prevent silent matching failures (NaN no longer matches "nan" strings).
  - Validated `cleanupInterval` to ensure it is at least 1000ms.
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
