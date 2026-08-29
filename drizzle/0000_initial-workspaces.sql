CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`clerk_organization_id` text NOT NULL,
	`name` text NOT NULL,
	`r2_prefix` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspaces_clerk_organization_id_unique` ON `workspaces` (`clerk_organization_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `workspaces_r2_prefix_unique` ON `workspaces` (`r2_prefix`);
