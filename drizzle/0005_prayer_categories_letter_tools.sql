ALTER TABLE `shared_prayers` ADD `friend_ids_json` text NOT NULL DEFAULT '[]';
ALTER TABLE `shared_prayers` ADD `friend_shared` integer NOT NULL DEFAULT 0;
ALTER TABLE `shared_prayers` ADD `category` text NOT NULL DEFAULT '';
ALTER TABLE `shared_trees` ADD `friend_ids_json` text NOT NULL DEFAULT '[]';
ALTER TABLE `shared_trees` ADD `friend_shared` integer NOT NULL DEFAULT 0;
ALTER TABLE `letters` ADD `available_at` text NOT NULL DEFAULT '';
UPDATE `letters` SET `available_at` = `created_at` WHERE `available_at` = '';
CREATE TABLE `letter_replies` (`id` text PRIMARY KEY NOT NULL, `letter_id` text NOT NULL REFERENCES `letters`(`id`) ON DELETE CASCADE, `recipient_id` text NOT NULL, `author_id` text NOT NULL, `author_name` text NOT NULL, `anonymous` integer NOT NULL DEFAULT 0, `body` text NOT NULL, `created_at` text NOT NULL);
CREATE INDEX `letter_replies_letter_idx` ON `letter_replies` (`letter_id`,`created_at`);
