ALTER TABLE scripture_meditations ADD COLUMN sync_key TEXT;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS scripture_chapter_sync_groups (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  book_id TEXT NOT NULL,
  chapter INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(owner_id,book_id,chapter)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS scripture_chapter_sync_members (
  sync_group_id TEXT NOT NULL REFERENCES scripture_chapter_sync_groups(id) ON DELETE CASCADE,
  chapter_id TEXT NOT NULL REFERENCES scripture_chapters(id) ON DELETE CASCADE,
  PRIMARY KEY(sync_group_id,chapter_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS scripture_sync_members_chapter_idx ON scripture_chapter_sync_members(chapter_id);
