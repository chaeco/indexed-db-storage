# @chaeco/indexed-db-storage

[![npm version](https://img.shields.io/npm/v/@chaeco/indexed-db-storage.svg)](https://www.npmjs.com/package/@chaeco/indexed-db-storage)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

English | [简体中文](./README.zh-CN.md)

A universal IndexedDB storage solution providing powerful persistent storage capabilities for the browser.

## ✨ Features

- 🎯 **Universal Storage** - Supports any data type, not limited to specific scenarios.
- 🔍 **Powerful Querying** - Supports `where` conditions, multi-field sorting, custom filtering, and complex range queries. Range conditions are compiled to `IDBKeyRange` and pushed down to indexes (Dexie-style) whenever possible.
- ⚡ **Bulk & Atomic Operations** - `bulkAdd`/`bulkPut`/`bulkDelete` in a single transaction, plus `runInTransaction` for atomic multi-step writes.
- 📄 **Efficient Pagination** - Keyset pagination (`after`/`before`) for infinite scroll without the offset penalty.
- 🔔 **Cross-Tab Events** - `onWrite` subscription with BroadcastChannel-based sync across tabs.
- 🔒 **Type Safe** - Full TypeScript generic support for robust data handling.
- 🔄 **Singleton Pattern** - Automatically manages instances based on `dbName` + `storeName` combinations, reusing connections for identical configurations.
- 🧹 **Auto Cleanup** - Configurable data retention mechanisms based on capacity or age.
- ⚙️ **Flexible Configuration & Migrations** - Customize `keyPath`, indexes, and other database settings. New or changed index definitions are applied automatically on the next `init()`, with an `onUpgrade` hook for data migrations. Connections auto-reopen after yielding to cross-tab upgrades (autoOpen).
- 📦 **Zero Dependencies** - Lightweight design with no external dependencies.
- 🚀 **Modern API** - Promise-based asynchronous API for seamless integration with `async/await`.
- ✅ **Well Tested** - 172 test cases with extensive coverage of core logic and edge cases.

## Installation

```bash
npm install github:chaeco/indexed-db-storage
```

## Module Formats

The package ships both **ESM** (`import`) and **CommonJS** (`require`) builds, usable in browsers, bundlers, SSR, and Node.js tooling:

```typescript
import { IndexedDBStorage } from '@chaeco/indexed-db-storage' // ESM
const { IndexedDBStorage } = require('@chaeco/indexed-db-storage') // CommonJS
```

## Quick Start

```typescript
import { IndexedDBStorage } from '@chaeco/indexed-db-storage'

// Define data type
interface User {
  id?: number
  name: string
  email: string
  createdAt: number
}

// Create storage instance
const storage = new IndexedDBStorage<User>(
  {
    dbName: 'my-app',
    storeName: 'users',
  },
  {
    storeName: 'users',
    keyPath: 'id',
    autoIncrement: true,
  }
)

// Initialize
await storage.init()

// Save data
await storage.save({
  name: 'John Doe',
  email: 'john@example.com',
  createdAt: Date.now()
})

// Query data
const users = await storage.query({ limit: 10 })

// Get single record
const user = await storage.get(1)

// Update data
await storage.update({
  id: 1,
  name: 'Jane Doe',
  email: 'jane@example.com',
  createdAt: Date.now()
})

// Delete record
await storage.delete(1)

// Clear all data
await storage.clear()
```

## Advanced Usage

### Auto Cleanup Configuration

```typescript
// Storage with auto-cleanup
const storage = new IndexedDBStorage<Log>(
  {
    dbName: 'app-logs',
    storeName: 'logs',
    maxRecords: 1000,                       // Optional: Keep at most 1000 records
    retentionTime: 7 * 24 * 60 * 60 * 1000, // Optional: Keep records for 7 days
    cleanupInterval: 60 * 60 * 1000,        // Optional: Run cleanup every hour
  },
  {
    storeName: 'logs',
    keyPath: 'id',
    autoIncrement: true,
    indexes: [
      { name: 'timestamp', keyPath: 'timestamp' }
    ]
  }
)

await storage.init()

/**
 * Note:
 * - Cleanup logic is triggered ONLY if maxRecords or retentionTime is set.
 * - Periodic cleanup starts ONLY if cleanupInterval is provided.
 */
```

### Custom Database Configuration

```typescript
import { IndexedDBStorage } from '@chaeco/indexed-db-storage'
import type { StoreConfig } from '@chaeco/indexed-db-storage'

const storeConfig: StoreConfig = {
  storeName: 'products',
  keyPath: 'id',
  autoIncrement: false,
  indexes: [
    { name: 'category', keyPath: 'category' },
    { name: 'price', keyPath: 'price' },
  ]
}

const storage = new IndexedDBStorage(
  {
    dbName: 'shop',
    storeName: 'products',
  },
  storeConfig
)

await storage.init()
```

### Querying with Indexes

```typescript
// Query by index
const products = await storage.query({
  indexName: 'category',
  range: IDBKeyRange.only('electronics'),
  limit: 20
})

// Range query
const expensiveProducts = await storage.query({
  indexName: 'price',
  range: IDBKeyRange.lowerBound(1000),
  limit: 10
})
```

### Advanced Query (where conditions)

```typescript
// 1. Equality check
const results = await storage.query({
  where: { field: 'age', operator: 'eq', value: 25 }
})

// 2. Comparison/Range
const results = await storage.query({
  where: { field: 'age', operator: 'gt', value: 30 } // > 30
})

const results = await storage.query({
  where: { field: 'age', operator: 'between', value: [25, 35] } // range [25, 35]
})

// 3. String operators
const results = await storage.query({
  where: { field: 'name', operator: 'contains', value: 'hn' } // e.g. "John"
})

const results = await storage.query({
  where: { field: 'name', operator: 'startsWith', value: 'Jo' } // Starts with "Jo"
})
```

For more details, see the [Advanced Query Documentation](./docs/advanced-query.md).

### Bulk Operations

```typescript
// Insert many records in ONE transaction (all-or-nothing)
const keys = await storage.bulkAdd(users)

// Upsert many records in ONE transaction
await storage.bulkPut(users)

// Delete many records by key, returns the number actually deleted
const deleted = await storage.bulkDelete([1, 2, 3])

// Batch read in one transaction; missing keys map to undefined
const found = await storage.getMany([1, 2, 3])
```

### Atomic Transactions

```typescript
// All writes share one IDBTransaction — any failure rolls back everything.
// Note: only await IDB requests inside the scope (see JSDoc for details).
await storage.runInTransaction('readwrite', async tx => {
  await tx.save(order)
  await tx.update(inventory)
})
```

### Keyset Pagination (infinite scroll)

```typescript
// First page
const page1 = await storage.query({ limit: 20 })

// Next page — no offset scan cost, constant per page
const page2 = await storage.query({ after: page1[page1.length - 1].id, limit: 20 })

// Previous page (descending)
const prev = await storage.query({
  before: page1[0].id,
  direction: 'prev',
  limit: 20,
})
```

### Streaming Iteration & Bulk Delete by Query

```typescript
// Stream through all records without loading everything into memory
await storage.iterate((user, key) => {
  console.log(user.name, key)
})

// Delete by condition in one transaction (e.g. purge a conversation)
await storage.deleteMany({ where: { field: 'channelId', operator: 'eq', value: channelId } })

// Keys-only queries (no value deserialization)
const ids = await storage.queryKeys({ where: { field: 'active', operator: 'eq', value: true } })
```

### Cross-Tab Write Events

```typescript
// Fires for local writes and writes from other tabs (BroadcastChannel)
const off = storage.onWrite(event => {
  // event: { storeName, type, keys?, source: 'local' | 'remote' }
  refreshUI()
})

// Stop listening
off()
```

### Storage Quota & Persistence

```typescript
// Ask the browser to keep this origin's storage (best-effort)
await IndexedDBStorage.requestPersistence()

// Origin-level quota usage
const { usage, quota } = (await IndexedDBStorage.estimate()) ?? {}
```

### Data Migrations

```typescript
const storage = new IndexedDBStorage<User>(
  {
    dbName: 'my-app',
    storeName: 'users',
    // Bump to trigger the upgrade event, even without schema changes
    version: 2,
    // Runs inside the upgrade transaction, after index changes are applied.
    // Seed new databases (oldVersion === 0) or migrate old record shapes.
    onUpgrade: async ctx => {
      const store = ctx.tx.objectStore('users')
      const all = await new Promise(resolve => {
        const req = store.getAll()
        req.onsuccess = () => resolve(req.result)
      })
      for (const record of all) {
        await store.put({ ...record, migratedAt: Date.now() })
      }
    },
  }
  // ...
)
```

⚠️ Only await IndexedDB requests inside `onUpgrade`; non-IDB awaits let the upgrade transaction auto-commit (spec behavior).

### Cross-Store Atomic Transactions

```typescript
// One transaction spanning two stores of the same database
await orders.runInTransaction(
  'readwrite',
  async tx => {
    await tx.save(order)
    await tx.forStore('stocks').put({ item: order.item, qty: stock.qty - 2 })
  },
  { stores: ['stocks'] }
)
```

### Backup & Restore

```typescript
const snapshot = await storage.exportData()      // all records
await storage.importData(snapshot, { clearBefore: true }) // wipe + restore
```

## License

MIT
