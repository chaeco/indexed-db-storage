/**
 * 数据操作 - 负责数据的增删查改
 */

import type { QueryOptions, WhereCondition, QueryOperator } from '../types/index'
import { openStore, resolveStore } from '../utils/idb'

/**
 * 将 IDBRequest 转为 Promise，统一 request 层错误处理。
 * 事务层错误由 openStore 绑定的 onerror/onabort 兜底。
 */
function reqToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(wrapCloneError(request.error, '写入'))
    request.onsuccess = () => resolve(request.result)
  })
}

/**
 * 结构化克隆失败（DataCloneError）的友好化包装。
 *
 * 真实场景：Vue 的 reactive() proxy 等无法被 IndexedDB structured clone，
 * 浏览器原始报错几乎无法定位原因——补充明确的修复指引，
 * 并通过 cause 保留原始错误。其他错误原样返回。
 */
function wrapCloneError(err: unknown, op: string): unknown {
  if (err && typeof err === 'object' && (err as { name?: string }).name === 'DataCloneError') {
    const wrapped = new Error(
      `[IndexedDBStorage] ${op} 失败：该值无法被 structured clone 写入 IndexedDB。\n` +
        '常见原因：传入了 Vue reactive()/ref().value 的 Proxy 等不可克隆对象。\n' +
        '修复：写入前转换为普通对象（如 Vue 的 toRaw(value) 或 JSON.parse(JSON.stringify(value))）。' +
        '注意：Date/Map/Set/TypedArray/ArrayBuffer 均可克隆，无需转换。'
    )
    ;(wrapped as Error & { cause?: unknown }).cause = err
    return wrapped
  }
  return err
}

/**
 * 保存数据到 IndexedDB
 */
export function saveData<T>(
  db: IDBDatabase,
  storeName: string,
  data: T,
  tx?: IDBTransaction
): Promise<IDBValidKey> {
  return new Promise((resolve, reject) => {
    const store = resolveStore(db, storeName, 'readwrite', reject, tx)
    try {
      resolve(reqToPromise(store.add(data)))
    } catch (err) {
      // structured clone 在请求创建时同步进行，克隆失败在此抛出
      reject(wrapCloneError(err, 'save()'))
    }
  })
}

/**
 * 更新（upsert）数据。
 *
 * 使用 `store.put()`：主键已存在则替换整条记录，否则插入新记录。
 */
export function updateData<T>(
  db: IDBDatabase,
  storeName: string,
  data: T,
  tx?: IDBTransaction
): Promise<IDBValidKey> {
  return new Promise((resolve, reject) => {
    const store = resolveStore(db, storeName, 'readwrite', reject, tx)
    try {
      resolve(reqToPromise(store.put(data)))
    } catch (err) {
      reject(wrapCloneError(err, 'update()'))
    }
  })
}

/**
 * 批量插入数据（bulkAdd）。
 *
 * 在**单个事务**内发出所有 add 请求，事务完成时统一 resolve，
 * 吞吐量显著高于逐条 save()（N 条数据 = 1 次事务而非 N 次）。
 *
 * 任一请求失败（如唯一键冲突）时整个事务中止，Promise 以首个错误 reject，
 * 已写入的记录随事务回滚——语义为"全有或全无"。
 *
 * @returns 与输入顺序一致的主键数组（`add` 语义，不含已存在记录的键）
 */
export function bulkAddData<T>(
  db: IDBDatabase,
  storeName: string,
  items: T[],
  tx?: IDBTransaction
): Promise<IDBValidKey[]> {
  if (items.length === 0) return Promise.resolve([])

  if (tx) {
    // 外部事务：不能依赖 tx.oncomplete（归 runInTransaction 所有），
    // 以每个请求的成功/失败作为完成信号
    const store = tx.objectStore(storeName)
    const keys: IDBValidKey[] = new Array(items.length)
    let requests: Promise<void>[]
    try {
      requests = items.map(
        (item, i) =>
          new Promise<void>((res, rej) => {
            const request = store.add(item)
            request.onsuccess = () => {
              keys[i] = request.result
              res()
            }
            request.onerror = () => rej(wrapCloneError(request.error, 'bulkAdd()'))
          })
      )
    } catch (err) {
      return Promise.reject(wrapCloneError(err, 'bulkAdd()'))
    }
    return Promise.all(requests).then(() => keys)
  }

  return new Promise((resolve, reject) => {
    const store = openStore(db, storeName, 'readwrite', reject)
    const keys: IDBValidKey[] = new Array(items.length)

    try {
      items.forEach((item, i) => {
        const request = store.add(item)
        request.onsuccess = () => {
          keys[i] = request.result
        }
        // onerror 不绑定：request 级失败会冒泡为事务 abort，由事务层 reject。
        // 绑定并阻止冒泡会变成"跳过失败项继续写"，那是 bulkPut 的语义。
      })
    } catch (err) {
      // 同步失败（如 structured clone 失败）：已入队的请求必须中止，
      // 否则事务会带着前半批数据提交，违背"全有或全无"
      try {
        store.transaction.abort()
      } catch {
        // 事务已结束
      }
      reject(wrapCloneError(err, 'bulkAdd()'))
      return
    }

    store.transaction.oncomplete = () => resolve(keys)
  })
}

