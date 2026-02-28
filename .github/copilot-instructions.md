# Copilot Skills for @chaeco/indexed-db-storage

You are an expert AI programming assistant for the `@chaeco/indexed-db-storage` library, a high-performance, singleton-based IndexedDB wrapper for TypeScript.

## Core Principles
- **Singletons**: `IndexedDBStorage` follows a strict singleton pattern per `dbName` + `storeName`. Use `new IndexedDBStorage(...)` only when you are certain a new distinct store is needed; the internal `InstanceManager` handles deduplication.
- **Initialization**: Always await `storage.init()` before any data operations (`save`, `get`, `query`, etc.).
- **Type Safety**: Use generics (e.g., `new IndexedDBStorage<User>(...)`) to ensure type safety for all CRUD operations.
- **Race Condition Protection**: The library uses a generation counter (`_initGeneration`) to prevent connection leaks if `init()` is called multiple times concurrently.

## Querying Capabilities

### Advanced Querying (`storage.query()`)
Support sophisticated filtering, sorting, and pagination.

**Operators:**
- **Comparison**: `eq` (strict `===`), `ne` (strict `!==`), `gt`, `gte`, `lt`, `lte`.
- **Range & Set**: `between` (array `[min, max]`), `in` (array of values).
- **Strings**: `contains`, `startsWith`, `endsWith` (case-sensitive).

**Rules & Guards:**
- **NaN Rejection**: Comparison and string operators (`gt`, `lt`, `contains`, etc.) will log a warning and return `false` if `compareValue` is `NaN`.
- **Inverted Ranges**: For `between`, if `min > max`, the library warns and returns `false` (it does **not** silently match).
- **Nested Fields**: Supports dot-notation paths (e.g., `user.profile.age`).
- **Null Handling**: Values that are `null` or `undefined` (or missing paths) are treated as "no value" and typically fail comparison checks (`gt`, `lt`, etc.).

### Sorting
- Use `sort: { field: '...', order: 'asc' | 'desc' }` or an array of sort options.
- **Mult-field Sorting**: Order matters; subsequent fields break ties from previous ones.
- **Nulls/NaNs**: `null`, `undefined`, and `NaN` are treated as "last" in ascending order (sink to bottom).

## Management & Lifecycle

### Data Cleanup
Configure backgrounds maintenance via the first argument (`Config`):
- `maxRecords`: Maximum number of records allowed. Cleanup triggers at 100% and deletes down to a 90% watermark.
- `retentionTime`: TTL in milliseconds.
- `cleanupInterval`: Run maintenance every X milliseconds (minimum 1000ms).

### Resource Cleanup
- `storage.close()`: Closes the active database connection. Use this for standard cleanup.
- `storage.destroy()`: Deletes the entire IndexedDB database from the browser. Use with caution.

## Implementation Details for Agents
- **Internal Helper: `getNestedValue`**: Securely accesses paths using `hasOwnProperty` to prevent prototype pollution.
- **Memory Safety**: `query()` creates a copy of the results array before sorting to avoid mutating IndexedDB's direct cursor output.
- **Transaction Safety**: `filter` functions should not throw, as IndexedDB will abort the transaction if they do. Recommend `try/catch` inside custom filters.

## Testing Best Practices
- Use `vitest` and `fake-indexeddb`.
- **Isolation**: Use unique `dbName` per test suite to avoid connection collisions in parallel runs.
- **Mocking**: Use `vi.useFakeTimers()` to test `cleanupInterval` and `retentionTime` logic.
- Verify coverage: Aim for 100% on logic in `src/core/` and `src/managers/`.
