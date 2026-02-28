/**
 * IDB 底层工具
 */

/**
 * 开启事务并返回 objectStore，同时将 onerror/onabort 绑定到 reject。
 * 被 data-operations.ts 和 cleanup.ts 共同使用。
 */
export function openStore(
  db: IDBDatabase,
  storeName: string,
  mode: IDBTransactionMode,
  reject: (reason?: unknown) => void
): IDBObjectStore {
  const transaction = db.transaction([storeName], mode)
  const store = transaction.objectStore(storeName)
  transaction.onerror = () => reject(transaction.error)
  transaction.onabort = () => reject(transaction.error ?? new Error('Transaction aborted'))
  return store
}