/**
 * 批量更新/插入数据（bulkPut，upsert 语义）。
 *
 * 在**单个事务**内发出所有 put 请求。任一请求失败时整个事务中止，
 * Promise 以首个错误 reject，已写入的记录随事务回滚——语义为"全有或全无"。
 *
 * @returns 与输入顺序一致的主键数组
 */
export function bulkPutData<T>(
  db: IDBDatabase,
  storeName: string,
  items: T[],
  tx?: IDBTransaction
): Promise<IDBValidKey[]> {
  if (items.length === 0) return Promise.resolve([])

  if (tx) {
    const store = tx.objectStore(storeName)
    const keys: IDBValidKey[] = new Array(items.length)
    let requests: Promise<void>[]
    try {
      requests = items.map(
        (item, i) =>
          new Promise<void>((res, rej) => {
            const request = store.put(item)
            request.onsuccess = () => {
              keys[i] = request.result
              res()
            }
            request.onerror = () => rej(wrapCloneError(request.error, 'bulkPut()'))
          })
      )
    } catch (err) {
      return Promise.reject(wrapCloneError(err, 'bulkPut()'))
    }
    return Promise.all(requests).then(() => keys)
  }

  return new Promise((resolve, reject) => {
    const store = openStore(db, storeName, 'readwrite', reject)
    const keys: IDBValidKey[] = new Array(items.length)

    try {
      items.forEach((item, i) => {
        const request = store.put(item)
        request.onsuccess = () => {
          keys[i] = request.result
        }
      })
    } catch (err) {
      try {
        store.transaction.abort()
      } catch {
        // 事务已结束
      }
      reject(wrapCloneError(err, 'bulkPut()'))
      return
    }

    store.transaction.oncomplete = () => resolve(keys)
  })
}

/**
 * 批量删除数据（bulkDelete）。
 *
 * 在**单个事务**内发出所有 delete 请求。删除不存在的 key 不视为错误
 * （与 IndexedDB `delete()` 语义一致）。
 *
 * 利用事务内请求按顺序执行的特性，在删除前后各发一个 count() 请求，
 * 差值即为实际删除的记录数。
 *
 * @returns 实际删除的记录数
 */
export function bulkDeleteData(
  db: IDBDatabase,
  storeName: string,
  keys: IDBValidKey[],
  tx?: IDBTransaction
): Promise<number> {
  if (keys.length === 0) return Promise.resolve(0)

  if (tx) {
    return (async () => {
      const store = tx.objectStore(storeName)
      const before = await reqToPromise<number>(store.count())
      await Promise.all(keys.map(key => reqToPromise<undefined>(store.delete(key))))
      // countAfter 在所有 delete 之后入队，事务内按顺序执行，反映删除后的记录数
      const after = await reqToPromise<number>(store.count())
      return before - after
    })()
  }

  return new Promise((resolve, reject) => {
    const store = openStore(db, storeName, 'readwrite', reject)

    const countBefore = store.count()

    keys.forEach(key => {
      store.delete(key)
    })

    // countAfter 在所有 delete 之后入队，事务内按顺序执行，反映删除后的记录数
    const countAfter = store.count()

    store.transaction.oncomplete = () => {
      resolve(countBefore.result - countAfter.result)
    }
  })
}

/**
 * 查询数据
 *
 * 内部路径选择（按优先级）：
 *
 * 1. **索引驱动游标**（`where` 中存在可映射为 IDBKeyRange 的条件，且对应字段
 *    存在同名索引或为内联主键）：范围条件被编译成 `IDBKeyRange` 直接在索引上
 *    定位，扫描量从 O(全表) 降到 O(匹配数)；其余条件继续在游标回调中 JS 过滤。
 *    这是仿照 Dexie `where().above()` 系列的核心优化。
 * 2. **普通游标**（存在 `where`/`filter`，或 `direction` + keyset 分页参数）：
 *    逐条遍历过滤；当**没有排序**时，limit 可在收集到 `offset + limit` 条记录后
 *    **提前终止**。
 * 3. **getAll 路径**（无 `where`/`filter`/`direction`）：一次性取回记录；
 *    `after`/`before` 会合成为 range 限定取回范围；若提供 `limit`，
 *    使用 `getAll(range, offset + limit)` 限制取回数量，降低大表内存开销。
 *    `direction` 选项在此路径下**不生效**（keyset + direction 除外，走路径 2）。
 */
/**
 * 将 keyset 分页参数（after/before）合成为 IDBKeyRange。
 * 与显式 range 互斥；after+before 同时提供时为开区间 bound。
 * 抛出错误表示调用方参数非法（range 冲突 / 非法 key）。
 */
