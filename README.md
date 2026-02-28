# @chaeco/indexed-db-storage

[![npm version](https://img.shields.io/npm/v/@chaeco/indexed-db-storage.svg)](https://www.npmjs.com/package/@chaeco/indexed-db-storage)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

English | [简体中文](./README.zh-CN.md)

A universal IndexedDB storage solution providing powerful persistent storage capabilities for the browser.

## ✨ Features

- 🎯 **Universal Storage** - Supports any data type, not limited to specific scenarios.
- 🔍 **Powerful Querying** - Supports `where` conditions, multi-field sorting, custom filtering, and complex range queries.
- 🔒 **Type Safe** - Full TypeScript generic support for robust data handling.
- 🔄 **Singleton Pattern** - Automatically manages instances based on `dbName` + `storeName` combinations, reusing connections for identical configurations.
- 🧹 **Auto Cleanup** - Configurable data retention mechanisms based on capacity or age.
- ⚙️ **Flexible Configuration** - Customize `keyPath`, indexes, and other database settings.
- 📦 **Zero Dependencies** - Lightweight design with no external dependencies.
- 🚀 **Modern API** - Promise-based asynchronous API for seamless integration with `async/await`.
- ✅ **Well Tested** - 83 test cases with extensive coverage of core logic and edge cases.

## Installation

```bash
npm install github:chaeco/indexed-db-storage
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

## License

MIT
