import { sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const workspaces = sqliteTable(
  'workspaces',
  {
    id: text().primaryKey(),
    clerkOrganizationId: text('clerk_organization_id').notNull(),
    name: text().notNull(),
    r2Prefix: text('r2_prefix').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('workspaces_clerk_organization_id_unique').on(table.clerkOrganizationId),
    uniqueIndex('workspaces_r2_prefix_unique').on(table.r2Prefix),
  ],
);