function synthesizeKeysetRange(options: Pick<QueryOptions, 'range' | 'after' | 'before'>): IDBKeyRange | null {
  const { range, after, before } = options

  if ((after !== undefined || before !== undefined) && range) {
    throw new Error(
      '[IndexedDBStorage] "after"/"before" cannot be combined with "range". Use one or the other.'
    )
  }
  if (after === undefined && before === undefined) return range ?? null

  if (after !== undefined && !isValidIDBKey(after)) {
    throw new Error('[IndexedDBStorage] "after" must be a valid IndexedDB key (number/string/Date/array).')
  }
  if (before !== undefined && !isValidIDBKey(before)) {
    throw new Error('[IndexedDBStorage] "before" must be a valid IndexedDB key (number/string/Date/array).')
  }

  if (after !== undefined && before !== undefined) {
    return IDBKeyRange.bound(after as IDBValidKey, before as IDBValidKey, true, true)
  }
  if (after !== undefined) return IDBKeyRange.lowerBound(after as IDBValidKey, true)
  return IDBKeyRange.upperBound(before as IDBValidKey, true)
}

/** after/before 是否存在（keyset 分页意图） */
function hasKeyset(options: Pick<QueryOptions, 'after' | 'before'>): boolean {
  return options.after !== undefined || options.before !== undefined
}

/**
 * 解析游标源与有效 range（queryData / iterateData / deleteManyData / queryKeysData 共用）。
 *
 * 规则：
 * - 显式 `indexName` 时尊重之（source = 该索引），调用方的 range 绑定在该索引上；
 * - 无 indexName 且无 range（含 after/before 合成）时，尝试把第一个可编译的
 *   where 范围条件下推到同名索引或内联主键（Dexie 式索引驱动）；
 * - 下推成功时该条件从 JS 过滤列表中移除（range 已保证其语义）。
 *
 * @param allowIndexPushdown 允许 where 条件下推到未显式指定的索引。
 *   queryKeysData 应传 false：它承诺"未指定 indexName 时返回主键"，
 *   静默换用别的索引会把返回值变成索引键，破坏调用契约。
 */
function resolveCursorSource(
  store: IDBObjectStore,
  options: Pick<QueryOptions, 'indexName' | 'range' | 'after' | 'before'>,
  compiled: CompiledWhere,
  allowIndexPushdown = true
): { source: IDBObjectStore | IDBIndex; range: IDBKeyRange | null } {
  // 注意：调用方显式提供 indexName 时，range 语义绑定在指定索引上，
  // 此路径不得接管 source（否则 range 与 where 的索引来源不一致，结果错误）。
  let source: IDBObjectStore | IDBIndex = options.indexName ? store.index(options.indexName) : store
  const range = synthesizeKeysetRange(options)

  if (allowIndexPushdown && compiled.rangeCondition && range === null && !options.indexName) {
    const field = compiled.rangeCondition.field
    // 仅字符串 keyPath 精确匹配可作为内联主键驱动（复合 keyPath 无法对单个成员建 range）
    const viaKeyPath = store.keyPath === field
    const usable = viaKeyPath || store.indexNames.contains(field)

    if (usable) {
      const compiledRange = compileRangeCondition(compiled.rangeCondition)
      if (compiledRange) {
        source = viaKeyPath ? store : store.index(field)
        compiled.conditions.splice(compiled.rangeIndex!, 1)
        return { source, range: compiledRange }
      }
    }
  }

  return { source, range }
}

export async function queryData<T>(
  db: IDBDatabase,
  storeName: string,
  options: QueryOptions<T> = {},
  tx?: IDBTransaction
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const store = resolveStore(db, storeName, 'readonly', reject, tx)
    const results: T[] = []

    const compiled = compileWhere(options.where)

    // after/before + direction 表示调用方在做 keyset 翻页（如降序上一页），
    // 必须走游标路径才能让 direction 生效
    if (options.where || options.filter || (options.direction && hasKeyset(options))) {
      const { source, range } = resolveCursorSource(store, options, compiled)

      const request =
        range !== null
          ? (source as IDBIndex).openCursor(range, options.direction)
          : source.openCursor(null, options.direction)

      request.onerror = () => reject(request.error)

      request.onsuccess = () => {
        const cursor = request.result as IDBCursorWithValue | null

        if (cursor) {
          const item = cursor.value as T

          if (matchesCompiled(item, compiled.conditions)) {
            if (!options.filter || options.filter(item)) {
              results.push(item)
            }
          }

          // 当没有排序需求时，可在收集到足够记录后提前终止游标遍历，
          // 避免扫描整个 store 中所有匹配的记录。
          // 有排序需求时必须收集全部记录才能正确排序。
          const noSort = !options.sort
          const limit = options.limit
          const offset = options.offset ?? 0
          if (noSort && limit !== undefined && results.length >= offset + limit) {
            finishQuery(results, options, resolve)
          } else {
            cursor.continue()
          }
        } else {
          finishQuery(results, options, resolve)
        }
      }
    } else {
      // 索引感知排序：单字段排序且字段可用索引时，免全量收集直接拿有序流
      if (options.sort && !options.direction && tryIndexSortQuery<T>(store, options, resolve, reject)) {
        return
      }

      // direction 在此路径下无效（getAll 始终按存储默认顺序返回）；
      // 若需要倒序或自定义顺序，请同时提供 where/filter 以走游标路径，
      // 或在 options.sort 中配置排序。
      if (options.direction) {
        console.warn(
          '[IndexedDBStorage] queryData: "direction" option is ignored when no "where" or "filter" is provided, ' +
            'because getAll() is used instead of a cursor. Use "sort" or add a "where"/"filter" condition to enable cursor traversal.'
        )
      }
      const source = options.indexName ? store.index(options.indexName) : store
      const effectiveRange = synthesizeKeysetRange(options)
      // 提供 limit 时用 getAll 的 count 参数上界取数，避免大表全量加载
      const offset = Math.max(0, Math.floor(options.offset ?? 0))
      const fetchCount =
        options.limit !== undefined
          ? offset + Math.max(0, Math.floor(options.limit))
          : undefined

      let request: IDBRequest<unknown[]>
      if (effectiveRange !== null && fetchCount !== undefined) {
        request = (source as IDBIndex).getAll(effectiveRange, fetchCount)
      } else if (effectiveRange !== null) {
        request = (source as IDBIndex).getAll(effectiveRange)
      } else if (fetchCount !== undefined) {
        request = (source as IDBIndex).getAll(null, fetchCount)
      } else {
        request = (source as IDBIndex).getAll()
      }

      request.onerror = () => reject(request.error)

      request.onsuccess = () => {
        finishQuery(request.result as T[], options, resolve)
      }
    }
  })
}

