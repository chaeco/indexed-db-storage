/**
 * 高级查询功能测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { IndexedDBStorage } from '../src/storage'

interface Employee {
  id?: number
  name: string
  age: number
  department: string
  salary: number
  email?: string
}

describe('高级查询功能', () => {
  let storage: IndexedDBStorage<Employee>

  beforeEach(async () => {
    storage = new IndexedDBStorage<Employee>(
      {
        dbName: 'test-advanced-query',
        storeName: 'employees',
      },
      {
        storeName: 'employees',
        keyPath: 'id',
        autoIncrement: true,
      }
    )

    await storage.init()

    // 初始化测试数据
    const employees: Omit<Employee, 'id'>[] = [
      { name: '张三', age: 25, department: '工程', salary: 8000, email: 'zhang@test.com' },
      { name: '李四', age: 30, department: '产品', salary: 9000, email: 'li@test.com' },
      { name: '王五', age: 28, department: '工程', salary: 8500, email: 'wang@test.com' },
      { name: '赵六', age: 35, department: '设计', salary: 10000, email: 'zhao@test.com' },
      { name: '钱七', age: 22, department: '工程', salary: 7000, email: 'qian@test.com' },
      { name: '孙八', age: 32, department: '产品', salary: 9500, email: 'sun@test.com' },
      { name: '周九', age: 27, department: '市场', salary: 7500, email: 'zhou@test.com' },
      { name: '吴十', age: 29, department: '工程', salary: 8800, email: 'wu@test.com' },
    ]

    for (const emp of employees) {
      await storage.save(emp)
    }
  })

  afterEach(async () => {
    await storage.clear()
    storage.destroy()
  })

  describe('where 条件查询', () => {
    it('应该支持等值查询 (eq)', async () => {
      const results = await storage.query({
        where: { field: 'age', operator: 'eq', value: 25 },
      })

      expect(results).toHaveLength(1)
      expect(results[0].name).toBe('张三')
    })

    it('应该支持不等于查询 (ne)', async () => {
      const results = await storage.query({
        where: { field: 'department', operator: 'ne', value: '工程' },
      })

      expect(results.length).toBeGreaterThan(0)
      expect(results.every(r => r.department !== '工程')).toBe(true)
    })

    it('应该支持大于查询 (gt)', async () => {
      const results = await storage.query({
        where: { field: 'age', operator: 'gt', value: 30 },
      })

      expect(results.every(r => r.age > 30)).toBe(true)
    })

    it('应该支持大于等于查询 (gte)', async () => {
      const results = await storage.query({
        where: { field: 'age', operator: 'gte', value: 30 },
      })

      expect(results.every(r => r.age >= 30)).toBe(true)
    })

    it('应该支持小于查询 (lt)', async () => {
      const results = await storage.query({
        where: { field: 'age', operator: 'lt', value: 25 },
      })

      expect(results.every(r => r.age < 25)).toBe(true)
    })

    it('应该支持小于等于查询 (lte)', async () => {
      const results = await storage.query({
        where: { field: 'salary', operator: 'lte', value: 8000 },
      })

      expect(results.every(r => r.salary <= 8000)).toBe(true)
    })

    it('应该支持范围查询 (between)', async () => {
      const results = await storage.query({
        where: { field: 'age', operator: 'between', value: [25, 30] },
      })

      expect(results.every(r => r.age >= 25 && r.age <= 30)).toBe(true)
    })

    it('between 端点为 NaN 时应返回空结果并输出 warn', async () => {
      // NaN 端点无法参与有意义的范围比较，应触发 warn 并对所有记录返回 false
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const results = await storage.query({
        where: { field: 'age', operator: 'between', value: [NaN, 30] },
      })
      expect(results).toHaveLength(0)
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('"between" operator received NaN'),
        expect.anything()
      )
      warnSpy.mockRestore()
    })

    it('gt/lt compareValue 为 NaN 时应返回空结果并输出 warn', async () => {
      // NaN 作为比较基准无意义，应触发 warn 而非静默让所有记录匹配失败
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const gtResults = await storage.query({
        where: { field: 'age', operator: 'gt', value: NaN },
      })
      expect(gtResults).toHaveLength(0)
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('"gt" operator received NaN'))
      warnSpy.mockClear()

      const ltResults = await storage.query({
        where: { field: 'age', operator: 'lt', value: NaN },
      })
      expect(ltResults).toHaveLength(0)
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('"lt" operator received NaN'))
      warnSpy.mockRestore()
    })

    it('gte/lte compareValue 为 NaN 时应返回空结果并输出 warn', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const gteResults = await storage.query({
        where: { field: 'age', operator: 'gte', value: NaN },
      })
      expect(gteResults).toHaveLength(0)
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('"gte" operator received NaN'))
      warnSpy.mockClear()

      const lteResults = await storage.query({
        where: { field: 'age', operator: 'lte', value: NaN },
      })
      expect(lteResults).toHaveLength(0)
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('"lte" operator received NaN'))
      warnSpy.mockRestore()
    })

    it('contains/startsWith/endsWith compareValue 为 NaN 时应返回空结果并输出 warn', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const containsResults = await storage.query({
        where: { field: 'name', operator: 'contains', value: NaN },
      })
      expect(containsResults).toHaveLength(0)
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('"contains" operator received NaN')
      )
      warnSpy.mockClear()

      const startsWithResults = await storage.query({
        where: { field: 'name', operator: 'startsWith', value: NaN },
      })
      expect(startsWithResults).toHaveLength(0)
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('"startsWith" operator received NaN')
      )
      warnSpy.mockClear()

      const endsWithResults = await storage.query({
        where: { field: 'email', operator: 'endsWith', value: NaN },
      })
      expect(endsWithResults).toHaveLength(0)
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('"endsWith" operator received NaN')
      )
      warnSpy.mockRestore()
    })

    it('between 倒置区间（min > max）时应返回空结果并输出 warn', async () => {
      // 传入 [35, 25] 而非 [25, 35]，常见的参数顺序错误，应 warn 而非静默返回空
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const results = await storage.query({
        where: { field: 'age', operator: 'between', value: [35, 25] },
      })
      expect(results).toHaveLength(0)
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('"between" operator: min > max'),
        expect.anything()
      )
      warnSpy.mockRestore()
    })

    it('in 的 compareValue 非数组时应返回空结果并输出 warn', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const results = await storage.query({
        where: { field: 'age', operator: 'in', value: 30 },
      })
      expect(results).toHaveLength(0)
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('"in" operator requires an array'),
        expect.anything()
      )
      warnSpy.mockRestore()
    })

    it('应该支持 in 查询', async () => {
      const results = await storage.query({
        where: { field: 'department', operator: 'in', value: ['工程', '产品'] },
      })

      expect(results.every(r => ['工程', '产品'].includes(r.department))).toBe(true)
    })

    it('应该支持字符串包含查询 (contains)', async () => {
      const results = await storage.query({
        where: { field: 'name', operator: 'contains', value: '李' },
      })

      expect(results.length).toBeGreaterThan(0)
      expect(results.every(r => r.name.includes('李'))).toBe(true)
    })

    it('应该支持字符串开头查询 (startsWith)', async () => {
      const results = await storage.query({
        where: { field: 'name', operator: 'startsWith', value: '张' },
      })

      expect(results).toHaveLength(1)
      expect(results[0].name).toBe('张三')
    })

    it('应该支持字符串结尾查询 (endsWith)', async () => {
      const results = await storage.query({
        where: { field: 'email', operator: 'endsWith', value: '@test.com' },
      })

      expect(results.length).toBe(8) // 所有邮箱都以 @test.com 结尾
    })

    it('应该支持多条件查询 (AND)', async () => {
      const results = await storage.query({
        where: [
          { field: 'age', operator: 'gt', value: 25 },
          { field: 'department', operator: 'eq', value: '工程' },
        ],
      })

      expect(results.every(r => r.age > 25 && r.department === '工程')).toBe(true)
    })
  })

  describe('排序功能', () => {
    it('应该支持单字段升序排序', async () => {
      const results = await storage.query({
        sort: { field: 'age', order: 'asc' },
      })

      for (let i = 1; i < results.length; i++) {
        expect(results[i].age).toBeGreaterThanOrEqual(results[i - 1].age)
      }
    })

    it('应该支持单字段降序排序', async () => {
      const results = await storage.query({
        sort: { field: 'salary', order: 'desc' },
      })

      for (let i = 1; i < results.length; i++) {
        expect(results[i].salary).toBeLessThanOrEqual(results[i - 1].salary)
      }
    })

    it('应该支持多字段排序', async () => {
      const results = await storage.query({
        sort: [
          { field: 'department', order: 'asc' },
          { field: 'age', order: 'desc' },
        ],
      })

      expect(results.length).toBeGreaterThan(0)

      // 验证部门排序
      for (let i = 1; i < results.length; i++) {
        const deptCompare = results[i - 1].department.localeCompare(results[i].department)
        if (deptCompare === 0) {
          // 同部门内按年龄降序
          expect(results[i].age).toBeLessThanOrEqual(results[i - 1].age)
        } else {
          // 部门应该升序
          expect(deptCompare).toBeLessThanOrEqual(0)
        }
      }
    })
  })

  describe('自定义过滤', () => {
    it('应该支持自定义过滤函数', async () => {
      const results = await storage.query({
        filter: item => item.age % 2 === 0 && item.salary > 8000,
      })

      expect(results.every(r => r.age % 2 === 0 && r.salary > 8000)).toBe(true)
    })

    it('应该支持 where 和 filter 组合', async () => {
      const results = await storage.query({
        where: { field: 'department', operator: 'eq', value: '工程' },
        filter: item => item.salary > 8000,
      })

      expect(results.every(r => r.department === '工程' && r.salary > 8000)).toBe(true)
    })
  })

  describe('组合查询', () => {
    it('应该支持 where + sort + limit', async () => {
      const results = await storage.query({
        where: { field: 'age', operator: 'gte', value: 25 },
        sort: { field: 'salary', order: 'desc' },
        limit: 3,
      })

      expect(results).toHaveLength(3)
      expect(results.every(r => r.age >= 25)).toBe(true)

      // 验证降序排序
      for (let i = 1; i < results.length; i++) {
        expect(results[i].salary).toBeLessThanOrEqual(results[i - 1].salary)
      }
    })

    it('应该支持完整的组合查询', async () => {
      const results = await storage.query({
        where: { field: 'department', operator: 'in', value: ['工程', '产品'] },
        sort: { field: 'age', order: 'asc' },
        filter: item => item.salary >= 8500,
        limit: 5,
        offset: 1,
      })

      expect(results.length).toBeLessThanOrEqual(5)
      expect(results.every(r => ['工程', '产品'].includes(r.department))).toBe(true)
      expect(results.every(r => r.salary >= 8500)).toBe(true)
    })
  })

  describe('分页查询', () => {
    it('应该支持 offset 和 limit', async () => {
      const page1 = await storage.query({
        sort: { field: 'id', order: 'asc' },
        limit: 3,
        offset: 0,
      })

      const page2 = await storage.query({
        sort: { field: 'id', order: 'asc' },
        limit: 3,
        offset: 3,
      })

      expect(page1).toHaveLength(3)
      expect(page2).toHaveLength(3)

      // 确保没有重复
      const ids1 = page1.map(r => r.id)
      const ids2 = page2.map(r => r.id)
      expect(ids1.some(id => ids2.includes(id))).toBe(false)
    })
  })
})
