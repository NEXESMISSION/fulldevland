# Admin Guide

Complete guide for administrators managing the FULLLANDDEV system.

---

## 👤 User Roles & Permissions

### Role Hierarchy

1. **Owner** - Full system access
2. **Manager** - Operational management
3. **FieldStaff** - Limited field operations

### Detailed Permissions Matrix

| Permission | Owner | Manager | FieldStaff |
|------------|-------|---------|------------|
| **Dashboard** |
| View Dashboard | ✅ | ✅ | ✅ |
| **Land Management** |
| View Land | ✅ | ✅ | ✅ |
| Edit Land | ✅ | ✅ | ❌ |
| Delete Land | ✅ | ❌ | ❌ |
| **Client Management** |
| View Clients | ✅ | ✅ | ✅ |
| Edit Clients | ✅ | ✅ | ✅ |
| Delete Clients | ✅ | ❌ | ❌ |
| **Sales Management** |
| View Sales | ✅ | ✅ | ✅ |
| Create Sales | ✅ | ✅ | ❌ |
| Edit Sales | ✅ | ✅ | ❌ |
| Edit Prices | ✅ | ❌ | ❌ |
| **Installments & Payments** |
| View Installments | ✅ | ✅ | ✅ |
| Edit Installments | ✅ | ✅ | ❌ |
| View Payments | ✅ | ✅ | ✅ |
| Record Payments | ✅ | ✅ | ✅ |
| **Financial** |
| View Financial | ✅ | ✅ | ❌ |
| View Profit | ✅ | ❌ | ❌ |
| **User Management** |
| Manage Users | ✅ | ❌ | ❌ |
| **Security** |
| View Audit Logs | ✅ | ✅ | ❌ |

---

## 🔐 User Management

### Creating Users

1. Go to **"المستخدمين"** (Users)
2. Click **"إضافة مستخدم جديد"** (Add New User)
3. Fill in required information
4. Select appropriate role
5. Save

**Important**: 
- User must exist in Supabase Auth first
- Email must match Auth email
- User ID must match Auth user ID

### User Creation Process

#### Method 1: Via Supabase Dashboard (Recommended)

1. **Create Auth User**:
   - Go to Supabase Dashboard → Authentication → Users
   - Click "Add user" → "Create new user"
   - Enter email and password
   - Check "Auto Confirm User"
   - Copy the User ID (UUID)

2. **Add to Database**:
   - Go to Table Editor → users table
   - Insert row with:
     - `id`: Auth User ID
     - `name`: User's name
     - `email`: Same as Auth email
     - `role`: Select role
     - `status`: Active

#### Method 2: Via Application (If Implemented)

1. Create user in application
2. System sends invitation email
3. User sets password via email link
4. User automatically added to database

### Managing User Roles

**Changing Roles**:
1. Edit user
2. Change role dropdown
3. Save
4. Changes take effect immediately

**Role Guidelines**:
- **Owner**: Only for business owners/administrators
- **Manager**: For operational managers who need most access
- **FieldStaff**: For field workers who only need to view and record payments

### Deactivating Users

1. Edit user
2. Change status to **"Inactive"**
3. Save
4. User cannot login while inactive

**Note**: Deactivated users' data remains in system for audit purposes.

### Reactivating Users

1. Edit inactive user
2. Change status to **"Active"**
3. Save
4. User can login again

---

## 🔒 Security Management

### Audit Logs

View all system activities:

1. Go to **"الأمان"** (Security)
2. View audit logs table
3. Filter by:
   - User
   - Action type
   - Date range
   - Table affected

**What's Logged**:
- User logins/logouts
- Data creation (land, clients, sales)
- Data updates
- Data deletions
- Payment recordings
- User management actions

### Login Attempts Tracking

Monitor login security:

1. View login attempts table
2. See:
   - Email addresses
   - Success/failure
   - Timestamps
   - IP addresses (if configured)

**Security Features**:
- **Rate Limiting**: Account lockout after 5 failed attempts
- **Lockout Duration**: 15 minutes
- **Session Timeout**: 24 hours
- **Inactivity Timeout**: 30 minutes

### Security Best Practices

1. **Regular Audit Review**:
   - Review audit logs weekly
   - Check for suspicious activity
   - Monitor failed login attempts

2. **User Account Management**:
   - Deactivate unused accounts
   - Review user permissions regularly
   - Remove users who no longer need access

3. **Password Policy**:
   - Enforce strong passwords
   - Require password changes periodically
   - Don't share passwords

4. **Access Control**:
   - Assign minimum required permissions
   - Use FieldStaff role for limited access
   - Reserve Owner role for administrators only

