/**
 * 查询操作相关类型
 */

/**
 * 查询条件操作符
 */
export type QueryOperator =
  | 'eq'      // 等于
  | 'ne'      // 不等于
  | 'gt'      // 大于
  | 'gte'     // 大于等于
  | 'lt'      // 小于
  | 'lte'     // 小于等于
  | 'between' // 在范围内
  | 'in'      // 在数组中
  | 'contains'// 包含（字符串）
  | 'startsWith' // 开头匹配（字符串）
  | 'endsWith'   // 结尾匹配（字符串）

/**
 * 单个查询条件
 */
export interface WhereCondition {
  /** 字段名 */
  field: string
  /** 操作符 */
  operator: QueryOperator
  /** 值 */
  value: unknown
}

/**
 * 排序选项
 */
export interface SortOption {
  /** 字段名 */
  field: string
  /** 排序方向 */
  order: 'asc' | 'desc'
}

/**
 * 查询选项
 */
export interface QueryOptions {
  /** 返回数量限制 */
  limit?: number
  /** 偏移量 */
  offset?: number
  /** 索引名称 */
  indexName?: string
  /** 查询范围 */
  range?: IDBKeyRange
  /** 游标方向 */
  direction?: IDBCursorDirection
  /** 查询条件（支持多条件） */
  where?: WhereCondition | WhereCondition[]
  /** 排序（支持多字段排序） */
  sort?: SortOption | SortOption[]
  /** 自定义过滤函数 */
  filter?: <T>(item: T) => boolean
  /** 是否返回总数 */
  includeTotal?: boolean
}

/**
 * 查询结果
 */
export interface QueryResult<T> {
  /** 数据列表 */
  data: T[]
  /** 总数 */
  total?: number
  /** 是否还有更多数据 */
  hasMore?: boolean
}
