interface StorageInstance {
    close(): void;
    destroy(): void;
}
export declare function getInstance(key: string): StorageInstance | undefined;
export declare function registerInstance(key: string, instance: StorageInstance): void;
export declare function removeInstance(key: string): void;
export declare function clearAllInstances(): void;
export {};
//# sourceMappingURL=instance.d.ts.map