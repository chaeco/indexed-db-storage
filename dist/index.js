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
async function initDatabase(dbName, storeConfig) {
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
            if (db.objectStoreNames.contains(storeConfig.storeName)) {
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
                if (!upgradedDb.objectStoreNames.contains(storeConfig.storeName)) {
                    createObjectStore(upgradedDb, storeConfig);
                }
            };
            upgradeRequest.onsuccess = () => resolve(upgradeRequest.result);
            upgradeRequest.onerror = () => reject(upgradeRequest.error);
        };
    });
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

async function saveData(db, storeName, data) {
    return new Promise((resolve, reject) => {
        const store = openStore(db, storeName, 'readwrite', reject);
        const request = store.add(data);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
    });
}
async function updateData(db, storeName, data) {
    return new Promise((resolve, reject) => {
        const store = openStore(db, storeName, 'readwrite', reject);
        const request = store.put(data);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
    });
}
async function queryData(db, storeName, options = {}) {
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
async function getData(db, storeName, key) {
    return new Promise((resolve, reject) => {
        const store = openStore(db, storeName, 'readonly', reject);
        const request = store.get(key);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
    });
}
async function deleteData(db, storeName, key) {
    return new Promise((resolve, reject) => {
        const store = openStore(db, storeName, 'readwrite', reject);
        const request = store.delete(key);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
    });
}
async function clearAllData(db, storeName) {
    return new Promise((resolve, reject) => {
        const store = openStore(db, storeName, 'readwrite', reject);
        const request = store.clear();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
    });
}
async function getCount(db, storeName) {
    return new Promise((resolve, reject) => {
        const store = openStore(db, storeName, 'readonly', reject);
        const request = store.count();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
    });
}

class IndexedDBStorage {
    constructor(options, storeConfig) {
        this.db = null;
        this.initPromise = null;
        this._initGeneration = 0;
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
                const storeConfig = this.config.getStoreConfig();
                const db = await initDatabase(this.config.getDbName(), storeConfig);
                if (this._initGeneration !== generation) {
                    db.close();
                    throw new Error('Database initialization was cancelled because close() was called concurrently.');
                }
                this.db = db;
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
        if (this.cleanupManager) {
            this.cleanupManager.cleanup().catch((err) => {
                console.warn('[IndexedDBStorage] Cleanup after save failed:', err);
            });
        }
        return key;
    }
    async update(data) {
        this.ensureInitialized();
        return updateData(this.db, this.config.getStoreName(), data);
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
        return deleteData(this.db, this.config.getStoreName(), key);
    }
    async clear() {
        this.ensureInitialized();
        return clearAllData(this.db, this.config.getStoreName());
    }
    async count() {
        this.ensureInitialized();
        return getCount(this.db, this.config.getStoreName());
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