/**
 * 索引感知排序路径（无 where/filter、无 indexName/range、单字段排序、字段可用索引）。
 *
 * 直接用 `index.openCursor(null, direction)` 获得天然有序流：
 * - 排序无需全量收集后比较，扫描即有序；
 * - asc → 'next'，desc → 'prev'，排序方向由游标方向天然保证；
 * - offset > 0 时用 `cursor.advance(offset)` 跳过前 offset 条（advance(count)
 *   要求 count ≥ 1，offset = 0 时走正常路径）；
 * - limit 可提前终止遍历。
 *
 * 注意：IDB 索引序按 key 字节序（number < string < Date...），与 finishQuery 的
 * `localeCompare` 语义不同——索引内同类型键之间顺序正确，混合类型时与内存排序
 * 可能有差异。返回 false 表示不适用此路径，调用方退回 getAll + 内存排序。
 */
function tryIndexSortQuery<T>(
  store: IDBObjectStore,
  options: QueryOptions<T>,
  resolve: (value: T[]) => void,
  reject: (reason?: unknown) => void
): boolean {
  // 条件：单字段排序、无 where/filter、无 range/keyset（keyset 分页时范围由 range 决定，退回内存排序）
  if (options.where || options.filter || options.range || hasKeyset(options)) return false
  const sort = options.sort
  if (!sort || Array.isArray(sort)) return false

  const field = sort.field
  const usable = store.indexNames.contains(field) || field === store.keyPath
  if (!usable) return false

  const source: IDBObjectStore | IDBIndex = field === store.keyPath ? store : store.index(field)
  const direction: IDBCursorDirection = sort.order === 'desc' ? 'prev' : 'next'
  const offset = Math.max(0, Math.floor(options.offset ?? 0))
  const limit = options.limit !== undefined ? Math.max(0, Math.floor(options.limit)) : Infinity
  const results: T[] = []

  const request = source.openCursor(null, direction)
  request.onerror = () => reject(request.error)

  let started = false
  request.onsuccess = () => {
    const cursor = request.result as IDBCursorWithValue | null
    if (!cursor) {
      resolve(results)
      return
    }

    if (!started && offset > 0) {
      // 光标当前在第 0 条；advance(offset) 跳过前 offset 条，落在第 offset 条（0 基）
      started = true
      cursor.advance(offset)
      return
    }
    started = true

    // limit=0 时不能先 push 再判断，否则会多收集一条
    if (results.length >= limit) {
      resolve(results)
      return
    }

    results.push(cursor.value as T)
    if (results.length >= limit) {
      resolve(results)
    } else {
      cursor.continue()
    }
  }
  return true
}

/** 预编译后的条件：路径已 split，游标回调中不再重复分配 */
interface CompiledCondition {
  path: string[]
  operator: QueryOperator
  value: unknown
}

/** 可直接编译为 IDBKeyRange 的条件（附加字段名，供索引驱动使用） */
interface CompiledWhere {
  conditions: CompiledCondition[]
  rangeCondition?: (CompiledCondition & { field: string }) | null
  /** rangeCondition 在 conditions 数组中的索引；-1 表示不存在 */
  rangeIndex?: number
}

const RANGE_OPERATORS = new Set<QueryOperator>(['eq', 'gt', 'gte', 'lt', 'lte', 'between'])

/**
 * 预编译 where 条件：数组化 + 路径 split 一次完成。
 * 同时识别第一个可映射为 IDBKeyRange 的范围条件（供索引驱动路径使用）。
 * rangeCondition 在 conditions 中的位置通过 rangeIndex 标记，
 * 供索引驱动路径在接管该条件后从数组中移除。
 */
