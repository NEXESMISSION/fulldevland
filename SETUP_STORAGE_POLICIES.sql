-- ============================================
-- SETUP STORAGE POLICIES FOR LAND IMAGES
-- ============================================
-- This script attempts to create RLS policies for storage.objects
-- If it fails with permission errors, you MUST set up policies manually
-- via Supabase Dashboard -> Storage -> land-images -> Policies
-- ============================================

-- Try to create policies (may fail if you don't have owner privileges)
-- Note: We drop existing policies first to avoid conflicts
DO $$
BEGIN
  -- Policy 1: Allow authenticated users to upload images
  BEGIN
    DROP POLICY IF EXISTS "Allow authenticated users to upload land images" ON storage.objects;
    CREATE POLICY "Allow authenticated users to upload land images"
    ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (
      bucket_id = 'land-images' AND
      (storage.foldername(name))[1] = 'land-batches'
    );
    RAISE NOTICE 'Policy 1 created successfully';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE WARNING 'Cannot create upload policy. Please create manually in Dashboard.';
    WHEN OTHERS THEN
      RAISE WARNING 'Error creating upload policy: %', SQLERRM;
  END;

  -- Policy 2: Allow authenticated users to update images
  BEGIN
    DROP POLICY IF EXISTS "Allow authenticated users to update land images" ON storage.objects;
    CREATE POLICY "Allow authenticated users to update land images"
    ON storage.objects
    FOR UPDATE
    TO authenticated
    USING (
      bucket_id = 'land-images' AND
      (storage.foldername(name))[1] = 'land-batches'
    )
    WITH CHECK (
      bucket_id = 'land-images' AND
      (storage.foldername(name))[1] = 'land-batches'
    );
    RAISE NOTICE 'Policy 2 created successfully';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE WARNING 'Cannot create update policy. Please create manually in Dashboard.';
    WHEN OTHERS THEN
      RAISE WARNING 'Error creating update policy: %', SQLERRM;
  END;

  -- Policy 3: Allow authenticated users to delete images
  BEGIN
    DROP POLICY IF EXISTS "Allow authenticated users to delete land images" ON storage.objects;
    CREATE POLICY "Allow authenticated users to delete land images"
    ON storage.objects
    FOR DELETE
    TO authenticated
    USING (
      bucket_id = 'land-images' AND
      (storage.foldername(name))[1] = 'land-batches'
    );
    RAISE NOTICE 'Policy 3 created successfully';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE WARNING 'Cannot create delete policy. Please create manually in Dashboard.';
    WHEN OTHERS THEN
      RAISE WARNING 'Error creating delete policy: %', SQLERRM;
  END;

  -- Policy 4: Allow public read access
  BEGIN
    DROP POLICY IF EXISTS "Allow public read access to land images" ON storage.objects;
    CREATE POLICY "Allow public read access to land images"
    ON storage.objects
    FOR SELECT
    TO public
    USING (bucket_id = 'land-images');
    RAISE NOTICE 'Policy 4 created successfully';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE WARNING 'Cannot create read policy. Please create manually in Dashboard.';
    WHEN OTHERS THEN
      RAISE WARNING 'Error creating read policy: %', SQLERRM;
  END;

  -- Policy 5: Allow authenticated users to read images
  BEGIN
    DROP POLICY IF EXISTS "Allow authenticated users to read land images" ON storage.objects;
    CREATE POLICY "Allow authenticated users to read land images"
    ON storage.objects
    FOR SELECT
    TO authenticated
    USING (bucket_id = 'land-images');
    RAISE NOTICE 'Policy 5 created successfully';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE WARNING 'Cannot create authenticated read policy. Please create manually in Dashboard.';
    WHEN OTHERS THEN
      RAISE WARNING 'Error creating authenticated read policy: %', SQLERRM;
  END;

END $$;

-- ============================================
-- IMPORTANT: If policies were not created
-- ============================================
-- You MUST set up policies manually:
-- 1. Go to Supabase Dashboard -> Storage -> land-images
-- 2. Click on "Policies" tab
-- 3. Click "New Policy"
-- 4. Use the SIMPLER method below (recommended)
-- ============================================

-- SIMPLER POLICIES (Recommended - easier to set up manually):
-- 
-- Policy 1: "Authenticated Full Access"
--   - Operation: ALL (or select INSERT, UPDATE, DELETE, SELECT)
--   - Target roles: authenticated
--   - Policy: bucket_id = 'land-images'
--
-- Policy 2: "Public Read Access"
--   - Operation: SELECT
--   - Target roles: public
--   - Policy: bucket_id = 'land-images'
--
-- ============================================

