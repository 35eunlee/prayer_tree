CREATE TABLE `daily_actions` (
	`user_id` text NOT NULL,
	`action` text NOT NULL,
	`day` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `action`, `day`)
);
--> statement-breakpoint
CREATE TABLE `group_members` (
	`group_id` text NOT NULL,
	`user_id` text NOT NULL,
	`joined_at` text NOT NULL,
	PRIMARY KEY(`group_id`, `user_id`),
	FOREIGN KEY (`group_id`) REFERENCES `prayer_groups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `letter_reads` (
	`letter_id` text NOT NULL,
	`user_id` text NOT NULL,
	`day` text NOT NULL,
	PRIMARY KEY(`letter_id`, `user_id`),
	FOREIGN KEY (`letter_id`) REFERENCES `letters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `letters` (
	`id` text PRIMARY KEY NOT NULL,
	`author_id` text NOT NULL,
	`author_name` text NOT NULL,
	`anonymous` integer DEFAULT 0 NOT NULL,
	`reference` text NOT NULL,
	`verse` text NOT NULL,
	`note` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `prayer_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`invite_code` text NOT NULL,
	`pin_salt` text NOT NULL,
	`pin_hash` text NOT NULL,
	`creator_id` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prayer_groups_invite_code_unique` ON `prayer_groups` (`invite_code`);--> statement-breakpoint
CREATE TABLE `shared_prayers` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`tree_id` text NOT NULL,
	`owner_name` text NOT NULL,
	`body` text NOT NULL,
	`fruit` text NOT NULL,
	`visibility` text NOT NULL,
	`group_ids_json` text NOT NULL,
	`harvested` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_states` (
	`user_id` text PRIMARY KEY NOT NULL,
	`state_json` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `waters` (
	`prayer_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`user_id` text NOT NULL,
	`display_name` text NOT NULL,
	`day` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`prayer_id`, `owner_id`, `user_id`, `day`)
);