function compileWhere(where?: WhereCondition | WhereCondition[]): CompiledWhere {
  if (!where) return { conditions: [], rangeCondition: null, rangeIndex: -1 }

  const raw = Array.isArray(where) ? where : [where]
  const conditions: CompiledCondition[] = raw.map(c => ({
    path: c.field.split('.'),
    operator: c.operator,
    value: c.value,
  }))

  const rangeIndex = conditions.findIndex(c => RANGE_OPERATORS.has(c.operator))
  let rangeCondition: (CompiledCondition & { field: string }) | null = null

  if (rangeIndex !== -1) {
    const candidate = conditions[rangeIndex]
    // 仅顶层字段（路径单段且无空段）才能映射到索引
    if (candidate.path.length === 1 && candidate.path[0] !== '') {
      rangeCondition = { ...candidate, field: candidate.path[0] }
    }
  }

  return { conditions, rangeCondition, rangeIndex }
}

/**
 * 判断值是否为有效 IDBKey（可安全传给 IDBKeyRange 工厂与 openCursor）。
 * 无效值（undefined、NaN、对象、数组含无效元素等）时返回 false，退回 JS 过滤。
 */
function isValidIDBKey(value: unknown): boolean {
  if (value == null) return false
  if (typeof value === 'number') return !isNaN(value)
  if (typeof value === 'string') return true
  if (value instanceof Date) return !isNaN(value.getTime())
  if (Array.isArray(value)) return value.every(isValidIDBKey)
  // 对象、boolean、function 等均非合法 key（boolean 在旧规范中无效，现代规范已移除）
  return false
}

/**
 * 将单个范围条件编译为 IDBKeyRange。
 * 返回 null 表示该条件无法安全编译（值非法、倒置区间等），退回 JS 过滤。
 */
function compileRangeCondition(c: CompiledCondition): IDBKeyRange | null {
  switch (c.operator) {
    case 'eq':
      return isValidIDBKey(c.value) ? IDBKeyRange.only(c.value as IDBValidKey) : null
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte':
      return isValidIDBKey(c.value)
        ? compileSimpleBound(c.operator, c.value as IDBValidKey)
        : null
    case 'between': {
      if (!Array.isArray(c.value) || c.value.length !== 2) return null
      const [min, max] = c.value as [unknown, unknown]
      // 端点非法（null/NaN/类型混合）时退回 JS 过滤，由 matchCondition 输出既有 warn
      if (!isValidIDBKey(min) || !isValidIDBKey(max)) return null
      if (typeof min !== typeof max) return null
      return IDBKeyRange.bound(min as IDBValidKey, max as IDBValidKey)
    }
    default:
      return null
  }
}

function compileSimpleBound(op: QueryOperator, value: IDBValidKey): IDBKeyRange {
  switch (op) {
    case 'gt':
      return IDBKeyRange.lowerBound(value, true)
    case 'gte':
      return IDBKeyRange.lowerBound(value)
    case 'lt':
      return IDBKeyRange.upperBound(value, true)
    default:
      return IDBKeyRange.upperBound(value)
  }
}

/**
 * 使用预编译条件匹配记录。
 */
function matchesCompiled(item: unknown, conditions: CompiledCondition[]): boolean {
  return conditions.every(condition => {
    const value = getNestedValueByPath(item, condition.path)
    return matchCondition(value, condition.operator, condition.value)
  })
}

/**
 * 对结果排序（复制后排序，不修改 IDB 原始数组）并应用分页，然后 resolve。
 */
function finishQuery<T>(results: T[], options: QueryOptions<T>, resolve: (value: T[]) => void): void {
  let sorted = results
  if (options.sort) {
    const sorts = Array.isArray(options.sort) ? options.sort : [options.sort]
    sorted = [...results].sort((a, b) => {
      for (const sort of sorts) {
        const aVal = getNestedValue(a, sort.field)
        const bVal = getNestedValue(b, sort.field)
        const comparison = compareValues(aVal, bVal)
        if (comparison !== 0) {
          return sort.order === 'asc' ? comparison : -comparison
        }
      }
      return 0
    })
  }

  // 应用分页
  // 对负数/小数/NaN 做防御性夹紧：
  //   负 offset → slice 从末尾计算，不符合"跳过 N 条"语义
  //   负 limit  → slice(0, -3) 返回"倒数第3条之前的所有记录"，而非"取0条"
  const offset = Math.max(0, Math.floor(options.offset ?? 0))
  const limit = options.limit !== undefined ? Math.max(0, Math.floor(options.limit)) : sorted.length
  const paginatedResults = sorted.slice(offset, offset + limit)

  resolve(paginatedResults)
}

/**
 * 获取嵌套字段的值（支持 a.b.c 格式）
 *
 * 使用 hasOwnProperty 限制只访问对象自身属性，防止通过
 * `__proto__`、`constructor`、`toString` 等键遍历原型链。
 * 空路径段（如 `"user..name"` 中 `..` 产生的 `""`）会使查找立即返回 undefined，
 * 避免意外匹配名称为空字符串的属性。
 */
function getNestedValue(obj: unknown, path: string): unknown {
  return getNestedValueByPath(obj, path.split('.'))
}

/**
 * 按预分割路径取值（热路径版本，避免每条记录重复 split）。
 */
