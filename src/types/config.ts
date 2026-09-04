/**
 * 配置相关类型定义
 */

/**
 * 对象存储配置
 */
export interface StoreConfig {
  /** 对象存储名称 */
  storeName: string
  /** 主键路径 */
  keyPath?: string
  /** 是否自动递增 */
  autoIncrement?: boolean
  /** 索引配置 */
  indexes?: IndexConfig[]
}

/**
 * 索引配置
 */
export interface IndexConfig {
  /** 索引名称 */
  name: string
  /** 索引键路径 */
  keyPath: string | string[]
  /** 索引选项 */
  options?: IDBIndexParameters
}

/**
 * 存储配置选项
 */
export interface StorageOptions {
  /** 数据库名称 */
  dbName: string
  /** 对象存储名称 */
  storeName: string
  /** 最大记录数（可选，必须为正整数） */
  maxRecords?: number
  /** 数据保留时间（毫秒，可选，必须 > 0） */
  retentionTime?: number
  /** 清理间隔（毫秒，可选，必须 > 0） */
  cleanupInterval?: number
  /** 时间戳索引名称（用于清理，可选） */
  timestampIndexName?: string
  /**
   * 目标 schema 版本（可选，正整数）。配置后 init 以 max(当前版本, 该版本) 打开：
   * 即使没有 schema 变更也会触发升级事件，供 `onUpgrade` 做纯数据迁移。
   */
  version?: number
  /**
   * 数据库版本升级回调：在升级事务内、索引 schema 变更应用之后执行。
   * 用于旧数据结构迁移（字段改名/拆分等）；全新数据库（oldVersion === 0）
   * 时也可用于种子数据。
   *
   * ⚠️ 与 runInTransaction 相同：ctx 内只允许 await IndexedDB 请求，
   * await 非 IDB 异步操作会导致升级事务自动提交（IndexedDB 规范行为）。
   * 同步抛出错误或迁移请求失败会中止升级，init() 以该错误拒绝。
   */
  onUpgrade?: (ctx: UpgradeContext) => void | Promise<void>
}

/**
 * onUpgrade 迁移钩子的上下文
 */
export interface UpgradeContext {
  /** 升级前的版本号（全新数据库为 0） */
  oldVersion: number
  /** 升级后的版本号 */
  newVersion: number
  /**
   * 升级事务：可用于遍历/改写既有 store 的数据（此时 schema 变更已应用，
   * 新索引已可使用）。
   */
  tx: IDBTransaction
  /** 升级中的数据库连接（仅本次升级事件有效） */
  db: IDBDatabase
}

/**
 * 清理配置（由 ConfigManager.getCleanupConfig() 构造，cleanupInterval 始终有值）
 */
export interface CleanupConfig {
  /** 最大记录数 */
  maxRecords?: number
  /** 保留时间（毫秒） */
  retentionTime?: number
  /**
   * 清理间隔（毫秒）。
   * 此字段在 CleanupConfig 对象内始终为正数——getCleanupConfig() 在
   * cleanupInterval 未设置时直接返回 null，不会构造出该对象。
   */
  cleanupInterval: number
  /** 时间戳索引名称 */
  timestampIndexName?: string
}
