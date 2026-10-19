CREATE TABLE IF NOT EXISTS scripture_chapters (
  id TEXT PRIMARY KEY NOT NULL,
  scope_type TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  book_id TEXT NOT NULL,
  book_name TEXT NOT NULL,
  chapter INTEGER NOT NULL,
  scripture_text TEXT NOT NULL,
  created_by TEXT NOT NULL,
  creator_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS scripture_chapters_scope_book_chapter_unique ON scripture_chapters(scope_type,scope_id,book_id,chapter);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS scripture_meditations (
  id TEXT PRIMARY KEY NOT NULL,
  chapter_id TEXT NOT NULL REFERENCES scripture_chapters(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  body TEXT NOT NULL,
  is_seed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS scripture_meditations_chapter_idx ON scripture_meditations(chapter_id,created_at);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS scripture_meditations_author_idx ON scripture_meditations(user_id,created_at);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS scripture_reading_progress (
  user_id TEXT NOT NULL,
  scope_type TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  book_id TEXT NOT NULL,
  chapter INTEGER NOT NULL,
  read_at TEXT NOT NULL,
  PRIMARY KEY(user_id,scope_type,scope_id,book_id,chapter)
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS scripture_reading_scope_idx ON scripture_reading_progress(scope_type,scope_id,book_id,chapter);