function getNestedValueByPath(obj: unknown, path: string[]): unknown {
  let current = obj
  for (const key of path) {
    // 空段（来自 "a..b" 这类路径）直接返回 undefined，不继续查找
    if (key === '') return undefined
    if (current == null || typeof current !== 'object') return undefined
    current = Object.prototype.hasOwnProperty.call(current, key)
      ? (current as Record<string, unknown>)[key]
      : undefined
  }
  return current
}

/**
 * 当 compareValue 为 NaN 时输出 warn 并返回 true（表示"应拒绝此条件"）。
 * gt/gte/lt/lte/contains/startsWith/endsWith 统一调用，避免相同的 NaN 守卫块逐字重复。
 */
function rejectIfNaNCompareValue(operator: string, compareValue: unknown): boolean {
  if (typeof compareValue === 'number' && isNaN(compareValue)) {
    console.warn(
      `[IndexedDBStorage] "${operator}" operator received NaN as compareValue. Condition will evaluate to false.`
    )
    return true
  }
  return false
}

/**
 * 匹配单个条件。
 *
 * 注意：`eq`、`ne`、`in` 对对象值使用**引用相等**（`===` / `Array.includes`），
 * 而非深比较。若需比对对象内容，请使用 `filter` 自定义函数。
 */
function matchCondition(value: unknown, operator: QueryOperator, compareValue: unknown): boolean {
  switch (operator) {
    case 'eq':
      return value === compareValue
    case 'ne':
      return value !== compareValue
    case 'gt':
      // null 在数值比较中强制转换为 0（null >= 0 === true），undefined 转换为 NaN（NaN > x === false）。
      // 两者都视为"无值"语义，统一返回 false 而非依赖隐式类型转换产生意外结果。
      if (value == null || compareValue == null) return false
      if (rejectIfNaNCompareValue(operator, compareValue)) return false
      return (value as number) > (compareValue as number)
    case 'gte':
      if (value == null || compareValue == null) return false
      if (rejectIfNaNCompareValue(operator, compareValue)) return false
      return (value as number) >= (compareValue as number)
    case 'lt':
      if (value == null || compareValue == null) return false
      if (rejectIfNaNCompareValue(operator, compareValue)) return false
      return (value as number) < (compareValue as number)
    case 'lte':
      if (value == null || compareValue == null) return false
      if (rejectIfNaNCompareValue(operator, compareValue)) return false
      return (value as number) <= (compareValue as number)
    case 'between':
      if (value == null) return false
      if (Array.isArray(compareValue) && compareValue.length === 2) {
        // 区间端点为 null/undefined 时视为条件不满足，而非与数值做 NaN 比较
        if (compareValue[0] == null || compareValue[1] == null) return false
        // NaN 端点与 null 同等处理：无法参与有意义的范围比较，静默返回 false 会让调用方难以发现错误
        if (
          (typeof compareValue[0] === 'number' && isNaN(compareValue[0])) ||
          (typeof compareValue[1] === 'number' && isNaN(compareValue[1]))
        ) {
          console.warn(
            '[IndexedDBStorage] "between" operator received NaN as an endpoint. Condition will evaluate to false.',
            compareValue
          )
          return false
        }
        // 倒置区间（min > max）理论上永远无法匹配，大概率是调用方传参错误；warn 帮助提早发现
        if ((compareValue[0] as number) > (compareValue[1] as number)) {
          console.warn(
            '[IndexedDBStorage] "between" operator: min > max, the range can never match any value. Got:',
            compareValue
          )
          return false
        }
        return (value as number) >= compareValue[0] && (value as number) <= compareValue[1]
      }
      // compareValue 格式错误（非长度为 2 的数组）：warn 而非静默返回 false，
      // 帮助开发者发现 `value: 30`（单值）而非 `value: [20, 30]` 的常见误用。
      console.warn(
        '[IndexedDBStorage] "between" operator requires an array of exactly 2 elements [min, max], got:',
        compareValue
      )
      return false
    case 'in':
      if (!Array.isArray(compareValue)) {
        console.warn(
          '[IndexedDBStorage] "in" operator requires an array as value, got:',
          compareValue
        )
        return false
      }
      return compareValue.includes(value)
    case 'contains':
      // null/undefined 不是字符串，直接返回 false，避免 String(null) = "null" 假匹配；
      // NaN 经 String() 转换为 "nan"，会静默匹配含 "nan" 的字符串，属于隐性误用
      if (value == null || compareValue == null) return false
      if (rejectIfNaNCompareValue(operator, compareValue)) return false
      return String(value).includes(String(compareValue))
    case 'startsWith':
      if (value == null || compareValue == null) return false
      if (rejectIfNaNCompareValue(operator, compareValue)) return false
      return String(value).startsWith(String(compareValue))
    case 'endsWith':
      if (value == null || compareValue == null) return false
      if (rejectIfNaNCompareValue(operator, compareValue)) return false
      return String(value).endsWith(String(compareValue))
    default:
      // TypeScript 编译期可约束 operator，但 JS 侧调用或强制类型转换时仍可传入非法值。
      // 静默 return false 会使拼写错误（如 'eq ' 代替 'eq'）完全不可见。
      console.warn(
        `[IndexedDBStorage] Unknown query operator: "${operator as string}". Condition will evaluate to false.`
      )
      return false
  }
}

