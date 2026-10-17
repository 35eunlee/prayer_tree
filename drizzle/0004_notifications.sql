CREATE TABLE `notifications` (`id` text PRIMARY KEY NOT NULL, `recipient_id` text NOT NULL, `actor_id` text NOT NULL, `actor_name` text NOT NULL, `kind` text NOT NULL, `title` text NOT NULL, `message` text NOT NULL, `link` text DEFAULT '' NOT NULL, `created_at` text NOT NULL, `read_at` text);
CREATE INDEX `notifications_recipient_created_idx` ON `notifications` (`recipient_id`,`created_at`);
