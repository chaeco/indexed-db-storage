/**
 * 数据操作 - 负责数据的增删查改
 */

import type { QueryOptions } from '../types/index'

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

    const source = options.indexName ? store.index(options.indexName) : store

    const request = options.range ? source.getAll(options.range) : source.getAll()

    request.onerror = () => {
      reject(request.error)
    }

    request.onsuccess = () => {
      let results = request.result

      // 分页处理
      const offset = options.offset ?? 0
      const limit = options.limit ?? results.length

      results = results.slice(offset, offset + limit)

      resolve(results)
    }
  })
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
