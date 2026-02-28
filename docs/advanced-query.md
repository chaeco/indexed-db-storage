# Advanced Query Quick Reference

English | [简体中文](./advanced-query.zh-CN.md)

This document provides a quick reference for the advanced query operators and usage patterns available in `@chaeco/indexed-db-storage`.

## Query Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `eq` | Equal to | `{ field: 'age', operator: 'eq', value: 25 }` |
| `ne` | Not equal to | `{ field: 'status', operator: 'ne', value: 'deleted' }` |
| `gt` | Greater than | `{ field: 'score', operator: 'gt', value: 80 }` |
| `gte` | Greater than or equal to | `{ field: 'age', operator: 'gte', value: 18 }` |
| `lt` | Less than | `{ field: 'price', operator: 'lt', value: 100 }` |
| `lte` | Less than or equal to | `{ field: 'stock', operator: 'lte', value: 10 }` |
| `between`| Within range (inclusive/exclusive by value) | `{ field: 'age', operator: 'between', value: [18, 65] }` |
| `in` | Value in array | `{ field: 'category', operator: 'in', value: ['A', 'B'] }` |
| `contains`| String contains substring | `{ field: 'name', operator: 'contains', value: 'hn' }` |
| `startsWith`| String starts with prefix | `{ field: 'email', operator: 'startsWith', value: 'admin' }` |
| `endsWith`| String ends with suffix | `{ field: 'file', operator: 'endsWith', value: '.jpg' }` |

## Usage Examples

### 1. Simple Conditions

```typescript
// Find users where age is exactly 25
const results = await storage.query({
  where: { field: 'age', operator: 'eq', value: 25 }
})

// Find products with price greater than 100
const results = await storage.query({
  where: { field: 'price', operator: 'gt', value: 100 }
})
```

### 2. Multiple Conditions (AND)

```typescript
// Find employees with age > 25 AND department is 'Engineering'
const results = await storage.query({
  where: [
    { field: 'age', operator: 'gt', value: 25 },
    { field: 'department', operator: 'eq', value: 'Engineering' }
  ]
})
```

### 3. Range and Between

```typescript
// Find users with age between 25 and 35 (inclusive)
const results = await storage.query({
  where: { field: 'age', operator: 'between', value: [25, 35] }
})

// Combined multi-range
const results = await storage.query({
  where: [
    { field: 'price', operator: 'gte', value: 50 },
    { field: 'price', operator: 'lte', value: 200 }
  ]
})
```

### 4. Array and String Queries

```typescript
// Find items matching specific categories
const results = await storage.query({
  where: { field: 'category', operator: 'in', value: ['Tech', 'Design'] }
})

// Search by substring
const results = await storage.query({
  where: { field: 'name', operator: 'contains', value: 'John' }
})

// Filter by email domain
const results = await storage.query({
  where: { field: 'email', operator: 'endsWith', value: '@company.com' }
})
```

### 5. Sorting

```typescript
// Sort by age ascending
const results = await storage.query({
  sort: { field: 'age', order: 'asc' }
})

// Sort by age descending
const results = await storage.query({
  sort: { field: 'age', order: 'desc' }
})

// Multi-field sorting: sort by department asc, then salary desc
const results = await storage.query({
  sort: [
    { field: 'department', order: 'asc' },
    { field: 'salary', order: 'desc' }
  ]
})
```

### 6. Pagination and Limits

```typescript
// Get the second page of active users
const results = await storage.query({
  where: { field: 'status', operator: 'eq', value: 'active' },
  limit: 10,
  offset: 10
})
```

### 7. Custom Filtering

```typescript
// Complex custom logic
const results = await storage.query({
  filter: (item) => item.price * item.quantity > 1000
})
```

### 8. Nested Fields

```typescript
// Query using dot notation for nested objects
const results = await storage.query({
  where: { field: 'profile.address.city', operator: 'eq', value: 'New York' }
})
```

## Internal Details & Edge Cases

- **NaN Handling**: `NaN` is not allowed in comparison operators (except `ne` for field checks) to prevent silent query failures. An error/warning will be logged.
- **Inverted Ranges**: For `between`, if `start > end`, the library will swap them automatically and log a warning.
- **Performance**: High-level filters (`where`, `filter`) are applied during cursor iteration. Sorting and pagination happen after retrieval from IndexedDB.
