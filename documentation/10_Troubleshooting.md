# Troubleshooting Guide

Common issues and solutions for FULLLANDDEV.

---

## 📋 Table of Contents

1. [Setup Issues](#setup-issues)
2. [Authentication Issues](#authentication-issues)
3. [Database Issues](#database-issues)
4. [Deployment Issues](#deployment-issues)
5. [Performance Issues](#performance-issues)
6. [UI/UX Issues](#uiux-issues)

---

## 🛠️ Setup Issues

### Issue: "Missing Supabase environment variables"

**Symptoms**: 
- Error message on app load
- Cannot connect to database

**Solutions**:
1. Check `.env` file exists in `frontend` folder
2. Verify variable names:
   - `VITE_SUPABASE_URL` (not `SUPABASE_URL`)
   - `VITE_SUPABASE_ANON_KEY` (not `SUPABASE_ANON_KEY`)
3. Restart development server after creating `.env`
4. Verify values are correct (no extra spaces)

**Check**:
```bash
# In frontend folder
cat .env
# Should show:
# VITE_SUPABASE_URL=https://...
# VITE_SUPABASE_ANON_KEY=eyJ...
```

---

### Issue: "Failed to fetch" or Network Errors

**Symptoms**:
- Blank page
- Console shows network errors
- Cannot load data

**Solutions**:
1. **Verify Supabase URL**:
   - Should be `https://xxxxx.supabase.co`
   - No trailing slash
   - Check in Supabase Dashboard → Settings → API

2. **Verify Anon Key**:
   - Should start with `eyJhbGci...`
   - Full key copied correctly
   - Check in Supabase Dashboard → Settings → API

3. **Check Supabase Project**:
   - Project is not paused
   - Project is active
   - Check project status in dashboard

4. **Check Network**:
   - Internet connection working
   - No firewall blocking
   - Try in different browser

5. **Check CORS**:
   - Add your domain to Supabase allowed origins
   - Settings → API → CORS

---

### Issue: Dependencies Installation Fails

**Symptoms**:
- `npm install` fails
- Package errors
- Missing modules

**Solutions**:
1. **Clear Cache**:
   ```bash
   npm cache clean --force
   rm -rf node_modules package-lock.json
   npm install
   ```

2. **Check Node Version**:
   ```bash
   node --version
   # Should be 18 or higher
   ```

3. **Use Correct Package Manager**:
   - If using npm, use `npm install`
   - If using yarn, use `yarn install`
   - Don't mix package managers

4. **Check Internet Connection**:
   - npm registry accessible
   - No proxy issues

---

## 🔐 Authentication Issues

### Issue: Cannot Login

**Symptoms**:
- Login fails
- "Invalid credentials" error
- Account locked

**Solutions**:
1. **Verify User Exists**:
   - Check Supabase Dashboard → Authentication → Users
   - User exists and is confirmed

2. **Check User in Database**:
   - Go to Table Editor → `users` table
   - User record exists
   - `id` matches Auth user ID
   - `status` is "Active"

3. **Check Account Lockout**:
   - Account locked after 5 failed attempts
   - Wait 15 minutes
   - Or clear lockout in code (development only)

4. **Verify Password**:
   - Password is correct
   - No extra spaces
   - Case sensitive

5. **Check Email**:
   - Email matches exactly
   - No typos
   - Case sensitive

---

### Issue: "User not found" After Login

**Symptoms**:
- Login succeeds but user not found
- Cannot access app
- Redirects to login

**Solutions**:
1. **Check User Record**:
   - User exists in `users` table
   - `id` matches Auth user ID exactly
   - `role` and `status` are set

2. **Create User Record**:
   ```sql
   INSERT INTO users (id, name, email, role, status)
   VALUES (
     'auth-user-id-here',
     'User Name',
     'user@example.com',
     'Owner',
     'Active'
   );
   ```

3. **Verify Auth User ID**:
   - Get from Supabase Dashboard → Authentication → Users
   - Copy exact UUID
   - Use in `users` table

---

### Issue: Session Expires Too Quickly

**Symptoms**:
- Logged out frequently
- Session timeout too short

**Solutions**:
1. **Check Session Timeout**:
   - Default: 24 hours
   - Check `AuthContext.tsx` for `SESSION_TIMEOUT_MS`

2. **Check Inactivity Timeout**:
   - Default: 30 minutes
   - Check `AuthContext.tsx` for `INACTIVITY_TIMEOUT_MS`

3. **User Activity**:
   - Move mouse, type, scroll to reset timer
   - Timer resets on any activity

---

## 🗄️ Database Issues

### Issue: "Relation does not exist"

**Symptoms**:
- Table not found error
- Cannot query table

**Solutions**:
1. **Check Table Exists**:
   - Go to Supabase Dashboard → Table Editor
   - Verify table exists

2. **Run Schema**:
   - Run `supabase_schema.sql` in SQL Editor
   - Verify all tables created

3. **Check Table Name**:
   - Table name is correct (case-sensitive)
   - No typos in query

---

### Issue: "Permission denied" or RLS Error

**Symptoms**:
- Cannot access data
- RLS policy error
- "Permission denied" message

**Solutions**:
1. **Check User Role**:
   - User has correct role
   - Role has required permissions

2. **Check RLS Policies**:
   - RLS enabled on table
   - Policy allows user's role
   - Policy conditions are correct

3. **Test as Owner**:
   - Login as Owner role
   - If works, it's a permission issue
   - Check role permissions

4. **Check Policy**:
   ```sql
   -- View policies
   SELECT * FROM pg_policies 
   WHERE tablename = 'table_name';
   ```

---

### Issue: Data Not Saving

**Symptoms**:
- Insert/update fails
- No error but data not saved
- Validation errors

**Solutions**:
1. **Check Required Fields**:
   - All required fields provided
   - No NULL values for NOT NULL columns

2. **Check Data Types**:
   - Data types match column types
   - Dates in correct format
   - Numbers are numbers

3. **Check Constraints**:
   - Unique constraints not violated
   - Foreign keys exist
   - Check constraints satisfied

4. **Check Error Message**:
   - Read error message carefully
   - Check console for details
   - Verify in Supabase logs

---

### Issue: Foreign Key Constraint Violation

**Symptoms**:
- Cannot delete record
- "Foreign key constraint" error

**Solutions**:
1. **Check Child Records**:
   - Child records exist
   - Must delete children first

2. **Delete Order**:
   ```typescript
   // Delete children first
   await supabase.from('child_table').delete().eq('parent_id', id)
   // Then delete parent
   await supabase.from('parent_table').delete().eq('id', id)
   ```

3. **Use CASCADE** (if appropriate):
   - Some tables have CASCADE DELETE
   - Check schema for CASCADE options

---

## 🚀 Deployment Issues

### Issue: 404 Error on Routes

**Symptoms**:
- Homepage works
- Other routes show 404
- Vercel deployment issue

**Solutions**:
1. **Check `vercel.json`**:
   - File exists in root directory
   - Contains rewrites configuration
   - Rewrites redirect to `/index.html`

2. **Verify Configuration**:
   ```json
   {
     "rewrites": [
       {
         "source": "/(.*)",
         "destination": "/index.html"
       }
     ]
   }
   ```

3. **Redeploy**:
   - Push `vercel.json` to repository
   - Trigger new deployment
   - Clear Vercel cache

---

### Issue: Build Fails on Vercel

**Symptoms**:
- Deployment fails
- Build errors
- TypeScript errors

**Solutions**:
1. **Test Locally**:
   ```bash
   cd frontend
   npm install
   npm run build
   ```
   - Fix any errors locally first

2. **Check Build Logs**:
   - View logs in Vercel dashboard
   - Identify specific error
   - Fix and redeploy

3. **Common Issues**:
   - TypeScript errors
   - Missing dependencies
   - Environment variables not set
   - Import errors

---

### Issue: Environment Variables Not Working

**Symptoms**:
- App can't connect to Supabase
- Variables not found

**Solutions**:
1. **Verify Names**:
   - Must be `VITE_SUPABASE_URL` (not `SUPABASE_URL`)
   - Must be `VITE_SUPABASE_ANON_KEY`
   - Case-sensitive

2. **Check Environments**:
   - Set for Production environment
   - Or set for all environments

3. **Redeploy**:
   - Variables added after deployment
   - Need to redeploy to take effect

---

## ⚡ Performance Issues

### Issue: Slow Page Load

**Symptoms**:
- Pages load slowly
- Long wait times

**Solutions**:
1. **Check Network**:
   - Internet connection speed
   - Supabase region (should be close)

2. **Optimize Queries**:
   - Use specific columns (not `*`)
   - Add indexes
   - Limit results

3. **Check Data Size**:
   - Large datasets slow queries
   - Add pagination
   - Filter results

---

### Issue: Too Many Requests

**Symptoms**:
- Rate limiting errors
- Slow performance

**Solutions**:
1. **Debounce Search**:
   - Use debounce for search inputs
   - Don't query on every keystroke

2. **Cache Data**:
   - Cache frequently accessed data
   - Use React state effectively

3. **Batch Operations**:
   - Combine multiple queries
   - Use transactions where possible

---

## 🎨 UI/UX Issues

### Issue: Mobile Not Responsive

**Symptoms**:
- Layout broken on mobile
- Text too small/large
- Buttons not clickable

**Solutions**:
1. **Check Tailwind Classes**:
   - Use responsive classes: `sm:`, `md:`, `lg:`
   - Example: `flex-col sm:flex-row`

2. **Test on Device**:
   - Test on actual device
   - Use browser DevTools mobile view
   - Check different screen sizes

3. **Common Fixes**:
   - Add `overflow-x-auto` for tables
   - Use `w-full sm:w-auto` for widths
   - Use `grid-cols-1 sm:grid-cols-2` for grids

---

### Issue: RTL (Right-to-Left) Issues

**Symptoms**:
- Text alignment wrong
- Layout reversed incorrectly

**Solutions**:
1. **Check HTML**:
   ```html
   <html lang="ar" dir="rtl">
   ```

2. **Check CSS**:
   - Use Tailwind RTL classes if needed
   - Check text alignment

3. **Test in Browser**:
   - Verify RTL rendering
   - Check text direction

---

### Issue: Styling Not Applied

**Symptoms**:
- Tailwind classes not working
- Styles missing

**Solutions**:
1. **Check Tailwind Config**:
   - Config file exists
   - Content paths correct

2. **Rebuild**:
   ```bash
   npm run dev
   # Or
   npm run build
   ```

3. **Check Import**:
   - `index.css` imported in `main.tsx`
   - Tailwind directives present

---

## 🔍 Debugging Tips

### Check Browser Console

1. Open DevTools (F12)
2. Check Console tab for errors
3. Check Network tab for failed requests
4. Check Application tab for storage

### Check Supabase Dashboard

1. Go to SQL Editor
2. Run queries directly
3. Check Table Editor for data
4. Check Logs for errors

### Check Vercel Logs

1. Go to Vercel dashboard
2. Select project
3. View deployment logs
4. Check function logs

---

## 📞 Getting Help

### Before Asking for Help

1. **Check Documentation**:
   - Read relevant guide
   - Check troubleshooting section

2. **Search Issues**:
   - Search for similar issues
   - Check GitHub issues (if applicable)

3. **Gather Information**:
   - Error messages
   - Steps to reproduce
   - Browser/OS version
   - Console logs

### Useful Information to Provide

- Error message (full text)
- Steps to reproduce
- Expected vs. actual behavior
- Browser and OS
- Console logs
- Network errors

---

## 📚 Additional Resources

- [Getting Started Guide](./01_Getting_Started.md)
- [User Guide](./02_User_Guide.md)
- [Development Guide](./08_Development.md)
- [Deployment Guide](./07_Deployment.md)
- [Supabase Documentation](https://supabase.com/docs)
- [Vercel Documentation](https://vercel.com/docs)

---

**Last Updated**: January 2026

