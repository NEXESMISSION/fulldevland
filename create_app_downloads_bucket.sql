-- Create app-downloads bucket for APK files
-- Run this in Supabase SQL Editor

-- Step 1: Create the bucket (must be done manually in Supabase Dashboard)
-- Go to Storage → New Bucket
-- Name: app-downloads
-- Public: Yes (checked)
-- File size limit: 100MB (for APK files)
-- Allowed MIME types: application/vnd.android.package-archive, application/octet-stream

-- Step 2: Set up RLS Policies
-- Note: Bucket must be created first in Dashboard before running these policies

-- Policy 1: Allow public read access (for downloads)
DROP POLICY IF EXISTS "Allow public read access to app downloads" ON storage.objects;
CREATE POLICY "Allow public read access to app downloads"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'app-downloads');

-- Policy 2: Allow authenticated users to upload APK files
DROP POLICY IF EXISTS "Allow authenticated users to upload APK files" ON storage.objects;
CREATE POLICY "Allow authenticated users to upload APK files"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'app-downloads' AND
    auth.role() = 'authenticated'
  );

-- Policy 3: Allow authenticated users to update APK files
DROP POLICY IF EXISTS "Allow authenticated users to update APK files" ON storage.objects;
CREATE POLICY "Allow authenticated users to update APK files"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'app-downloads' AND
    auth.role() = 'authenticated'
  );

-- Policy 4: Allow authenticated users to delete APK files
DROP POLICY IF EXISTS "Allow authenticated users to delete APK files" ON storage.objects;
CREATE POLICY "Allow authenticated users to delete APK files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'app-downloads' AND
    auth.role() = 'authenticated'
  );

-- Instructions:
-- 1. Go to Supabase Dashboard → Storage
-- 2. Click "New bucket"
-- 3. Name: app-downloads
-- 4. Check "Public bucket"
-- 5. File size limit: 104857600 (100MB)
-- 6. Allowed MIME types: application/vnd.android.package-archive, application/octet-stream
-- 7. Click "Create bucket"
-- 8. Then run this SQL script to set up policies
-- 9. Upload your APK file to the bucket with path: app.apk

