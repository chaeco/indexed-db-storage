/**
 * 清理管理器 - 负责数据的定期清理和容量管理
 */

import type { CleanupConfig } from '../types/index'

/**
 * 清理管理器类
 */
export class CleanupManager {
  private db: IDBDatabase
  private storeName: string
  private config: CleanupConfig
  private cleanupTimer?: ReturnType<typeof setInterval>

  constructor(db: IDBDatabase, storeName: string, config: CleanupConfig) {
    this.db = db
    this.storeName = storeName
    this.config = config
  }

  /**
   * 启动清理定时器
   */
  start(): void {
    if (!this.config.cleanupInterval) return

    this.cleanupTimer = setInterval(async () => {
      try {
        await this.cleanup()
      } catch (error) {
        console.warn('IndexedDB cleanup failed:', error)
      }
    }, this.config.cleanupInterval)
  }

  /**
   * 停止清理定时器
   */
  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = undefined
    }
  }

  /**
   * 执行清理
   */
  async cleanup(): Promise<void> {
    if (this.config.retentionTime) {
      await this.deleteExpiredData()
    }

    if (this.config.maxRecords) {
      await this.enforceMaxRecords()
    }
  }

  /**
   * 删除过期数据
   */
  private async deleteExpiredData(): Promise<void> {
    if (!this.config.retentionTime) return

    const timestampIndexName = this.config.timestampIndexName ?? 'timestamp'
    const now = Date.now()
    const expiredTime = now - this.config.retentionTime

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite')
      const store = transaction.objectStore(this.storeName)

      // 检查索引是否存在
      if (!store.indexNames.contains(timestampIndexName)) {
        resolve()
        return
      }

      const index = store.index(timestampIndexName)
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
    if (!this.config.maxRecords) return

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite')
      const store = transaction.objectStore(this.storeName)
      const countRequest = store.count()

      countRequest.onerror = () => reject(countRequest.error)

      countRequest.onsuccess = () => {
        const count = countRequest.result
        if (count > this.config.maxRecords!) {
          const toDelete = count - Math.floor(this.config.maxRecords! * 0.9)
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
