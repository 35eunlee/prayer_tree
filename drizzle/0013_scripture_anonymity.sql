ALTER TABLE scripture_chapters ADD COLUMN is_anonymous INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE scripture_meditations ADD COLUMN is_anonymous INTEGER NOT NULL DEFAULT 0;
