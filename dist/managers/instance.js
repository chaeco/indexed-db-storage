const instances = new Map();
export function getInstance(key) {
    return instances.get(key);
}
export function registerInstance(key, instance) {
    instances.set(key, instance);
}
export function removeInstance(key) {
    instances.delete(key);
}
export function clearAllInstances() {
    instances.forEach(instance => instance.close());
    instances.clear();
}
export function getAllInstances() {
    return Array.from(instances.values());
}
//# sourceMappingURL=instance.js.map