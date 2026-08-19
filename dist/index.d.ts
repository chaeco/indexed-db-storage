/**
 * 配置相关类型定义
 */
/**
 * 对象存储配置
 */
interface StoreConfig {
    /** 对象存储名称 */
    storeName: string;
    /** 主键路径 */
    keyPath?: string;
    /** 是否自动递增 */
    autoIncrement?: boolean;
    /** 索引配置 */
    indexes?: IndexConfig[];
}
/**
 * 索引配置
 */
interface IndexConfig {
    /** 索引名称 */
    name: string;
    /** 索引键路径 */
    keyPath: string | string[];
    /** 索引选项 */
    options?: IDBIndexParameters;
}
/**
 * 存储配置选项
 */
interface StorageOptions {
    /** 数据库名称 */
    dbName: string;
    /** 对象存储名称 */
    storeName: string;
    /** 最大记录数（可选，必须为正整数） */
    maxRecords?: number;
    /** 数据保留时间（毫秒，可选，必须 > 0） */
    retentionTime?: number;
    /** 清理间隔（毫秒，可选，必须 > 0） */
    cleanupInterval?: number;
    /** 时间戳索引名称（用于清理，可选） */
    timestampIndexName?: string;
}
/**
 * 清理配置（由 ConfigManager.getCleanupConfig() 构造，cleanupInterval 始终有值）
 */
interface CleanupConfig {
    /** 最大记录数 */
    maxRecords?: number;
    /** 保留时间（毫秒） */
    retentionTime?: number;
    /**
     * 清理间隔（毫秒）。
     * 此字段在 CleanupConfig 对象内始终为正数——getCleanupConfig() 在
     * cleanupInterval 未设置时直接返回 null，不会构造出该对象。
     */
    cleanupInterval: number;
    /** 时间戳索引名称 */
    timestampIndexName?: string;
}

/**
 * 查询操作相关类型
 */
/**
 * 查询条件操作符
 */
type QueryOperator = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'between' | 'in' | 'contains' | 'startsWith' | 'endsWith';
/**
 * 单个查询条件
 */
interface WhereCondition {
    /**
     * 字段名。支持点分隔的嵌套路径（如 `"user.address.city"`）。
     * 路径中若包含空段（如 `"a..b"`）或访问到 null/undefined 的中间节点，
     * 该条件将视作字段值为 `undefined`，不会抛出错误。
     */
    field: string;
    /** 操作符 */
    operator: QueryOperator;
    /** 值 */
    value: unknown;
}
/**
 * 排序选项
 */
interface SortOption {
    /**
     * 排序字段名。支持点分隔的嵌套路径（如 `"meta.createdAt"`），
     * 与 {@link WhereCondition.field} 语义一致。
     * `null`/`undefined` 值的记录始终排在末尾。
     */
    field: string;
    /** 排序方向 */
    order: 'asc' | 'desc';
}
/**
 * 查询选项
 */
interface QueryOptions {
    /**
     * 返回数量限制。
     *
     * 在游标路径（存在 `where` 或 `filter`）且**没有排序**时，limit 可在收集到
     * `offset + limit` 条记录后**提前终止游标遍历**，避免扫描整个 store。
     * 当存在排序时需要遍历所有匹配记录才能正确排序，limit 仅在最终切片阶段应用。
     * 大数据量且有排序需求时，请结合 `range`（IDBKeyRange）缩小扫描范围。
     */
    limit?: number;
    /** 偏移量 */
    offset?: number;
    /** 索引名称 */
    indexName?: string;
    /** 查询范围 */
    range?: IDBKeyRange;
    /**
     * 游标遍历方向。
     * 仅在游标路径下有效（即存在 `where` 或 `filter` 条件时）。
     * 在 getAll 路径（无 where/filter）下此选项会被忽略并输出 `console.warn`。
     */
    direction?: IDBCursorDirection;
    /** 查询条件（支持多条件） */
    where?: WhereCondition | WhereCondition[];
    /** 排序（支持多字段排序） */
    sort?: SortOption | SortOption[];
    /**
     * 自定义过滤函数。返回 `true` 表示保留该条记录。
     *
     * **注意**：过滤函数若抛出异常，该异常会被 IndexedDB 事务捕获并中止事务，
     * Promise 将以 `"Transaction aborted"` 拒绝，而非原始异常。
     * 请确保过滤函数内部不会抛出，或在函数内部自行 `try/catch`。
     */
    filter?: <T>(item: T) => boolean;
}

/**
 * 存储相关类型定义
 */

/**
 * 存储实例接口
 */
