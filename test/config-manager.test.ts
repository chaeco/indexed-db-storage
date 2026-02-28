/**
 * ConfigManager 配置校验测试
 * 通过 IndexedDBStorage 构造函数触发（ConfigManager 为内部类，不对外导出）
 */

import { describe, it, expect, vi } from 'vitest'
import { IndexedDBStorage } from '../src/storage'

describe('ConfigManager 参数校验', () => {
  describe('dbName 校验', () => {
    it('dbName 为空字符串时应抛出错误', () => {
      expect(() => new IndexedDBStorage({ dbName: '', storeName: 'store' }))
        .toThrow('dbName must be a non-empty string')
    })

    it('dbName 为纯空白字符时应抛出错误', () => {
      expect(() => new IndexedDBStorage({ dbName: '   ', storeName: 'store' }))
        .toThrow('dbName must be a non-empty string')
    })
  })

  describe('storeName 校验', () => {
    it('storeName 为空字符串时应抛出错误', () => {
      expect(() => new IndexedDBStorage({ dbName: 'db', storeName: '' }))
        .toThrow('storeName must be a non-empty string')
    })

    it('storeName 为纯空白字符时应抛出错误', () => {
      expect(() => new IndexedDBStorage({ dbName: 'db', storeName: '  ' }))
        .toThrow('storeName must be a non-empty string')
    })
  })

  describe('maxRecords 校验', () => {
    it('maxRecords = 0 时应抛出错误', () => {
      expect(() => new IndexedDBStorage({ dbName: 'db', storeName: 'store', maxRecords: 0 }))
        .toThrow('maxRecords must be a positive integer')
    })

    it('maxRecords 为负数时应抛出错误', () => {
      expect(() => new IndexedDBStorage({ dbName: 'db', storeName: 'store', maxRecords: -10 }))
        .toThrow('maxRecords must be a positive integer')
    })

    it('maxRecords 为小数时应抛出错误', () => {
      expect(() => new IndexedDBStorage({ dbName: 'db', storeName: 'store', maxRecords: 1.5 }))
        .toThrow('maxRecords must be a positive integer')
    })
  })

  describe('retentionTime 校验', () => {
    it('retentionTime 为负数时应抛出错误', () => {
      expect(() => new IndexedDBStorage({ dbName: 'db', storeName: 'store', retentionTime: -1000 }))
        .toThrow('retentionTime must be a finite positive number')
    })

    it('retentionTime = Infinity 时应抛出错误', () => {
      expect(() => new IndexedDBStorage({ dbName: 'db', storeName: 'store', retentionTime: Infinity }))
        .toThrow('retentionTime must be a finite positive number')
    })
  })

  describe('cleanupInterval 校验', () => {
    it('cleanupInterval = 0 时应抛出错误', () => {
      expect(() => new IndexedDBStorage({ dbName: 'db', storeName: 'store', cleanupInterval: 0 }))
        .toThrow('cleanupInterval must be a finite positive number')
    })

    it('cleanupInterval 为负数时应抛出错误', () => {
      expect(() => new IndexedDBStorage({ dbName: 'db', storeName: 'store', cleanupInterval: -500 }))
        .toThrow('cleanupInterval must be a finite positive number')
    })
  })

  describe('warn：配置不完整', () => {
    it('设置 retentionTime 但未设置 cleanupInterval 时应输出 warn', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { })
      const s = new IndexedDBStorage({ dbName: 'cfg-warn-1', storeName: 'store', retentionTime: 60000 })
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('cleanupInterval is missing'))
      warnSpy.mockRestore()
      s.destroy()
    })

    it('设置 maxRecords 但未设置 cleanupInterval 时应输出 warn', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { })
      const s = new IndexedDBStorage({ dbName: 'cfg-warn-2', storeName: 'store', maxRecords: 100 })
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('cleanupInterval is missing'))
      warnSpy.mockRestore()
      s.destroy()
    })

    it('设置 cleanupInterval 但未设置 maxRecords/retentionTime 时应输出 warn', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { })
      const s = new IndexedDBStorage({ dbName: 'cfg-warn-3', storeName: 'store', cleanupInterval: 60000 })
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('neither maxRecords nor retentionTime'))
      warnSpy.mockRestore()
      s.destroy()
    })
  })
})
