CREATE TABLE `group_intercessions` (
  `id` text PRIMARY KEY NOT NULL,
  `group_id` text NOT NULL REFERENCES `prayer_groups`(`id`) ON DELETE CASCADE,
  `body` text NOT NULL,
  `created_by` text NOT NULL,
  `created_at` text NOT NULL
);
CREATE INDEX `group_intercessions_group_created_idx` ON `group_intercessions` (`group_id`,`created_at`);
