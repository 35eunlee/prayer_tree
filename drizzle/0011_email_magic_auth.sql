CREATE TABLE `email_identities` (
  `email` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `email_identities_user_idx` ON `email_identities` (`user_id`);
--> statement-breakpoint
CREATE TABLE `google_identities` (
  `subject` text PRIMARY KEY NOT NULL,
  `email` text NOT NULL,
  `user_id` text NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `google_identities_user_idx` ON `google_identities` (`user_id`);
--> statement-breakpoint
CREATE INDEX `google_identities_email_idx` ON `google_identities` (`email`);
--> statement-breakpoint
CREATE TABLE `email_magic_links` (
  `token_hash` text PRIMARY KEY NOT NULL,
  `email` text NOT NULL,
  `return_to` text NOT NULL,
  `expires_at` integer NOT NULL,
  `consumed_at` integer,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `email_magic_links_email_created_idx` ON `email_magic_links` (`email`, `created_at`);