class ConfigManager {
    constructor(options, storeConfig) {
        if (!options.dbName || !options.dbName.trim()) {
            throw new Error('StorageOptions.dbName must be a non-empty string.');
        }
        if (!options.storeName || !options.storeName.trim()) {
            throw new Error('StorageOptions.storeName must be a non-empty string.');
        }
        if (options.maxRecords !== undefined) {
            if (!Number.isInteger(options.maxRecords) || options.maxRecords <= 0) {
                throw new Error('StorageOptions.maxRecords must be a positive integer.');
            }
        }
        if (options.retentionTime !== undefined) {
            if (!Number.isFinite(options.retentionTime) || options.retentionTime <= 0) {
                throw new Error('StorageOptions.retentionTime must be a finite positive number (milliseconds).');
            }
        }
        if (options.cleanupInterval !== undefined) {
            if (!Number.isFinite(options.cleanupInterval) || options.cleanupInterval <= 0) {
                throw new Error('StorageOptions.cleanupInterval must be a finite positive number (milliseconds).');
            }
        }
        if ((options.retentionTime || options.maxRecords) && !options.cleanupInterval) {
            console.warn('[IndexedDBStorage] retentionTime/maxRecords is set but cleanupInterval is missing. ' +
                'Automatic cleanup will never run. Please set cleanupInterval to enable it, ' +
                'or call cleanup() manually when needed.');
        }
        if (options.cleanupInterval && !options.maxRecords && !options.retentionTime) {
            console.warn('[IndexedDBStorage] cleanupInterval is set but neither maxRecords nor retentionTime is provided. ' +
                'No cleanup will run. Set at least one of maxRecords or retentionTime.');
        }
        if (storeConfig && storeConfig.storeName !== options.storeName) {
            throw new Error(`storeConfig.storeName ("${storeConfig.storeName}") must match options.storeName ("${options.storeName}"). ` +
                'The object store is identified by options.storeName; storeConfig.storeName must be the same.');
        }
        this.storageOptions = options;
        this.storeConfig = storeConfig;
    }
    getDbName() {
        return this.storageOptions.dbName;
    }
    getStoreName() {
        return this.storageOptions.storeName;
    }
    static buildInstanceKey(dbName, storeName) {
        return `${dbName}\x00${storeName}`;
    }
    getInstanceKey() {
        return ConfigManager.buildInstanceKey(this.storageOptions.dbName, this.storageOptions.storeName);
    }
    getStoreConfig() {
        return (this.storeConfig ?? {
            storeName: this.storageOptions.storeName,
            autoIncrement: true,
        });
    }
    getCleanupConfig() {
        const { maxRecords, retentionTime, cleanupInterval, timestampIndexName } = this.storageOptions;
        if (!cleanupInterval || (!maxRecords && !retentionTime)) {
            return null;
        }
        return {
            maxRecords,
            retentionTime,
            cleanupInterval,
            timestampIndexName,
        };
    }
}

