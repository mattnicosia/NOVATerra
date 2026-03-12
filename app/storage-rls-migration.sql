-- Storage bucket RLS policies for "blobs" bucket
-- Run in Supabase Dashboard → SQL Editor
-- Fixes: "new row violates row-level security policy" on drawing/document uploads

-- 1. Ensure the bucket exists and is private
INSERT INTO storage.buckets (id, name, public)
VALUES ('blobs', 'blobs', false)
ON CONFLICT (id) DO NOTHING;

-- 2. Enable RLS (may already be enabled — safe to repeat)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 3. Drop existing policies if re-running (idempotent)
DROP POLICY IF EXISTS "Users can upload to own folder" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own blobs" ON storage.objects;
DROP POLICY IF EXISTS "Users can read own blobs" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own blobs" ON storage.objects;

-- 4. INSERT — users can upload to paths starting with their own user ID
--    Upload path pattern: {userId}/{estimateId}/drawings/{drawingId}
--                          {userId}/{estimateId}/documents/{docId}
--                          {userId}/{estimateId}/specPdf
CREATE POLICY "Users can upload to own folder" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'blobs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 5. UPDATE — users can overwrite their own blobs (upsert)
CREATE POLICY "Users can update own blobs" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'blobs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 6. SELECT — users can read/download their own blobs
CREATE POLICY "Users can read own blobs" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'blobs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 7. DELETE — users can remove their own blobs (cleanup)
CREATE POLICY "Users can delete own blobs" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'blobs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
