/**
 * 数据库管理器 - 负责 IndexedDB 的创建和升级
 */

import type { StoreConfig } from '../types/index'

export type { StoreConfig }

/**
 * 初始化 IndexedDB 数据库
 */
export async function initDatabase(dbName: string, storeConfig: StoreConfig): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB not supported'))
      return
    }

    const request = window.indexedDB.open(dbName, 1)

    request.onerror = () => {
      reject(request.error)
    }

    request.onsuccess = () => {
      const db = request.result

      // 检查 object store 是否存在
      if (!db.objectStoreNames.contains(storeConfig.storeName)) {
        // 需要升级版本
        db.close()
        upgradeDatabase(dbName, storeConfig).then(resolve).catch(reject)
      } else {
        resolve(db)
      }
    }

    request.onupgradeneeded = () => {
      const db = request.result
      createObjectStore(db, storeConfig)
    }
  })
}

/**
 * 升级数据库版本
 */
async function upgradeDatabase(dbName: string, storeConfig: StoreConfig): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const upgradeRequest = window.indexedDB.open(dbName, 2)

    upgradeRequest.onupgradeneeded = () => {
      const db = upgradeRequest.result
      if (!db.objectStoreNames.contains(storeConfig.storeName)) {
        createObjectStore(db, storeConfig)
      }
    }

    upgradeRequest.onsuccess = () => {
      resolve(upgradeRequest.result)
    }

    upgradeRequest.onerror = () => {
      reject(upgradeRequest.error)
    }
  })
}

/**
 * 创建对象存储
 */
function createObjectStore(db: IDBDatabase, config: StoreConfig): void {
  const store = db.createObjectStore(config.storeName, {
    keyPath: config.keyPath,
    autoIncrement: config.autoIncrement ?? true,
  })

  // 创建索引
  if (config.indexes) {
    config.indexes.forEach(index => {
      store.createIndex(index.name, index.keyPath, index.options)
    })
  }
}
