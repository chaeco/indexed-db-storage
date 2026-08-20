/**
 * 查询操作相关类型
 */

/**
 * 查询条件操作符
 */
export type QueryOperator =
  | 'eq' // 等于
  | 'ne' // 不等于
  | 'gt' // 大于
  | 'gte' // 大于等于
  | 'lt' // 小于
  | 'lte' // 小于等于
  | 'between' // 在范围内
  | 'in' // 在数组中
  | 'contains' // 包含（字符串）
  | 'startsWith' // 开头匹配（字符串）
  | 'endsWith' // 结尾匹配（字符串）

/**
 * 单个查询条件
 */
export interface WhereCondition {
  /**
   * 字段名。支持点分隔的嵌套路径（如 `"user.address.city"`）。
   * 路径中若包含空段（如 `"a..b"`）或访问到 null/undefined 的中间节点，
   * 该条件将视作字段值为 `undefined`，不会抛出错误。
   */
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
  /**
   * 排序字段名。支持点分隔的嵌套路径（如 `"meta.createdAt"`），
   * 与 {@link WhereCondition.field} 语义一致。
   * `null`/`undefined` 值的记录始终排在末尾。
   */
  field: string
  /** 排序方向 */
  order: 'asc' | 'desc'
}

/**
 * 查询选项
 */
export interface QueryOptions {
  /**
   * 返回数量限制。
   *
   * 在游标路径（存在 `where` 或 `filter`）且**没有排序**时，limit 可在收集到
   * `offset + limit` 条记录后**提前终止游标遍历**，避免扫描整个 store。
   * 当存在排序时需要遍历所有匹配记录才能正确排序，limit 仅在最终切片阶段应用。
   * 大数据量且有排序需求时，请结合 `range`（IDBKeyRange）缩小扫描范围。
   */
  limit?: number
  /** 偏移量 */
  offset?: number
  /** 索引名称 */
  indexName?: string
  /** 查询范围 */
  range?: IDBKeyRange
  /**
   * 游标遍历方向。
   * 仅在游标路径下有效（即存在 `where` 或 `filter` 条件时）。
   * 在 getAll 路径（无 where/filter）下此选项会被忽略并输出 `console.warn`。
   */
  direction?: IDBCursorDirection
  /** 查询条件（支持多条件） */
  where?: WhereCondition | WhereCondition[]
  /** 排序（支持多字段排序） */
  sort?: SortOption | SortOption[]
  /**
   * 自定义过滤函数。返回 `true` 表示保留该条记录。
   *
   * **注意**：过滤函数若抛出异常，该异常会被 IndexedDB 事务捕获并中止事务，
   * Promise 将以 `"Transaction aborted"` 拒绝，而非原始异常。
   * 请确保过滤函数内部不会抛出，或在函数内部自行 `try/catch`。
   */
  filter?: <T>(item: T) => boolean
}
