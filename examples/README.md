# Examples

English | [简体中文](./README.zh-CN.md)

This directory contains examples of how to use `@chaeco/indexed-db-storage`.

## Running the Examples

### Method 1: After Building

1. Build the project:
   ```bash
   npm run build
   ```
2. Run a simple HTTP server in the project root:
   ```bash
   # Using Node.js (npx)
   npx serve .

   # Using Python
   python3 -m http.server 8000
   ```
3. Open in your browser:
   - Basic CRUD: [http://localhost:8000/examples/basic.html](http://localhost:8000/examples/basic.html)
   - Logger: [http://localhost:8000/examples/logger.html](http://localhost:8000/examples/logger.html)
   - Advanced Query: [http://localhost:8000/examples/advanced-query.html](http://localhost:8000/examples/advanced-query.html)
   - Bulk & Transaction: [http://localhost:8000/examples/bulk-transaction.html](http://localhost:8000/examples/bulk-transaction.html)

### Method 2: Development Server

If you are using Vite or another dev server, you can link to these HTML files directly.

## Example Details

### basic.html - Basic CRUD Operations
Demonstrates:
- Initializing the storage.
- Saving, getting, updating, and deleting records.
- Clearing the entire store.

### logger.html - Auto Cleanup and Indexing
Demonstrates:
- Setting up a log storage with `maxRecords` and `retentionTime`.
- Configuring `cleanupInterval` for background maintenance.
- Using indexes for performance.

### advanced-query.html - Advanced Querying
Demonstrates:
- Using `where` conditions with various operators (`gt`, `between`, `contains`, etc.).
- Multi-field sorting.
- Pagination with `limit` and `offset`.
- Nested field searching.

### bulk-transaction.html - Bulk Operations & Transactions
Demonstrates:
- `bulkAdd` / `getMany` / `deleteMany` in single transactions.
- `runInTransaction` with cross-store atomic writes (`forStore`) and rollback.
- Keyset pagination (`after` cursor) for infinite scroll.
- `onWrite` subscription (local + cross-tab) and `exportData` / `importData`.
