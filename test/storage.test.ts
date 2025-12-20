/**
 * IndexedDB Storage 集成测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
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
    it('should enforce max records', async () => {
      const storageWithLimit = new IndexedDBStorage({
        dbName: 'cleanup-test-db',
        storeName: 'limit-store',
        maxRecords: 5,
        cleanupInterval: 100,
      })

      await storageWithLimit.init()

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

      storageWithLimit.destroy()
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

      // 关闭后的操作应返回空或默认值
      expect(await closedStorage.query()).toEqual([])
      expect(await closedStorage.count()).toBe(0)

      closedStorage.destroy()
    })
  })
})
