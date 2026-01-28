export type QueryOperator = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'between' | 'in' | 'contains' | 'startsWith' | 'endsWith';
export interface WhereCondition {
    field: string;
    operator: QueryOperator;
    value: unknown;
}
export interface SortOption {
    field: string;
    order: 'asc' | 'desc';
}
export interface QueryOptions {
    limit?: number;
    offset?: number;
    indexName?: string;
    range?: IDBKeyRange;
    direction?: IDBCursorDirection;
    where?: WhereCondition | WhereCondition[];
    sort?: SortOption | SortOption[];
    filter?: <T>(item: T) => boolean;
    includeTotal?: boolean;
}
export interface QueryResult<T> {
    data: T[];
    total?: number;
    hasMore?: boolean;
}
//# sourceMappingURL=operations.d.ts.map