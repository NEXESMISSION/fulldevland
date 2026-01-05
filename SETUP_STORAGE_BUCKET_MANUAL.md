# Manual Setup: Storage Bucket for Land Images

**⚠️ IMPORTANT: You MUST complete these steps for image uploads to work!**

After running `ADD_IMAGE_TO_LAND_BATCHES.sql`, follow these steps to set up the storage bucket:

## Step 1: Create the Bucket

1. Go to **Supabase Dashboard** → **Storage**
2. Click **"New bucket"**
3. Enter bucket name: `land-images`
4. Check **"Public bucket"** (so images can be accessed via URL)
5. Set **File size limit**: `5242880` (5MB)
6. Set **Allowed MIME types**: `image/jpeg,image/jpg,image/png,image/gif,image/webp`
7. Click **"Create bucket"**

## Step 2: Set Up RLS Policies

Go to the `land-images` bucket → **Policies** tab → Click **"New Policy"**

### Policy 1: Allow Authenticated Upload
- **Policy name**: `Allow authenticated users to upload land images`
- **Allowed operation**: `INSERT`
- **Target roles**: `authenticated`
- **Policy definition** (Using "For full customization"):
```sql
bucket_id = 'land-images' AND (storage.foldername(name))[1] = 'land-batches'
```

### Policy 2: Allow Authenticated Update
- **Policy name**: `Allow authenticated users to update land images`
- **Allowed operation**: `UPDATE`
- **Target roles**: `authenticated`
- **Policy definition**:
```sql
bucket_id = 'land-images' AND (storage.foldername(name))[1] = 'land-batches'
```

### Policy 3: Allow Authenticated Delete
- **Policy name**: `Allow authenticated users to delete land images`
- **Allowed operation**: `DELETE`
- **Target roles**: `authenticated`
- **Policy definition**:
```sql
bucket_id = 'land-images' AND (storage.foldername(name))[1] = 'land-batches'
```

### Policy 4: Allow Public Read
- **Policy name**: `Allow public read access to land images`
- **Allowed operation**: `SELECT`
- **Target roles**: `public`
- **Policy definition**:
```sql
bucket_id = 'land-images'
```

## Step 3: Verify

After setting up, try uploading an image in the application. If you still get RLS errors, double-check that:
1. The bucket name is exactly `land-images`
2. All policies are created correctly
3. The bucket is set to **Public**

## ⚡ QUICK SETUP (Recommended - Use This Method!)

**This is the EASIEST and FASTEST way to get it working:**

### Step 1: Create the Bucket
1. Go to **Supabase Dashboard** → **Storage**
2. Click **"New bucket"**
3. Enter bucket name: `land-images`
4. Check **"Public bucket"**
5. Click **"Create bucket"**

### Step 2: Add Two Simple Policies

Go to `land-images` bucket → **Policies** tab → Click **"New Policy"**

#### Policy 1: Authenticated Full Access (REQUIRED)
1. Click **"New Policy"**
2. Select **"For full customization"**
3. **Policy name**: `Authenticated users full access`
4. **Allowed operation**: Check **ALL** (or check: INSERT, UPDATE, DELETE, SELECT)
5. **Target roles**: Check **authenticated**
6. **Policy definition** (paste this):
```sql
bucket_id = 'land-images'
```
7. Click **"Review"** then **"Save policy"**

#### Policy 2: Public Read (REQUIRED)
1. Click **"New Policy"** again
2. Select **"For full customization"**
3. **Policy name**: `Public read access`
4. **Allowed operation**: Check **SELECT** only
5. **Target roles**: Check **public**
6. **Policy definition** (paste this):
```sql
bucket_id = 'land-images'
```
7. Click **"Review"** then **"Save policy"**

### ✅ Done! 
Now try uploading an image again. It should work!

---

## Alternative: Detailed Setup (More Secure)

If you want more restrictive policies:

