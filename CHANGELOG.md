# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.2] - 2026-01-28

### Added

- 🔍 **强大的高级查询功能**
  - **Where 条件查询**：支持 11 种查询操作符
    - 比较操作：`eq`, `ne`, `gt`, `gte`, `lt`, `lte`
    - 范围操作：`between`, `in`
    - 字符串操作：`contains`, `startsWith`, `endsWith`
  - **多条件查询**：支持多个 where 条件组合（AND 逻辑）
  - **多字段排序**：支持单字段和多字段排序（升序/降序）
  - **自定义过滤**：支持自定义 filter 函数进行复杂条件筛选
  - **嵌套字段查询**：支持 `user.address.city` 格式的嵌套字段查询
  - **组合查询**：where + sort + filter + limit + offset 完美结合

- 📚 **完整文档和示例**
  - 新增高级查询示例页面 ([advanced-query.html](examples/advanced-query.html))
  - 新增高级查询快速参考文档 ([docs/advanced-query.md](docs/advanced-query.md))
  - README 新增高级查询使用说明

- ✅ **测试覆盖**
  - 新增 20 个高级查询测试用例
  - 总测试用例数：44 个（全部通过）
  - 覆盖所有查询操作符和组合场景

### Enhanced

- 查询性能优化：where 条件使用游标遍历，提升大数据集查询效率
- API 完全向后兼容：原有 `range` 和 `indexName` 查询方式依然支持

### Technical Details

- 新增类型定义：`WhereCondition`, `QueryOperator`, `SortOption`
- 新增内部函数：
  - `matchesWhereConditions()` - 条件匹配
  - `matchCondition()` - 单条件匹配
  - `getNestedValue()` - 嵌套字段获取
  - `compareValues()` - 值比较（支持字符串、数字、日期）
  - `finishQuery()` - 查询后处理（排序和分页）

## [0.0.1] - 2024-12-20

### Added

- 初始版本发布

- 基于 IndexedDB 的通用数据存储

- 完整的 CRUD 操作支持 (save, query, get, update, delete, clear)

- 自动清理机制
  - 基于最大记录数的清理
  - 基于保留时间的清理
  - 可配置的清理间隔

- 单例模式支持，同配置自动复用实例

- TypeScript 完整类型支持

- 自定义 store 配置（keyPath, autoIncrement, indexes）

- 生命周期钩子（onSave, onDelete, onClear）

- 完整的测试套件（24个测试用例）

- ESLint 和 Prettier 代码规范

- 使用示例（基础示例和日志系统示例）

### Technical Details

- TypeScript 5.9.3

- 模块化架构设计
  - `core/` - 核心数据操作和配置管理
  - `managers/` - 实例、数据库和清理管理
  - `types/` - TypeScript 类型定义

- 测试框架：Vitest + fake-indexeddb

- 代码质量：ESLint + Prettier

- 构建工具：TypeScript Compiler

### Architecture Highlights

- 零默认值设计：所有配置由开发者显式提供

- 泛型支持：存储任意类型的数据

- 清理管理器：独立的 CleanupManager 类处理数据清理

- 配置管理器：集中的 ConfigManager 处理配置逻辑

- 实例管理器：基于 dbName:storeName 的单例模式

## [Unreleased]

### Planned

- 更多的查询选项（范围查询、排序）

- 批量操作优化

- 数据导入/导出功能

- 错误重试机制

- 性能监控和日志
