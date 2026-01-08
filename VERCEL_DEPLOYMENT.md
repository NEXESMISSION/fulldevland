# Vercel Deployment Guide

## ✅ Fixed Issues

### 1. **SPA Routing (404 Error)** ✅ FIXED
- **Problem**: Vercel returns 404 for client-side routes
- **Solution**: Added `vercel.json` with rewrites to redirect all routes to `index.html`

### 2. **Build Configuration** ✅ FIXED
- **Problem**: Vercel needs to know build directory and commands
- **Solution**: Configured `vercel.json` with:
  - `outputDirectory`: `frontend/dist`
  - `buildCommand`: `cd frontend && npm install && npm run build`
  - `installCommand`: `cd frontend && npm install`

### 3. **Environment Variables** ⚠️ REQUIRED
- **Problem**: Environment variables not set in Vercel
- **Solution**: Add these in Vercel Dashboard → Settings → Environment Variables:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`

## 📋 Deployment Steps

### Step 1: Set Environment Variables in Vercel

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add these variables:
   ```
   VITE_SUPABASE_URL=https://xxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```
   **⚠️ IMPORTANT**: Replace `xxxxx` with your actual Supabase project URL and use your actual anon key. Never commit real credentials to version control!
4. Make sure to select **Production**, **Preview**, and **Development** environments
5. Click **Save**

### Step 2: Configure Project Settings

1. Go to **Settings** → **General**
2. Set **Root Directory** to: `frontend` (if not auto-detected)
3. Set **Build Command** to: `npm run build`
4. Set **Output Directory** to: `dist`
5. Set **Install Command** to: `npm install`

### Step 3: Deploy

1. Push your code to GitHub
2. Vercel will automatically detect the changes
3. Or manually trigger a deployment from Vercel dashboard

## 🔍 Troubleshooting

### Issue: Still Getting 404
**Solution**: 
- Check that `vercel.json` is in the root directory
- Verify rewrites are configured correctly
- Clear Vercel cache and redeploy

### Issue: Build Fails
**Solution**:
- Check build logs in Vercel dashboard
- Ensure all dependencies are in `package.json`
- Verify TypeScript compilation passes locally

### Issue: Environment Variables Not Working
**Solution**:
- Verify variables are set in Vercel dashboard
- Check variable names match exactly (case-sensitive)
- Redeploy after adding variables

### Issue: Blank Page
**Solution**:
- Check browser console for errors
- Verify Supabase URL and key are correct
- Check network tab for failed requests

## 📝 Files Created

1. **vercel.json** - Vercel configuration for SPA routing
2. **.vercelignore** - Files to ignore during deployment

## ✅ Verification Checklist

- [ ] `vercel.json` exists in root directory
- [ ] Environment variables set in Vercel dashboard
- [ ] Build passes locally (`npm run build`)
- [ ] No TypeScript errors
- [ ] All dependencies in `package.json`
- [ ] `.env` file is NOT committed (in `.gitignore`)


