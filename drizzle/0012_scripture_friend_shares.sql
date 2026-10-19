CREATE TABLE IF NOT EXISTS scripture_chapter_access (
  chapter_id TEXT NOT NULL REFERENCES scripture_chapters(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(chapter_id,user_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS scripture_chapter_access_user_idx ON scripture_chapter_access(user_id,chapter_id);