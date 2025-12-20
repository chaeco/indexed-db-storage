/**
 * 实例管理器 - 负责单例模式的实例缓存和管理
 */

// 避免循环依赖，使用泛型接口
interface StorageInstance {
  close(): void
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
 * 清除所有实例
 */
export function clearAllInstances(): void {
  instances.forEach(instance => instance.close())
  instances.clear()
}

/**
 * 获取所有实例
 */
export function getAllInstances(): StorageInstance[] {
  return Array.from(instances.values())
}
