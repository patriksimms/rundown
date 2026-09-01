CREATE TABLE `ingestion_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`source_key` text NOT NULL,
	`destination_key` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ingestion_tokens_workspace_id_idx` ON `ingestion_tokens` (`workspace_id`);