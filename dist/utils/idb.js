export function openStore(db, storeName, mode, reject) {
    const transaction = db.transaction([storeName], mode);
    const store = transaction.objectStore(storeName);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error('Transaction aborted'));
    return store;
}
//# sourceMappingURL=idb.js.map