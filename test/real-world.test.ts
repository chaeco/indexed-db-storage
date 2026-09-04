/**
 * 0.2.0 新功能测试：cleanup 事件、DataCloneError 提示、onUpgrade 迁移钩子、
 * export/import、跨 store 原子事务
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { IndexedDBStorage } from '../src/storage'
import type { StorageWriteEvent } from '../src/types/storage'

interface User {
  id?: number
  name: string
  age: number
  city: string
}

/** 以原生 API 打开指定版本的库并执行升级回调（构造"旧版本"前置状态） */
function openRaw(dbName: string, version: number, upgrade: (db: IDBDatabase) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, version)
    req.onupgradeneeded = () => upgrade(req.result)
    req.onsuccess = () => {
      req.result.close()
      resolve()
    }
    req.onerror = () => reject(req.error)
  })
}

describe('cleanup 触发 onWrite 事件', () => {
  it('清理删除的记录应发出 cleanup 事件且带主键', async () => {
    const storage = new IndexedDBStorage<User>(
      {
        dbName: 'feat2-cleanup-ev',
        storeName: 'users',
        maxRecords: 5,
        cleanupInterval: 9999999,
      },
      { storeName: 'users', keyPath: 'id', autoIncrement: true }
    )
    await storage.init()
    await storage.clear()

    const events: StorageWriteEvent[] = []
    storage.onWrite(e => events.push(e))

    for (let i = 0; i < 10; i++) {
      await storage.save({ name: `u${i}`, age: i, city: 'x' })
    }
    // save 的 fire-and-forget 清理 + 手动清理都可能有；等所有清理落定
    await storage.cleanup()
    await vi.waitFor(async () => {
      expect(await storage.count()).toBeLessThanOrEqual(5)
    })

    const cleanupKeys = events.filter(e => e.type === 'cleanup').flatMap(e => e.keys ?? [])
    expect(cleanupKeys.length).toBeGreaterThan(0)
    expect(events.filter(e => e.type === 'cleanup').every(e => e.source === 'local')).toBe(true)

    const count = await storage.count()
    // 每条被删记录恰好报告一次，且删除数 + 剩余数 = 写入总数
    expect(new Set(cleanupKeys.map(String)).size).toBe(cleanupKeys.length)
    expect(cleanupKeys.length + count).toBe(10)
    expect(count).toBeLessThanOrEqual(5)

    storage.destroy()
  })
})

describe('DataCloneError 友好提示', () => {
  let storage: IndexedDBStorage<User>

  beforeEach(async () => {
    storage = new IndexedDBStorage<User>(
      { dbName: 'feat2-clone', storeName: 'users' },
      { storeName: 'users', keyPath: 'id', autoIncrement: true }
    )
    await storage.init()
    await storage.clear()
  })

  afterEach(() => storage.destroy())

  it('无法克隆的值应返回带修复指引的错误（save/update/bulk）', async () => {
    const bad = { name: 'x', age: 1, city: 'y', fn: () => {} } as unknown as User

    await expect(storage.save(bad)).rejects.toThrow(/structured clone/)
    await expect(storage.update(bad)).rejects.toThrow(/structured clone/)
    await expect(storage.bulkAdd([bad])).rejects.toThrow(/structured clone/)
    await expect(storage.bulkPut([bad])).rejects.toThrow(/structured clone/)
  })

  it('bulkAdd 同步克隆失败应回滚已入队的记录', async () => {
    const good = { name: 'g', age: 1, city: 'x' }
    const bad = { name: 'b', age: 2, city: 'x', fn: () => {} } as unknown as User

    await expect(storage.bulkAdd([good, bad])).rejects.toThrow(/structured clone/)
    expect(await storage.count()).toBe(0)
  })

  it('事务内的克隆失败同样带指引', async () => {
    const bad = { name: 'x', age: 1, city: 'y', fn: () => {} } as unknown as User
    await expect(
      storage.runInTransaction('readwrite', async tx => {
        await tx.save(bad)
      })
    ).rejects.toThrow(/structured clone/)
  })
})

