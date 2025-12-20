/**
 * 查询操作相关类型
 */

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
