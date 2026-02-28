# 高级查询功能快速参考

## 查询操作符

| 操作符 | 说明 | 示例 |
|--------|------|------|
| `eq` | 等于 | `{ field: 'age', operator: 'eq', value: 25 }` |
| `ne` | 不等于 | `{ field: 'status', operator: 'ne', value: 'deleted' }` |
| `gt` | 大于 | `{ field: 'score', operator: 'gt', value: 80 }` |
| `gte` | 大于等于 | `{ field: 'age', operator: 'gte', value: 18 }` |
| `lt` | 小于 | `{ field: 'price', operator: 'lt', value: 100 }` |
| `lte` | 小于等于 | `{ field: 'stock', operator: 'lte', value: 10 }` |
| `between` | 在范围内 | `{ field: 'age', operator: 'between', value: [18, 65] }` |
| `in` | 在数组中 | `{ field: 'category', operator: 'in', value: ['A', 'B'] }` |
| `contains` | 包含（字符串） | `{ field: 'name', operator: 'contains', value: '李' }` |
| `startsWith` | 开头匹配 | `{ field: 'email', operator: 'startsWith', value: 'admin' }` |
| `endsWith` | 结尾匹配 | `{ field: 'file', operator: 'endsWith', value: '.jpg' }` |

## 常用查询示例

### 1. 简单条件查询

```typescript
// 查询年龄等于 25 的记录
const results = await storage.query({
  where: { field: 'age', operator: 'eq', value: 25 }
})

// 查询价格大于 100 的商品
const results = await storage.query({
  where: { field: 'price', operator: 'gt', value: 100 }
})
```

### 2. 多条件查询（AND）

```typescript
// 查询年龄 > 25 且部门是工程的员工
const results = await storage.query({
  where: [
    { field: 'age', operator: 'gt', value: 25 },
    { field: 'department', operator: 'eq', value: '工程' }
  ]
})
```

### 3. 范围查询

```typescript
// 查询年龄在 25-35 之间的记录
const results = await storage.query({
  where: { field: 'age', operator: 'between', value: [25, 35] }
})

// 查询价格 >= 50 且 <= 200
const results = await storage.query({
  where: [
    { field: 'price', operator: 'gte', value: 50 },
    { field: 'price', operator: 'lte', value: 200 }
  ]
})
```

### 4. 数组和字符串查询

```typescript
// 查询部门在指定列表中的员工
const results = await storage.query({
  where: { field: 'department', operator: 'in', value: ['工程', '产品', '设计'] }
})

// 查询名字包含"李"的员工
const results = await storage.query({
  where: { field: 'name', operator: 'contains', value: '李' }
})

// 查询邮箱以 @company.com 结尾的用户
const results = await storage.query({
  where: { field: 'email', operator: 'endsWith', value: '@company.com' }
})
```

### 5. 排序

```typescript
// 按年龄升序排序
const results = await storage.query({
  sort: { field: 'age', order: 'asc' }
})

// 按年龄降序排序
const results = await storage.query({
  sort: { field: 'age', order: 'desc' }
})

// 多字段排序：先按部门升序，再按工资降序
const results = await storage.query({
  sort: [
    { field: 'department', order: 'asc' },
    { field: 'salary', order: 'desc' }
  ]
})
```

### 6. 自定义过滤函数

```typescript
// 查询年龄是偶数的员工
const results = await storage.query({
  filter: (item) => item.age % 2 === 0
})

// 复杂条件：年龄 > 25 且工资 > 8000
const results = await storage.query({
  filter: (item) => item.age > 25 && item.salary > 8000
})

// 结合 where 和 filter
const results = await storage.query({
  where: { field: 'department', operator: 'eq', value: '工程' },
  filter: (item) => item.salary >= 8000 && item.experience > 2
})
```

### 7. 分页查询

```typescript
// 第一页（每页 10 条）
const page1 = await storage.query({
  limit: 10,
  offset: 0
})

// 第二页
const page2 = await storage.query({
  limit: 10,
  offset: 10
})

// 带排序的分页
const results = await storage.query({
  sort: { field: 'createdAt', order: 'desc' },
  limit: 20,
  offset: 0
})
```

### 8. 组合查询

```typescript
// 复杂组合查询
const results = await storage.query({
  // 条件：年龄 >= 25，部门是工程或产品
  where: [
    { field: 'age', operator: 'gte', value: 25 },
    { field: 'department', operator: 'in', value: ['工程', '产品'] }
  ],
  // 自定义过滤：工资 > 8000
  filter: (item) => item.salary > 8000,
  // 排序：按工资降序
  sort: { field: 'salary', order: 'desc' },
  // 分页：取前 10 条
  limit: 10,
  offset: 0
})
```

### 9. 嵌套字段查询

```typescript
interface User {
  id: number
  name: string
  address: {
    city: string
    country: string
  }
}

// 查询地址中城市为北京的用户
const results = await storage.query({
  where: { field: 'address.city', operator: 'eq', value: '北京' }
})
```

## 性能提示

1. **使用索引**：对于频繁查询的字段，创建索引可以提高性能

   ```typescript
   const storage = new IndexedDBStorage(
     { dbName: 'app', storeName: 'users' },
     {
       storeName: 'users',
       keyPath: 'id',
       autoIncrement: true,
       indexes: [
         { name: 'age', keyPath: 'age' },
         { name: 'department', keyPath: 'department' }
       ]
     }
   )
   ```

2. **结合 range 和 where**：当使用索引查询时，可以结合 `range` 和 `where` 提高效率

   ```typescript
   const results = await storage.query({
     indexName: 'age',
     range: IDBKeyRange.lowerBound(25), // 使用索引快速过滤
     where: { field: 'department', operator: 'eq', value: '工程' } // 再进一步筛选
   })
   ```

3. **避免全表扫描**：尽量使用 where 条件或索引，避免仅使用 filter 导致全表扫描

4. **合理分页**：对于大量数据，使用 `limit` 和 `offset` 进行分页，避免一次性加载所有数据

## TypeScript 类型定义

```typescript
interface QueryOptions {
  limit?: number
  offset?: number
  indexName?: string
  range?: IDBKeyRange
  direction?: IDBCursorDirection
  where?: WhereCondition | WhereCondition[]
  sort?: SortOption | SortOption[]
  filter?: <T>(item: T) => boolean
  includeTotal?: boolean
}

interface WhereCondition {
  field: string
  operator: QueryOperator
  value: unknown
}

type QueryOperator =
  | 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte'
  | 'between' | 'in' | 'contains' | 'startsWith' | 'endsWith'

interface SortOption {
  field: string
  order: 'asc' | 'desc'
}
```

## 迁移指南

如果你的代码使用旧版本的查询 API，可以这样迁移：

### 旧版本

```typescript
// 使用 IDBKeyRange
const results = await storage.query({
  range: IDBKeyRange.lowerBound(25)
})
```

### 新版本

```typescript
// 使用 where 条件（更直观）
const results = await storage.query({
  where: { field: 'age', operator: 'gte', value: 25 }
})

// 或者继续使用 range（兼容）
const results = await storage.query({
  range: IDBKeyRange.lowerBound(25)
})
```

两种方式都支持，推荐使用新的 `where` 语法，更直观易读。