/**
 * 比较两个值（用于排序）。
 * null / undefined 始终排在末尾（a 为 null → 返回正值 → a 排后）。
 */
function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0
  if (a == null) return 1 // null/undefined 排末尾
  if (b == null) return -1 // null/undefined 排末尾

  if (typeof a === 'string' && typeof b === 'string') {
    return a.localeCompare(b)
  }

  if (typeof a === 'number' && typeof b === 'number') {
    // NaN 视为"无效值"，与 null/undefined 同等处理，排在末尾；两个都是 NaN 则视为相等
    if (isNaN(a) && isNaN(b)) return 0
    if (isNaN(a)) return 1
    if (isNaN(b)) return -1
    return a - b
  }

  if (a instanceof Date && b instanceof Date) {
    return a.getTime() - b.getTime()
  }

  return String(a).localeCompare(String(b))
}

/**
 * 根据主键获取数据
 */
export function getData<T>(
  db: IDBDatabase,
  storeName: string,
  key: IDBValidKey,
  tx?: IDBTransaction
): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const store = resolveStore(db, storeName, 'readonly', reject, tx)
    resolve(reqToPromise<T | undefined>(store.get(key)))
  })
}

/**
 * 批量获取数据（getMany）：单事务内发出所有 get 请求。
 * 结果与输入顺序一致；不存在的 key 对应位置为 undefined。
 */
export function getManyData<T>(
  db: IDBDatabase,
  storeName: string,
  keys: IDBValidKey[],
  tx?: IDBTransaction
): Promise<(T | undefined)[]> {
  if (keys.length === 0) return Promise.resolve([])

  return new Promise((resolve, reject) => {
    const store = resolveStore(db, storeName, 'readonly', reject, tx)
    Promise.all(keys.map(key => reqToPromise<T | undefined>(store.get(key)))).then(resolve, reject)
  })
}

/**
 * 删除数据
 */
export function deleteData(
  db: IDBDatabase,
  storeName: string,
  key: IDBValidKey,
  tx?: IDBTransaction
): Promise<void> {
  return new Promise((resolve, reject) => {
    const store = resolveStore(db, storeName, 'readwrite', reject, tx)
    resolve(reqToPromise<undefined>(store.delete(key)).then(() => undefined))
  })
}

/**
 * 清除所有数据
 */
export function clearAllData(db: IDBDatabase, storeName: string, tx?: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    const store = resolveStore(db, storeName, 'readwrite', reject, tx)
    resolve(reqToPromise<undefined>(store.clear()).then(() => undefined))
  })
}

/**
 * 获取记录总数
 */
export function getCount(db: IDBDatabase, storeName: string, tx?: IDBTransaction): Promise<number> {
  return new Promise((resolve, reject) => {
    const store = resolveStore(db, storeName, 'readonly', reject, tx)
    resolve(reqToPromise<number>(store.count()))
  })
}

/**
 * 流式遍历记录（游标逐条回调，不在内存中累积全量结果）。
 *
 * 遍历顺序 = 游标顺序（主键序或 indexName 索引序），不支持 sort。
 * onItem 返回 false 可提前终止。返回实际回调的记录数。
 */
export function iterateData<T>(
  db: IDBDatabase,
  storeName: string,
  options: QueryOptions<T> | undefined,
  onItem: (item: T, key: IDBValidKey) => void | false,
  tx?: IDBTransaction
): Promise<number> {
  const opts: QueryOptions<T> = options ?? {}
  if (opts.sort) {
    throw new Error(
      '[IndexedDBStorage] iterate() does not support "sort" — results stream in cursor order. Use query() instead.'
    )
  }

  return new Promise((resolve, reject) => {
    const store = resolveStore(db, storeName, 'readonly', reject, tx)
    const compiled = compileWhere(opts.where)
    const { source, range } = resolveCursorSource(store, opts, compiled)

    const offset = Math.max(0, Math.floor(opts.offset ?? 0))
    const limit = opts.limit !== undefined ? Math.max(0, Math.floor(opts.limit)) : undefined

    const request =
      range !== null
        ? (source as IDBIndex).openCursor(range, opts.direction)
        : source.openCursor(null, opts.direction)

    request.onerror = () => reject(request.error)

    let seen = 0 // 匹配的记录数
    let delivered = 0 // 已回调的记录数

    request.onsuccess = () => {
      const cursor = request.result as IDBCursorWithValue | null
      if (!cursor) {
        resolve(delivered)
        return
      }

      const item = cursor.value as T
      if (matchesCompiled(item, compiled.conditions) && (!opts.filter || opts.filter(item))) {
        seen++
        if (seen > offset) {
          const proceed = onItem(item, cursor.primaryKey)
          delivered++
          if (proceed === false) {
            resolve(delivered)
            return
          }
          if (limit !== undefined && delivered >= limit) {
            resolve(delivered)
            return
          }
        }
      }
      cursor.continue()
    }
  })
}

/**
 * 按查询条件批量删除（单事务）。
 *
 * 先用游标收集匹配记录的主键（cursor.primaryKey，与遍历源无关），
 * 再在同一事务内逐个删除。sort 时需要值参与比较，因此收集阶段保留 value。
 *
 * @returns 实际删除的记录数
 */
