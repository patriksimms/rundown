CREATE TABLE `query_read_budgets` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`scanned_bytes` integer DEFAULT 0 NOT NULL,
	`maximum_bytes` integer NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `query_read_budgets_workspace_id_idx` ON `query_read_budgets` (`workspace_id`);