function getIndexedDB() {
    const idb = 'indexedDB' in globalThis
        ? globalThis.indexedDB
        : undefined;
    if (!idb) {
        throw new Error('IndexedDB is not supported in this environment.');
    }
    return idb;
}
async function initDatabase(dbName, storeConfig, onClose) {
    return new Promise((resolve, reject) => {
        let idb;
        try {
            idb = getIndexedDB();
        }
        catch (e) {
            reject(e);
            return;
        }
        const probeRequest = idb.open(dbName);
        probeRequest.onerror = () => reject(probeRequest.error);
        probeRequest.onupgradeneeded = () => {
            createObjectStore(probeRequest.result, storeConfig);
        };
        probeRequest.onsuccess = () => {
            const db = probeRequest.result;
            const changes = diffSchemaChanges(db, storeConfig);
            if (!changes) {
                attachVersionchangeHandler(db, dbName, onClose);
                resolve(db);
                return;
            }
            const nextVersion = db.version + 1;
            db.close();
            const upgradeRequest = idb.open(dbName, nextVersion);
            upgradeRequest.onblocked = () => {
                reject(new Error(`Database "${dbName}" upgrade to v${nextVersion} is blocked. ` +
                    'Close all other tabs or connections to this database and retry.'));
            };
            upgradeRequest.onupgradeneeded = () => {
                const upgradedDb = upgradeRequest.result;
                if (changes.createStore) {
                    if (!upgradedDb.objectStoreNames.contains(storeConfig.storeName)) {
                        createObjectStore(upgradedDb, storeConfig);
                    }
                    return;
                }
                if (upgradeRequest.transaction) {
                    applyIndexChanges(upgradeRequest.transaction, storeConfig.storeName, changes.indexChanges);
                }
            };
            upgradeRequest.onsuccess = () => {
                const db = upgradeRequest.result;
                attachVersionchangeHandler(db, dbName, onClose);
                resolve(db);
            };
            upgradeRequest.onerror = () => reject(upgradeRequest.error);
        };
    });
}
function diffSchemaChanges(db, config) {
    if (!db.objectStoreNames.contains(config.storeName)) {
        return { createStore: true, indexChanges: [] };
    }
    const tx = db.transaction(config.storeName, 'readonly');
    const store = tx.objectStore(config.storeName);
    const indexChanges = [];
    for (const index of config.indexes ?? []) {
        if (!store.indexNames.contains(index.name)) {
            indexChanges.push({ index, rebuild: false });
            continue;
        }
        const existing = store.index(index.name);
        const rebuild = JSON.stringify(existing.keyPath) !== JSON.stringify(index.keyPath) ||
            existing.unique !== !!index.options?.unique ||
            existing.multiEntry !== !!index.options?.multiEntry;
        if (rebuild) {
            indexChanges.push({ index, rebuild: true });
        }
    }
    return indexChanges.length > 0 ? { createStore: false, indexChanges } : null;
}
function applyIndexChanges(tx, storeName, changes) {
    const store = tx.objectStore(storeName);
    for (const { index, rebuild } of changes) {
        if (rebuild) {
            store.deleteIndex(index.name);
            console.warn(`[IndexedDBStorage] Index "${index.name}" on store "${storeName}" definition changed, rebuilding.`);
        }
        store.createIndex(index.name, index.keyPath, index.options);
    }
}
function attachVersionchangeHandler(db, dbName, onClose) {
    db.onversionchange = event => {
        db.close();
        onClose?.();
        console.warn(`[IndexedDBStorage] Database "${dbName}" received versionchange (v${event.oldVersion} -> v${event.newVersion}). ` +
            'This connection was closed automatically. Call init() again to reconnect if still needed.');
    };
}
function createObjectStore(db, config) {
    const store = db.createObjectStore(config.storeName, {
        keyPath: config.keyPath,
        autoIncrement: config.autoIncrement ?? true,
    });
    if (config.indexes) {
        config.indexes.forEach(index => {
            store.createIndex(index.name, index.keyPath, index.options);
        });
    }
}

function openStore(db, storeName, mode, reject) {
    const transaction = db.transaction([storeName], mode);
    const store = transaction.objectStore(storeName);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error('Transaction aborted'));
    return store;
}
function resolveStore(db, storeName, mode, reject, tx) {
    if (tx)
        return tx.objectStore(storeName);
    return openStore(db, storeName, mode, reject);
}

class CleanupManager {
    constructor(db, storeName, config) {
        this.isCleanupRunning = false;
        this.db = db;
        this.storeName = storeName;
        this.config = config;
    }
    start() {
        if (this.cleanupTimer !== undefined)
            return;
        this.cleanupTimer = setInterval(async () => {
            try {
                await this.cleanup();
            }
            catch (error) {
                console.warn('[IndexedDBStorage] Cleanup timer error:', error);
            }
        }, this.config.cleanupInterval);
    }
    stop() {
        if (this.cleanupTimer !== undefined) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = undefined;
        }
    }
    async cleanup() {
        if (this.isCleanupRunning)
            return;
        this.isCleanupRunning = true;
        try {
            if (this.config.retentionTime) {
                await this.deleteExpiredData();
            }
            if (this.config.maxRecords) {
                await this.enforceMaxRecords();
            }
        }
        finally {
            this.isCleanupRunning = false;
        }
    }
    async deleteExpiredData() {
        const timestampIndexName = this.config.timestampIndexName ?? 'timestamp';
        const expiredTime = Date.now() - this.config.retentionTime;
        return new Promise((resolve, reject) => {
            const store = openStore(this.db, this.storeName, 'readwrite', reject);
            const transaction = store.transaction;
            if (!store.indexNames.contains(timestampIndexName)) {
                console.warn(`[IndexedDBStorage] Cleanup: timestamp index "${timestampIndexName}" not found on store "${this.storeName}". ` +
                    'Expired data will not be deleted. Add the index or set timestampIndexName correctly.');
                transaction.onabort = () => resolve();
                transaction.abort();
                return;
            }
            const index = store.index(timestampIndexName);
            const range = IDBKeyRange.upperBound(expiredTime);
            const request = index.openCursor(range);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                const cursor = request.result;
                if (cursor) {
                    cursor.delete();
                    cursor.continue();
                }
                else {
                    resolve();
                }
            };
        });
    }
    async enforceMaxRecords() {
        return new Promise((resolve, reject) => {
            const store = openStore(this.db, this.storeName, 'readwrite', reject);
            const countRequest = store.count();
            countRequest.onerror = () => reject(countRequest.error);
            countRequest.onsuccess = () => {
                const count = countRequest.result;
                if (count > this.config.maxRecords) {
                    const targetCount = Math.max(1, Math.floor(this.config.maxRecords * 0.9));
                    const toDelete = count - targetCount;
                    const request = store.openCursor();
                    let deleted = 0;
                    request.onerror = () => reject(request.error);
                    request.onsuccess = () => {
                        const cursor = request.result;
                        if (cursor && deleted < toDelete) {
                            cursor.delete();
                            deleted++;
                            cursor.continue();
                        }
                        else {
                            resolve();
                        }
                    };
                }
                else {
                    resolve();
                }
            };
        });
    }
}

