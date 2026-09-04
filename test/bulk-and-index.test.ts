/**
 * 新增优化功能测试：bulk API、索引驱动查询、索引感知排序、getAll limit
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { IndexedDBStorage } from '../src/storage'
import { bulkAddData, bulkPutData, bulkDeleteData } from '../src/core/data-operations'

interface User {
  id?: number
  name: string
  age: number
  city: string
}

describe('bulk API', () => {
  let storage: IndexedDBStorage<User>

  beforeEach(async () => {
    storage = new IndexedDBStorage<User>(
      { dbName: 'test-bulk-db', storeName: 'users' },
      { storeName: 'users', keyPath: 'id', autoIncrement: true }
    )
    await storage.init()
    await storage.clear()
  })

  afterEach(() => {
    storage.destroy()
  })

  it('bulkAdd 应返回与输入顺序一致的主键数组', async () => {
    const keys = await storage.bulkAdd([{ name: 'a', age: 1, city: 'x' }, { name: 'b', age: 2, city: 'y' }])

    expect(keys).toHaveLength(2)
    expect(keys[0]).not.toEqual(keys[1])

    const all = await storage.query()
    expect(all).toHaveLength(2)
    expect(all.map(u => u.name).sort()).toEqual(['a', 'b'])
  })

  it('bulkAdd 空数组应返回空数组且不报错', async () => {
    await expect(storage.bulkAdd([])).resolves.toEqual([])
  })

  it('bulkAdd 唯一键冲突时应整体回滚（全有或全无）', async () => {
    // 先写一条固定 id
    await storage.bulkPut([{ id: 1, name: 'orig', age: 0, city: 'z' }])

    // 尝试 bulkAdd id=2（正常）和 id=1（冲突，add 语义下失败）
    await expect(
      storage.bulkAdd([
        { id: 2, name: 'new', age: 2, city: 'y' },
        { id: 1, name: 'conflict', age: 1, city: 'x' },
      ])
    ).rejects.toThrow()

    // 事务回滚：id=2 不应存在
    expect(await storage.get(2)).toBeUndefined()
    // id=1 保持原值（add 冲突不会覆盖）
    expect(await storage.get(1)).toMatchObject({ name: 'orig' })
  })

  it('bulkPut 应支持混合插入与更新', async () => {
    await storage.bulkPut([{ id: 1, name: 'a', age: 1, city: 'x' }])

    await storage.bulkPut([
      { id: 1, name: 'a-updated', age: 10, city: 'xx' },
      { id: 2, name: 'b', age: 2, city: 'y' },
    ])

    expect(await storage.get(1)).toMatchObject({ name: 'a-updated', age: 10 })
    expect(await storage.get(2)).toMatchObject({ name: 'b' })
  })

  it('bulkDelete 应返回实际删除的记录数', async () => {
    await storage.bulkAdd([
      { id: 1, name: 'a', age: 1, city: 'x' },
      { id: 2, name: 'b', age: 2, city: 'y' },
    ])

    // 删除存在的 1、不存在的 99、存在的 2
    const deleted = await storage.bulkDelete([1, 99, 2])
    expect(deleted).toBe(2)

    expect(await storage.count()).toBe(0)
  })

  it('bulkDelete 空数组应返回 0', async () => {
    await expect(storage.bulkDelete([])).resolves.toBe(0)
  })

  it('底层 bulk 函数与实例方法行为一致', async () => {
    const db = (storage as unknown as { db: IDBDatabase }).db
    const keys = await bulkPutData(db, 'users', [
      { name: 'x', age: 1, city: 'c1' },
      { name: 'y', age: 2, city: 'c2' },
    ])
    expect(keys).toHaveLength(2)

    const n = await bulkDeleteData(db, 'users', keys)
    expect(n).toBe(2)
  })
})

describe('索引驱动查询（where → IDBKeyRange）', () => {
  let storage: IndexedDBStorage<User>

  beforeEach(async () => {
    storage = new IndexedDBStorage<User>(
      { dbName: 'test-index-query-db', storeName: 'users' },
      {
        storeName: 'users',
        keyPath: 'id',
        autoIncrement: true,
        indexes: [{ name: 'age', keyPath: 'age' }, { name: 'city', keyPath: 'city' }],
      }
    )
    await storage.init()
    await storage.clear()
    await storage.bulkAdd([
      { name: 'u1', age: 20, city: 'BJ' },
      { name: 'u2', age: 25, city: 'SH' },
      { name: 'u3', age: 30, city: 'BJ' },
      { name: 'u4', age: 35, city: 'GZ' },
      { name: 'u5', age: 40, city: 'BJ' },
    ])
  })

  afterEach(() => {
    storage.destroy()
  })

  it('索引字段上的 gte 条件应与全表过滤结果一致', async () => {
    const results = await storage.query({ where: { field: 'age', operator: 'gte', value: 30 } })
    // age 索引存在 → 走索引驱动路径；结果按索引序返回
    expect(results.map(r => r.age)).toEqual([30, 35, 40])
  })

  it('索引字段上的 between 条件应返回区间内记录', async () => {
    const results = await storage.query({ where: { field: 'age', operator: 'between', value: [25, 35] } })
    expect(results.map(r => r.age)).toEqual([25, 30, 35])
  })

  it('索引字段上的 eq 条件应返回精确匹配', async () => {
    const results = await storage.query({ where: { field: 'city', operator: 'eq', value: 'BJ' } })
    expect(results).toHaveLength(3)
    expect(results.every(r => r.city === 'BJ')).toBe(true)
  })

  it('索引驱动路径支持 limit 提前终止', async () => {
    const results = await storage.query({
      where: { field: 'age', operator: 'gte', value: 0 },
      limit: 2,
    })
    expect(results).toHaveLength(2)
  })

  it('索引驱动路径上其余条件继续 JS 过滤（组合条件）', async () => {
    const results = await storage.query({
      where: [
        { field: 'age', operator: 'gte', value: 0 },
        { field: 'city', operator: 'eq', value: 'BJ' },
      ],
      limit: 2,
    })
    expect(results).toHaveLength(2)
    expect(results.every(r => r.city === 'BJ')).toBe(true)
  })

  it('非索引字段的 where 应退回普通游标路径且结果正确', async () => {
    const results = await storage.query({ where: { field: 'name', operator: 'eq', value: 'u3' } })
    expect(results).toHaveLength(1)
    expect(results[0].age).toBe(30)
  })

  it('where 条件编译后行为与原实现一致（多条件 AND + 非范围操作符）', async () => {
    const results = await storage.query({
      where: [
        { field: 'age', operator: 'gt', value: 20 },
        { field: 'city', operator: 'ne', value: 'BJ' },
      ],
    })
    expect(results.every(r => r.age > 20 && r.city !== 'BJ')).toBe(true)
    expect(results.map(r => r.name).sort()).toEqual(['u2', 'u4'])
  })
})

describe('索引感知排序', () => {
  let storage: IndexedDBStorage<User>

  beforeEach(async () => {
    storage = new IndexedDBStorage<User>(
      { dbName: 'test-index-sort-db', storeName: 'users' },
      {
        storeName: 'users',
        keyPath: 'id',
        autoIncrement: true,
        indexes: [{ name: 'age', keyPath: 'age' }],
      }
    )
    await storage.init()
    await storage.clear()
    await storage.bulkAdd([
      { name: 'u1', age: 30, city: 'a' },
      { name: 'u2', age: 10, city: 'b' },
      { name: 'u3', age: 20, city: 'c' },
      { name: 'u4', age: 40, city: 'd' },
    ])
  })

  afterEach(() => {
    storage.destroy()
  })

  it('有索引的单字段升序排序应返回正确顺序', async () => {
    const results = await storage.query({ sort: { field: 'age', order: 'asc' } })
    expect(results.map(r => r.age)).toEqual([10, 20, 30, 40])
  })

  it('有索引的单字段降序排序应返回正确顺序', async () => {
    const results = await storage.query({ sort: { field: 'age', order: 'desc' } })
    expect(results.map(r => r.age)).toEqual([40, 30, 20, 10])
  })

  it('索引排序 + offset 分页应正确跳过', async () => {
    const results = await storage.query({ sort: { field: 'age', order: 'asc' }, offset: 2 })
    expect(results.map(r => r.age)).toEqual([30, 40])
  })

  it('索引排序 + offset + limit 组合应正确分页', async () => {
    const results = await storage.query({
      sort: { field: 'age', order: 'asc' },
      offset: 1,
      limit: 2,
    })
    expect(results.map(r => r.age)).toEqual([20, 30])
  })

  it('索引排序 + limit=0 应返回空数组', async () => {
    const results = await storage.query({ sort: { field: 'age', order: 'asc' }, limit: 0 })
    expect(results).toEqual([])
  })

  it('排序字段无索引时应退回内存排序且结果一致', async () => {
    const results = await storage.query({ sort: { field: 'name', order: 'asc' } })
    expect(results.map(r => r.name)).toEqual(['u1', 'u2', 'u3', 'u4'])
  })

  it('主键字段（keyPath）排序应走索引驱动路径', async () => {
    const results = await storage.query({ sort: { field: 'id', order: 'desc' }, limit: 2 })
    expect(results).toHaveLength(2)
    const ids = results.map(r => r.id!)
    expect(ids[0]).toBeGreaterThan(ids[1])
  })
})

describe('getAll limit 上界取数', () => {
  let storage: IndexedDBStorage<User>

  beforeEach(async () => {
    storage = new IndexedDBStorage<User>(
      { dbName: 'test-getall-limit-db', storeName: 'users' },
      { storeName: 'users', keyPath: 'id', autoIncrement: true }
    )
    await storage.init()
    await storage.clear()
    await storage.bulkAdd(
      Array.from({ length: 50 }, (_, i) => ({ name: `u${i}`, age: i, city: 'x' }))
    )
  })

  afterEach(() => {
    storage.destroy()
  })

  it('limit + offset 组合应等价于全量取回后切片', async () => {
    const limited = await storage.query({ limit: 10, offset: 5 })
    const full = await storage.query()

    expect(limited).toHaveLength(10)
    expect(limited).toEqual(full.slice(5, 15))
  })

  it('仅 limit 时应返回前 N 条', async () => {
    const limited = await storage.query({ limit: 3 })
    expect(limited).toHaveLength(3)
    expect(limited).toEqual((await storage.query()).slice(0, 3))
  })
})

describe('底层 queryData 辅助路径', () => {
  it('bulkAddData/bulkPutData 空数组直接 resolve', async () => {
    // 不需要真实 db —— 空数组短路不触碰 IDB
    await expect(bulkAddData({} as IDBDatabase, 's', [])).resolves.toEqual([])
    await expect(bulkPutData({} as IDBDatabase, 's', [])).resolves.toEqual([])
  })
})

describe('边界情况回归', () => {
  it('indexName + range + where 时应尊重调用方指定的索引（不被索引驱动接管）', async () => {
    const storage = new IndexedDBStorage<User>(
      { dbName: 'test-edge-db', storeName: 'users' },
      {
        storeName: 'users',
        keyPath: 'id',
        autoIncrement: true,
        indexes: [{ name: 'age', keyPath: 'age' }, { name: 'city', keyPath: 'city' }],
      }
    )
    await storage.init()
    await storage.clear()
    await storage.bulkAdd([
      { name: 'u1', age: 20, city: 'BJ' },
      { name: 'u2', age: 25, city: 'SH' },
      { name: 'u3', age: 30, city: 'BJ' },
      { name: 'u4', age: 35, city: 'GZ' },
    ])

    // indexName='city' + city range：range 绑定在 city 索引上；
    // where 里的 age gte 条件应仅作 JS 过滤，不得改变游标来源
    /* global IDBKeyRange */
    const results = await storage.query({
      indexName: 'city',
      range: IDBKeyRange.bound('BJ', 'GZ'),
      where: [{ field: 'age', operator: 'gte', value: 0 }],
    })

    // city ∈ [BJ, GZ]（IDB 字符串序）: BJ, GZ, SH... bound 上限含 GZ
    expect(results.every(r => r.city >= 'BJ' && r.city <= 'GZ')).toBe(true)
    expect(results.every(r => r.age >= 0)).toBe(true)

    storage.destroy()
  })

  it('where eq 的值为对象（无效 IDBKey）时应退回 JS 过滤而非抛异常', async () => {
    const storage = new IndexedDBStorage<User>(
      { dbName: 'test-edge-db2', storeName: 'users' },
      {
        storeName: 'users',
        keyPath: 'id',
        autoIncrement: true,
        indexes: [{ name: 'age', keyPath: 'age' }],
      }
    )
    await storage.init()
    await storage.clear()
    await storage.bulkAdd([{ name: 'u1', age: 20, city: 'a' }])

    // 对象不是合法 IDBKey；索引驱动路径必须安全回退
    const results = await storage.query({
      where: { field: 'age', operator: 'eq', value: { x: 1 } as unknown as number },
    })
    // eq 引用比较：对象永不相等，结果为空但不抛错
    expect(results).toEqual([])

    storage.destroy()
  })

  it('where eq 值为 NaN 时应安全回退并返回空', async () => {
    const storage = new IndexedDBStorage<User>(
      { dbName: 'test-edge-db3', storeName: 'users' },
      {
        storeName: 'users',
        keyPath: 'id',
        autoIncrement: true,
        indexes: [{ name: 'age', keyPath: 'age' }],
      }
    )
    await storage.init()
    await storage.clear()
    await storage.bulkAdd([{ name: 'u1', age: 20, city: 'a' }])

    const results = await storage.query({
      where: { field: 'age', operator: 'eq', value: NaN },
    })
    expect(results).toEqual([])

    storage.destroy()
  })

  it('between Date 端点应正常走索引驱动路径', async () => {
    const storage = new IndexedDBStorage<{ id?: number; name: string; ts: Date }>(
      { dbName: 'test-edge-db4', storeName: 'events' },
      {
        storeName: 'events',
        keyPath: 'id',
        autoIncrement: true,
        indexes: [{ name: 'ts', keyPath: 'ts' }],
      }
    )
    await storage.init()
    await storage.clear()

    const base = new Date('2024-01-01T00:00:00Z').getTime()
    await storage.bulkAdd([
      { name: 'e1', ts: new Date(base) },
      { name: 'e2', ts: new Date(base + 1000) },
      { name: 'e3', ts: new Date(base + 2000) },
    ])

    const results = await storage.query({
      where: {
        field: 'ts',
        operator: 'between',
        value: [new Date(base), new Date(base + 2000)],
      },
    })
    expect(results.map(r => r.name).sort()).toEqual(['e1', 'e2', 'e3'])

    storage.destroy()
  })

  it('单字段索引排序 + where 组合（where 在非排序字段上）应走游标路径且结果正确', async () => {
    const storage = new IndexedDBStorage<User>(
      { dbName: 'test-edge-db5', storeName: 'users' },
      {
        storeName: 'users',
        keyPath: 'id',
        autoIncrement: true,
        indexes: [{ name: 'age', keyPath: 'age' }],
      }
    )
    await storage.init()
    await storage.clear()
    await storage.bulkAdd([
      { name: 'a', age: 30, city: 'BJ' },
      { name: 'b', age: 10, city: 'SH' },
      { name: 'c', age: 20, city: 'BJ' },
    ])

    const results = await storage.query({
      where: { field: 'city', operator: 'eq', value: 'BJ' },
      sort: { field: 'age', order: 'desc' },
    })
    expect(results.map(r => r.name)).toEqual(['a', 'c'])

    storage.destroy()
  })
})

describe('onversionchange 自动让位', () => {
  it('其他连接升级版本时应自动让位并重连', async () => {
    const storage = new IndexedDBStorage<User>(
      { dbName: 'test-vc-db', storeName: 'users' },
      { storeName: 'users', keyPath: 'id', autoIncrement: true }
    )
    await storage.init()
    const oldDb = (storage as unknown as { db: IDBDatabase | null }).db
    expect(oldDb).not.toBeNull()

    // 用原生 API 以更高版本打开同一数据库，触发已持有连接的 versionchange
    const upgradePromise = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('test-vc-db', 2)
      req.onupgradeneeded = () => {}
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    const newDb = await upgradePromise

    // 让位后应自动以新版本重连（autoOpen 语义），后续操作无需手动 init
    await vi.waitFor(async () => {
      expect((storage as unknown as { db: IDBDatabase | null }).db).not.toBeNull()
    })
    const reconnectedDb = (storage as unknown as { db: IDBDatabase | null }).db!
    expect(reconnectedDb).not.toBe(oldDb)
    expect(reconnectedDb.version).toBe(2)
    await expect(storage.save({ name: 'x', age: 1, city: 'y' })).resolves.toBeDefined()

    newDb.close()
    storage.destroy()
  })
})
