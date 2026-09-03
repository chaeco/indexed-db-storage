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
 *
 * @typeParam T 记录类型。用于 `filter` 回调的元素类型推导。
 */
interface QueryOptions<T = unknown> {
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
     * keyset 分页游标：从该键之后开始遍历（不含该键）。
     * 作用于主键（未指定 `indexName` 时）或 `indexName` 指定的索引键。
     * 与 `range` 互斥，同时提供将抛出错误。
     * 典型用法：把上一页最后一条记录的主键作为下一页的 `after`，
     * 避免 offset 分页越翻越慢的问题。
     */
    after?: IDBValidKey;
    /**
     * keyset 分页游标：遍历到该键之前结束（不含该键）。语义同 {@link QueryOptions.after}。
     * 配合 `direction: 'prev'` 可实现降序翻页（此时会走游标路径而非 getAll）。
     */
    before?: IDBValidKey;
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
    filter?: (item: T) => boolean;
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
    /**
     * 批量插入数据（单事务，全有或全无）。
     * 任一记录写入失败（如键冲突）时整个批次回滚并以首个错误 reject。
     */
    bulkAdd(items: T[]): Promise<IDBValidKey[]>;
    /**
     * 批量更新/插入数据（单事务 upsert，全有或全无）。
     * 任一记录写入失败时整个批次回滚并以首个错误 reject。
     */
    bulkPut(items: T[]): Promise<IDBValidKey[]>;
    /**
     * 批量删除数据（单事务）。
     * @returns 实际删除的记录数（删除不存在的 key 不算错误，也不计数）
     */
    bulkDelete(keys: IDBValidKey[]): Promise<number>;
    /** 查询数据 */
    query(options?: QueryOptions<T>): Promise<T[]>;
    /** 获取单条数据 */
    get(key: IDBValidKey): Promise<T | undefined>;
    /**
     * 批量获取数据（单事务）。结果与输入顺序一致；不存在的 key 对应 `undefined`。
     * 列表页按 ID 批量取详情时，替代循环 `get()`（N 个事务 → 1 个）。
     */
    getMany(keys: IDBValidKey[]): Promise<(T | undefined)[]>;
    /**
     * 流式遍历记录：游标逐条回调，不在内存中累积全量结果。
     * 适合大数据量导出/批处理。遍历顺序 = 游标顺序（主键序或 indexName 索引序），
     * 不支持 `sort`（传入将抛出错误）。
     * @param onItem 每条记录的回调（key 为记录主键，与遍历源无关）；返回 `false` 可提前终止遍历
     * @returns 实际回调的记录数
     */
    iterate(onItem: (item: T, key: IDBValidKey) => void | false, options?: QueryOptions<T>): Promise<number>;
    /**
     * 按查询条件批量删除（单事务）。支持 `where`/`filter`/`indexName`/`range`/
     * `after`/`before`/`direction`/`sort`/`limit`/`offset`（`sort`+`limit` 可实现
     * "删除最旧的 N 条"）。不带任何条件时等价于 `clear()`（大表清空请直接用 `clear()`）。
     * @returns 实际删除的记录数
     */
    deleteMany(options?: QueryOptions<T>): Promise<number>;
    /**
     * 只查询键、不反序列化记录值，适合存在性检查/批量取 ID。
     * 始终返回记录的**主键**（依据 IDB 规范，即使经 indexName 遍历亦为主键）。
     * 不支持 `sort`（传入将抛出错误）。
     */
    queryKeys(options?: QueryOptions<T>): Promise<IDBValidKey[]>;
    /**
     * 订阅写入事件（本标签页 + 其他标签页经 BroadcastChannel 同步的写入）。
     * 注意：BroadcastChannel 不可用的环境下仅收到本地事件；`close()` 会清空所有监听器。
     * @returns 取消订阅函数
     */
    onWrite(listener: (event: StorageWriteEvent) => void): () => void;
    /**
     * 在单个事务中原子执行一组操作。任何操作失败都会中止事务并回滚。
     *
     * ⚠️ 限制：scope 内只允许 await IndexedDB 请求（scope 提供的方法）。
     * 若 await 了非 IDB 的异步操作（fetch/setTimeout 等），事务会在事件循环
     * 空闲时自动提交，后续请求将抛出 InvalidStateError——这是 IndexedDB 规范行为。
     *
     * @example
     * ```ts
     * await storage.runInTransaction('readwrite', async tx => {
     *   await tx.save(order)
     *   await tx.update(inventory)
     * })
     * ```
     */
    runInTransaction<R>(mode: IDBTransactionMode, scope: (tx: ITransactionScope<T>) => Promise<R> | R): Promise<R>;
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
     * 同时会关闭跨标签页通知通道并清空 onWrite 监听器。
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
 * runInTransaction 的 scope：一组共享同一 IDBTransaction 的操作。
 * 任何操作失败都会中止整个事务并回滚。
 */
interface ITransactionScope<T = unknown> {
    get(key: IDBValidKey): Promise<T | undefined>;
    getMany(keys: IDBValidKey[]): Promise<(T | undefined)[]>;
    save(data: T): Promise<IDBValidKey>;
    update(data: T): Promise<IDBValidKey>;
    bulkAdd(items: T[]): Promise<IDBValidKey[]>;
    bulkPut(items: T[]): Promise<IDBValidKey[]>;
    delete(key: IDBValidKey): Promise<void>;
    bulkDelete(keys: IDBValidKey[]): Promise<number>;
    count(): Promise<number>;
    query(options?: QueryOptions<T>): Promise<T[]>;
}
/**
 * 写入事件（onWrite 回调参数）。
 */
interface StorageWriteEvent {
    /** 发生写入的 store 名称 */
    storeName: string;
    /** 写入类型 */
    type: 'add' | 'put' | 'delete' | 'bulkAdd' | 'bulkPut' | 'bulkDelete' | 'clear';
    /** 受影响记录的主键（`clear` 时无） */
    keys?: IDBValidKey[];
    /** 'local' = 本标签页；'remote' = 其他标签页（经 BroadcastChannel 同步） */
    source: 'local' | 'remote';
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
    private _writeListeners;
    private _writeChannel?;
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
     * 批量插入数据（单事务，全有或全无）。
     *
     * N 条数据仅使用 1 次事务，吞吐量显著高于逐条 save()。
     * 任一记录写入失败（如键冲突）时整个批次回滚并以首个错误 reject。
     */
    bulkAdd(items: T[]): Promise<IDBValidKey[]>;
    /**
     * 批量更新/插入数据（单事务 upsert，全有或全无）。
     */
    bulkPut(items: T[]): Promise<IDBValidKey[]>;
    /**
     * 批量删除数据（单事务）。
     * @returns 实际删除的记录数（删除不存在的 key 不算错误，也不计数）
     */
    bulkDelete(keys: IDBValidKey[]): Promise<number>;
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
    query(options?: QueryOptions<T>): Promise<T[]>;
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
     * 批量获取数据（单事务）。与输入顺序一致；不存在的 key 对应 undefined。
     */
    getMany(keys: IDBValidKey[]): Promise<(T | undefined)[]>;
    /**
     * 流式遍历记录：游标逐条回调，不在内存中累积全量结果。
     * onItem 返回 false 可提前终止。不支持 sort（传入将抛出错误）。
     * @returns 实际回调的记录数
     */
    iterate(onItem: (item: T, key: IDBValidKey) => void | false, options?: QueryOptions<T>): Promise<number>;
    /**
     * 按查询条件批量删除（单事务）。
     * sort+limit 可实现"删除最旧的 N 条"；不带条件时等价于 clear()。
     * @returns 实际删除的记录数
     */
    deleteMany(options?: QueryOptions<T>): Promise<number>;
    /**
     * 只查询键、不反序列化记录值。不支持 sort（传入将抛出错误）。
     * 未指定 indexName 时返回主键；指定时返回该索引的键。
     */
    queryKeys(options?: QueryOptions<T>): Promise<IDBValidKey[]>;
    /**
     * 订阅写入事件（本地写入 + 其他标签页经 BroadcastChannel 同步的写入）。
     * @returns 取消订阅函数
     */
    onWrite(listener: (event: StorageWriteEvent) => void): () => void;
    /** 分发写入事件给监听器；单个监听器异常不影响其他监听器 */
    private dispatchWrite;
    /** 写入操作完成后调用：通知本地监听器 + 广播到其他标签页 */
    private emitWrite;
    /**
     * 在单个事务中原子执行一组操作。任何操作失败都会中止事务并回滚。
     *
     * ⚠️ scope 内只允许 await IndexedDB 请求；await 非 IDB 异步操作会导致
     * 事务自动提交（IndexedDB 规范行为），后续请求将抛出 InvalidStateError。
     */
    runInTransaction<R>(mode: IDBTransactionMode, scope: (tx: ITransactionScope<T>) => Promise<R> | R): Promise<R>;
    /** 创建绑定到指定事务的操作集 */
    private createTransactionScope;
    /**
     * 请求将当前源（origin）标记为持久化存储，降低浏览器在存储压力下
     * 驱逐本库数据的概率。注意：对 Safari ITP 的"7 天不活跃清除"无效，
     * 该策略只能通过用户交互（如添加到主屏幕）规避。
     * @returns 用户授权结果；环境不支持时返回 null
     */
    static requestPersistence(): Promise<boolean | null>;
    /**
     * 查询当前源是否已被标记为持久化存储。
     * @returns 环境不支持时返回 null
     */
    static isPersistent(): Promise<boolean | null>;
    /**
     * 查询当前源的存储配额与用量（origin 级别，非单库）。
     * @returns 环境不支持时返回 null
     */
    static estimate(): Promise<StorageEstimate | null>;
    /**
     * save/bulk 后的 cleanup 触发。
     *
     * CleanupManager 自身有重入锁：上一轮清理未完成时 cleanup() 直接返回，
     * 因此这里无需额外时间窗去抖——高频写入时并发清理自然被跳过，
     * 同时保留"save 后过期数据尽快被清理"的语义（既有测试与文档依赖此行为）。
     * fire-and-forget，不影响 save/bulk 调用的响应时间。
     */
    private maybeTriggerCleanup;
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
export type { CleanupConfig, IStorage, ITransactionScope, IndexConfig, QueryOptions as IndexedDBQueryOptions, StorageOptions as IndexedDBStorageOptions, QueryOperator, QueryOptions, SortOption, StorageOptions, StorageWriteEvent, StoreConfig, WhereCondition };
