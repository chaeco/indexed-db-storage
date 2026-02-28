/**
 * 清理管理器 - 负责数据的定期清理和容量管理
 */

import type { CleanupConfig } from '../types/index'
import { openStore } from '../utils/idb'

/**
 * 清理管理器类
 */
export class CleanupManager {
  private db: IDBDatabase
  private storeName: string
  private config: CleanupConfig
  private cleanupTimer?: ReturnType<typeof setInterval>
  // 并发重入锁：save() 的 fire-and-forget 调用在上一轮未完成时直接跳过
  private isCleanupRunning = false

  constructor(db: IDBDatabase, storeName: string, config: CleanupConfig) {
    this.db = db
    this.storeName = storeName
    this.config = config
  }

  /** 启动清理定时器（幂等：重复调用不泄漏句柄） */
  start(): void {
    if (this.cleanupTimer !== undefined) return
    this.cleanupTimer = setInterval(async () => {
      try {
        await this.cleanup()
      } catch (error) {
        console.warn('[IndexedDBStorage] Cleanup timer error:', error)
      }
    }, this.config.cleanupInterval)
  }

  /**
   * 停止清理定时器
   */
  stop(): void {
    if (this.cleanupTimer !== undefined) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = undefined
    }
  }

  /**
   * 执行清理
   */
  async cleanup(): Promise<void> {
    if (this.isCleanupRunning) return
    this.isCleanupRunning = true
    try {
      if (this.config.retentionTime) {
        await this.deleteExpiredData()
      }

      if (this.config.maxRecords) {
        await this.enforceMaxRecords()
      }
    } finally {
      this.isCleanupRunning = false
    }
  }

  /**
   * 删除过期数据
   */
  private async deleteExpiredData(): Promise<void> {
    const timestampIndexName = this.config.timestampIndexName ?? 'timestamp'
    const expiredTime = Date.now() - this.config.retentionTime!

    return new Promise((resolve, reject) => {
      const store = openStore(this.db, this.storeName, 'readwrite', reject)
      const transaction = store.transaction

      if (!store.indexNames.contains(timestampIndexName)) {
        console.warn(
          `[IndexedDBStorage] Cleanup: timestamp index "${timestampIndexName}" not found on store "${this.storeName}". ` +
          'Expired data will not be deleted. Add the index or set timestampIndexName correctly.'
        )
        // 预期行为的 abort：立即释放资源；覆写 onabort 为 resolve 避免误 reject
        transaction.onabort = () => resolve()
        transaction.abort()
        return
      }

      const index = store.index(timestampIndexName)
      // upperBound 闭区间：恰好到期的记录也删除，符合"过期即删"语义
      const range = IDBKeyRange.upperBound(expiredTime)
      const request = index.openCursor(range)

      request.onerror = () => reject(request.error)

      request.onsuccess = () => {
        const cursor = request.result
        if (cursor) {
          cursor.delete()
          cursor.continue()
        } else {
          resolve()
        }
      }
    })
  }

  /**
   * 强制限制最大记录数
   */
  private async enforceMaxRecords(): Promise<void> {
    return new Promise((resolve, reject) => {
      const store = openStore(this.db, this.storeName, 'readwrite', reject)

      const countRequest = store.count()

      countRequest.onerror = () => reject(countRequest.error)

      countRequest.onsuccess = () => {
        const count = countRequest.result
        if (count > this.config.maxRecords!) {
          // 触发条件是严格大于（count > maxRecords），因此 save() 之后 store 会短暂超出上限一条，
          // 下次 cleanup 再删回水位。这是预期行为：避免每次 save 都阻塞等待清理完成。
          // 删到 90% 水位（而非恰好 maxRecords）避免下一次 save 立即再次触发清理；
          // Math.max(1, ...) 防止 maxRecords=1 时 floor(0.9)=0 导致清空全部记录
          const targetCount = Math.max(1, Math.floor(this.config.maxRecords! * 0.9))
          const toDelete = count - targetCount
          // 默认 openCursor() 按主键升序遍历，即优先删除最早插入的记录（FIFO）
          const request = store.openCursor()
          let deleted = 0

          request.onerror = () => reject(request.error)

          request.onsuccess = () => {
            const cursor = request.result
            if (cursor && deleted < toDelete) {
              cursor.delete()
              deleted++
              cursor.continue()
            } else {
              resolve()
            }
          }
        } else {
          resolve()
        }
      }
    })
  }
}