describe('onUpgrade 迁移钩子', () => {
  it('全新数据库可用钩子写入种子数据', async () => {
    const versions: { old: number; new: number }[] = []
    const storage = new IndexedDBStorage<User>({
      dbName: 'feat2-hook-seed',
      storeName: 'users',
      onUpgrade: ctx => {
        versions.push({ old: ctx.oldVersion, new: ctx.newVersion })
        ctx.tx.objectStore('users').add({ name: 'seed', age: 0, city: 'seed-city' })
      },
    })
    await storage.init()

    const all = await storage.query()
    expect(all).toHaveLength(1)
    expect(all[0]).toMatchObject({ name: 'seed', city: 'seed-city' })
    expect(versions).toEqual([{ old: 0, new: 1 }])
    storage.destroy()
  })

  it('已有数据应在版本升级时被异步迁移', async () => {
    await openRaw('feat2-hook-migrate', 1, db => {
      const store = db.createObjectStore('users', { keyPath: 'id', autoIncrement: true })
      store.add({ name: 'legacy' })
    })

    const storage = new IndexedDBStorage<User>({
      dbName: 'feat2-hook-migrate',
      storeName: 'users',
      // 纯数据迁移无 schema 变更：显式 version 目标触发升级事件
      version: 2,
      onUpgrade: async ctx => {
        expect(ctx.oldVersion).toBe(1)
        // 升级事务内读取旧数据并改写结构（每个 await 均为 IDB 请求）
        const store = ctx.tx.objectStore('users')
        const all = await new Promise<unknown[]>((resolve, reject) => {
          const req = store.getAll()
          req.onsuccess = () => resolve(req.result)
          req.onerror = () => reject(req.error)
        })
        for (const record of all) {
          const legacy = record as { id?: number; name: string; age?: number }
          await new Promise<void>((resolve, reject) => {
            const req = store.put({
              id: legacy.id,
              name: legacy.name,
              age: (legacy.age ?? 0) + 1,
              city: 'migrated',
            })
            req.onsuccess = () => resolve()
            req.onerror = () => reject(req.error)
          })
        }
      },
    })
    await storage.init()

    const all = await storage.query()
    expect(all).toHaveLength(1)
    expect(all[0]).toMatchObject({ name: 'legacy', age: 1, city: 'migrated' })
    storage.destroy()
  })

  it('钩子同步抛错应中止升级并使 init 失败', async () => {
    await openRaw('feat2-hook-fail', 1, db => {
      db.createObjectStore('users', { keyPath: 'id', autoIncrement: true })
    })

    const storage = new IndexedDBStorage<User>({
      dbName: 'feat2-hook-fail',
      storeName: 'users',
      version: 2,
      onUpgrade: () => {
        throw new Error('migration failed')
      },
    })
    await expect(storage.init()).rejects.toThrow(/migration failed/i)
    storage.destroy()
  })
})

describe('exportData/importData', () => {
  let storage: IndexedDBStorage<User>

  beforeEach(async () => {
    storage = new IndexedDBStorage<User>(
      { dbName: 'feat2-export', storeName: 'users' },
      { storeName: 'users', keyPath: 'id', autoIncrement: true }
    )
    await storage.init()
    await storage.clear()
    await storage.bulkAdd([
      { name: 'a', age: 1, city: 'x' },
      { name: 'b', age: 2, city: 'y' },
    ])
  })

  afterEach(() => storage.destroy())

  it('export → import(clearBefore) 应无损恢复', async () => {
    const snapshot = await storage.exportData()
    expect(snapshot).toHaveLength(2)

    // 写入一条干扰数据后整体恢复
    await storage.save({ name: 'noise', age: 99, city: 'z' })
    const written = await storage.importData(snapshot, { clearBefore: true })
    expect(written).toBe(2)

    const restored = await storage.query()
    expect(restored).toEqual(snapshot)
  })

  it('不带 clearBefore 时为覆盖式合并导入', async () => {
    const snapshot = await storage.exportData()
    const written = await storage.importData(snapshot)
    expect(written).toBe(2)
    expect(await storage.count()).toBe(2)
  })

  it('import 应发出 bulkPut 事件', async () => {
    const events: StorageWriteEvent[] = []
    storage.onWrite(e => events.push(e))
    await storage.importData([{ name: 'c', age: 3, city: 'z' }])
    expect(events.map(e => e.type)).toEqual(['bulkPut'])
  })
})

