# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