const instances = new Map();
function getInstance(key) {
    return instances.get(key);
}
function registerInstance(key, instance) {
    instances.set(key, instance);
}
function removeInstance(key) {
    instances.delete(key);
}
function clearAllInstances() {
    instances.forEach(instance => {
        try {
            instance.destroy();
        }
        catch {
        }
    });
    instances.clear();
}

function reqToPromise(request) {
    return new Promise((resolve, reject) => {
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
    });
}
function saveData(db, storeName, data, tx) {
    return new Promise((resolve, reject) => {
        const store = resolveStore(db, storeName, 'readwrite', reject, tx);
        resolve(reqToPromise(store.add(data)));
    });
}
function updateData(db, storeName, data, tx) {
    return new Promise((resolve, reject) => {
        const store = resolveStore(db, storeName, 'readwrite', reject, tx);
        resolve(reqToPromise(store.put(data)));
    });
}
function bulkAddData(db, storeName, items, tx) {
    if (items.length === 0)
        return Promise.resolve([]);
    if (tx) {
        const store = tx.objectStore(storeName);
        const keys = new Array(items.length);
        return Promise.all(items.map((item, i) => new Promise((res, rej) => {
            const request = store.add(item);
            request.onsuccess = () => {
                keys[i] = request.result;
                res();
            };
            request.onerror = () => rej(request.error);
        }))).then(() => keys);
    }
    return new Promise((resolve, reject) => {
        const store = openStore(db, storeName, 'readwrite', reject);
        const keys = new Array(items.length);
        items.forEach((item, i) => {
            const request = store.add(item);
            request.onsuccess = () => {
                keys[i] = request.result;
            };
        });
        store.transaction.oncomplete = () => resolve(keys);
    });
}
function bulkPutData(db, storeName, items, tx) {
    if (items.length === 0)
        return Promise.resolve([]);
    if (tx) {
        const store = tx.objectStore(storeName);
        const keys = new Array(items.length);
        return Promise.all(items.map((item, i) => new Promise((res, rej) => {
            const request = store.put(item);
            request.onsuccess = () => {
                keys[i] = request.result;
                res();
            };
            request.onerror = () => rej(request.error);
        }))).then(() => keys);
    }
    return new Promise((resolve, reject) => {
        const store = openStore(db, storeName, 'readwrite', reject);
        const keys = new Array(items.length);
        items.forEach((item, i) => {
            const request = store.put(item);
            request.onsuccess = () => {
                keys[i] = request.result;
            };
        });
        store.transaction.oncomplete = () => resolve(keys);
    });
}
function bulkDeleteData(db, storeName, keys, tx) {
    if (keys.length === 0)
        return Promise.resolve(0);
    if (tx) {
        return (async () => {
            const store = tx.objectStore(storeName);
            const before = await reqToPromise(store.count());
            await Promise.all(keys.map(key => reqToPromise(store.delete(key))));
            const after = await reqToPromise(store.count());
            return before - after;
        })();
    }
    return new Promise((resolve, reject) => {
        const store = openStore(db, storeName, 'readwrite', reject);
        const countBefore = store.count();
        keys.forEach(key => {
            store.delete(key);
        });
        const countAfter = store.count();
        store.transaction.oncomplete = () => {
            resolve(countBefore.result - countAfter.result);
        };
    });
}
function synthesizeKeysetRange(options) {
    const { range, after, before } = options;
    if ((after !== undefined || before !== undefined) && range) {
        throw new Error('[IndexedDBStorage] "after"/"before" cannot be combined with "range". Use one or the other.');
    }
    if (after === undefined && before === undefined)
        return range ?? null;
    if (after !== undefined && !isValidIDBKey(after)) {
        throw new Error('[IndexedDBStorage] "after" must be a valid IndexedDB key (number/string/Date/array).');
    }
    if (before !== undefined && !isValidIDBKey(before)) {
        throw new Error('[IndexedDBStorage] "before" must be a valid IndexedDB key (number/string/Date/array).');
    }
    if (after !== undefined && before !== undefined) {
        return IDBKeyRange.bound(after, before, true, true);
    }
    if (after !== undefined)
        return IDBKeyRange.lowerBound(after, true);
    return IDBKeyRange.upperBound(before, true);
}
function hasKeyset(options) {
    return options.after !== undefined || options.before !== undefined;
}
function resolveCursorSource(store, options, compiled, allowIndexPushdown = true) {
    let source = options.indexName ? store.index(options.indexName) : store;
    const range = synthesizeKeysetRange(options);
    if (allowIndexPushdown && compiled.rangeCondition && range === null && !options.indexName) {
        const field = compiled.rangeCondition.field;
        const viaKeyPath = store.keyPath === field;
        const usable = viaKeyPath || store.indexNames.contains(field);
        if (usable) {
            const compiledRange = compileRangeCondition(compiled.rangeCondition);
            if (compiledRange) {
                source = viaKeyPath ? store : store.index(field);
                compiled.conditions.splice(compiled.rangeIndex, 1);
                return { source, range: compiledRange };
            }
        }
    }
    return { source, range };
}
async function queryData(db, storeName, options = {}, tx) {
    return new Promise((resolve, reject) => {
        const store = resolveStore(db, storeName, 'readonly', reject, tx);
        const results = [];
        const compiled = compileWhere(options.where);
        if (options.where || options.filter || (options.direction && hasKeyset(options))) {
            const { source, range } = resolveCursorSource(store, options, compiled);
            const request = range !== null
                ? source.openCursor(range, options.direction)
                : source.openCursor(null, options.direction);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                const cursor = request.result;
                if (cursor) {
                    const item = cursor.value;
                    if (matchesCompiled(item, compiled.conditions)) {
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
            if (options.sort && !options.direction && tryIndexSortQuery(store, options, resolve, reject)) {
                return;
            }
            if (options.direction) {
                console.warn('[IndexedDBStorage] queryData: "direction" option is ignored when no "where" or "filter" is provided, ' +
                    'because getAll() is used instead of a cursor. Use "sort" or add a "where"/"filter" condition to enable cursor traversal.');
            }
            const source = options.indexName ? store.index(options.indexName) : store;
            const effectiveRange = synthesizeKeysetRange(options);
            const offset = Math.max(0, Math.floor(options.offset ?? 0));
            const fetchCount = options.limit !== undefined
                ? offset + Math.max(0, Math.floor(options.limit))
                : undefined;
            let request;
            if (effectiveRange !== null && fetchCount !== undefined) {
                request = source.getAll(effectiveRange, fetchCount);
            }
            else if (effectiveRange !== null) {
                request = source.getAll(effectiveRange);
            }
            else if (fetchCount !== undefined) {
                request = source.getAll(null, fetchCount);
            }
            else {
                request = source.getAll();
            }
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                finishQuery(request.result, options, resolve);
            };
        }
    });
}
function tryIndexSortQuery(store, options, resolve, reject) {
    if (options.where || options.filter || options.range || hasKeyset(options))
        return false;
    const sort = options.sort;
    if (!sort || Array.isArray(sort))
        return false;
    const field = sort.field;
    const usable = store.indexNames.contains(field) || field === store.keyPath;
    if (!usable)
        return false;
    const source = field === store.keyPath ? store : store.index(field);
    const direction = sort.order === 'desc' ? 'prev' : 'next';
    const offset = Math.max(0, Math.floor(options.offset ?? 0));
    const limit = options.limit !== undefined ? Math.max(0, Math.floor(options.limit)) : Infinity;
    const results = [];
    const request = source.openCursor(null, direction);
    request.onerror = () => reject(request.error);
    let started = false;
    request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
            resolve(results);
            return;
        }
        if (!started && offset > 0) {
            started = true;
            cursor.advance(offset);
            return;
        }
        started = true;
        if (results.length >= limit) {
            resolve(results);
            return;
        }
        results.push(cursor.value);
        if (results.length >= limit) {
            resolve(results);
        }
        else {
            cursor.continue();
        }
    };
    return true;
}
const RANGE_OPERATORS = new Set(['eq', 'gt', 'gte', 'lt', 'lte', 'between']);
function compileWhere(where) {
    if (!where)
        return { conditions: [], rangeCondition: null, rangeIndex: -1 };
    const raw = Array.isArray(where) ? where : [where];
    const conditions = raw.map(c => ({
        path: c.field.split('.'),
        operator: c.operator,
        value: c.value,
    }));
    const rangeIndex = conditions.findIndex(c => RANGE_OPERATORS.has(c.operator));
    let rangeCondition = null;
    if (rangeIndex !== -1) {
        const candidate = conditions[rangeIndex];
        if (candidate.path.length === 1 && candidate.path[0] !== '') {
            rangeCondition = { ...candidate, field: candidate.path[0] };
        }
    }
    return { conditions, rangeCondition, rangeIndex };
}
function isValidIDBKey(value) {
    if (value == null)
        return false;
    if (typeof value === 'number')
        return !isNaN(value);
    if (typeof value === 'string')
        return true;
    if (value instanceof Date)
        return !isNaN(value.getTime());
    if (Array.isArray(value))
        return value.every(isValidIDBKey);
    return false;
}
function compileRangeCondition(c) {
    switch (c.operator) {
        case 'eq':
            return isValidIDBKey(c.value) ? IDBKeyRange.only(c.value) : null;
        case 'gt':
        case 'gte':
        case 'lt':
        case 'lte':
            return isValidIDBKey(c.value)
                ? compileSimpleBound(c.operator, c.value)
                : null;
        case 'between': {
            if (!Array.isArray(c.value) || c.value.length !== 2)
                return null;
            const [min, max] = c.value;
            if (!isValidIDBKey(min) || !isValidIDBKey(max))
                return null;
            if (typeof min !== typeof max)
                return null;
            return IDBKeyRange.bound(min, max);
        }
        default:
            return null;
    }
}
function compileSimpleBound(op, value) {
    switch (op) {
        case 'gt':
            return IDBKeyRange.lowerBound(value, true);
        case 'gte':
            return IDBKeyRange.lowerBound(value);
        case 'lt':
            return IDBKeyRange.upperBound(value, true);
        default:
            return IDBKeyRange.upperBound(value);
    }
}
function matchesCompiled(item, conditions) {
    return conditions.every(condition => {
        const value = getNestedValueByPath(item, condition.path);
        return matchCondition(value, condition.operator, condition.value);
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
    const limit = options.limit !== undefined ? Math.max(0, Math.floor(options.limit)) : sorted.length;
    const paginatedResults = sorted.slice(offset, offset + limit);
    resolve(paginatedResults);
}
function getNestedValue(obj, path) {
    return getNestedValueByPath(obj, path.split('.'));
}
function getNestedValueByPath(obj, path) {
    let current = obj;
    for (const key of path) {
        if (key === '')
            return undefined;
        if (current == null || typeof current !== 'object')
            return undefined;
        current = Object.prototype.hasOwnProperty.call(current, key)
            ? current[key]
            : undefined;
    }
    return current;
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
function getData(db, storeName, key, tx) {
    return new Promise((resolve, reject) => {
        const store = resolveStore(db, storeName, 'readonly', reject, tx);
        resolve(reqToPromise(store.get(key)));
    });
}
function getManyData(db, storeName, keys, tx) {
    if (keys.length === 0)
        return Promise.resolve([]);
    return new Promise((resolve, reject) => {
        const store = resolveStore(db, storeName, 'readonly', reject, tx);
        Promise.all(keys.map(key => reqToPromise(store.get(key)))).then(resolve, reject);
    });
}
function deleteData(db, storeName, key, tx) {
    return new Promise((resolve, reject) => {
        const store = resolveStore(db, storeName, 'readwrite', reject, tx);
        resolve(reqToPromise(store.delete(key)).then(() => undefined));
    });
}
function clearAllData(db, storeName, tx) {
    return new Promise((resolve, reject) => {
        const store = resolveStore(db, storeName, 'readwrite', reject, tx);
        resolve(reqToPromise(store.clear()).then(() => undefined));
    });
}
function getCount(db, storeName, tx) {
    return new Promise((resolve, reject) => {
        const store = resolveStore(db, storeName, 'readonly', reject, tx);
        resolve(reqToPromise(store.count()));
    });
}
function iterateData(db, storeName, options, onItem, tx) {
    const opts = options ?? {};
    if (opts.sort) {
        throw new Error('[IndexedDBStorage] iterate() does not support "sort" — results stream in cursor order. Use query() instead.');
    }
    return new Promise((resolve, reject) => {
        const store = resolveStore(db, storeName, 'readonly', reject, tx);
        const compiled = compileWhere(opts.where);
        const { source, range } = resolveCursorSource(store, opts, compiled);
        const offset = Math.max(0, Math.floor(opts.offset ?? 0));
        const limit = opts.limit !== undefined ? Math.max(0, Math.floor(opts.limit)) : undefined;
        const request = range !== null
            ? source.openCursor(range, opts.direction)
            : source.openCursor(null, opts.direction);
        request.onerror = () => reject(request.error);
        let seen = 0;
        let delivered = 0;
        request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor) {
                resolve(delivered);
                return;
            }
            const item = cursor.value;
            if (matchesCompiled(item, compiled.conditions) && (!opts.filter || opts.filter(item))) {
                seen++;
                if (seen > offset) {
                    const proceed = onItem(item, cursor.primaryKey);
                    delivered++;
                    if (proceed === false) {
                        resolve(delivered);
                        return;
                    }
                    if (limit !== undefined && delivered >= limit) {
                        resolve(delivered);
                        return;
                    }
                }
            }
            cursor.continue();
        };
    });
}
function deleteManyData(db, storeName, options = {}, tx) {
    return new Promise((resolve, reject) => {
        const store = resolveStore(db, storeName, 'readwrite', reject, tx);
        const compiled = compileWhere(options.where);
        const { source, range } = resolveCursorSource(store, options, compiled);
        const offset = Math.max(0, Math.floor(options.offset ?? 0));
        const limit = options.limit !== undefined ? Math.max(0, Math.floor(options.limit)) : undefined;
        const noSort = !options.sort;
        const entries = [];
        const request = range !== null
            ? source.openCursor(range, options.direction)
            : source.openCursor(null, options.direction);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const cursor = request.result;
            if (cursor) {
                const item = cursor.value;
                if (matchesCompiled(item, compiled.conditions) && (!options.filter || options.filter(item))) {
                    entries.push({ key: cursor.primaryKey, value: item });
                    if (noSort && limit !== undefined && entries.length >= offset + limit) {
                        finishDelete();
                        return;
                    }
                }
                cursor.continue();
            }
            else {
                finishDelete();
            }
        };
        const finishDelete = () => {
            let selected = entries;
            if (options.sort) {
                const sorts = (Array.isArray(options.sort) ? options.sort : [options.sort]).map(s => ({
                    path: s.field.split('.'),
                    order: s.order,
                }));
                selected = [...entries].sort((a, b) => {
                    for (const s of sorts) {
                        const cmp = compareValues(getNestedValueByPath(a.value, s.path), getNestedValueByPath(b.value, s.path));
                        if (cmp !== 0)
                            return s.order === 'asc' ? cmp : -cmp;
                    }
                    return 0;
                });
            }
            if (limit !== undefined || offset > 0) {
                const end = limit !== undefined ? offset + limit : undefined;
                selected = selected.slice(offset, end);
            }
            if (selected.length === 0) {
                resolve(0);
                return;
            }
            Promise.all(selected.map(e => reqToPromise(store.delete(e.key)))).then(() => resolve(selected.length), err => reject(err));
        };
    });
}
function queryKeysData(db, storeName, options = {}, tx) {
    if (options.sort) {
        throw new Error('[IndexedDBStorage] queryKeys() does not support "sort" — sorting requires record values. Use query() instead.');
    }
    return new Promise((resolve, reject) => {
        const store = resolveStore(db, storeName, 'readonly', reject, tx);
        const compiled = compileWhere(options.where);
        const { source, range } = resolveCursorSource(store, options, compiled, false);
        const offset = Math.max(0, Math.floor(options.offset ?? 0));
        const limit = options.limit !== undefined ? Math.max(0, Math.floor(options.limit)) : undefined;
        if (!options.filter && compiled.conditions.length === 0) {
            const count = limit !== undefined ? offset + limit : undefined;
            const request = range !== null
                ? source.getAllKeys(range, count)
                : source.getAllKeys(undefined, count);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                const all = request.result;
                resolve(all.slice(offset));
            };
            return;
        }
        const keys = [];
        let seen = 0;
        const request = range !== null
            ? source.openCursor(range, options.direction)
            : source.openCursor(null, options.direction);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor) {
                resolve(keys);
                return;
            }
            if (matchesCompiled(cursor.value, compiled.conditions) &&
                (!options.filter || options.filter(cursor.value))) {
                seen++;
                if (seen > offset) {
                    keys.push(cursor.primaryKey);
                    if (limit !== undefined && keys.length >= limit) {
                        resolve(keys);
                        return;
                    }
                }
            }
            cursor.continue();
        };
    });
}