describe('跨 store 原子事务', () => {
  let orders: IndexedDBStorage<{ id?: number; item: string }>
  let stocks: IndexedDBStorage<{ id?: number; item: string; qty: number }>

  beforeEach(async () => {
    orders = new IndexedDBStorage(
      { dbName: 'feat2-xstore', storeName: 'orders' },
      { storeName: 'orders', keyPath: 'id', autoIncrement: true }
    )
    stocks = new IndexedDBStorage(
      { dbName: 'feat2-xstore', storeName: 'stocks' },
      { storeName: 'stocks', keyPath: 'id', autoIncrement: true }
    )
    // 同库第二个 store 会触发版本升级，需顺序初始化
    await orders.init()
    await stocks.init()
    await orders.clear()
    await stocks.clear()
  })

  afterEach(() => {
    orders.destroy()
    stocks.destroy()
  })

  it('跨 store 写入应原子生效', async () => {
    await orders.runInTransaction(
      'readwrite',
      async tx => {
        await tx.save({ item: 'book' })
        await tx.forStore<{ item: string; qty: number }>('stocks').save({ item: 'book', qty: 3 })
      },
      { stores: ['stocks'] }
    )
    expect(await orders.count()).toBe(1)
    expect(await stocks.count()).toBe(1)
  })

  it('任一 store 失败应全部回滚', async () => {
    await expect(
      orders.runInTransaction(
        'readwrite',
        async tx => {
          await tx.save({ item: 'a' })
          await tx.forStore<{ item: string; qty: number }>('stocks').save({ item: 'b', qty: 1 })
          throw new Error('boom')
        },
        { stores: ['stocks'] }
      )
    ).rejects.toThrow('boom')
    expect(await orders.count()).toBe(0)
    expect(await stocks.count()).toBe(0)
  })

  it('forStore 指向不存在的 store 应报明确错误', async () => {
    await expect(
      orders.runInTransaction('readwrite', async tx => {
        tx.forStore('nope')
      })
    ).rejects.toThrow(/does not exist/)
  })

  it('runInTransaction options.stores 指向不存在的 store 应报明确错误', async () => {
    await expect(
      orders.runInTransaction('readwrite', async () => {}, { stores: ['nope'] })
    ).rejects.toThrow(/does not exist/)
  })

  it('跨 store 写入事件应路由到对应实例', async () => {
    const orderEvents: StorageWriteEvent[] = []
    const stockEvents: StorageWriteEvent[] = []
    orders.onWrite(e => orderEvents.push(e))
    stocks.onWrite(e => stockEvents.push(e))

    await orders.runInTransaction(
      'readwrite',
      async tx => {
        await tx.save({ item: 'book' })
        await tx.forStore<{ item: string; qty: number }>('stocks').save({ item: 'book', qty: 3 })
      },
      { stores: ['stocks'] }
    )

    // 本地事件只投递给 store 归属实例；跨实例经 BroadcastChannel 以 remote 分发
    expect(orderEvents.map(e => `${e.storeName}:${e.type}:${e.source}`)).toEqual([
      'orders:add:local',
    ])
    await vi.waitFor(() => {
      expect(stockEvents).toHaveLength(1)
    })
    expect(stockEvents[0]).toMatchObject({
      storeName: 'stocks',
      type: 'add',
      source: 'remote',
    })
  })
})
