/**
 * 实例管理器 - 负责单例模式的实例缓存和管理
 */

// 避免循环依赖，使用泛型接口
interface StorageInstance {
  close(): void
  /** 关闭连接并从单例缓存中移除自身（= close + removeInstance） */
  destroy(): void
}

/**
 * 实例缓存池
 */
const instances = new Map<string, StorageInstance>()

/**
 * 获取已存在的实例
 */
export function getInstance(key: string): StorageInstance | undefined {
  return instances.get(key)
}

/**
 * 注册新实例
 */
export function registerInstance(key: string, instance: StorageInstance): void {
  instances.set(key, instance)
}

/**
 * 移除实例
 */
export function removeInstance(key: string): void {
  instances.delete(key)
}

/**
 * 清除所有实例。
 *
 * 每个 destroy() 调用都包在 try/catch 中：
 * - 确保单个实例清理失败不会跳过后续实例。
 * - 最后的 instances.clear() 无论如何都会执行，map 保证被清空。
 */
export function clearAllInstances(): void {
  instances.forEach(instance => {
    try {
      instance.destroy()
    } catch {
      // best-effort：单个 destroy() 失败不阻止其余实例被清理
    }
  })
  instances.clear()
}
