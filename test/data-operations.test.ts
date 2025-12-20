/**
 * 数据操作模块测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  saveData,
  updateData,
  queryData,
  getData,
  deleteData,
  clearAllData,
  getCount,
} from '../src/core/data-operations'

describe('Data Operations', () => {
  let db: IDBDatabase
  const dbName = 'test-db'

  beforeEach(async () => {
    // 删除旧数据库
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(dbName)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })

    // 创建测试数据库
    db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(dbName, 1)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains('test-store')) {
          db.createObjectStore('test-store', { keyPath: 'id', autoIncrement: true })
        }
      }
    })
  })

  afterEach(() => {
    if (db) {
      db.close()
    }
  })

  describe('saveData', () => {
    it('should save data and return key', async () => {
      const data = { name: 'test', value: 123 }
      const key = await saveData(db, 'test-store', data)

      expect(key).toBeDefined()
      expect(typeof key).toBe('number')
    })

    it('should save multiple records', async () => {
      await saveData(db, 'test-store', { name: 'test1' })
      await saveData(db, 'test-store', { name: 'test2' })

      const count = await getCount(db, 'test-store')
      expect(count).toBe(2)
    })
  })

  describe('getData', () => {
    it('should retrieve saved data by key', async () => {
      const data = { name: 'John', age: 30 }
      const key = await saveData(db, 'test-store', data)

      const retrieved = await getData(db, 'test-store', key)
      expect(retrieved).toMatchObject(data)
    })

    it('should return undefined for non-existent key', async () => {
      const retrieved = await getData(db, 'test-store', 9999)
      expect(retrieved).toBeUndefined()
    })
  })

  describe('updateData', () => {
    it('should update existing data', async () => {
      // 先保存一条数据
      const data = { name: 'old', value: 1 }
      const key = await saveData(db, 'test-store', data)

      // 获取保存后的完整数据（包含id）
      const saved = await getData(db, 'test-store', key)

      // 更新数据
      await updateData(db, 'test-store', { ...saved!, name: 'new', value: 2 })

      const updated = await getData(db, 'test-store', key)
      expect(updated).toMatchObject({ name: 'new', value: 2 })
    })
  })

  describe('deleteData', () => {
    it('should delete data by key', async () => {
      const key = await saveData(db, 'test-store', { name: 'to-delete' })
      await deleteData(db, 'test-store', key)

      const retrieved = await getData(db, 'test-store', key)
      expect(retrieved).toBeUndefined()
    })
  })

  describe('queryData', () => {
    beforeEach(async () => {
      await saveData(db, 'test-store', { name: 'Alice', age: 25 })
      await saveData(db, 'test-store', { name: 'Bob', age: 30 })
      await saveData(db, 'test-store', { name: 'Charlie', age: 35 })
    })

    it('should query all data', async () => {
      const results = await queryData(db, 'test-store')
      expect(results).toHaveLength(3)
    })

    it('should respect limit', async () => {
      const results = await queryData(db, 'test-store', { limit: 2 })
      expect(results).toHaveLength(2)
    })

    it('should respect offset', async () => {
      const results = await queryData(db, 'test-store', { offset: 1, limit: 2 })
      expect(results).toHaveLength(2)
    })
  })

  describe('clearAllData', () => {
    it('should clear all data from store', async () => {
      await saveData(db, 'test-store', { name: 'test1' })
      await saveData(db, 'test-store', { name: 'test2' })

      await clearAllData(db, 'test-store')

      const count = await getCount(db, 'test-store')
      expect(count).toBe(0)
    })
  })

  describe('getCount', () => {
    it('should return correct count', async () => {
      expect(await getCount(db, 'test-store')).toBe(0)

      await saveData(db, 'test-store', { name: 'test1' })
      expect(await getCount(db, 'test-store')).toBe(1)

      await saveData(db, 'test-store', { name: 'test2' })
      expect(await getCount(db, 'test-store')).toBe(2)
    })
  })
})
