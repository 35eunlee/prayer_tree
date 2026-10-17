CREATE TABLE `group_intercession_waters` (
  `group_id` text NOT NULL REFERENCES `prayer_groups`(`id`) ON DELETE CASCADE,
  `prayer_id` text NOT NULL REFERENCES `group_intercessions`(`id`) ON DELETE CASCADE,
  `user_id` text NOT NULL,
  `display_name` text NOT NULL,
  `day` text NOT NULL,
  `created_at` text NOT NULL,
  PRIMARY KEY (`group_id`,`prayer_id`,`user_id`,`day`)
);
CREATE INDEX `group_intercession_waters_group_idx` ON `group_intercession_waters` (`group_id`,`created_at`);
