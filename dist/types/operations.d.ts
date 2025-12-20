export interface QueryOptions {
    limit?: number;
    offset?: number;
    indexName?: string;
    range?: IDBKeyRange;
    direction?: IDBCursorDirection;
}
export interface QueryResult<T> {
    data: T[];
    total?: number;
    hasMore?: boolean;
}
//# sourceMappingURL=operations.d.ts.map