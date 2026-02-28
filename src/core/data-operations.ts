/**
 * 数据操作 - 负责数据的增删查改
 */

import type { QueryOptions, WhereCondition, QueryOperator } from '../types/index'
import { openStore } from '../utils/idb'

/**
 * 保存数据到 IndexedDB
 */
export async function saveData<T>(
  db: IDBDatabase,
  storeName: string,
  data: T
): Promise<IDBValidKey> {
  return new Promise((resolve, reject) => {
    const store = openStore(db, storeName, 'readwrite', reject)

    const request = store.add(data)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
}

/**
 * 更新（upsert）数据。
 *
 * 使用 `store.put()`：主键已存在则替换整条记录，否则插入新记录。
 */
export async function updateData<T>(
  db: IDBDatabase,
  storeName: string,
  data: T
): Promise<IDBValidKey> {
  return new Promise((resolve, reject) => {
    const store = openStore(db, storeName, 'readwrite', reject)

    const request = store.put(data)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
}

/**
 * 查询数据
 *
 * 内部走两条路径：
 * - **游标路径**（存在 `where` 或 `filter`）：逐条遍历，支持 `direction`、复杂过滤；
 *   注意 `limit`/`offset` **在游标遍历完成、所有匹配记录收集完毕后**才切片应用，
 *   并不提前终止遍历。大数据量场景请尽量结合 `range` 缩小扫描范围。
 * - **getAll 路径**（无 `where`/`filter`）：一次性取回全部记录，性能更优，
 *   但 `direction` 选项**不生效**（getAll 始终以存储默认顺序返回）。
 */
export async function queryData<T>(
  db: IDBDatabase,
  storeName: string,
  options: QueryOptions = {}
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const store = openStore(db, storeName, 'readonly', reject)
    const results: T[] = []
    if (options.where || options.filter) {
      const source = options.indexName ? store.index(options.indexName) : store
      const request = options.range
        ? source.openCursor(options.range, options.direction)
        : source.openCursor(null, options.direction)

      request.onerror = () => reject(request.error)

      request.onsuccess = () => {
        const cursor = request.result as IDBCursorWithValue | null

        if (cursor) {
          const item = cursor.value as T

          if (matchesWhereConditions(item, options.where)) {
            if (!options.filter || options.filter(item)) {
              results.push(item)
            }
          }

          cursor.continue()
        } else {
          finishQuery(results, options, resolve)
        }
      }
    } else {
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
      const request = options.range ? source.getAll(options.range) : source.getAll()

      request.onerror = () => reject(request.error)

      request.onsuccess = () => {
        finishQuery(request.result as T[], options, resolve)
      }
    }
  })
}

/**
 * 对结果排序（复制后排序，不修改 IDB 原始数组）并应用分页，然后 resolve。
 */
function finishQuery<T>(
  results: T[],
  options: QueryOptions,
  resolve: (value: T[]) => void
): void {
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
  const limit = options.limit !== undefined
    ? Math.max(0, Math.floor(options.limit))
    : sorted.length
  const paginatedResults = sorted.slice(offset, offset + limit)

  resolve(paginatedResults)
}

/**
 * 检查数据是否匹配 where 条件
 */
function matchesWhereConditions(item: unknown, where?: WhereCondition | WhereCondition[]): boolean {
  if (!where) return true

  const conditions = Array.isArray(where) ? where : [where]

  return conditions.every((condition) => {
    const value = getNestedValue(item, condition.field)
    return matchCondition(value, condition.operator, condition.value)
  })
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
  return path.split('.').reduce((current: unknown, key: string) => {
    // 空段（来自 "a..b" 这类路径）直接返回 undefined，不继续查找
    if (key === '') return undefined
    if (current == null || typeof current !== 'object') return undefined
    return Object.prototype.hasOwnProperty.call(current, key)
      ? (current as Record<string, unknown>)[key]
      : undefined
  }, obj)
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
        if ((typeof compareValue[0] === 'number' && isNaN(compareValue[0])) ||
          (typeof compareValue[1] === 'number' && isNaN(compareValue[1]))) {
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
      console.warn(`[IndexedDBStorage] Unknown query operator: "${operator as string}". Condition will evaluate to false.`)
      return false
  }
}

/**
 * 比较两个值（用于排序）。
 * null / undefined 始终排在末尾（a 为 null → 返回正值 → a 排后）。
 */
function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0
  if (a == null) return 1   // null/undefined 排末尾
  if (b == null) return -1  // null/undefined 排末尾

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
export async function getData<T>(
  db: IDBDatabase,
  storeName: string,
  key: IDBValidKey
): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const store = openStore(db, storeName, 'readonly', reject)
    const request = store.get(key)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
}

/**
 * 删除数据
 */
export async function deleteData(
  db: IDBDatabase,
  storeName: string,
  key: IDBValidKey
): Promise<void> {
  return new Promise((resolve, reject) => {
    const store = openStore(db, storeName, 'readwrite', reject)
    const request = store.delete(key)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}

/**
 * 清除所有数据
 */
export async function clearAllData(db: IDBDatabase, storeName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const store = openStore(db, storeName, 'readwrite', reject)
    const request = store.clear()

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}

/**
 * 获取记录总数
 */
export async function getCount(db: IDBDatabase, storeName: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const store = openStore(db, storeName, 'readonly', reject)
    const request = store.count()

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
}
