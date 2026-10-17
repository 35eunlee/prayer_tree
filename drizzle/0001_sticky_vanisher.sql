CREATE TABLE `shared_trees` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`tree_id` text NOT NULL,
	`owner_name` text NOT NULL,
	`tree_name` text NOT NULL,
	`style_json` text NOT NULL,
	`verse_json` text NOT NULL,
	`group_ids_json` text NOT NULL,
	`updated_at` text NOT NULL
);
