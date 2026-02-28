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
    instances.forEach(instance => {
        try {
            instance.destroy();
        }
        catch {
        }
    });
    instances.clear();
}
//# sourceMappingURL=instance.js.map