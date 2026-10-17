CREATE TABLE `friends` (
	`user_id` text NOT NULL,
	`friend_id` text NOT NULL,
	`friend_name` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `friend_id`)
);
--> statement-breakpoint
CREATE TABLE `friend_invites` (
	`token` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`owner_name` text NOT NULL,
	`expires_at` text NOT NULL,
	`accepted_by` text,
	`created_at` text NOT NULL,
	`accepted_at` text
);
--> statement-breakpoint
CREATE TABLE `group_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`prayer_id` text NOT NULL,
	`author_id` text NOT NULL,
	`author_name` text NOT NULL,
	`body` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `prayer_groups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `group_comments_group_prayer_idx` ON `group_comments` (`group_id`,`prayer_id`);