---

## 📊 Data Management

### Backup Recommendations

**Database Backups**:
- Supabase automatically backs up daily
- Manual backups available in Supabase dashboard
- Export data regularly for additional safety

**Backup Schedule**:
- **Daily**: Automatic (Supabase)
- **Weekly**: Manual export of critical data
- **Monthly**: Full database export

### Data Export

**Exporting Data**:

1. **Via Supabase Dashboard**:
   - Go to Database → Backups
   - Download backup file
   - Or use SQL Editor to export specific tables

2. **Via Application** (if implemented):
   - Use export features in Financial/Reports pages
   - Export to CSV/Excel

### Data Cleanup

**Regular Maintenance**:
- Remove test data
- Archive old completed sales
- Clean up cancelled reservations
- Remove inactive clients (if policy allows)

**Cleanup Scripts**:
- Use `database_cleanup.sql` for test data
- Custom scripts for specific cleanup needs

---

## ⚙️ System Configuration

### Environment Variables

**Required Variables**:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

**Where to Set**:
- **Development**: `.env` file in `frontend` folder
- **Production**: Vercel Dashboard → Settings → Environment Variables

### Database Configuration

**RLS Policies**:
- All tables have Row Level Security enabled
- Policies enforce role-based access
- Don't disable RLS without understanding implications

**Database Functions**:
- Audit logging functions
- Permission checking functions
- Data validation functions

See [04_Database_Schema.md](./04_Database_Schema.md) for details.

---

## 🚨 Troubleshooting Admin Issues

### User Cannot Login

**Check**:
1. User exists in `users` table
2. User status is "Active"
3. User ID matches Auth user ID
4. Email matches Auth email
5. Check login attempts for lockout

**Solution**:
- Verify user record in database
- Check account lockout status
- Reset password if needed
- Reactivate if deactivated

### Permission Issues

**Check**:
1. User role is correct
2. Permission exists in rolePermissions
3. RLS policies allow access
4. User status is Active

**Solution**:
- Verify role assignment
- Check permission matrix
- Review RLS policies
- Test with Owner role to isolate issue

### Data Access Issues

**Check**:
1. RLS policies are active
2. User has correct role
3. Data exists and is not deleted
4. No database connection issues

**Solution**:
- Review RLS policy for table
- Check user role permissions
- Verify data in Supabase dashboard
- Check network/connection

---

## 📈 Monitoring & Maintenance

### Regular Tasks

**Daily**:
- Check system status
- Review error logs
- Monitor active users

**Weekly**:
- Review audit logs
- Check for overdue installments
- Review user activity
- Backup critical data

**Monthly**:
- Full security audit
- User access review
- Database optimization
- Performance review

### Performance Monitoring

**Key Metrics**:
- Page load times
- Database query performance
- User activity levels
- Error rates

**Tools**:
- Supabase Dashboard analytics
- Vercel Analytics (if enabled)
- Browser DevTools
- Database query logs

---

## 🔄 Updates & Maintenance

### Updating the System

**Before Updates**:
1. Backup database
2. Test in development environment
3. Review changelog
4. Notify users of downtime

**Update Process**:
1. Pull latest code
2. Run database migrations
3. Update environment variables if needed
4. Deploy to production
5. Verify functionality
6. Monitor for issues

### Database Migrations

**Running Migrations**:
1. Review migration file
2. Test in development
3. Backup production database
4. Run migration in Supabase SQL Editor
5. Verify changes
6. Update application code if needed

See [05_SQL_Migrations.md](./05_SQL_Migrations.md) for detailed migration guide.

---

## 📞 Support & Resources

### Documentation

- [User Guide](./02_User_Guide.md) - For end users
- [Database Schema](./04_Database_Schema.md) - Database structure
- [Security Guide](./06_Security.md) - Security details
- [Troubleshooting](./10_Troubleshooting.md) - Common issues

### External Resources

- [Supabase Documentation](https://supabase.com/docs)
- [React Documentation](https://react.dev)
- [Vercel Documentation](https://vercel.com/docs)

---

## ✅ Admin Checklist

**Initial Setup**:
- [ ] Create Owner user account
- [ ] Configure environment variables
- [ ] Set up database schema
- [ ] Test all user roles
- [ ] Configure security settings
- [ ] Set up backups

**Ongoing Maintenance**:
- [ ] Review audit logs weekly
- [ ] Monitor user activity
- [ ] Check for security issues
- [ ] Update user permissions as needed
- [ ] Backup data regularly
- [ ] Keep system updated

---

**Last Updated**: January 2026

