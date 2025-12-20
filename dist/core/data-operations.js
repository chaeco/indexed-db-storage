export async function saveData(db, storeName, data) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.add(data);
        request.onerror = () => {
            reject(request.error);
        };
        request.onsuccess = () => {
            resolve(request.result);
        };
        transaction.onerror = () => {
            reject(transaction.error);
        };
    });
}
export async function updateData(db, storeName, data) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.put(data);
        request.onerror = () => {
            reject(request.error);
        };
        request.onsuccess = () => {
            resolve(request.result);
        };
        transaction.onerror = () => {
            reject(transaction.error);
        };
    });
}
export async function queryData(db, storeName, options = {}) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const source = options.indexName ? store.index(options.indexName) : store;
        const request = options.range ? source.getAll(options.range) : source.getAll();
        request.onerror = () => {
            reject(request.error);
        };
        request.onsuccess = () => {
            let results = request.result;
            const offset = options.offset ?? 0;
            const limit = options.limit ?? results.length;
            results = results.slice(offset, offset + limit);
            resolve(results);
        };
    });
}
export async function getData(db, storeName, key) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.get(key);
        request.onerror = () => {
            reject(request.error);
        };
        request.onsuccess = () => {
            resolve(request.result);
        };
    });
}
export async function deleteData(db, storeName, key) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.delete(key);
        request.onerror = () => {
            reject(request.error);
        };
        request.onsuccess = () => {
            resolve();
        };
    });
}
export async function clearAllData(db, storeName) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.clear();
        request.onerror = () => {
            reject(request.error);
        };
        request.onsuccess = () => {
            resolve();
        };
    });
}
export async function getCount(db, storeName) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.count();
        request.onerror = () => {
            reject(request.error);
        };
        request.onsuccess = () => {
            resolve(request.result);
        };
    });
}
//# sourceMappingURL=data-operations.js.map