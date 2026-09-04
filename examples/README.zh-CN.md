# 示例说明

本目录包含 IndexedDB Storage 的使用示例。

## 运行示例

### 方法 1：构建后运行

1. 构建项目：

```bash
npm run build

```

1. 使用任意 HTTP 服务器运行示例，例如：

```bash

# 使用 Python

python3 -m http.server 8000

# 或使用 Node.js

npx serve .

# 或使用 VS Code Live Server 扩展

```

1. 在浏览器中打开：

- 基础示例: [http://localhost:8000/examples/basic.html](http://localhost:8000/examples/basic.html)

- 日志示例: [http://localhost:8000/examples/logger.html](http://localhost:8000/examples/logger.html)

- 高级查询示例: [http://localhost:8000/examples/advanced-query.html](http://localhost:8000/examples/advanced-query.html)
- 批量与事务示例: [http://localhost:8000/examples/bulk-transaction.html](http://localhost:8000/examples/bulk-transaction.html)

### 方法 2：使用开发服务器

如果你有 Vite 或其他开发服务器，也可以直接运行。

## 示例详情

### bulk-transaction.html - 批量操作与事务

演示：

- `bulkAdd` / `getMany` / `deleteMany` 单事务批量操作

- `runInTransaction` 跨 store 原子写入（`forStore`）与回滚

- keyset 分页（`after` 游标）实现无限滚动

- `onWrite` 订阅（本地 + 跨标签页）与 `exportData` / `importData`

### basic.html - 基础 CRUD 操作

演示：

- 初始化存储

- 保存数据

- 查询数据

- 清空数据

- 自动清理功能

### logger.html - 日志系统

演示一个完整的日志管理系统：

- 不同级别的日志（Error, Warn, Info, Debug）

- 日志查询和过滤

- 统计信息

- 自动清理旧日志

### advanced-query.html - 高级查询功能

演示强大的查询功能：

- **条件查询（where）**：等值、范围、字符串匹配等
  - 等值查询：`eq`, `ne`
  - 范围查询：`gt`, `gte`, `lt`, `lte`, `between`
  - 字符串查询：`contains`, `startsWith`, `endsWith`
  - 数组查询：`in`
  - 多条件查询（AND）

- **排序功能（sort）**：单字段和多字段排序

- **自定义过滤（filter）**：使用函数进行复杂条件过滤

- **组合查询**：where + sort + filter + limit + offset

- **分页查询**：完整的分页实现

## 注意事项

- 示例需要在 HTTP 服务器上运行（不能直接用 file:// 协议打开）

- 确保已经运行 `npm run build` 生成 dist 目录

- IndexedDB 数据存储在浏览器中，可以在开发者工具中查看