class IndexedDBStorage {
    constructor(options, storeConfig) {
        this.db = null;
        this.initPromise = null;
        this._initGeneration = 0;
        this._writeListeners = new Set();
        this.config = new ConfigManager(options, storeConfig);
        const instanceKey = this.config.getInstanceKey();
        const existing = getInstance(instanceKey);
        if (existing) {
            if (storeConfig) {
                console.warn(`[IndexedDBStorage] An instance for dbName="${options.dbName}" storeName="${options.storeName}" already exists. ` +
                    'The new storeConfig will be ignored. Call destroy() first if you need to reconfigure.');
            }
            return existing;
        }
        registerInstance(instanceKey, this);
    }
    static clearInstance(options) {
        if (options) {
            const key = ConfigManager.buildInstanceKey(options.dbName, options.storeName);
            const instance = getInstance(key);
            if (instance) {
                instance.destroy();
            }
        }
        else {
            clearAllInstances();
        }
    }
    async init() {
        if (this.db)
            return;
        if (this.initPromise)
            return this.initPromise;
        const generation = this._initGeneration;
        this.initPromise = (async () => {
            try {
                const db = await initDatabase(this.config.getDbName(), this.config.getStoreConfig(), () => {
                    if (this.db === db)
                        this.db = null;
                });
                if (this._initGeneration !== generation) {
                    db.close();
                    throw new Error('Database initialization was cancelled because close() was called concurrently.');
                }
                this.db = db;
                if (typeof BroadcastChannel !== 'undefined' && !this._writeChannel) {
                    this._writeChannel = new BroadcastChannel(`indexed-db-storage:${this.config.getDbName()}`);
                    this._writeChannel.onmessage = (event) => {
                        const data = event.data;
                        if (data && data.storeName === this.config.getStoreName()) {
                            this.dispatchWrite({ ...data, source: 'remote' });
                        }
                    };
                }
                const cleanupConfig = this.config.getCleanupConfig();
                if (cleanupConfig) {
                    this.cleanupManager = new CleanupManager(this.db, this.config.getStoreName(), cleanupConfig);
                    this.cleanupManager.start();
                }
            }
            finally {
                this.initPromise = null;
            }
        })();
        return this.initPromise;
    }
    async save(data) {
        this.ensureInitialized();
        const key = await saveData(this.db, this.config.getStoreName(), data);
        this.emitWrite('add', [key]);
        this.maybeTriggerCleanup();
        return key;
    }
    async bulkAdd(items) {
        this.ensureInitialized();
        const keys = await bulkAddData(this.db, this.config.getStoreName(), items);
        this.emitWrite('bulkAdd', keys);
        this.maybeTriggerCleanup();
        return keys;
    }
    async bulkPut(items) {
        this.ensureInitialized();
        const keys = await bulkPutData(this.db, this.config.getStoreName(), items);
        this.emitWrite('bulkPut', keys);
        this.maybeTriggerCleanup();
        return keys;
    }
    async bulkDelete(keys) {
        this.ensureInitialized();
        const deleted = await bulkDeleteData(this.db, this.config.getStoreName(), keys);
        this.emitWrite('bulkDelete', keys);
        return deleted;
    }
    async update(data) {
        this.ensureInitialized();
        const key = await updateData(this.db, this.config.getStoreName(), data);
        this.emitWrite('put', [key]);
        return key;
    }
    async query(options) {
        this.ensureInitialized();
        return queryData(this.db, this.config.getStoreName(), options);
    }
    async get(key) {
        this.ensureInitialized();
        return getData(this.db, this.config.getStoreName(), key);
    }
    async delete(key) {
        this.ensureInitialized();
        await deleteData(this.db, this.config.getStoreName(), key);
        this.emitWrite('delete', [key]);
    }
    async clear() {
        this.ensureInitialized();
        await clearAllData(this.db, this.config.getStoreName());
        this.emitWrite('clear');
    }
    async count() {
        this.ensureInitialized();
        return getCount(this.db, this.config.getStoreName());
    }
    async getMany(keys) {
        this.ensureInitialized();
        return getManyData(this.db, this.config.getStoreName(), keys);
    }
    async iterate(onItem, options) {
        this.ensureInitialized();
        return iterateData(this.db, this.config.getStoreName(), options, onItem);
    }
    async deleteMany(options) {
        this.ensureInitialized();
        return deleteManyData(this.db, this.config.getStoreName(), options);
    }
    async queryKeys(options) {
        this.ensureInitialized();
        return queryKeysData(this.db, this.config.getStoreName(), options);
    }
    onWrite(listener) {
        this._writeListeners.add(listener);
        return () => {
            this._writeListeners.delete(listener);
        };
    }
    dispatchWrite(event) {
        this._writeListeners.forEach(listener => {
            try {
                listener(event);
            }
            catch (err) {
                console.warn('[IndexedDBStorage] onWrite listener error:', err);
            }
        });
    }
    emitWrite(type, keys) {
        const event = {
            storeName: this.config.getStoreName(),
            type,
            keys,
            source: 'local',
        };
        this.dispatchWrite(event);
        if (this._writeChannel) {
            try {
                this._writeChannel.postMessage({
                    storeName: event.storeName,
                    type: event.type,
                    keys: event.keys,
                });
            }
            catch {
            }
        }
    }
    async runInTransaction(mode, scope) {
        this.ensureInitialized();
        const tx = this.db.transaction([this.config.getStoreName()], mode);
        const scopeObj = this.createTransactionScope(tx);
        const pendingWrites = [];
        const trackWrite = (type) => {
            return keys => {
                pendingWrites.push({ type, keys });
            };
        };
        const scopedTx = {
            get: scopeObj.get,
            getMany: scopeObj.getMany,
            count: scopeObj.count,
            query: scopeObj.query,
            save: data => scopeObj.save(data).then(key => (trackWrite('add')([key]), key)),
            update: data => scopeObj.update(data).then(key => (trackWrite('put')([key]), key)),
            bulkAdd: items => scopeObj.bulkAdd(items).then(keys => (trackWrite('bulkAdd')(keys), keys)),
            bulkPut: items => scopeObj.bulkPut(items).then(keys => (trackWrite('bulkPut')(keys), keys)),
            delete: key => scopeObj.delete(key).then(() => trackWrite('delete')([key])),
            bulkDelete: keys => scopeObj.bulkDelete(keys).then(n => (trackWrite('bulkDelete')(keys), n)),
        };
        let outcome = null;
        const settled = new Promise(resolve => {
            tx.oncomplete = () => resolve('complete');
            tx.onabort = () => resolve('abort');
            tx.onerror = () => resolve('abort');
        });
        try {
            const value = await scope(scopedTx);
            outcome = { ok: true, value };
        }
        catch (err) {
            outcome = { ok: false, error: err };
            try {
                tx.abort();
            }
            catch {
            }
        }
        const settledState = await settled;
        if (outcome && !outcome.ok) {
            throw outcome.error;
        }
        if (settledState === 'abort') {
            throw tx.error ?? new Error('Transaction aborted');
        }
        for (const write of pendingWrites) {
            this.emitWrite(write.type, write.keys);
        }
        return outcome.value;
    }
    createTransactionScope(tx) {
        const db = this.db;
        const storeName = this.config.getStoreName();
        return {
            get: key => getData(db, storeName, key, tx),
            getMany: keys => getManyData(db, storeName, keys, tx),
            save: data => saveData(db, storeName, data, tx),
            update: data => updateData(db, storeName, data, tx),
            bulkAdd: items => bulkAddData(db, storeName, items, tx),
            bulkPut: items => bulkPutData(db, storeName, items, tx),
            delete: key => deleteData(db, storeName, key, tx),
            bulkDelete: keys => bulkDeleteData(db, storeName, keys, tx),
            count: () => getCount(db, storeName, tx),
            query: options => queryData(db, storeName, options, tx),
        };
    }
    static async requestPersistence() {
        const storage = globalThis.navigator?.storage;
        if (!storage?.persist)
            return null;
        return storage.persist();
    }
    static async isPersistent() {
        const storage = globalThis.navigator?.storage;
        if (!storage?.persisted)
            return null;
        return storage.persisted();
    }
    static async estimate() {
        const storage = globalThis.navigator?.storage;
        if (!storage?.estimate)
            return null;
        return storage.estimate();
    }
    maybeTriggerCleanup() {
        if (!this.cleanupManager)
            return;
        this.cleanupManager.cleanup().catch((err) => {
            console.warn('[IndexedDBStorage] Cleanup after save failed:', err);
        });
    }
    async cleanup() {
        if (this.cleanupManager) {
            await this.cleanupManager.cleanup();
        }
    }
    stopCleanupTimer() {
        if (this.cleanupManager) {
            this.cleanupManager.stop();
        }
    }
    close() {
        this._initGeneration++;
        this.stopCleanupTimer();
        this.cleanupManager = undefined;
        this.initPromise = null;
        if (this._writeChannel) {
            this._writeChannel.close();
            this._writeChannel = undefined;
        }
        this._writeListeners.clear();
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }
    destroy() {
        this.close();
        removeInstance(this.config.getInstanceKey());
    }
    ensureInitialized() {
        if (!this.db) {
            throw new Error('Database not initialized. Call init() first.');
        }
    }
}

export { IndexedDBStorage };
//# sourceMappingURL=index.js.map
