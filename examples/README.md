# 示例说明

本目录包含 IndexedDB Storage 的使用示例。

## 运行示例

### 方法 1：构建后运行

1. 构建项目：

```bash
npm run build

```

1. 使用任意 HTTP 服务器运行示例，例如：

```bash

# 使用 Python

python3 -m http.server 8000

# 或使用 Node.js

npx serve .

# 或使用 VS Code Live Server 扩展

```

1. 在浏览器中打开：

- 基础示例: [http://localhost:8000/examples/basic.html](http://localhost:8000/examples/basic.html)

- 日志示例: [http://localhost:8000/examples/logger.html](http://localhost:8000/examples/logger.html)

### 方法 2：使用开发服务器

如果你有 Vite 或其他开发服务器，也可以直接运行。

## 示例详情

### basic.html - 基础 CRUD 操作

演示：

- 初始化存储

- 保存数据

- 查询数据

- 清空数据

- 自动清理功能

### logger.html - 日志系统

演示一个完整的日志管理系统：

- 不同级别的日志（Error, Warn, Info, Debug）

- 日志查询和过滤

- 统计信息

- 自动清理旧日志

## 注意事项

- 示例需要在 HTTP 服务器上运行（不能直接用 file:// 协议打开）

- 确保已经运行 `npm run build` 生成 dist 目录

- IndexedDB 数据存储在浏览器中，可以在开发者工具中查看
