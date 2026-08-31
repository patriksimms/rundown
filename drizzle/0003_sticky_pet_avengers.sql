CREATE TABLE `datasource_uploads` (
	`key` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`clerk_user_id` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `datasource_uploads_workspace_id_idx` ON `datasource_uploads` (`workspace_id`);