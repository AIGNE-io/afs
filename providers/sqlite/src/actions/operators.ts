/**
 * MongoDB-style condition operators parser for SQLite queries
 *
 * Converts operator objects like { age: { $gte: 18, $lt: 65 } }
 * to parameterized SQL WHERE clauses.
 */

import type { SQL } from "drizzle-orm";
import { sql } from "drizzle-orm";

// Type definitions

type PrimitiveValue = string | number | boolean | null;

interface ColumnCondition {
  $eq?: PrimitiveValue;
  $ne?: PrimitiveValue;
  $gt?: number | string;
  $gte?: number | string;
  $lt?: number | string;
  $lte?: number | string;
  $in?: PrimitiveValue[];
  $notIn?: PrimitiveValue[];
  $like?: string;
  $isNull?: boolean;
  $between?: [number | string, number | string];
}

export type WhereClause = {
  [key: string]: ColumnCondition | PrimitiveValue | WhereClause[] | WhereClause | undefined;
} & {
  $and?: WhereClause[];
  $or?: WhereClause[];
  $not?: WhereClause;
};

const COMPARISON_OPERATORS = [
  "$eq",
  "$ne",
  "$gt",
  "$gte",
  "$lt",
  "$lte",
  "$in",
  "$notIn",
  "$like",
  "$isNull",
  "$between",
];

/**
 * Check if value is an operator object (has $ prefixed keys)
 */
function isOperatorObject(value: unknown): value is ColumnCondition {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const keys = Object.keys(value);
  return keys.length > 0 && keys.every((k) => COMPARISON_OPERATORS.includes(k));
}

/**
 * Check if key is a logical operator
 */
function isLogicalOperator(key: string): boolean {
  return key === "$and" || key === "$or" || key === "$not";
}

/**
 * Validate operator name
 */
function validateOperator(op: string): void {
  if (op.startsWith("$") && !COMPARISON_OPERATORS.includes(op) && !isLogicalOperator(op)) {
    throw new Error(`Invalid operator: ${op}`);
  }
}

/**
 * Parse a column condition with operators
 */
function parseColumnCondition(column: string, condition: ColumnCondition): SQL {
  const parts: SQL[] = [];
  const col = sql.identifier(column);

  for (const [op, value] of Object.entries(condition)) {
    validateOperator(op);

    switch (op) {
      case "$eq":
        parts.push(sql`${col} = ${value}`);
        break;
      case "$ne":
        parts.push(sql`${col} <> ${value}`);
        break;
      case "$gt":
        parts.push(sql`${col} > ${value}`);
        break;
      case "$gte":
        parts.push(sql`${col} >= ${value}`);
        break;
      case "$lt":
        parts.push(sql`${col} < ${value}`);
        break;
      case "$lte":
        parts.push(sql`${col} <= ${value}`);
        break;
      case "$in": {
        const arr = value as PrimitiveValue[];
        if (!Array.isArray(arr) || arr.length === 0) {
          throw new Error("$in requires a non-empty array");
        }
        const placeholders = arr.map((v) => sql`${v}`);
        parts.push(sql`${col} IN (${sql.join(placeholders, sql`, `)})`);
        break;
      }
      case "$notIn": {
        const arr = value as PrimitiveValue[];
        if (!Array.isArray(arr) || arr.length === 0) {
          throw new Error("$notIn requires a non-empty array");
        }
        const placeholders = arr.map((v) => sql`${v}`);
        parts.push(sql`${col} NOT IN (${sql.join(placeholders, sql`, `)})`);
        break;
      }
      case "$like":
        parts.push(sql`${col} LIKE ${value}`);
        break;
      case "$isNull":
        if (value === true) {
          parts.push(sql`${col} IS NULL`);
        } else {
          parts.push(sql`${col} IS NOT NULL`);
        }
        break;
      case "$between": {
        const [min, max] = value as [number | string, number | string];
        parts.push(sql`${col} BETWEEN ${min} AND ${max}`);
        break;
      }
    }
  }

  if (parts.length === 0) {
    return sql`1 = 1`;
  }

  return parts.length === 1 ? parts[0]! : sql`(${sql.join(parts, sql` AND `)})`;
}

/**
 * Parse $and clause
 */
function parseAndClause(clauses: WhereClause[]): SQL {
  if (!Array.isArray(clauses) || clauses.length === 0) {
    return sql`1 = 1`;
  }
  const parts = clauses.map((c) => parseWhereClause(c));
  return sql`(${sql.join(parts, sql` AND `)})`;
}

/**
 * Parse $or clause
 */
function parseOrClause(clauses: WhereClause[]): SQL {
  if (!Array.isArray(clauses) || clauses.length === 0) {
    return sql`1 = 1`;
  }
  const parts = clauses.map((c) => parseWhereClause(c));
  return sql`(${sql.join(parts, sql` OR `)})`;
}

/**
 * Parse $not clause
 */
function parseNotClause(clause: WhereClause): SQL {
  const inner = parseWhereClause(clause);
  return sql`NOT (${inner})`;
}

/**
 * Parse a complete WHERE clause object into parameterized SQL
 *
 * @param where - The where clause object with MongoDB-style operators
 * @returns Parameterized SQL fragment
 *
 * @example
 * // Simple equality
 * parseWhereClause({ status: "active" })
 *
 * // With operators
 * parseWhereClause({ age: { $gte: 18, $lt: 65 } })
 *
 * // Logical combination
 * parseWhereClause({ $or: [{ status: "active" }, { role: "admin" }] })
 */
export function parseWhereClause(where: WhereClause): SQL {
  if (!where || typeof where !== "object") {
    return sql`1 = 1`;
  }

  const conditions: SQL[] = [];

  for (const [key, value] of Object.entries(where)) {
    if (key === "$and") {
      conditions.push(parseAndClause(value as WhereClause[]));
    } else if (key === "$or") {
      conditions.push(parseOrClause(value as WhereClause[]));
    } else if (key === "$not") {
      conditions.push(parseNotClause(value as WhereClause));
    } else if (isOperatorObject(value)) {
      conditions.push(parseColumnCondition(key, value as ColumnCondition));
    } else {
      // Simple equality (implicit $eq)
      const col = sql.identifier(key);
      conditions.push(sql`${col} = ${value as PrimitiveValue}`);
    }
  }

  if (conditions.length === 0) {
    return sql`1 = 1`;
  }

  return conditions.length === 1 ? conditions[0]! : sql.join(conditions, sql` AND `);
}

/**
 * Build a complete WHERE clause (including the WHERE keyword)
 */
export function buildWhereClause(where: WhereClause | undefined): SQL {
  if (!where || Object.keys(where).length === 0) {
    return sql``;
  }
  return sql` WHERE ${parseWhereClause(where)}`;
}
