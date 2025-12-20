# @chaeco/indexed-db-storage

[![npm version](https://img.shields.io/npm/v/@chaeco/indexed-db-storage.svg)](https://www.npmjs.com/package/@chaeco/indexed-db-storage)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

通用 IndexedDB 存储解决方案，为浏览器端提供强大的持久化存储能力。

## ✨ 特性

- 🎯 **通用存储** - 支持任意数据类型，不限于特定场景

- 🔒 **类型安全** - 完整的 TypeScript 泛型支持

- 🔄 **单例模式** - 基于 `dbName:storeName` 自动管理实例

- 🧹 **自动清理** - 可配置的数据清理机制（按时间/数量）

- ⚙️ **灵活配置** - 自定义 keyPath、索引等数据库配置

- 📦 **零依赖** - 无外部依赖，轻量级设计

- 🚀 **现代化** - 基于 Promise 的异步 API

- ✅ **测试完善** - 24 个测试用例，覆盖率 69%

## 安装

```bash
npm install git+ssh://git@github.com:chaeco/indexed-db-storage.git

# 或者使用 HTTPS
npm install https://github.com/chaeco/indexed-db-storage.git
```

## 快速开始

```typescript
import { IndexedDBStorage } from '@chaeco/indexed-db-storage'

// 定义数据类型
interface User {
  id?: number
  name: string
  email: string
  createdAt: number
}

// 创建存储实例
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

// 初始化
await storage.init()

// 保存数据
await storage.save({
  name: 'John Doe',
  email: 'john@example.com',
  createdAt: Date.now()
})

// 查询数据
const users = await storage.query({ limit: 10 })

// 获取单条数据
const user = await storage.get(1)

// 更新数据
await storage.update({
  id: 1,
  name: 'Jane Doe',
  email: 'jane@example.com',
  createdAt: Date.now()
})

// 删除数据
await storage.delete(1)

// 清空所有数据
await storage.clear()

```

## 高级用法

### 自动清理配置

```typescript
// 带自动清理的存储
const storage = new IndexedDBStorage<Log>(
  {
    dbName: 'app-logs',
    storeName: 'logs',
    maxRecords: 1000,                       // 可选：最多保留 1000 条
    retentionTime: 7 * 24 * 60 * 60 * 1000, // 可选：保留 7 天
    cleanupInterval: 60 * 60 * 1000,        // 可选：每小时清理一次
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

// 注意：
// - 如果不配置 maxRecords/retentionTime/cleanupInterval，则不会启用自动清理
// - cleanupInterval 必须配置才会启动定时清理
// - maxRecords 或 retentionTime 至少配置一个才会触发清理逻辑

```

### 自定义数据库配置

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

### 使用索引查询

```typescript
// 按索引查询
const products = await storage.query({
  indexName: 'category',
  range: IDBKeyRange.only('electronics'),
  limit: 20
})

// 范围查询
const expensiveProducts = await storage.query({
  indexName: 'price',
  range: IDBKeyRange.lowerBound(1000),
  limit: 10
})

```

### 实例复用

```typescript
// 相同配置会返回同一实例
const storage1 = new IndexedDBStorage({
  dbName: 'my-app',
  storeName: 'users'
})

const storage2 = new IndexedDBStorage({
  dbName: 'my-app',
  storeName: 'users'
})

console.log(storage1 === storage2) // true

// 不同 storeName 会创建独立实例
const storage3 = new IndexedDBStorage({
  dbName: 'my-app',
  storeName: 'posts'
})

console.log(storage1 === storage3) // false

```

### 手动清理

```typescript
// 手动触发清理（不需要配置自动清理参数）
await storage.cleanup()

// 获取记录数
const count = await storage.count()
console.log(`当前有 ${count} 条记录`)

```

## API 文档

### 构造函数

```typescript
new IndexedDBStorage<T>(options: StorageOptions, storeConfig?: StoreConfig)

```

**参数：**

`options` (StorageOptions):

- `dbName` (string, 必填) - 数据库名称

- `storeName` (string, 必填) - 对象存储名称

- `maxRecords` (number, 可选) - 最大记录数，超出后触发清理

- `retentionTime` (number, 可选) - 数据保留时间（毫秒）。**不配置则不限制数量**

- `retentionTime` (number, 可选) - 数据保留时间（毫秒）。**不配置则不限制时间**

- `cleanupInterval` (number, 可选) - 自动清理间隔（毫秒）。**必须配置才会启动定时清理**

- `timestampIndexName` (string, 可选) - 时间戳索引名称（用于按时间
`storeConfig` (StoreConfig, 可选):

- `storeName` (string, 必填) - 对象存储名称

- `keyPath` (string, 可选) - 主键字段名。**不配置则使用 out-of-line keys**

- `autoIncrement` (boolean, 可选) - 是否自动递增。**默认为 true**

- `indexes` (IndexConfig[], 可选) - 索引配置数组

### 实例方法

#### `async init(): Promise<void>`

初始化数据库。支持重复调用，只会初始化一次。

#### `async save(data: T): Promise<IDBValidKey>`

保存数据。返回生成的主键。

#### `async update(data: T): Promise<IDBValidKey>`

更新数据。返回主键。

#### `async query(options?: QueryOptions): Promise<T[]>`

查询数据。

**QueryOptions:**

- `limit` (number) - 返回数量限制

- `offset` (number) - 偏移量

- `indexName` (string) - 使用的索引名称

- `range` (IDBKeyRange) - 查询范围

- `direction` (IDBCursorDirection) - 排序方向

#### `async get(key: IDBValidKey): Promise<T | undefined>`

根据主键获取单条数据。

#### `async delete(key: IDBValidKey): Promise<void>`

根据主键删除数据。

#### `async clear(): Promise<void>`

清空所有数据。

#### `async count(): Promise<number>`

获取记录总数。

#### `async cleanup(): Promise<void>`

手动触发清理操作。

#### `close(): void`

关闭数据库连接。

#### `destroy(): void`

销毁实例（关闭连接并从缓存中移除）。

### 静态方法

#### `static clearInstance(options?: StorageOptions): void`

清除指定的实例缓存。不传参数则清除所有实例。

## 📁 项目结构

```text
src/
├── core/
│   ├── config-manager.ts    # 配置管理
│   └── data-operations.ts   # CRUD 操作
├── managers/
│   ├── instance.ts          # 实例管理
│   ├── database.ts          # 数据库初始化
│   └── cleanup.ts           # 清理管理
├── types/
│   ├── config.ts            # 配置类型
│   ├── operations.ts        # 操作类型
│   └── storage.ts           # 存储类型
├── storage.ts               # 主存储类
└── index.ts                 # 入口导出

```

场景

- **用户数据

## 💡 使用缓存** - 离线优先的应用

- **表单草稿** - 防止数据丢失

- **聊天记录** - 本地消息存储

- **购物车** - 跨会话持久化

- **日志收集** - 客户端日志

- **文件管理** - 上传文件元数据

- **游戏存档** - 本地进度保存

## 🌐 浏览器兼容性

| 浏览器  | 最低版本 |
| ------- | ------- |
| Chrome  | 11+ ✅  |
| Firefox | 10+ ✅  |
| Safari  | 10+ ✅  |
| Edge    | 15+ ✅  |
| Opera   | 15+ ✅  |
| IE      | ❌ 不支持 |

## 📚 示例

查看 [examples](./examples) 目录获取更多示例：

- [basic.html](./examples/basic.html) - 基础 CRUD 操作

- [logger.html](./examples/logger.html) - 日志系统示例

## 🔧 开发

```bash

# 安装依赖

npm install

# 运行测试

npm test

# 构建

npm run build

# 代码检查

npm run lint

# 格式化

npm run format

```

MIT © [chaeco](https://github.com/chaeco)
