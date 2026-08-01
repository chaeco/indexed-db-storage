/**
 * 数据库初始化模块测试
 */

import { describe, it, expect, afterEach } from 'vitest'
import { initDatabase } from '../src/managers/database'

describe('initDatabase', () => {
  afterEach(async () => {
    // 清理测试数据库
    const dbsToClean = ['db-probe-test', 'db-upgrade-test', 'db-index-test', 'db-multi-index-test']
    for (const dbName of dbsToClean) {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(dbName)
        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error)
      })
    }
  })

  it('should create a database with a store', async () => {
    const db = await initDatabase('db-probe-test', {
      storeName: 'test-store',
      autoIncrement: true,
    })

    expect(db).toBeDefined()
    expect(db.objectStoreNames.contains('test-store')).toBe(true)
    db.close()
  })

  it('should create store with custom keyPath', async () => {
    const db = await initDatabase('db-probe-test', {
      storeName: 'keyed-store',
      keyPath: 'id',
      autoIncrement: true,
    })

    expect(db.objectStoreNames.contains('keyed-store')).toBe(true)
    db.close()
  })

  it('should create store with indexes', async () => {
    const db = await initDatabase('db-index-test', {
      storeName: 'idx-store',
      keyPath: 'id',
      autoIncrement: true,
      indexes: [
        { name: 'by-name', keyPath: 'name', options: { unique: false } },
        { name: 'by-age', keyPath: 'age', options: { unique: false } },
      ],
    })

    const store = db.transaction('idx-store', 'readonly').objectStore('idx-store')
    expect(store.indexNames.contains('by-name')).toBe(true)
    expect(store.indexNames.contains('by-age')).toBe(true)
    db.close()
  })

  it('should trigger upgrade path when store does not exist in existing database', async () => {
    // 第一步：创建一个没有目标 store 的数据库
    const db1 = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('db-upgrade-test', 1)
      request.onupgradeneeded = () => {
        // 创建不相关的 store，故意不创建 'target-store'
        request.result.createObjectStore('other-store', { autoIncrement: true })
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    db1.close()

    // 第二步：调用 initDatabase 请求一个不存在的 store
    // 应触发升级路径（currentVersion+1 重新打开）
    const db2 = await initDatabase('db-upgrade-test', {
      storeName: 'target-store',
      autoIncrement: true,
    })

    expect(db2.objectStoreNames.contains('target-store')).toBe(true)
    expect(db2.objectStoreNames.contains('other-store')).toBe(true)
    db2.close()
  })

  it('should reuse existing store without upgrade', async () => {
    // 第一次调用创建 store
    const db1 = await initDatabase('db-probe-test', {
      storeName: 'reuse-store',
      autoIncrement: true,
    })
    db1.close()

    // 第二次调用应复用已有 store（不触发升级）
    const db2 = await initDatabase('db-probe-test', {
      storeName: 'reuse-store',
      autoIncrement: true,
    })
    expect(db2.objectStoreNames.contains('reuse-store')).toBe(true)
    db2.close()
  })
})