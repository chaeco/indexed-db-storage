/**
 * 数据库管理器 - 负责 IndexedDB 的创建和升级
 */

import type { IndexConfig, StoreConfig } from '../types/index'

/**
 * 获取当前环境的 indexedDB 实现（兼容浏览器与 Node.js 测试环境）
 */
function getIndexedDB(): IDBFactory {
  // globalThis 在所有目标环境（浏览器、Worker、Node ≥ 14）中始终存在，无需 typeof 检查
  const idb =
    'indexedDB' in globalThis
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
export async function initDatabase(
  dbName: string,
  storeConfig: StoreConfig,
  onClose?: () => void
): Promise<IDBDatabase> {
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

      // Schema diff：store 缺失或索引配置（新增/定义变化）需要升级
      const changes = diffSchemaChanges(db, storeConfig)

      if (!changes) {
        attachVersionchangeHandler(db, dbName, onClose)
        resolve(db)
        return
      }

      // 存在 schema 变更：以 currentVersion+1 重新打开，在 onupgradeneeded 中应用
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
        if (changes.createStore) {
          if (!upgradedDb.objectStoreNames.contains(storeConfig.storeName)) {
            createObjectStore(upgradedDb, storeConfig)
          }
          return
        }
        // 升级事务通过 upgradeRequest.transaction 获取（db.transaction 在升级期间为 null）
        if (upgradeRequest.transaction) {
          applyIndexChanges(
            upgradeRequest.transaction,
            storeConfig.storeName,
            changes.indexChanges
          )
        }
      }

      upgradeRequest.onsuccess = () => {
        const db = upgradeRequest.result
        attachVersionchangeHandler(db, dbName, onClose)
        resolve(db)
      }
      upgradeRequest.onerror = () => reject(upgradeRequest.error)
    }
  })
}

/** store 缺失或索引配置变化 */
interface SchemaChanges {
  createStore: boolean
  indexChanges: { index: IndexConfig; rebuild: boolean }[]
}

/**
 * 对比现有 schema 与配置，计算需要的变更。
 *
 * - store 缺失 → 需整体创建（含索引）；
 * - 配置中新增的索引 → 创建；
 * - 同名索引的 keyPath/unique/multiEntry 与现有定义不一致 → 重建（deleteIndex + createIndex，
 *   索引数据由 IDB 自动重建，不影响记录本身）。
 */
function diffSchemaChanges(db: IDBDatabase, config: StoreConfig): SchemaChanges | null {
  if (!db.objectStoreNames.contains(config.storeName)) {
    return { createStore: true, indexChanges: [] }
  }

  // 索引元数据在事务开启时同步可用，无需等待异步结果
  const tx = db.transaction(config.storeName, 'readonly')
  const store = tx.objectStore(config.storeName)
  const indexChanges: { index: IndexConfig; rebuild: boolean }[] = []

  for (const index of config.indexes ?? []) {
    if (!store.indexNames.contains(index.name)) {
      indexChanges.push({ index, rebuild: false })
      continue
    }
    const existing = store.index(index.name)
    const rebuild =
      JSON.stringify(existing.keyPath) !== JSON.stringify(index.keyPath) ||
      existing.unique !== !!index.options?.unique ||
      existing.multiEntry !== !!index.options?.multiEntry
    if (rebuild) {
      indexChanges.push({ index, rebuild: true })
    }
  }

  return indexChanges.length > 0 ? { createStore: false, indexChanges } : null
}

/** 在升级事务中应用索引变更 */
function applyIndexChanges(
  tx: IDBTransaction,
  storeName: string,
  changes: { index: IndexConfig; rebuild: boolean }[]
): void {
  const store = tx.objectStore(storeName)
  for (const { index, rebuild } of changes) {
    if (rebuild) {
      store.deleteIndex(index.name)
      console.warn(
        `[IndexedDBStorage] Index "${index.name}" on store "${storeName}" definition changed, rebuilding.`
      )
    }
    store.createIndex(index.name, index.keyPath, index.options)
  }
}

/**
 * 为连接挂载 onversionchange 自动让位处理。
 *
 * 当其他连接（通常是另一个标签页）请求更高版本时，若本连接不关闭，
 * 对方的 upgrade 会被永久阻塞。默认行为是自动关闭本连接释放锁；
 * onClose 回调（若提供）会收到通知，供上层同步内部状态。
 */
function attachVersionchangeHandler(db: IDBDatabase, dbName: string, onClose?: () => void): void {
  db.onversionchange = event => {
    db.close()
    onClose?.()
    console.warn(
      `[IndexedDBStorage] Database "${dbName}" received versionchange (v${event.oldVersion} -> v${event.newVersion}). ` +
        'This connection was closed automatically. Call init() again to reconnect if still needed.'
    )
  }
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
