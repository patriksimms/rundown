CREATE TABLE `calculated_fields` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`data_source_id` text NOT NULL,
	`canonical_name` text NOT NULL,
	`label` text NOT NULL,
	`expression` text NOT NULL,
	`role` text NOT NULL,
	`semantic_type` text NOT NULL,
	`description` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `calculated_fields_data_source_id_idx` ON `calculated_fields` (`data_source_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `calculated_fields_data_source_canonical_unique` ON `calculated_fields` (`data_source_id`,`canonical_name`);--> statement-breakpoint
CREATE TABLE `dashboard_grants` (
	`dashboard_id` text NOT NULL,
	`clerk_user_id` text NOT NULL,
	`role` text NOT NULL,
	`granted_by` text NOT NULL,
	`granted_at` text NOT NULL,
	PRIMARY KEY(`dashboard_id`, `clerk_user_id`)
);
--> statement-breakpoint
CREATE INDEX `dashboard_grants_user_id_idx` ON `dashboard_grants` (`clerk_user_id`);--> statement-breakpoint
CREATE TABLE `dashboards` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`document` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `dashboards_workspace_id_idx` ON `dashboards` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `data_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`location` text NOT NULL,
	`version` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `data_sources_workspace_id_idx` ON `data_sources` (`workspace_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `data_sources_workspace_name_unique` ON `data_sources` (`workspace_id`,`name`);--> statement-breakpoint
CREATE TABLE `fields` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`data_source_id` text NOT NULL,
	`column_name` text NOT NULL,
	`canonical_name` text NOT NULL,
	`label` text NOT NULL,
	`role` text NOT NULL,
	`semantic_type` text NOT NULL,
	`description` text,
	`hidden` integer DEFAULT false NOT NULL,
	`cast_to` text,
	`sample_values` text,
	`cardinality` integer
);
--> statement-breakpoint
CREATE INDEX `fields_data_source_id_idx` ON `fields` (`data_source_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `fields_data_source_column_unique` ON `fields` (`data_source_id`,`column_name`);--> statement-breakpoint
CREATE UNIQUE INDEX `fields_data_source_canonical_unique` ON `fields` (`data_source_id`,`canonical_name`);--> statement-breakpoint
CREATE TABLE `library_metrics` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`canonical_name` text NOT NULL,
	`expression` text NOT NULL,
	`semantic_type` text NOT NULL,
	`description` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `library_metrics_workspace_canonical_unique` ON `library_metrics` (`workspace_id`,`canonical_name`);--> statement-breakpoint
CREATE TABLE `share_links` (
	`token` text PRIMARY KEY NOT NULL,
	`dashboard_id` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`revoked_at` text
);
--> statement-breakpoint
CREATE INDEX `share_links_dashboard_id_idx` ON `share_links` (`dashboard_id`);