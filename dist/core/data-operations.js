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
        const results = [];
        if (options.where || options.filter) {
            const source = options.indexName ? store.index(options.indexName) : store;
            const request = options.range
                ? source.openCursor(options.range, options.direction)
                : source.openCursor(null, options.direction);
            request.onerror = () => reject(request.error);
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    const item = cursor.value;
                    if (matchesWhereConditions(item, options.where)) {
                        if (!options.filter || options.filter(item)) {
                            results.push(item);
                        }
                    }
                    cursor.continue();
                }
                else {
                    finishQuery(results, options, resolve);
                }
            };
        }
        else {
            const source = options.indexName ? store.index(options.indexName) : store;
            const request = options.range ? source.getAll(options.range) : source.getAll();
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                finishQuery(request.result, options, resolve);
            };
        }
    });
}
function finishQuery(results, options, resolve) {
    if (options.sort) {
        const sorts = Array.isArray(options.sort) ? options.sort : [options.sort];
        results.sort((a, b) => {
            for (const sort of sorts) {
                const aVal = getNestedValue(a, sort.field);
                const bVal = getNestedValue(b, sort.field);
                const comparison = compareValues(aVal, bVal);
                if (comparison !== 0) {
                    return sort.order === 'asc' ? comparison : -comparison;
                }
            }
            return 0;
        });
    }
    const offset = options.offset ?? 0;
    const limit = options.limit ?? results.length;
    const paginatedResults = results.slice(offset, offset + limit);
    resolve(paginatedResults);
}
function matchesWhereConditions(item, where) {
    if (!where)
        return true;
    const conditions = Array.isArray(where) ? where : [where];
    return conditions.every((condition) => {
        const value = getNestedValue(item, condition.field);
        return matchCondition(value, condition.operator, condition.value);
    });
}
function getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => {
        return current && typeof current === 'object' ? current[key] : undefined;
    }, obj);
}
function matchCondition(value, operator, compareValue) {
    switch (operator) {
        case 'eq':
            return value === compareValue;
        case 'ne':
            return value !== compareValue;
        case 'gt':
            return value > compareValue;
        case 'gte':
            return value >= compareValue;
        case 'lt':
            return value < compareValue;
        case 'lte':
            return value <= compareValue;
        case 'between':
            if (Array.isArray(compareValue) && compareValue.length === 2) {
                return value >= compareValue[0] && value <= compareValue[1];
            }
            return false;
        case 'in':
            return Array.isArray(compareValue) && compareValue.includes(value);
        case 'contains':
            return String(value).includes(String(compareValue));
        case 'startsWith':
            return String(value).startsWith(String(compareValue));
        case 'endsWith':
            return String(value).endsWith(String(compareValue));
        default:
            return false;
    }
}
function compareValues(a, b) {
    if (a === b)
        return 0;
    if (a == null)
        return 1;
    if (b == null)
        return -1;
    if (typeof a === 'string' && typeof b === 'string') {
        return a.localeCompare(b);
    }
    if (typeof a === 'number' && typeof b === 'number') {
        return a - b;
    }
    if (a instanceof Date && b instanceof Date) {
        return a.getTime() - b.getTime();
    }
    return String(a).localeCompare(String(b));
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