/**
 * 数据库管理器 - 负责 IndexedDB 的创建和升级
 */

import type { StoreConfig } from '../types/index'

/**
 * 获取当前环境的 indexedDB 实现（兼容浏览器与 Node.js 测试环境）
 */
function getIndexedDB(): IDBFactory {
  // globalThis 在所有目标环境（浏览器、Worker、Node ≥ 14）中始终存在，无需 typeof 检查
  const idb = 'indexedDB' in globalThis
    ? (globalThis as typeof globalThis & { indexedDB: IDBFactory }).indexedDB
    : undefined

  if (!idb) {
    throw new Error('IndexedDB is not supported in this environment.')
  }
  return idb
}

/**
 * 初始化 IndexedDB 数据库。
 *
 * 采用"先探测版本再按需升级"策略，避免硬编码版本号：
 * 1. 不带版本号打开数据库，获取当前版本（若不存在则以版本 1 创建）
 * 2. 若目标 object store 不存在，以 currentVersion + 1 重新打开并在
 *    onupgradeneeded 中创建 store
 */
export async function initDatabase(dbName: string, storeConfig: StoreConfig): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let idb: IDBFactory
    try {
      idb = getIndexedDB()
    } catch (e) {
      reject(e)
      return
    }

    // 不指定版本：若 DB 不存在则以版本 1 创建，否则以现有版本打开
    const probeRequest = idb.open(dbName)

    probeRequest.onerror = () => reject(probeRequest.error)

    // 只有全新数据库才会触发此事件，在此处创建 store 即可
    probeRequest.onupgradeneeded = () => {
      createObjectStore(probeRequest.result, storeConfig)
    }

    probeRequest.onsuccess = () => {
      const db = probeRequest.result

      if (db.objectStoreNames.contains(storeConfig.storeName)) {
        resolve(db)
        return
      }

      // store 不存在：以 currentVersion+1 重新打开，在 onupgradeneeded 中创建
      const nextVersion = db.version + 1
      db.close()

      const upgradeRequest = idb.open(dbName, nextVersion)

      upgradeRequest.onblocked = () => {
        reject(
          new Error(
            `Database "${dbName}" upgrade to v${nextVersion} is blocked. ` +
            'Close all other tabs or connections to this database and retry.'
          )
        )
      }

      upgradeRequest.onupgradeneeded = () => {
        const upgradedDb = upgradeRequest.result
        if (!upgradedDb.objectStoreNames.contains(storeConfig.storeName)) {
          createObjectStore(upgradedDb, storeConfig)
        }
      }

      upgradeRequest.onsuccess = () => resolve(upgradeRequest.result)
      upgradeRequest.onerror = () => reject(upgradeRequest.error)
    }
  })
}

/**
 * 创建对象存储及其索引
 */
function createObjectStore(db: IDBDatabase, config: StoreConfig): void {
  const store = db.createObjectStore(config.storeName, {
    keyPath: config.keyPath,
    autoIncrement: config.autoIncrement ?? true,
  })

  if (config.indexes) {
    config.indexes.forEach(index => {
      store.createIndex(index.name, index.keyPath, index.options)
    })
  }
}
