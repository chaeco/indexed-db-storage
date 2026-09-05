/**
 * 新增功能测试：索引升级、getMany、iterate、deleteMany、queryKeys、
 * keyset 分页、runInTransaction、onWrite、persist/estimate、复合 keyPath 回归
 */

/* global IDBKeyRange */

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
function openRaw(
  dbName: string,
  version: number,
  upgrade: (db: IDBDatabase) => void
): Promise<void> {
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

describe('索引升级', () => {
  it('应为已存在的 store 补建新增索引', async () => {
    await openRaw('feat-upgrade-1', 1, db => {
      db.createObjectStore('users', { keyPath: 'id', autoIncrement: true })
    })

    const storage = new IndexedDBStorage<User>(
      { dbName: 'feat-upgrade-1', storeName: 'users' },
      {
        storeName: 'users',
        keyPath: 'id',
        autoIncrement: true,
        indexes: [{ name: 'age', keyPath: 'age' }],
      }
    )
    await storage.init()
    await storage.bulkAdd([
      { name: 'a', age: 1, city: 'x' },
      { name: 'b', age: 2, city: 'y' },
    ])

    // 索引存在且数据已入索引：用 indexName 查询做端到端验证
    const results = await storage.query({ indexName: 'age', range: IDBKeyRange.only(2) })
    expect(results).toHaveLength(1)
    expect(results[0].name).toBe('b')
    storage.destroy()
  })

  it('同名索引定义变化时应重建', async () => {
    await openRaw('feat-upgrade-2', 1, db => {
      const store = db.createObjectStore('users', { keyPath: 'id', autoIncrement: true })
      store.createIndex('idx', 'age')
    })

    const storage = new IndexedDBStorage<User>(
      { dbName: 'feat-upgrade-2', storeName: 'users' },
      {
        storeName: 'users',
        keyPath: 'id',
        autoIncrement: true,
        indexes: [{ name: 'idx', keyPath: 'city' }],
      }
    )
    await storage.init()
    await storage.bulkAdd([
      { name: 'a', age: 1, city: 'BJ' },
      { name: 'b', age: 2, city: 'SH' },
    ])

    // 索引已按新 keyPath（city）重建
    const results = await storage.query({ indexName: 'idx', range: IDBKeyRange.only('BJ') })
    expect(results).toHaveLength(1)
    expect(results[0].name).toBe('a')
    storage.destroy()
  })

  it('schema 无变化时重复 init 不应再升级版本', async () => {
    const storeConfig = {
      storeName: 'users',
      keyPath: 'id',
      autoIncrement: true,
      indexes: [{ name: 'age', keyPath: 'age' }],
    }
    const storage = new IndexedDBStorage<User>(
      { dbName: 'feat-upgrade-3', storeName: 'users' },
      storeConfig
    )
    await storage.init()
    const db1 = (storage as unknown as { db: IDBDatabase }).db!
    const v1 = db1.version
    storage.destroy()

    const storage2 = new IndexedDBStorage<User>(
      { dbName: 'feat-upgrade-3', storeName: 'users' },
      storeConfig
    )
    await storage2.init()
    const v2 = (storage2 as unknown as { db: IDBDatabase }).db!.version
    expect(v2).toBe(v1)
    storage2.destroy()
  })
})

describe('getMany', () => {
  let storage: IndexedDBStorage<User>
  let ids: IDBValidKey[]

  beforeEach(async () => {
    storage = new IndexedDBStorage<User>(
      { dbName: 'feat-getmany', storeName: 'users' },
      { storeName: 'users', keyPath: 'id', autoIncrement: true }
    )
    await storage.init()
    await storage.clear()
    ids = await storage.bulkAdd([
      { name: 'u1', age: 1, city: 'a' },
      { name: 'u2', age: 2, city: 'b' },
      { name: 'u3', age: 3, city: 'c' },
    ])
  })

  afterEach(() => storage.destroy())

  it('应按输入顺序返回结果，缺失 key 为 undefined', async () => {
    const got = await storage.getMany([ids[0], 999999, ids[2]])
    expect(got).toHaveLength(3)
    expect(got[0]).toMatchObject({ name: 'u1' })
    expect(got[1]).toBeUndefined()
    expect(got[2]).toMatchObject({ name: 'u3' })
  })

  it('空数组应返回空数组', async () => {
    await expect(storage.getMany([])).resolves.toEqual([])
  })
})

describe('iterate', () => {
  let storage: IndexedDBStorage<User>

  beforeEach(async () => {
    storage = new IndexedDBStorage<User>(
      { dbName: 'feat-iterate', storeName: 'users' },
      { storeName: 'users', keyPath: 'id', autoIncrement: true }
    )
    await storage.init()
    await storage.clear()
    await storage.bulkAdd(
      Array.from({ length: 10 }, (_, i) => ({
        name: `u${i}`,
        age: i,
        city: i % 2 ? 'odd' : 'even',
      }))
    )
  })

  afterEach(() => storage.destroy())

  it('应按主键序流式遍历全部记录', async () => {
    const seen: string[] = []
    const delivered = await storage.iterate(user => {
      seen.push(user.name)
    })
    expect(delivered).toBe(10)
    expect(seen).toEqual(Array.from({ length: 10 }, (_, i) => `u${i}`))
  })

  it('where 条件应过滤流', async () => {
    const seen: User[] = []
    const delivered = await storage.iterate(
      u => {
        seen.push(u)
      },
      { where: { field: 'city', operator: 'eq', value: 'odd' } }
    )
    expect(delivered).toBe(5)
    expect(seen.every(u => u.city === 'odd')).toBe(true)
  })

  it('onItem 返回 false 应提前终止', async () => {
    const seen: string[] = []
    const delivered = await storage.iterate(user => {
      seen.push(user.name)
      return seen.length === 2 ? false : undefined
    })
    expect(seen).toHaveLength(2)
    expect(delivered).toBe(2)
  })

  it('limit/offset 应生效', async () => {
    const seen: string[] = []
    const delivered = await storage.iterate(
      u => {
        seen.push(u.name)
      },
      { offset: 8, limit: 5 }
    )
    expect(delivered).toBe(2)
    expect(seen).toEqual(['u8', 'u9'])
  })

  it('传入 sort 应抛出错误', async () => {
    await expect(
      storage.iterate(() => {}, { sort: { field: 'age', order: 'asc' } })
    ).rejects.toThrow('sort')
  })
})

describe('deleteMany', () => {
  let storage: IndexedDBStorage<User>

  beforeEach(async () => {
    storage = new IndexedDBStorage<User>(
      { dbName: 'feat-deletemany', storeName: 'users' },
      { storeName: 'users', keyPath: 'id', autoIncrement: true }
    )
    await storage.init()
    await storage.clear()
    await storage.bulkAdd(
      Array.from({ length: 10 }, (_, i) => ({
        name: `u${i}`,
        age: i,
        city: i < 5 ? 'BJ' : 'SH',
      }))
    )
  })

  afterEach(() => storage.destroy())

  it('按 where 条件批量删除并返回数量', async () => {
    const deleted = await storage.deleteMany({
      where: { field: 'city', operator: 'eq', value: 'BJ' },
    })
    expect(deleted).toBe(5)
    expect(await storage.count()).toBe(5)
    const rest = await storage.query()
    expect(rest.every(u => u.city === 'SH')).toBe(true)
  })

  it('sort + limit 应删除排序后最前的 N 条', async () => {
    const deleted = await storage.deleteMany({
      sort: { field: 'age', order: 'asc' },
      limit: 3,
    })
    expect(deleted).toBe(3)
    const rest = await storage.query()
    expect(rest).toHaveLength(7)
    expect(rest.map(u => u.age).sort((a, b) => a - b)).toEqual([3, 4, 5, 6, 7, 8, 9])
  })

  it('不带条件时等价于 clear', async () => {
    const deleted = await storage.deleteMany()
    expect(deleted).toBe(10)
    expect(await storage.count()).toBe(0)
  })
})

describe('queryKeys', () => {
  let storage: IndexedDBStorage<User>
  let ids: IDBValidKey[]

  beforeEach(async () => {
    storage = new IndexedDBStorage<User>(
      { dbName: 'feat-querykeys', storeName: 'users' },
      {
        storeName: 'users',
        keyPath: 'id',
        autoIncrement: true,
        indexes: [{ name: 'city', keyPath: 'city' }],
      }
    )
    await storage.init()
    await storage.clear()
    ids = await storage.bulkAdd([
      { name: 'u1', age: 1, city: 'BJ' },
      { name: 'u2', age: 2, city: 'SH' },
      { name: 'u3', age: 3, city: 'BJ' },
    ])
  })

  afterEach(() => storage.destroy())

  it('无条件时返回全部主键（快速路径）', async () => {
    const keys = await storage.queryKeys()
    expect([...keys].sort((a, b) => Number(a) - Number(b))).toEqual(
      [...ids].sort((a, b) => Number(a) - Number(b))
    )
  })

  it('where 条件应返回主键而非索引键（即使字段有索引）', async () => {
    const keys = await storage.queryKeys({
      where: { field: 'city', operator: 'eq', value: 'BJ' },
    })
    // 必须是主键（getMany 可直接使用），而非索引键（城市字符串）
    expect(keys).toHaveLength(2)
    const values = await storage.getMany(keys)
    expect(values.map(v => v!.name).sort()).toEqual(['u1', 'u3'])
  })

  it('indexName 时同样返回主键（IDB 规范：getAllKeys 返回主键）', async () => {
    const keys = await storage.queryKeys({ indexName: 'city' })
    expect([...keys].sort((a, b) => Number(a) - Number(b))).toEqual(
      [...ids].sort((a, b) => Number(a) - Number(b))
    )
  })

  it('传入 sort 应抛出错误', async () => {
    await expect(storage.queryKeys({ sort: { field: 'age', order: 'asc' } })).rejects.toThrow(
      'sort'
    )
  })

  it('limit/offset 应生效', async () => {
    const keys = await storage.queryKeys({ limit: 2, offset: 1 })
    expect(keys).toHaveLength(2)
  })
})

describe('keyset 分页（after/before）', () => {
  let storage: IndexedDBStorage<User>
  let ids: number[]

  beforeEach(async () => {
    storage = new IndexedDBStorage<User>(
      { dbName: 'feat-keyset', storeName: 'users' },
      { storeName: 'users', keyPath: 'id', autoIncrement: true }
    )
    await storage.init()
    await storage.clear()
    // fake-indexeddb 的库在 describe 内持久，autoIncrement 跨用例累加，
    // 因此所有断言基于本次批量插入返回的实际主键
    const keys = await storage.bulkAdd(
      Array.from({ length: 10 }, (_, i) => ({ name: `u${i}`, age: i, city: 'x' }))
    )
    ids = keys.map(Number)
  })

  afterEach(() => storage.destroy())

  it('after 翻页应无重叠且覆盖全部记录', async () => {
    const page1 = await storage.query({ limit: 4 })
    const page2 = await storage.query({ after: page1[3].id!, limit: 4 })
    const page3 = await storage.query({ after: page2[3].id!, limit: 4 })

    expect(page1.map(u => u.id)).toEqual(ids.slice(0, 4))
    expect(page2.map(u => u.id)).toEqual(ids.slice(4, 8))
    expect(page3.map(u => u.id)).toEqual(ids.slice(8, 10))
  })

  it('before + direction prev 应实现降序上一页', async () => {
    const results = await storage.query({ before: ids[4], direction: 'prev', limit: 3 })
    expect(results.map(u => u.id)).toEqual([ids[3], ids[2], ids[1]])
  })

  it('after + before 组合为开区间', async () => {
    const results = await storage.query({ after: ids[1], before: ids[4] })
    expect(results.map(u => u.id)).toEqual([ids[2], ids[3]])
  })

  it('与 range 同时提供应抛出错误', async () => {
    await expect(storage.query({ after: 1, range: IDBKeyRange.lowerBound(0) })).rejects.toThrow(
      'cannot be combined'
    )
  })

  it('after 为非法 IDB key 应抛出错误', async () => {
    await expect(storage.query({ after: { x: 1 } as unknown as IDBValidKey })).rejects.toThrow(
      'valid IndexedDB key'
    )
  })
})

describe('runInTransaction', () => {
  let storage: IndexedDBStorage<User>

  beforeEach(async () => {
    storage = new IndexedDBStorage<User>(
      { dbName: 'feat-tx', storeName: 'users' },
      { storeName: 'users', keyPath: 'id', autoIncrement: true }
    )
    await storage.init()
    await storage.clear()
  })

  afterEach(() => storage.destroy())

  it('事务内多个写入应原子生效', async () => {
    await storage.runInTransaction('readwrite', async tx => {
      await tx.save({ name: 'a', age: 1, city: 'x' })
      await tx.bulkPut([{ name: 'b', age: 2, city: 'y' }])
    })
    expect(await storage.count()).toBe(2)
  })

  it('scope 抛错应回滚全部写入', async () => {
    await expect(
      storage.runInTransaction('readwrite', async tx => {
        await tx.save({ name: 'a', age: 1, city: 'x' })
        throw new Error('boom')
      })
    ).rejects.toThrow('boom')
    expect(await storage.count()).toBe(0)
  })

  it('readonly 事务内写入应失败', async () => {
    await expect(
      storage.runInTransaction('readonly', async tx => {
        await tx.save({ name: 'a', age: 1, city: 'x' })
      })
    ).rejects.toThrow()
    expect(await storage.count()).toBe(0)
  })

  it('事务内 query/count 可见同事务写入', async () => {
    const res = await storage.runInTransaction('readwrite', async tx => {
      await tx.save({ name: 'a', age: 1, city: 'x' })
      const all = await tx.query()
      return { len: all.length, count: await tx.count() }
    })
    expect(res).toEqual({ len: 1, count: 1 })
  })

  it('scope 内 await 非 IDB 异步操作应失败而不是挂起', async () => {
    await expect(
      storage.runInTransaction('readwrite', async tx => {
        await tx.save({ name: 'a', age: 1, city: 'x' })
        // 非 IDB 异步：事件循环空闲，事务按规范自动提交
        await new Promise(resolve => globalThis.setTimeout(resolve, 20))
        await tx.save({ name: 'b', age: 2, city: 'y' })
      })
    ).rejects.toThrow()
  }, 5000)

  it('提交成功后应发出 scope 内累积的写入事件', async () => {
    const events: StorageWriteEvent[] = []
    storage.onWrite(e => events.push(e))

    await storage.runInTransaction('readwrite', async tx => {
      await tx.save({ name: 'a', age: 1, city: 'x' })
      await tx.bulkAdd([{ name: 'b', age: 2, city: 'y' }])
    })

    expect(events.map(e => e.type)).toEqual(['add', 'bulkAdd'])
    expect(events.every(e => e.source === 'local')).toBe(true)
  })
})

describe('onWrite', () => {
  let storage: IndexedDBStorage<User>

  beforeEach(async () => {
    storage = new IndexedDBStorage<User>(
      { dbName: 'feat-onwrite', storeName: 'users' },
      { storeName: 'users', keyPath: 'id', autoIncrement: true }
    )
    await storage.init()
    await storage.clear()
  })

  afterEach(() => storage.destroy())

  it('各类写入应发出对应事件', async () => {
    const events: StorageWriteEvent[] = []
    storage.onWrite(e => events.push(e))

    const key = await storage.save({ name: 'a', age: 1, city: 'x' })
    await storage.update({ id: key as number, name: 'a2', age: 2, city: 'x' })
    await storage.bulkAdd([{ name: 'b', age: 3, city: 'y' }])
    const k2 = await storage.bulkPut([{ name: 'c', age: 4, city: 'z' }])
    await storage.delete(k2[0])
    await storage.bulkDelete([key])
    await storage.clear()

    expect(events.map(e => e.type)).toEqual([
      'add',
      'put',
      'bulkAdd',
      'bulkPut',
      'delete',
      'bulkDelete',
      'clear',
    ])
    expect(events.every(e => e.source === 'local')).toBe(true)
    expect(events[0].keys).toEqual([key])
    expect(events[6].keys).toBeUndefined()
  })

  it('取消订阅后不再接收事件', async () => {
    const events: StorageWriteEvent[] = []
    const off = storage.onWrite(e => events.push(e))
    await storage.save({ name: 'a', age: 1, city: 'x' })
    expect(events).toHaveLength(1)
    off()
    await storage.save({ name: 'b', age: 2, city: 'y' })
    expect(events).toHaveLength(1)
  })

  it('close() 后监听器被清空', async () => {
    const events: StorageWriteEvent[] = []
    storage.onWrite(e => events.push(e))
    storage.close()
    await storage.init()
    await storage.save({ name: 'a', age: 1, city: 'x' })
    expect(events).toHaveLength(0)
  })

  it('应接收其他标签页的远程写入事件', async () => {
    // 通过类型化全局访问避免 eslint no-undef；环境不支持时跳过实际验证
    const BC = (
      globalThis as typeof globalThis & {
        BroadcastChannel?: new (name: string) => {
          postMessage(data: unknown): void
          close(): void
        }
      }
    ).BroadcastChannel
    if (!BC) return

    const events: StorageWriteEvent[] = []
    storage.onWrite(e => events.push(e))

    // 模拟另一标签页广播
    const channel = new BC('indexed-db-storage:feat-onwrite')
    channel.postMessage({ storeName: 'users', type: 'add', keys: [42] })

    await vi.waitFor(() => {
      expect(events).toHaveLength(1)
    })
    expect(events[0]).toEqual({
      storeName: 'users',
      type: 'add',
      keys: [42],
      source: 'remote',
    })
    channel.close()
  })
})

describe('persist/estimate', () => {
  it('requestPersistence 应返回布尔或 null（视环境支持而定）', async () => {
    const result = await IndexedDBStorage.requestPersistence()
    expect(result === null || typeof result === 'boolean').toBe(true)
  })

  it('isPersistent 应返回布尔或 null', async () => {
    const result = await IndexedDBStorage.isPersistent()
    expect(result === null || typeof result === 'boolean').toBe(true)
  })

  it('estimate 应返回配额对象或 null', async () => {
    const result = await IndexedDBStorage.estimate()
    expect(result === null || typeof result === 'object').toBe(true)
  })
})

describe('复合 keyPath 回归', () => {
  it('keyPath 为数组时 where 单字段查询不应抛 NotFoundError', async () => {
    const storage = new IndexedDBStorage<{ a: number; b: string }>(
      { dbName: 'feat-compound', storeName: 'items' },
      { storeName: 'items', keyPath: ['a', 'b'], autoIncrement: false }
    )
    await storage.init()
    await storage.clear()
    await storage.bulkAdd([
      { a: 1, b: 'x' },
      { a: 2, b: 'y' },
    ])

    const results = await storage.query({
      where: { field: 'a', operator: 'gt', value: 1 },
    })
    expect(results).toEqual([{ a: 2, b: 'y' }])
    storage.destroy()
  })
})
