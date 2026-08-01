import { openStore } from '../utils/idb';
export async function saveData(db, storeName, data) {
    return new Promise((resolve, reject) => {
        const store = openStore(db, storeName, 'readwrite', reject);
        const request = store.add(data);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
    });
}
export async function updateData(db, storeName, data) {
    return new Promise((resolve, reject) => {
        const store = openStore(db, storeName, 'readwrite', reject);
        const request = store.put(data);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
    });
}
export async function queryData(db, storeName, options = {}) {
    return new Promise((resolve, reject) => {
        const store = openStore(db, storeName, 'readonly', reject);
        const results = [];
        if (options.where || options.filter) {
            const source = options.indexName ? store.index(options.indexName) : store;
            const request = options.range
                ? source.openCursor(options.range, options.direction)
                : source.openCursor(null, options.direction);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                const cursor = request.result;
                if (cursor) {
                    const item = cursor.value;
                    if (matchesWhereConditions(item, options.where)) {
                        if (!options.filter || options.filter(item)) {
                            results.push(item);
                        }
                    }
                    const noSort = !options.sort;
                    const limit = options.limit;
                    const offset = options.offset ?? 0;
                    if (noSort && limit !== undefined && results.length >= offset + limit) {
                        finishQuery(results, options, resolve);
                    }
                    else {
                        cursor.continue();
                    }
                }
                else {
                    finishQuery(results, options, resolve);
                }
            };
        }
        else {
            if (options.direction) {
                console.warn('[IndexedDBStorage] queryData: "direction" option is ignored when no "where" or "filter" is provided, ' +
                    'because getAll() is used instead of a cursor. Use "sort" or add a "where"/"filter" condition to enable cursor traversal.');
            }
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
    let sorted = results;
    if (options.sort) {
        const sorts = Array.isArray(options.sort) ? options.sort : [options.sort];
        sorted = [...results].sort((a, b) => {
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
    const offset = Math.max(0, Math.floor(options.offset ?? 0));
    const limit = options.limit !== undefined
        ? Math.max(0, Math.floor(options.limit))
        : sorted.length;
    const paginatedResults = sorted.slice(offset, offset + limit);
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
        if (key === '')
            return undefined;
        if (current == null || typeof current !== 'object')
            return undefined;
        return Object.prototype.hasOwnProperty.call(current, key)
            ? current[key]
            : undefined;
    }, obj);
}
function rejectIfNaNCompareValue(operator, compareValue) {
    if (typeof compareValue === 'number' && isNaN(compareValue)) {
        console.warn(`[IndexedDBStorage] "${operator}" operator received NaN as compareValue. Condition will evaluate to false.`);
        return true;
    }
    return false;
}
function matchCondition(value, operator, compareValue) {
    switch (operator) {
        case 'eq':
            return value === compareValue;
        case 'ne':
            return value !== compareValue;
        case 'gt':
            if (value == null || compareValue == null)
                return false;
            if (rejectIfNaNCompareValue(operator, compareValue))
                return false;
            return value > compareValue;
        case 'gte':
            if (value == null || compareValue == null)
                return false;
            if (rejectIfNaNCompareValue(operator, compareValue))
                return false;
            return value >= compareValue;
        case 'lt':
            if (value == null || compareValue == null)
                return false;
            if (rejectIfNaNCompareValue(operator, compareValue))
                return false;
            return value < compareValue;
        case 'lte':
            if (value == null || compareValue == null)
                return false;
            if (rejectIfNaNCompareValue(operator, compareValue))
                return false;
            return value <= compareValue;
        case 'between':
            if (value == null)
                return false;
            if (Array.isArray(compareValue) && compareValue.length === 2) {
                if (compareValue[0] == null || compareValue[1] == null)
                    return false;
                if ((typeof compareValue[0] === 'number' && isNaN(compareValue[0])) ||
                    (typeof compareValue[1] === 'number' && isNaN(compareValue[1]))) {
                    console.warn('[IndexedDBStorage] "between" operator received NaN as an endpoint. Condition will evaluate to false.', compareValue);
                    return false;
                }
                if (compareValue[0] > compareValue[1]) {
                    console.warn('[IndexedDBStorage] "between" operator: min > max, the range can never match any value. Got:', compareValue);
                    return false;
                }
                return value >= compareValue[0] && value <= compareValue[1];
            }
            console.warn('[IndexedDBStorage] "between" operator requires an array of exactly 2 elements [min, max], got:', compareValue);
            return false;
        case 'in':
            if (!Array.isArray(compareValue)) {
                console.warn('[IndexedDBStorage] "in" operator requires an array as value, got:', compareValue);
                return false;
            }
            return compareValue.includes(value);
        case 'contains':
            if (value == null || compareValue == null)
                return false;
            if (rejectIfNaNCompareValue(operator, compareValue))
                return false;
            return String(value).includes(String(compareValue));
        case 'startsWith':
            if (value == null || compareValue == null)
                return false;
            if (rejectIfNaNCompareValue(operator, compareValue))
                return false;
            return String(value).startsWith(String(compareValue));
        case 'endsWith':
            if (value == null || compareValue == null)
                return false;
            if (rejectIfNaNCompareValue(operator, compareValue))
                return false;
            return String(value).endsWith(String(compareValue));
        default:
            console.warn(`[IndexedDBStorage] Unknown query operator: "${operator}". Condition will evaluate to false.`);
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
        if (isNaN(a) && isNaN(b))
            return 0;
        if (isNaN(a))
            return 1;
        if (isNaN(b))
            return -1;
        return a - b;
    }
    if (a instanceof Date && b instanceof Date) {
        return a.getTime() - b.getTime();
    }
    return String(a).localeCompare(String(b));
}
export async function getData(db, storeName, key) {
    return new Promise((resolve, reject) => {
        const store = openStore(db, storeName, 'readonly', reject);
        const request = store.get(key);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
    });
}
export async function deleteData(db, storeName, key) {
    return new Promise((resolve, reject) => {
        const store = openStore(db, storeName, 'readwrite', reject);
        const request = store.delete(key);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
    });
}
export async function clearAllData(db, storeName) {
    return new Promise((resolve, reject) => {
        const store = openStore(db, storeName, 'readwrite', reject);
        const request = store.clear();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
    });
}
export async function getCount(db, storeName) {
    return new Promise((resolve, reject) => {
        const store = openStore(db, storeName, 'readonly', reject);
        const request = store.count();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
    });
}
//# sourceMappingURL=data-operations.js.map