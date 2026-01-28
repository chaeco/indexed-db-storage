/**
 * 数据操作 - 负责数据的增删查改
 */

import type { QueryOptions, WhereCondition, QueryOperator } from '../types/index'

/**
 * 保存数据到 IndexedDB
 */
export async function saveData<T>(
  db: IDBDatabase,
  storeName: string,
  data: T
): Promise<IDBValidKey> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readwrite')
    const store = transaction.objectStore(storeName)

    const request = store.add(data)

    request.onerror = () => {
      reject(request.error)
    }

    request.onsuccess = () => {
      resolve(request.result)
    }

    transaction.onerror = () => {
      reject(transaction.error)
    }
  })
}

/**
 * 更新数据
 */
export async function updateData<T>(
  db: IDBDatabase,
  storeName: string,
  data: T
): Promise<IDBValidKey> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readwrite')
    const store = transaction.objectStore(storeName)

    const request = store.put(data)

    request.onerror = () => {
      reject(request.error)
    }

    request.onsuccess = () => {
      resolve(request.result)
    }

    transaction.onerror = () => {
      reject(transaction.error)
    }
  })
}

/**
 * 查询数据
 */
export async function queryData<T>(
  db: IDBDatabase,
  storeName: string,
  options: QueryOptions = {}
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readonly')
    const store = transaction.objectStore(storeName)
    const results: T[] = []

    // 如果有 where 条件或自定义 filter，使用游标遍历
    if (options.where || options.filter) {
      const source = options.indexName ? store.index(options.indexName) : store
      const request = options.range
        ? source.openCursor(options.range, options.direction)
        : source.openCursor(null, options.direction)

      request.onerror = () => reject(request.error)

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result

        if (cursor) {
          const item = cursor.value as T

          // 应用 where 条件
          if (matchesWhereConditions(item, options.where)) {
            // 应用自定义过滤
            if (!options.filter || options.filter(item)) {
              results.push(item)
            }
          }

          cursor.continue()
        } else {
          // 游标遍历完成
          finishQuery(results, options, resolve)
        }
      }
    } else {
      // 简单查询，使用 getAll
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
 * 完成查询处理（排序和分页）
 */
function finishQuery<T>(
  results: T[],
  options: QueryOptions,
  resolve: (value: T[]) => void
): void {
  // 应用排序
  if (options.sort) {
    const sorts = Array.isArray(options.sort) ? options.sort : [options.sort]
    results.sort((a, b) => {
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
  const offset = options.offset ?? 0
  const limit = options.limit ?? results.length
  const paginatedResults = results.slice(offset, offset + limit)

  resolve(paginatedResults)
}

/**
 * 检查数据是否匹配 where 条件
 */
function matchesWhereConditions<T>(item: T, where?: WhereCondition | WhereCondition[]): boolean {
  if (!where) return true

  const conditions = Array.isArray(where) ? where : [where]

  return conditions.every((condition) => {
    const value = getNestedValue(item, condition.field)
    return matchCondition(value, condition.operator, condition.value)
  })
}

/**
 * 获取嵌套字段的值（支持 a.b.c 格式）
 */
function getNestedValue<T>(obj: T, path: string): unknown {
  return path.split('.').reduce((current: unknown, key: string) => {
    return current && typeof current === 'object' ? (current as Record<string, unknown>)[key] : undefined
  }, obj as unknown)
}

/**
 * 匹配单个条件
 */
function matchCondition(value: unknown, operator: QueryOperator, compareValue: unknown): boolean {
  switch (operator) {
    case 'eq':
      return value === compareValue
    case 'ne':
      return value !== compareValue
    case 'gt':
      return (value as number) > (compareValue as number)
    case 'gte':
      return (value as number) >= (compareValue as number)
    case 'lt':
      return (value as number) < (compareValue as number)
    case 'lte':
      return (value as number) <= (compareValue as number)
    case 'between':
      if (Array.isArray(compareValue) && compareValue.length === 2) {
        return (value as number) >= compareValue[0] && (value as number) <= compareValue[1]
      }
      return false
    case 'in':
      return Array.isArray(compareValue) && compareValue.includes(value)
    case 'contains':
      return String(value).includes(String(compareValue))
    case 'startsWith':
      return String(value).startsWith(String(compareValue))
    case 'endsWith':
      return String(value).endsWith(String(compareValue))
    default:
      return false
  }
}

/**
 * 比较两个值（用于排序）
 */
function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0
  if (a == null) return 1
  if (b == null) return -1

  if (typeof a === 'string' && typeof b === 'string') {
    return a.localeCompare(b)
  }

  if (typeof a === 'number' && typeof b === 'number') {
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
    const transaction = db.transaction([storeName], 'readonly')
    const store = transaction.objectStore(storeName)
    const request = store.get(key)

    request.onerror = () => {
      reject(request.error)
    }

    request.onsuccess = () => {
      resolve(request.result)
    }
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
    const transaction = db.transaction([storeName], 'readwrite')
    const store = transaction.objectStore(storeName)
    const request = store.delete(key)

    request.onerror = () => {
      reject(request.error)
    }

    request.onsuccess = () => {
      resolve()
    }
  })
}

/**
 * 清除所有数据
 */
export async function clearAllData(db: IDBDatabase, storeName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readwrite')
    const store = transaction.objectStore(storeName)
    const request = store.clear()

    request.onerror = () => {
      reject(request.error)
    }

    request.onsuccess = () => {
      resolve()
    }
  })
}

/**
 * 获取记录总数
 */
export async function getCount(db: IDBDatabase, storeName: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readonly')
    const store = transaction.objectStore(storeName)
    const request = store.count()

    request.onerror = () => {
      reject(request.error)
    }

    request.onsuccess = () => {
      resolve(request.result)
    }
  })
}