interface IStorage<T = unknown> {
    /** 初始化 */
    init(): Promise<void>;
    /** 保存数据 */
    save(data: T): Promise<IDBValidKey>;
    /** 更新数据（upsert：主键已存在则替换，否则插入） */
    update(data: T): Promise<IDBValidKey>;
    /** 查询数据 */
    query(options?: QueryOptions): Promise<T[]>;
    /** 获取单条数据 */
    get(key: IDBValidKey): Promise<T | undefined>;
    /** 删除数据 */
    delete(key: IDBValidKey): Promise<void>;
    /** 清空数据 */
    clear(): Promise<void>;
    /** 获取总数 */
    count(): Promise<number>;
    /**
     * 手动触发一次清理（不依赖定时器，始终可调用）。
     * 若构造时未配置 maxRecords/retentionTime，此方法是 no-op，不抛出错误。
     */
    cleanup(): Promise<void>;
    /**
     * 关闭数据库连接，但**保留**单例缓存中的注册记录。
     * 关闭后以相同参数 `new IndexedDBStorage()` 仍返回此实例（需重新调用 `init()`）。
     * 若需同时清除单例注册，请改用 `destroy()`。
     */
    close(): void;
    /**
     * 关闭连接并从单例缓存中移除自身（= `close()` + 移除注册）。
     * 之后以相同参数 `new IndexedDBStorage()` 将创建全新实例。
     */
    destroy(): void;
}

/**
 * IndexedDB 通用存储类 - 主入口
 */

/**
 * IndexedDB 通用存储类
 *
 * @example
 * ```typescript
 * const storage = new IndexedDBStorage({
 *   dbName: 'my-app',
 *   storeName: 'users',
 * })
 *
 * await storage.init()
 * await storage.save({ name: 'John', age: 30 })
 * const data = await storage.query({ limit: 10 })
 * ```
 *
 * @example 开启自动清理
 * ```typescript
 * const storage = new IndexedDBStorage({
 *   dbName: 'app-logs',
 *   storeName: 'logs',
 *   maxRecords: 1000,
 *   cleanupInterval: 60 * 60 * 1000, // cleanupInterval 必须与 maxRecords/retentionTime 同时配置
 * })
 * ```
 */
declare class IndexedDBStorage<T = unknown> implements IStorage<T> {
    private config;
    private db;
    private cleanupManager?;
    private initPromise;
    private _initGeneration;
    constructor(options: StorageOptions, storeConfig?: StoreConfig);
    /**
     * 关闭并从单例缓存中移除指定实例。
     * 传入 options 时精确移除对应实例；不传时清除所有实例。
     */
    static clearInstance(options?: StorageOptions): void;
    /**
     * 初始化数据库
     */
    init(): Promise<void>;
    /**
     * 保存数据
     */
    save(data: T): Promise<IDBValidKey>;
    /**
     * 更新数据（upsert 语义）。
     *
     * 底层使用 IndexedDB `put()`：若指定主键的记录已存在则替换整条记录，
     * 若不存在则插入新记录。如需严格"仅更新已有记录"语义，请先调用
     * `get()` 确认记录存在后再调用此方法。
     */
    update(data: T): Promise<IDBValidKey>;
    /**
     * 查询数据
     */
    query(options?: QueryOptions): Promise<T[]>;
    /**
     * 根据主键获取数据
     */
    get(key: IDBValidKey): Promise<T | undefined>;
    /**
     * 删除数据
     */
    delete(key: IDBValidKey): Promise<void>;
    /**
     * 清空所有数据
     */
    clear(): Promise<void>;
    /**
     * 获取记录总数
     */
    count(): Promise<number>;
    /**
     * 手动触发一次清理，不依赖定时器。
     * 若构造时未配置 maxRecords/retentionTime，此方法是 no-op，不抛出错误。
     */
    cleanup(): Promise<void>;
    /** close() / destroy() 的内部辅助，停止清理定时器 */
    private stopCleanupTimer;
    /**
     * 关闭数据库连接。
     * 若 init() 正在进行中，世代递增会使其结果失效并抛出错误，避免竞态连接泄漏。
     */
    close(): void;
    /**
     * 关闭连接并从单例缓存中移除此实例（= close + removeInstance）。
     * 之后以相同参数调用 `new IndexedDBStorage()` 将创建全新实例。
     */
    destroy(): void;
    /**
     * 确保数据库已初始化
     */
    private ensureInitialized;
}

export { IndexedDBStorage };
export type { CleanupConfig, IStorage, IndexConfig, QueryOptions as IndexedDBQueryOptions, StorageOptions as IndexedDBStorageOptions, QueryOperator, QueryOptions, SortOption, StorageOptions, StoreConfig, WhereCondition };
