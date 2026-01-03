# Getting Started Guide

Complete setup and installation instructions for FULLLANDDEV.

---

## 📋 Prerequisites

Before you begin, ensure you have:

- **Node.js** 18 or higher ([Download](https://nodejs.org/))
- **npm** or **yarn** package manager
- **Supabase Account** ([Sign up](https://supabase.com))
- **Git** (for version control)
- **Code Editor** (VS Code recommended)

---

## 🚀 Step-by-Step Setup

### Step 1: Clone or Download the Project

```bash
# If using Git
git clone https://github.com/NEXESMISSION/fulldevland.git
cd fulldevland

# Or download and extract the ZIP file
```

### Step 2: Set Up Supabase Database

#### 2.1 Create Supabase Project

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Click **"New Project"**
3. Fill in:
   - **Name**: Your project name
   - **Database Password**: Choose a strong password (save it!)
   - **Region**: Choose closest to your users
4. Click **"Create new project"**
5. Wait for project to initialize (2-3 minutes)

#### 2.2 Get Your Supabase Credentials

1. In your Supabase project dashboard
2. Go to **Settings** → **API**
3. Copy:
   - **Project URL** (e.g., `https://xxxxx.supabase.co`)
   - **anon/public key** (starts with `eyJhbGci...`)

#### 2.3 Run Database Schema

1. In Supabase dashboard, go to **SQL Editor**
2. Click **"New query"**
3. Open `supabase_schema.sql` from the project root
4. Copy and paste the entire content
5. Click **"Run"** (or press `Ctrl+Enter`)
6. Wait for execution to complete (should show "Success")

#### 2.4 Run Security Enhancements

1. In SQL Editor, create a new query
2. Open `security_database_fixes.sql`
3. Copy and paste the content
4. Click **"Run"**

#### 2.5 (Optional) Set Up Debt Management

If you need debt management features:

1. Run `create_debts_table.sql`
2. Run `add_debt_payments_table.sql`

#### 2.6 (Optional) Add Login Tracking

For enhanced security:

1. Run `add_login_attempts_tracking.sql`

**✅ Database Setup Complete!**

---

### Step 3: Configure Environment Variables

#### 3.1 Create Environment File

```bash
cd frontend
```

Create a `.env` file in the `frontend` folder:

```bash
# Windows (PowerShell)
New-Item .env

# Mac/Linux
touch .env
```

#### 3.2 Add Your Credentials

Open `.env` and add:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

Replace with your actual values from Step 2.2.

**⚠️ Important**: Never commit `.env` to Git! It's already in `.gitignore`.

---

### Step 4: Install Dependencies

```bash
# Make sure you're in the frontend directory
cd frontend

# Install all packages
npm install
```

This will install:
- React and React DOM
- TypeScript
- Vite
- Tailwind CSS
- Supabase client
- React Router
- And all other dependencies

**Expected time**: 1-3 minutes depending on internet speed.

---

### Step 5: Create Your First User

#### 5.1 Create Auth User

1. In Supabase dashboard, go to **Authentication** → **Users**
2. Click **"Add user"** → **"Create new user"**
3. Enter:
   - **Email**: `admin@example.com` (or your email)
   - **Password**: Choose a strong password
   - **Auto Confirm User**: ✅ Check this
4. Click **"Create user"**
5. **Copy the User ID** (UUID) - you'll need it in the next step

#### 5.2 Add User to Database

1. Go to **Table Editor** → **users** table
2. Click **"Insert row"**
3. Fill in:
   - **id**: Paste the User ID from step 5.1
   - **name**: Your name (e.g., "Admin User")
   - **email**: Same email as step 5.1
   - **role**: Select `Owner` (for full access)
   - **status**: Select `Active`
4. Click **"Save"**

**✅ User Created!**

---

### Step 6: Run Development Server

```bash
# Make sure you're in the frontend directory
cd frontend

# Start development server
npm run dev
```

You should see:
```
  VITE v7.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

#### 6.1 Open in Browser

1. Open your browser
2. Go to `http://localhost:5173`
3. You should see the login page

#### 6.2 Login

1. Enter the email and password from Step 5.1
2. Click **"تسجيل الدخول"** (Login)
3. You should be redirected to the dashboard

**🎉 Setup Complete!**

---

## ✅ Verification Checklist

After setup, verify everything works:

- [ ] Database schema created successfully
- [ ] Environment variables set correctly
- [ ] Dependencies installed without errors
- [ ] Development server starts without errors
- [ ] Can login with created user
- [ ] Dashboard loads correctly
- [ ] Can navigate between pages

---

## 🐛 Troubleshooting

### Issue: "Missing Supabase environment variables"

**Solution**: 
- Check `.env` file exists in `frontend` folder
- Verify variable names are exactly: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- Restart development server after creating `.env`

### Issue: "Failed to fetch" or network errors

**Solution**:
- Verify Supabase URL is correct (no trailing slash)
- Check Supabase project is active (not paused)
- Verify anon key is correct
- Check browser console for detailed errors

### Issue: "User not found" after login

**Solution**:
- Verify user exists in `users` table
- Check `id` in `users` table matches Auth user ID
- Verify `role` and `status` are set correctly

### Issue: Database errors when running SQL

**Solution**:
- Run scripts one at a time
- Check for error messages in SQL Editor
- Verify you're running scripts in correct order
- Check if tables already exist (may need to drop first)

### Issue: Port 5173 already in use

**Solution**:
```bash
# Kill process using port 5173
# Windows
netstat -ano | findstr :5173
taskkill /PID <PID> /F

# Mac/Linux
lsof -ti:5173 | xargs kill
```

Or use a different port:
```bash
npm run dev -- --port 3000
```

---

## 📚 Next Steps

Now that setup is complete:

1. **Read User Guide**: [02_User_Guide.md](./02_User_Guide.md)
2. **Explore Features**: Try creating land batches, clients, and sales
3. **Check Admin Guide**: [03_Admin_Guide.md](./03_Admin_Guide.md) if you're an admin
4. **Review Security**: [06_Security.md](./06_Security.md) for security best practices

---

## 🔧 Development Commands

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Run linter
npm run lint
```

---

## 📞 Need Help?

- Check [10_Troubleshooting.md](./10_Troubleshooting.md) for common issues
- Review [08_Development.md](./08_Development.md) for development details
- Check Supabase documentation: https://supabase.com/docs

---

**Last Updated**: January 2026

