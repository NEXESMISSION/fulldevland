# Deployment Guide

Complete guide for deploying FULLLANDDEV to production.

---

## 📋 Table of Contents

1. [Deployment Overview](#deployment-overview)
2. [Vercel Deployment](#vercel-deployment)
3. [Supabase Setup](#supabase-setup)
4. [Environment Variables](#environment-variables)
5. [Post-Deployment](#post-deployment)
6. [Troubleshooting](#troubleshooting)

---

## 🚀 Deployment Overview

### Deployment Architecture

```
┌─────────────────┐
│   GitHub Repo   │
│   (Source Code) │
└────────┬────────┘
         │
         │ Auto Deploy
         │
┌────────▼────────┐
│     Vercel      │  (Frontend Hosting)
│   - Build       │
│   - Deploy      │
│   - CDN         │
└────────┬────────┘
         │
         │ API Calls
         │
┌────────▼────────┐
│    Supabase     │  (Backend)
│   - Database    │
│   - Auth        │
│   - Storage     │
└─────────────────┘
```

### What Gets Deployed

- **Frontend**: React application (Vercel)
- **Backend**: Supabase (Database + Auth)
- **Domain**: Custom domain (optional)

---

## 📦 Vercel Deployment

### Prerequisites

- GitHub account
- Vercel account ([Sign up](https://vercel.com))
- Code pushed to GitHub repository

### Step 1: Connect Repository

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click **"Add New Project"**
3. Import your GitHub repository
4. Select the repository
5. Click **"Import"**

### Step 2: Configure Project

Vercel should auto-detect settings, but verify:

1. **Framework Preset**: Vite (auto-detected)
2. **Root Directory**: `frontend` (if not auto-detected)
3. **Build Command**: `npm run build` (auto-detected)
4. **Output Directory**: `dist` (auto-detected)
5. **Install Command**: `npm install` (auto-detected)

**If not auto-detected**, manually set:
- Root Directory: `frontend`
- Build Command: `cd frontend && npm install && npm run build`
- Output Directory: `frontend/dist`

### Step 3: Set Environment Variables

**Critical**: Must be set before first deployment!

1. In Vercel project settings
2. Go to **Settings** → **Environment Variables**
3. Add these variables:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

4. Select environments:
   - ✅ Production
   - ✅ Preview
   - ✅ Development

5. Click **"Save"**

**Where to get values**:
- Supabase Dashboard → Settings → API
- Copy Project URL and anon/public key

### Step 4: Deploy

1. Click **"Deploy"** button
2. Wait for build to complete (2-5 minutes)
3. Check build logs for errors
4. Once deployed, you'll get a URL like: `https://your-project.vercel.app`

### Step 5: Verify Deployment

1. Open deployment URL
2. Should see login page
3. Try logging in
4. Check browser console for errors
5. Verify all pages load correctly

---

## 🗄️ Supabase Setup

### Step 1: Create Supabase Project

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Click **"New Project"**
3. Fill in:
   - **Name**: Your project name
   - **Database Password**: Strong password (save it!)
   - **Region**: Choose closest to users
4. Click **"Create new project"**
5. Wait 2-3 minutes for setup

### Step 2: Run Database Schema

1. Go to **SQL Editor**
2. Create new query
3. Copy contents of `supabase_schema.sql`
4. Paste and run
5. Wait for "Success" message

### Step 3: Run Security Migrations

1. Run `security_database_fixes.sql`
2. (Optional) Run `add_login_attempts_tracking.sql`

### Step 4: Configure Authentication

1. Go to **Authentication** → **Settings**
2. Configure:
   - **Site URL**: Your Vercel deployment URL
   - **Redirect URLs**: Add your domain
   - **Email Templates**: Customize if needed

### Step 5: Get API Credentials

1. Go to **Settings** → **API**
2. Copy:
   - **Project URL**
   - **anon/public key**
3. Use these in Vercel environment variables

---

## 🔐 Environment Variables

### Required Variables

```env
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Where to Set

**Development**:
- Create `.env` file in `frontend` folder
- Add variables
- **Never commit** `.env` to Git (already in `.gitignore`)

**Production (Vercel)**:
- Vercel Dashboard → Project → Settings → Environment Variables
- Add for Production, Preview, and Development environments

### Variable Naming

**Important**: Must start with `VITE_` for Vite to expose them!

- ✅ `VITE_SUPABASE_URL`
- ✅ `VITE_SUPABASE_ANON_KEY`
- ❌ `SUPABASE_URL` (won't work!)

---

## ✅ Post-Deployment

### Step 1: Create First User

1. Go to Supabase Dashboard → Authentication → Users
2. Click **"Add user"** → **"Create new user"**
3. Enter email and password
4. Check **"Auto Confirm User"**
5. Copy User ID (UUID)

6. Go to Table Editor → `users` table
7. Insert row:
   - `id`: Paste User ID
   - `name`: User's name
   - `email`: Same email
   - `role`: `Owner`
   - `status`: `Active`

### Step 2: Test Application

1. Open deployment URL
2. Login with created user
3. Test all features:
   - Create land batch
   - Create client
   - Create sale
   - Record payment
   - View reports

### Step 3: Configure Custom Domain (Optional)

1. In Vercel project settings
2. Go to **Settings** → **Domains**
3. Add your domain
4. Follow DNS configuration instructions
5. Update Supabase Auth redirect URLs

---

## 🔧 Vercel Configuration

### `vercel.json`

The project includes `vercel.json` for SPA routing:

```json
{
  "version": 2,
  "buildCommand": "cd frontend && npm install && npm run build",
  "outputDirectory": "frontend/dist",
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

**What it does**:
- Configures build process
- Sets output directory
- Enables SPA routing (fixes 404 errors)

### Build Settings

**Automatic Detection**:
- Vercel auto-detects Vite projects
- Sets correct build commands
- Configures output directory

**Manual Override** (if needed):
- Root Directory: `frontend`
- Build Command: `npm run build`
- Output Directory: `dist`
- Install Command: `npm install`

---

## 🐛 Troubleshooting

### Issue: 404 Error on Routes

**Symptoms**: Homepage works, but other routes show 404.

**Solution**:
- ✅ `vercel.json` should have rewrites configured
- Check that `vercel.json` is in root directory
- Redeploy after adding `vercel.json`

### Issue: Build Fails

**Symptoms**: Deployment fails during build.

**Solutions**:
1. **Check build logs** in Vercel dashboard
2. **Common causes**:
   - TypeScript errors
   - Missing dependencies
   - Environment variables not set
3. **Fix locally first**:
   ```bash
   cd frontend
   npm install
   npm run build
   ```
4. **Fix errors** and push again

### Issue: Blank Page

**Symptoms**: Page loads but shows blank screen.

**Solutions**:
1. **Check browser console** for errors
2. **Verify environment variables** are set correctly
3. **Check Supabase connection**:
   - Verify URL is correct
   - Verify anon key is correct
   - Check Supabase project is active
4. **Check network tab** for failed requests

### Issue: Environment Variables Not Working

**Symptoms**: App can't connect to Supabase.

**Solutions**:
1. **Verify variable names**:
   - Must be `VITE_SUPABASE_URL` (not `SUPABASE_URL`)
   - Must be `VITE_SUPABASE_ANON_KEY` (not `SUPABASE_ANON_KEY`)
2. **Check environments**:
   - Variables must be set for Production environment
   - Or set for all environments
3. **Redeploy** after adding variables:
   - Vercel needs to rebuild with new variables

### Issue: CORS Errors

**Symptoms**: Browser console shows CORS errors.

**Solutions**:
1. **Check Supabase settings**:
   - Go to Settings → API
   - Verify allowed origins
   - Add your Vercel domain
2. **Check redirect URLs**:
   - Authentication → URL Configuration
   - Add your domain to allowed URLs

### Issue: Database Connection Errors

**Symptoms**: "Failed to fetch" or network errors.

**Solutions**:
1. **Verify Supabase URL**:
   - Should be `https://xxxxx.supabase.co`
   - No trailing slash
2. **Verify anon key**:
   - Should start with `eyJhbGci...`
   - Full key copied correctly
3. **Check Supabase project**:
   - Project is not paused
   - Project is active and running

---

## 📊 Monitoring

### Vercel Analytics

1. Enable in Vercel dashboard
2. View:
   - Page views
   - Performance metrics
   - Error rates
   - User locations

### Supabase Monitoring

1. Go to Supabase Dashboard
2. View:
   - Database performance
   - API usage
   - Auth activity
   - Storage usage

### Error Tracking

**Browser Console**:
- Check for JavaScript errors
- Check for network errors
- Check for authentication errors

**Vercel Logs**:
- View build logs
- View runtime logs
- View function logs

---

## 🔄 Updates & Maintenance

### Updating Deployment

1. **Push changes to GitHub**:
   ```bash
   git add .
   git commit -m "Update description"
   git push
   ```

2. **Vercel auto-deploys**:
   - Detects push to main branch
   - Triggers new deployment
   - Builds and deploys automatically

3. **Monitor deployment**:
   - Check Vercel dashboard
   - Verify build succeeds
   - Test new features

### Manual Deployment

1. Go to Vercel dashboard
2. Select project
3. Click **"Redeploy"**
4. Select deployment to redeploy
5. Or trigger new deployment

### Rollback

1. Go to Vercel dashboard
2. Select project → **Deployments**
3. Find previous working deployment
4. Click **"..."** → **"Promote to Production"**

---

## ✅ Deployment Checklist

**Before Deployment**:
- [ ] Code pushed to GitHub
- [ ] Database schema run in Supabase
- [ ] Environment variables ready
- [ ] Build passes locally
- [ ] No TypeScript errors
- [ ] All tests pass (if applicable)

**During Deployment**:
- [ ] Repository connected to Vercel
- [ ] Environment variables set
- [ ] Build configuration correct
- [ ] Build succeeds
- [ ] Deployment completes

**After Deployment**:
- [ ] Application loads correctly
- [ ] Can login
- [ ] All pages accessible
- [ ] Database connection works
- [ ] No console errors
- [ ] First user created
- [ ] Test all features

---

## 📚 Additional Resources

- [Vercel Documentation](https://vercel.com/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [Vite Deployment Guide](https://vitejs.dev/guide/static-deploy.html)
- [Troubleshooting Guide](./10_Troubleshooting.md)

---

**Last Updated**: January 2026

