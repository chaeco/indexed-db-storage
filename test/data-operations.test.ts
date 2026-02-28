/**
 * 数据操作模块测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
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

    it('should sort NaN values to the end', async () => {
      // NaN 字段应排在末尾，不破坏其他记录的顺序
      await saveData(db, 'test-store', { name: 'WithNaN', age: NaN })
      await saveData(db, 'test-store', { name: 'Age10', age: 10 })
      await saveData(db, 'test-store', { name: 'Age5', age: 5 })

      const results = await queryData<{ name: string; age: number }>(db, 'test-store', {
        where: { field: 'name', operator: 'in', value: ['WithNaN', 'Age10', 'Age5'] },
        sort: { field: 'age', order: 'asc' },
      })

      expect(results).toHaveLength(3)
      // 有效数字按升序排在前面，NaN 排在末尾
      expect(results[0].age).toBe(5)
      expect(results[1].age).toBe(10)
      expect(isNaN(results[2].age)).toBe(true)
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

  describe('queryData 边界行为', () => {
    beforeEach(async () => {
      await saveData(db, 'test-store', { name: 'Alice', age: 25 })
      await saveData(db, 'test-store', { name: 'Bob', age: 30 })
    })

    it('direction + 无 where/filter 时应输出 warn 并正常返回', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { })
      const results = await queryData(db, 'test-store', { direction: 'prev' })
      expect(results).toHaveLength(2)
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('"direction" option is ignored'))
      warnSpy.mockRestore()
    })

    it('between compareValue 非数组时应输出 warn 并返回空结果', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { })
      const results = await queryData(db, 'test-store', {
        where: { field: 'age', operator: 'between', value: 30 },
      })
      expect(results).toHaveLength(0)
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('"between" operator requires an array'),
        30
      )
      warnSpy.mockRestore()
    })

    it('未知 operator 时应输出 warn 并对所有记录返回 false', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { })
      const results = await queryData(db, 'test-store', {
        // 强制传入无效 operator
        where: { field: 'age', operator: 'unknown' as never, value: 25 },
      })
      expect(results).toHaveLength(0)
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown query operator'))
      warnSpy.mockRestore()
    })

    it('多条件排序时，所有字段相等的记录应保持稳定（return 0 路径）', async () => {
      // Alice 和 Bob 的 age 均不同，但若按不存在的字段排序，所有值均为 undefined，走 compareValues 返回 0
      const results = await queryData<{ name: string; age: number }>(db, 'test-store', {
        where: { field: 'name', operator: 'in', value: ['Alice', 'Bob'] },
        sort: { field: 'nonExistentField', order: 'asc' },
      })
      expect(results).toHaveLength(2)
      // 顺序可任意，重点是不抛出错误
    })
  })

  describe('compareValues 排序 - Date 与 String 回退', () => {
    it('应支持按 Date 字段升序排序', async () => {
      const d1 = new Date('2020-01-01')
      const d2 = new Date('2023-06-15')
      const d3 = new Date('2021-12-31')
      await saveData(db, 'test-store', { name: 'D1', createdAt: d1 })
      await saveData(db, 'test-store', { name: 'D3', createdAt: d3 })
      await saveData(db, 'test-store', { name: 'D2', createdAt: d2 })

      const results = await queryData<{ name: string; createdAt: Date }>(db, 'test-store', {
        where: { field: 'name', operator: 'in', value: ['D1', 'D2', 'D3'] },
        sort: { field: 'createdAt', order: 'asc' },
      })

      expect(results.map((r) => r.name)).toEqual(['D1', 'D3', 'D2'])
    })

    it('应支持按 Date 字段降序排序', async () => {
      const d1 = new Date('2020-01-01')
      const d2 = new Date('2023-06-15')
      await saveData(db, 'test-store', { name: 'Early', createdAt: d1 })
      await saveData(db, 'test-store', { name: 'Late', createdAt: d2 })

      const results = await queryData<{ name: string; createdAt: Date }>(db, 'test-store', {
        where: { field: 'name', operator: 'in', value: ['Early', 'Late'] },
        sort: { field: 'createdAt', order: 'desc' },
      })

      expect(results[0].name).toBe('Late')
      expect(results[1].name).toBe('Early')
    })

    it('sort 字段仅部分记录存在时，null/undefined 值应排在末尾', async () => {
      // HasScore 有 score，NoScore 无 score（getNestedValue 返回 undefined）
      await saveData(db, 'test-store', { name: 'HasScore', score: 50 })
      await saveData(db, 'test-store', { name: 'NoScore' })

      const results = await queryData<{ name: string; score?: number }>(db, 'test-store', {
        where: { field: 'name', operator: 'in', value: ['HasScore', 'NoScore'] },
        sort: { field: 'score', order: 'asc' },
      })

      // undefined 排末尾（compareValues: a==null → return 1）
      expect(results[0].name).toBe('HasScore')
      expect(results[1].name).toBe('NoScore')
    })

    it('sort 字段值均为 NaN 时应视为相等（isNaN(a) && isNaN(b) → return 0）', async () => {
      await saveData(db, 'test-store', { name: 'NaN-A', score: NaN })
      await saveData(db, 'test-store', { name: 'NaN-B', score: NaN })

      const results = await queryData<{ name: string; score: number }>(db, 'test-store', {
        where: { field: 'name', operator: 'in', value: ['NaN-A', 'NaN-B'] },
        sort: { field: 'score', order: 'asc' },
      })

      // 两者均为 NaN → compareValues 返回 0 → 顺序任意，但不应抛出
      expect(results).toHaveLength(2)
      expect(results.every((r) => isNaN(r.score))).toBe(true)
    })

    it('非 string/number/Date 类型字段应回退到 String().localeCompare() 排序', async () => {
      // boolean 值——不是 string/number/Date，走 String() 回退比较 ("false" < "true")
      await saveData(db, 'test-store', { name: 'T', active: true })
      await saveData(db, 'test-store', { name: 'F', active: false })

      const results = await queryData<{ name: string; active: boolean }>(db, 'test-store', {
        where: { field: 'name', operator: 'in', value: ['T', 'F'] },
        sort: { field: 'active', order: 'asc' },
      })

      // "false" < "true" 以字典序，F 排前
      expect(results[0].name).toBe('F')
      expect(results[1].name).toBe('T')
    })
  })
})
