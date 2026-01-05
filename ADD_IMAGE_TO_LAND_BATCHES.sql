-- ============================================
-- ADD IMAGE COLUMN TO LAND_BATCHES TABLE
-- AND SETUP STORAGE BUCKET WITH RLS POLICIES
-- ============================================
-- Purpose: Add image URL support for land batches
-- Run this in Supabase SQL Editor
-- ============================================

-- Step 1: Add image_url column to land_batches table
ALTER TABLE land_batches 
ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Add comment to the column
COMMENT ON COLUMN land_batches.image_url IS 'URL of the land batch image (stored in Supabase Storage)';

-- Step 2: Create storage bucket for land images (if it doesn't exist)
-- Note: This requires superuser privileges. If it fails, create the bucket manually in Supabase Dashboard.
DO $$
BEGIN
  -- Try to create the bucket
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES (
    'land-images',
    'land-images',
    true, -- Public bucket so images can be accessed via URL
    5242880, -- 5MB limit
    ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
  )
  ON CONFLICT (id) DO UPDATE
  SET 
    public = true,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Cannot create bucket via SQL. Please create it manually in Supabase Dashboard -> Storage -> New Bucket';
  WHEN OTHERS THEN
    RAISE NOTICE 'Error creating bucket: %', SQLERRM;
END $$;

-- ============================================
-- MANUAL STEPS REQUIRED - SETUP STORAGE BUCKET
-- ============================================
-- After running this SQL, you MUST manually set up the storage bucket:
--
-- METHOD 1: Via Supabase Dashboard (Recommended)
-- 1. Go to Supabase Dashboard -> Storage
-- 2. Click "New bucket"
-- 3. Bucket name: "land-images"
-- 4. Make it PUBLIC
-- 5. Click "Create bucket"
-- 6. Go to "Policies" tab for the bucket
-- 7. Click "New Policy" and add these policies:
--
--    Policy 1: "Allow authenticated upload"
--    - Policy name: "Allow authenticated users to upload land images"
--    - Allowed operation: INSERT
--    - Target roles: authenticated
--    - Policy definition:
--      bucket_id = 'land-images' AND (storage.foldername(name))[1] = 'land-batches'
--
--    Policy 2: "Allow authenticated update"
--    - Policy name: "Allow authenticated users to update land images"
--    - Allowed operation: UPDATE
--    - Target roles: authenticated
--    - Policy definition:
--      bucket_id = 'land-images' AND (storage.foldername(name))[1] = 'land-batches'
--
--    Policy 3: "Allow authenticated delete"
--    - Policy name: "Allow authenticated users to delete land images"
--    - Allowed operation: DELETE
--    - Target roles: authenticated
--    - Policy definition:
--      bucket_id = 'land-images' AND (storage.foldername(name))[1] = 'land-batches'
--
--    Policy 4: "Allow public read"
--    - Policy name: "Allow public read access to land images"
--    - Allowed operation: SELECT
--    - Target roles: public
--    - Policy definition:
--      bucket_id = 'land-images'
--
-- METHOD 2: Via Supabase CLI (Alternative)
-- Run: supabase storage create land-images --public
-- Then set up policies via Dashboard as described above
--
-- ============================================
-- DONE!
-- ============================================
-- 1. ✅ The image_url column has been added to land_batches table.
-- 2. ⚠️  You need to manually create the 'land-images' storage bucket (see above).
-- 3. ⚠️  You need to manually set up RLS policies (see above).
-- 4. File size limit: 5MB (set when creating bucket)
-- 5. Allowed MIME types: JPEG, JPG, PNG, GIF, WebP
-- ============================================