export function deleteManyData<T>(
  db: IDBDatabase,
  storeName: string,
  options: QueryOptions<T> = {},
  tx?: IDBTransaction
): Promise<number> {
  return new Promise((resolve, reject) => {
    const store = resolveStore(db, storeName, 'readwrite', reject, tx)
    const compiled = compileWhere(options.where)
    const { source, range } = resolveCursorSource(store, options, compiled)

    const offset = Math.max(0, Math.floor(options.offset ?? 0))
    const limit = options.limit !== undefined ? Math.max(0, Math.floor(options.limit)) : undefined
    const noSort = !options.sort

    const entries: { key: IDBValidKey; value: T }[] = []

    const request =
      range !== null
        ? (source as IDBIndex).openCursor(range, options.direction)
        : source.openCursor(null, options.direction)

    request.onerror = () => reject(request.error)

    request.onsuccess = () => {
      const cursor = request.result as IDBCursorWithValue | null
      if (cursor) {
        const item = cursor.value as T
        if (matchesCompiled(item, compiled.conditions) && (!options.filter || options.filter(item))) {
          entries.push({ key: cursor.primaryKey, value: item })
          // 无排序时收集到 offset+limit 即可提前终止
          if (noSort && limit !== undefined && entries.length >= offset + limit) {
            finishDelete()
            return
          }
        }
        cursor.continue()
      } else {
        finishDelete()
      }
    }

    const finishDelete = (): void => {
      let selected = entries
      if (options.sort) {
        const sorts = (Array.isArray(options.sort) ? options.sort : [options.sort]).map(s => ({
          path: s.field.split('.'),
          order: s.order,
        }))
        selected = [...entries].sort((a, b) => {
          for (const s of sorts) {
            const cmp = compareValues(
              getNestedValueByPath(a.value, s.path),
              getNestedValueByPath(b.value, s.path)
            )
            if (cmp !== 0) return s.order === 'asc' ? cmp : -cmp
          }
          return 0
        })
      }
      if (limit !== undefined || offset > 0) {
        const end = limit !== undefined ? offset + limit : undefined
        selected = selected.slice(offset, end)
      }

      if (selected.length === 0) {
        resolve(0)
        return
      }

      Promise.all(selected.map(e => reqToPromise<undefined>(store.delete(e.key)))).then(
        () => resolve(selected.length),
        err => reject(err)
      )
    }
  })
}

/**
 * 只查询键、不反序列化记录值。
 *
 * 无 where/filter 时走 getAllKeys(range, count) 快速路径；
 * 有条件时走游标收集（仍只保留键）。
 * 始终返回记录的**主键**（即使通过 indexName 遍历，依据 IDB 规范
 * `IDBIndex.getAllKeys()` 返回的也是主键，游标路径收集 primaryKey 保持一致）。
 */
export function queryKeysData<T>(
  db: IDBDatabase,
  storeName: string,
  options: QueryOptions<T> = {},
  tx?: IDBTransaction
): Promise<IDBValidKey[]> {
  if (options.sort) {
    throw new Error(
      '[IndexedDBStorage] queryKeys() does not support "sort" — sorting requires record values. Use query() instead.'
    )
  }

  return new Promise((resolve, reject) => {
    const store = resolveStore(db, storeName, 'readonly', reject, tx)
    const compiled = compileWhere(options.where)
    // 禁用 where 下推：queryKeys 的返回值契约绑定遍历源
    // （未指定 indexName → 主键），静默换用 where 字段的索引会把主键变成索引键
    const { source, range } = resolveCursorSource(store, options, compiled, false)

    const offset = Math.max(0, Math.floor(options.offset ?? 0))
    const limit = options.limit !== undefined ? Math.max(0, Math.floor(options.limit)) : undefined

    // 快速路径：无 where/filter 时用 getAllKeys（IDB 直接返回键，不读值）
    if (!options.filter && compiled.conditions.length === 0) {
      const count = limit !== undefined ? offset + limit : undefined
      const request =
        range !== null
          ? (source as IDBIndex).getAllKeys(range, count)
          : source.getAllKeys(undefined, count)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const all = request.result as IDBValidKey[]
        resolve(all.slice(offset))
      }
      return
    }

    const keys: IDBValidKey[] = []
    let seen = 0

    const request =
      range !== null
        ? (source as IDBIndex).openCursor(range, options.direction)
        : source.openCursor(null, options.direction)

    request.onerror = () => reject(request.error)

    request.onsuccess = () => {
      const cursor = request.result as IDBCursorWithValue | null
      if (!cursor) {
        resolve(keys)
        return
      }

      if (
        matchesCompiled(cursor.value, compiled.conditions) &&
        (!options.filter || options.filter(cursor.value))
      ) {
        seen++
        if (seen > offset) {
          // 始终收集主键：与 getAllKeys 快速路径的规范行为保持一致
          keys.push(cursor.primaryKey)
          if (limit !== undefined && keys.length >= limit) {
            resolve(keys)
            return
          }
        }
      }
      cursor.continue()
    }
  })
}
