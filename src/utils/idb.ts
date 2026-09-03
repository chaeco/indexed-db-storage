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

/**
 * 获取 objectStore：提供了外部事务（runInTransaction 场景）时复用该事务，
 * 否则开启独立事务。外部事务的 onerror/onabort 由事务发起方（runInTransaction）绑定。
 */
export function resolveStore(
  db: IDBDatabase,
  storeName: string,
  mode: IDBTransactionMode,
  reject: (reason?: unknown) => void,
  tx?: IDBTransaction
): IDBObjectStore {
  if (tx) return tx.objectStore(storeName)
  return openStore(db, storeName, mode, reject)
}
