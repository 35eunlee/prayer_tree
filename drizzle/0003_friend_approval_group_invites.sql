CREATE TABLE `friend_requests` (
  `requester_id` text NOT NULL,
  `recipient_id` text NOT NULL,
  `requester_name` text NOT NULL,
  `recipient_name` text NOT NULL,
  `status` text NOT NULL,
  `created_at` text NOT NULL,
  `responded_at` text,
  PRIMARY KEY(`requester_id`, `recipient_id`)
);
--> statement-breakpoint
CREATE INDEX `friend_requests_recipient_status_idx` ON `friend_requests` (`recipient_id`,`status`);
--> statement-breakpoint
CREATE TABLE `group_friend_invites` (
  `id` text PRIMARY KEY NOT NULL,
  `group_id` text NOT NULL,
  `inviter_id` text NOT NULL,
  `inviter_name` text NOT NULL,
  `friend_id` text NOT NULL,
  `friend_name` text NOT NULL,
  `status` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`group_id`) REFERENCES `prayer_groups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `group_friend_invites_friend_status_idx` ON `group_friend_invites` (`friend_id`,`status`);
--> statement-breakpoint
CREATE INDEX `group_friend_invites_group_status_idx` ON `group_friend_invites` (`group_id`,`status`);
--> statement-breakpoint
CREATE TABLE `friend_aliases` (
  `user_id` text NOT NULL,
  `friend_id` text NOT NULL,
  `alias` text NOT NULL,
  `updated_at` text NOT NULL,
  PRIMARY KEY(`user_id`, `friend_id`)
);
--> statement-breakpoint
ALTER TABLE `group_comments` ADD COLUMN `visibility` text NOT NULL DEFAULT 'public';
