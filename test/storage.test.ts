/**
 * IndexedDB Storage 集成测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { IndexedDBStorage } from '../src/storage'

describe('IndexedDBStorage', () => {
  let storage: IndexedDBStorage<{ id?: number; name: string; value?: number }>

  beforeEach(async () => {
    storage = new IndexedDBStorage(
      {
        dbName: 'test-storage-db',
        storeName: 'test-store',
      },
      {
        storeName: 'test-store',
        keyPath: 'id',
        autoIncrement: true,
      }
    )
    await storage.init()
    // 清除上一个 it 遗留的数据，保证每个测试从空 store 开始，
    // 避免测试顺序改变时因残留记录导致 count / query 断言失败。
    await storage.clear()
  })

  afterEach(() => {
    storage.destroy()
  })

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      const newStorage = new IndexedDBStorage({
        dbName: 'init-test-db',
        storeName: 'init-store',
      })

      await expect(newStorage.init()).resolves.not.toThrow()
      newStorage.destroy()
    })

    it('should support multiple initializations', async () => {
      await storage.init()
      await storage.init()
      await storage.init()
      // 不应该抛出错误
    })

    it('should throw error when using before init', async () => {
      const uninitStorage = new IndexedDBStorage({
        dbName: 'uninit-db',
        storeName: 'uninit-store',
      })

      await expect(uninitStorage.save({ name: 'test' })).rejects.toThrow('not initialized')
      uninitStorage.destroy()
    })
  })

  describe('Singleton Pattern', () => {
    it('should return same instance for same config', () => {
      const storage1 = new IndexedDBStorage({
        dbName: 'singleton-test',
        storeName: 'store1',
      })

      const storage2 = new IndexedDBStorage({
        dbName: 'singleton-test',
        storeName: 'store1',
      })

      expect(storage1).toBe(storage2)
      storage1.destroy()
    })

    it('should return different instances for different stores', () => {
      const storage1 = new IndexedDBStorage({
        dbName: 'singleton-test',
        storeName: 'store1',
      })

      const storage2 = new IndexedDBStorage({
        dbName: 'singleton-test',
        storeName: 'store2',
      })

      expect(storage1).not.toBe(storage2)
      storage1.destroy()
      storage2.destroy()
    })
  })

  describe('CRUD Operations', () => {
    it('should save and retrieve data', async () => {
      const data = { name: 'Test Item', value: 42 }
      const key = await storage.save(data)

      const retrieved = await storage.get(key)
      expect(retrieved).toMatchObject(data)
    })

    it('should update data', async () => {
      const data = { name: 'Original' }
      const key = await storage.save(data)

      // 获取保存后的完整数据（包含id）
      const saved = await storage.get(key)
      expect(saved).toBeDefined()
      expect(saved).toHaveProperty('id', key)
      expect(saved).toHaveProperty('name', 'Original')

      // 更新数据（saved 现在包含 id 字段）
      await storage.update({ ...saved, name: 'Updated', value: 100 })

      // 重新获取更新后的数据
      const updated = await storage.get(key)
      expect(updated).toBeDefined()
      expect(updated).toMatchObject({ name: 'Updated', value: 100 })
    })

    it('should delete data', async () => {
      const key = await storage.save({ name: 'To Delete' })
      await storage.delete(key)

      const retrieved = await storage.get(key)
      expect(retrieved).toBeUndefined()
    })

    it('should query data', async () => {
      await storage.save({ name: 'Item 1' })
      await storage.save({ name: 'Item 2' })
      await storage.save({ name: 'Item 3' })

      const results = await storage.query({ limit: 2 })
      expect(results).toHaveLength(2)
    })

    it('should clear all data', async () => {
      await storage.save({ name: 'Item 1' })
      await storage.save({ name: 'Item 2' })

      await storage.clear()

      const count = await storage.count()
      expect(count).toBe(0)
    })

    it('should count records', async () => {
      expect(await storage.count()).toBe(0)

      await storage.save({ name: 'Item 1' })
      expect(await storage.count()).toBe(1)

      await storage.save({ name: 'Item 2' })
      expect(await storage.count()).toBe(2)
    })
  })

  describe('Cleanup', () => {
    let storageWithLimit: IndexedDBStorage<{ name: string }>

    beforeEach(async () => {
      storageWithLimit = new IndexedDBStorage({
        dbName: 'cleanup-test-db',
        storeName: 'limit-store',
        maxRecords: 5,
        cleanupInterval: 100,
      })
      await storageWithLimit.init()
      await storageWithLimit.clear()
    })

    afterEach(() => {
      storageWithLimit.destroy()
    })

    it('should enforce max records', async () => {
      // 添加 10 条记录
      for (let i = 0; i < 10; i++) {
        await storageWithLimit.save({ name: `Item ${i}` })
      }

      // 手动触发清理
      await storageWithLimit.cleanup()

      const count = await storageWithLimit.count()
      // 清理后应该保留约 90% = 4-5 条记录
      expect(count).toBeLessThanOrEqual(5)
      expect(count).toBeGreaterThanOrEqual(4)
    })
  })

  describe('Error Handling', () => {
    it('should handle invalid operations gracefully', async () => {
      const closedStorage = new IndexedDBStorage({
        dbName: 'closed-db',
        storeName: 'closed-store',
      })

      await closedStorage.init()
      closedStorage.close()

      // close() 后 db 为 null，所有操作（读/写）均应统一抛出 "not initialized" 错误，
      // 防止调用方误以为空结果是正常业务响应而非编程错误。
      await expect(closedStorage.query()).rejects.toThrow('Database not initialized')
      await expect(closedStorage.count()).rejects.toThrow('Database not initialized')

      closedStorage.destroy()
    })

    it('should throw when storeConfig.storeName does not match options.storeName', () => {
      expect(() => {
        new IndexedDBStorage(
          { dbName: 'mismatch-db', storeName: 'users' },
          { storeName: 'messages', keyPath: 'id', autoIncrement: true }
        )
      }).toThrow(/storeConfig\.storeName.*must match.*options\.storeName/i)
    })
  })

  describe('Singleton Lifecycle', () => {
    it('should warn when creating duplicate instance with storeConfig', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const s1 = new IndexedDBStorage(
        { dbName: 'dup-warn-db', storeName: 'dup-store' },
        { storeName: 'dup-store', keyPath: 'id', autoIncrement: true }
      )
      // 同 key 再次创建，传入 storeConfig → 应 warn 并返回已有实例
      const s2 = new IndexedDBStorage(
        { dbName: 'dup-warn-db', storeName: 'dup-store' },
        { storeName: 'dup-store', keyPath: 'id', autoIncrement: true }
      )

      expect(s1).toBe(s2)
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('already exists'))
      warnSpy.mockRestore()
      s1.destroy()
    })

    it('clearInstance(options) should destroy the specific instance', async () => {
      const s = new IndexedDBStorage({ dbName: 'clear-inst-db', storeName: 'ci-store' })
      await s.init()

      IndexedDBStorage.clearInstance({ dbName: 'clear-inst-db', storeName: 'ci-store' })

      // destroy 后，以相同参数构造应得到全新实例（不是同一引用）
      const s2 = new IndexedDBStorage({ dbName: 'clear-inst-db', storeName: 'ci-store' })
      expect(s2).not.toBe(s)
      s2.destroy()
    })

    it('clearInstance(options) should be a no-op when instance does not exist', () => {
      // 不抛出错误即为通过
      expect(() => {
        IndexedDBStorage.clearInstance({ dbName: 'nonexistent-db', storeName: 'no-store' })
      }).not.toThrow()
    })

    it('clearInstance() without args should destroy all instances', async () => {
      // 每个 store 使用独立 dbName，避免 fake-indexeddb 升级时互相阻塞
      const s1 = new IndexedDBStorage({ dbName: 'cls-all-a', storeName: 'store-a' })
      const s2 = new IndexedDBStorage({ dbName: 'cls-all-b', storeName: 'store-b' })
      await s1.init()
      await s2.init()

      IndexedDBStorage.clearInstance()

      // 清除后重建，应得到全新实例
      const n1 = new IndexedDBStorage({ dbName: 'cls-all-a', storeName: 'store-a' })
      const n2 = new IndexedDBStorage({ dbName: 'cls-all-b', storeName: 'store-b' })
      expect(n1).not.toBe(s1)
      expect(n2).not.toBe(s2)
      n1.destroy()
      n2.destroy()
    })

    it('should cancel init() when close() is called concurrently', async () => {
      const s = new IndexedDBStorage({ dbName: 'cancel-init-db', storeName: 'ci-store' })
      const initPromise = s.init()
      // 同步调用 close()：此时 initDatabase 尚未 resolve，世代递增
      s.close()
      await expect(initPromise).rejects.toThrow(/cancelled/)
      s.destroy()
    })
  })

  describe('StoreConfig with indexes', () => {
    it('should create store with indexes when storeConfig.indexes is provided', async () => {
      const s = new IndexedDBStorage(
        { dbName: 'idx-db', storeName: 'idx-store' },
        {
          storeName: 'idx-store',
          keyPath: 'id',
          autoIncrement: true,
          indexes: [{ name: 'by-name', keyPath: 'name', options: { unique: false } }],
        }
      )
      // init 成功即表示索引被正确创建
      await expect(s.init()).resolves.not.toThrow()
      s.destroy()
    })
  })

  describe('retentionTime cleanup', () => {
    it('should delete expired records based on retentionTime', async () => {
      const retentionStorage = new IndexedDBStorage<{ name: string; timestamp: number }>(
        {
          dbName: 'retention-test-db',
          storeName: 'retention-store',
          retentionTime: 1000, // 1 秒保留期
          cleanupInterval: 9999999, // 足够大，避免定时器自动触发
          timestampIndexName: 'by-timestamp',
        },
        {
          storeName: 'retention-store',
          keyPath: 'id',
          autoIncrement: true,
          indexes: [{ name: 'by-timestamp', keyPath: 'timestamp', options: { unique: false } }],
        }
      )
      await retentionStorage.init()
      await retentionStorage.clear()

      // 存入远古时间戳（epoch + 1ms ~= year 1970），肯定早于 expiredTime = now - 1000
      // save() 的 fire-and-forget cleanup 会在每次 await 后通过 deleteExpiredData 立即删除
      await retentionStorage.save({ name: 'expired-1', timestamp: 1 })
      await retentionStorage.save({ name: 'expired-2', timestamp: 2 })

      // 未来时间戳：始终不会过期
      const farFuture = Date.now() + 999999
      await retentionStorage.save({ name: 'fresh', timestamp: farFuture })

      // fire-and-forget 清理已在 save 后运行完毕，过期记录已被删除；
      // 此处再调一次以保证路径覆盖 isCleanupRunning=false 的分支
      await retentionStorage.cleanup()

      const remaining = await retentionStorage.query()
      expect(remaining).toHaveLength(1)
      expect(remaining[0].name).toBe('fresh')

      retentionStorage.destroy()
    })

    it('should warn and skip deleteExpiredData when timestamp index does not exist', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      // store 没有 timestamp 索引，但配了 retentionTime
      const s = new IndexedDBStorage<{ name: string }>(
        {
          dbName: 'no-ts-index-db',
          storeName: 'no-ts-store',
          retentionTime: 1000,
          cleanupInterval: 9999999,
          timestampIndexName: 'timestamp',
        },
        {
          storeName: 'no-ts-store',
          keyPath: 'id',
          autoIncrement: true,
          // 故意不创建 timestamp 索引
        }
      )
      await s.init()
      await s.save({ name: 'test' })

      // cleanup 应不抛出，并输出 warn
      await expect(s.cleanup()).resolves.not.toThrow()
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('timestamp index'))

      warnSpy.mockRestore()
      s.destroy()
    })
  })
})
