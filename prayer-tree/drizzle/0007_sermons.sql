CREATE TABLE `sermons` (
  `id` text PRIMARY KEY NOT NULL,
  `author_id` text NOT NULL,
  `author_name` text NOT NULL,
  `title` text NOT NULL,
  `scripture` text NOT NULL,
  `content` text NOT NULL,
  `folder` text NOT NULL DEFAULT '기본 폴더',
  `visibility` text NOT NULL DEFAULT 'private',
  `group_ids_json` text NOT NULL DEFAULT '[]',
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
CREATE INDEX `sermons_author_updated_idx` ON `sermons` (`author_id`,`updated_at`);
