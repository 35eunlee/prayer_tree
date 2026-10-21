ALTER TABLE scripture_chapter_sync_groups ADD COLUMN source_chapter_id TEXT;
--> statement-breakpoint
UPDATE scripture_chapter_sync_groups
SET source_chapter_id = (
  SELECT m.chapter_id
  FROM scripture_chapter_sync_members m
  JOIN scripture_chapters c ON c.id = m.chapter_id
  WHERE m.sync_group_id = scripture_chapter_sync_groups.id
  ORDER BY c.created_at, c.id
  LIMIT 1
)
WHERE source_chapter_id IS NULL;
