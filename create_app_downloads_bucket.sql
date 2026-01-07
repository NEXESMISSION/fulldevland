-- ============================================
-- Create app-downloads bucket for APK files
-- ============================================
-- IMPORTANT: Bucket creation must be done manually in Supabase Dashboard
-- This SQL file only sets up the RLS policies AFTER bucket is created
-- ============================================

-- STEP 1: CREATE BUCKET MANUALLY (Required before running this SQL)
-- ============================================
-- 1. Go to Supabase Dashboard → Storage
-- 2. Click "New bucket" button
-- 3. Enter bucket name: app-downloads
-- 4. Check "Public bucket" (IMPORTANT: Must be public for downloads)
-- 5. Set File size limit: 104857600 (100MB) - for APK files
-- 6. Set Allowed MIME types: 
--    application/vnd.android.package-archive,application/octet-stream
-- 7. Click "Create bucket"
-- ============================================

-- STEP 2: UPLOAD APK FILE (After bucket is created)
-- ============================================
-- 1. Go to Storage → app-downloads bucket
-- 2. Click "Upload file" or drag and drop
-- 3. Select your APK file
-- 4. Name it exactly: app.apk (IMPORTANT: Must be this exact name)
-- 5. Click "Upload"
-- ============================================

-- STEP 3: RUN THIS SQL (After bucket is created)
-- ============================================
-- Run the policies below in Supabase SQL Editor
-- ============================================

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

