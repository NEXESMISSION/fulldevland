# API Reference

Database queries and API patterns for FULLLANDDEV.

---

## 📋 Table of Contents

1. [Supabase Client Setup](#supabase-client-setup)
2. [Common Query Patterns](#common-query-patterns)
3. [Table-Specific Queries](#table-specific-queries)
4. [Advanced Queries](#advanced-queries)
5. [Error Handling](#error-handling)

---

## 🔧 Supabase Client Setup

### Import

```typescript
import { supabase } from '@/lib/supabase'
```

### Client Configuration

Located in `frontend/src/lib/supabase.ts`:

```typescript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

---

## 🔍 Common Query Patterns

### Select (Read)

**Basic Select**:
```typescript
const { data, error } = await supabase
  .from('table_name')
  .select('*')
```

**Select Specific Columns**:
```typescript
const { data, error } = await supabase
  .from('table_name')
  .select('column1, column2, column3')
```

**With Filter**:
```typescript
const { data, error } = await supabase
  .from('table_name')
  .select('*')
  .eq('column', value)
```

**With Multiple Filters**:
```typescript
const { data, error } = await supabase
  .from('table_name')
  .select('*')
  .eq('column1', value1)
  .neq('column2', value2)
  .gt('column3', value3)
```

**With Ordering**:
```typescript
const { data, error } = await supabase
  .from('table_name')
  .select('*')
  .order('created_at', { ascending: false })
```

**With Limit**:
```typescript
const { data, error } = await supabase
  .from('table_name')
  .select('*')
  .limit(10)
```

**Single Record**:
```typescript
const { data, error } = await supabase
  .from('table_name')
  .select('*')
  .eq('id', id)
  .single()
```

### Insert (Create)

**Single Record**:
```typescript
const { data, error } = await supabase
  .from('table_name')
  .insert([{
    column1: value1,
    column2: value2
  }])
  .select()
```

**Multiple Records**:
```typescript
const { data, error } = await supabase
  .from('table_name')
  .insert([
    { column1: value1, column2: value2 },
    { column1: value3, column2: value4 }
  ])
  .select()
```

### Update

**Single Record**:
```typescript
const { data, error } = await supabase
  .from('table_name')
  .update({ column: newValue })
  .eq('id', id)
  .select()
```

**Multiple Records**:
```typescript
const { data, error } = await supabase
  .from('table_name')
  .update({ column: newValue })
  .in('id', [id1, id2, id3])
  .select()
```

### Delete

**Single Record**:
```typescript
const { error } = await supabase
  .from('table_name')
  .delete()
  .eq('id', id)
```

**Multiple Records**:
```typescript
const { error } = await supabase
  .from('table_name')
  .delete()
  .in('id', [id1, id2, id3])
```

---

## 📊 Table-Specific Queries

### Users

**Get Current User Profile**:
```typescript
const { data, error } = await supabase
  .from('users')
  .select('id, name, email, role, status, created_at, updated_at')
  .eq('id', userId)
  .single()
```

**Get All Users**:
```typescript
const { data, error } = await supabase
  .from('users')
  .select('id, name, email, role, status, created_at, updated_at')
  .order('name', { ascending: true })
```

### Land Batches

**Get All Batches**:
```typescript
const { data, error } = await supabase
  .from('land_batches')
  .select('*, land_pieces(*)')
  .order('created_at', { ascending: false })
```

**Get Batch with Pieces**:
```typescript
const { data, error } = await supabase
  .from('land_batches')
  .select('*, land_pieces(*)')
  .eq('id', batchId)
  .single()
```

**Create Batch**:
```typescript
const { data, error } = await supabase
  .from('land_batches')
  .insert([{
    name: 'Batch Name',
    total_surface: 10000,
    total_cost: 50000,
    date_acquired: '2026-01-15',
    real_estate_tax_number: '12345',
    notes: 'Notes here',
    created_by: userId
  }])
  .select()
```

### Land Pieces

**Get Available Pieces**:
```typescript
const { data, error } = await supabase
  .from('land_pieces')
  .select('*')
  .eq('status', 'Available')
  .order('piece_number')
```

**Get Pieces by Batch**:
```typescript
const { data, error } = await supabase
  .from('land_pieces')
  .select('*')
  .eq('land_batch_id', batchId)
  .order('piece_number')
```

**Update Piece Status**:
```typescript
const { data, error } = await supabase
  .from('land_pieces')
  .update({ status: 'Sold' })
  .eq('id', pieceId)
  .select()
```

### Clients

**Get All Clients**:
```typescript
const { data, error } = await supabase
  .from('clients')
  .select('*')
  .order('name', { ascending: true })
```

**Search Clients**:
```typescript
const { data, error } = await supabase
  .from('clients')
  .select('*')
  .or(`name.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%,cin.ilike.%${searchTerm}%`)
  .order('name')
```

**Create Client**:
```typescript
const { data, error } = await supabase
  .from('clients')
  .insert([{
    name: 'Client Name',
    cin: '12345678',
    phone: '+21612345678',
    email: 'client@example.com',
    address: 'Address here',
    created_by: userId
  }])
  .select()
```

### Sales

**Get All Sales**:
```typescript
const { data, error } = await supabase
  .from('sales')
  .select('*, clients(*), land_pieces(*)')
  .order('sale_date', { ascending: false })
```

**Get Sale with Details**:
```typescript
const { data, error } = await supabase
  .from('sales')
  .select(`
    *,
    clients(*),
    land_pieces(*),
    installments(*),
    payment_records(*)
  `)
  .eq('id', saleId)
  .single()
```

**Create Sale**:
```typescript
const { data, error } = await supabase
  .from('sales')
  .insert([{
    client_id: clientId,
    land_piece_ids: [pieceId1, pieceId2],
    payment_type: 'Installment',
    total_price: 100000,
    total_cost: 50000,
    profit: 50000,
    sale_date: '2026-01-15',
    number_of_installments: 12,
    monthly_installment_amount: 5000,
    installment_start_date: '2026-02-01',
    created_by: userId
  }])
  .select()
```

### Installments

**Get Installments by Sale**:
```typescript
const { data, error } = await supabase
  .from('installments')
  .select('*')
  .eq('sale_id', saleId)
  .order('installment_number', { ascending: true })
```

**Get Overdue Installments**:
```typescript
const { data, error } = await supabase
  .from('installments')
  .select('*, sales(*, clients(*))')
  .lt('due_date', new Date().toISOString().split('T')[0])
  .neq('status', 'Paid')
  .order('due_date', { ascending: true })
```

**Update Installment Status**:
```typescript
const { data, error } = await supabase
  .from('installments')
  .update({ 
    status: 'Paid',
    paid_amount: amount
  })
  .eq('id', installmentId)
  .select()
```

### Payment Records

**Get Payments by Sale**:
```typescript
const { data, error } = await supabase
  .from('payment_records')
  .select('*')
  .eq('sale_id', saleId)
  .order('payment_date', { ascending: false })
```

**Record Payment**:
```typescript
const { data, error } = await supabase
  .from('payment_records')
  .insert([{
    sale_id: saleId,
    installment_id: installmentId, // nullable
    payment_type: 'Installment',
    amount: 5000,
    payment_date: '2026-01-15',
    notes: 'Payment notes',
    created_by: userId
  }])
  .select()
```

---

## 🔥 Advanced Queries

### Joins (Using Select)

**Multiple Tables**:
```typescript
const { data, error } = await supabase
  .from('sales')
  .select(`
    *,
    clients(*),
    land_pieces(*),
    installments(*)
  `)
```

### Filtering

**Equals**:
```typescript
.eq('column', value)
```

**Not Equals**:
```typescript
.neq('column', value)
```

**Greater Than**:
```typescript
.gt('column', value)
```

**Less Than**:
```typescript
.lt('column', value)
```

**Greater Than or Equal**:
```typescript
.gte('column', value)
```

**Less Than or Equal**:
```typescript
.lte('column', value)
```

**In Array**:
```typescript
.in('column', [value1, value2, value3])
```

**Contains**:
```typescript
.contains('column', value) // For arrays
```

**Text Search (Case Insensitive)**:
```typescript
.ilike('column', `%${searchTerm}%`)
```

**Or Condition**:
```typescript
.or('column1.eq.value1,column2.eq.value2')
```

**Is Null**:
```typescript
.is('column', null)
```

**Is Not Null**:
```typescript
.not('column', 'is', null)
```

### Aggregations

**Count**:
```typescript
const { count, error } = await supabase
  .from('table_name')
  .select('*', { count: 'exact', head: true })
```

**Sum** (using RPC or client-side):
```typescript
// Client-side calculation
const { data } = await supabase
  .from('table_name')
  .select('amount')

const sum = data?.reduce((acc, row) => acc + row.amount, 0) || 0
```

### Pagination

**Offset Pagination**:
```typescript
const pageSize = 10
const page = 1
const from = (page - 1) * pageSize
const to = from + pageSize - 1

const { data, error } = await supabase
  .from('table_name')
  .select('*')
  .range(from, to)
  .order('created_at', { ascending: false })
```

---

## ⚠️ Error Handling

### Standard Pattern

```typescript
const { data, error } = await supabase
  .from('table_name')
  .select('*')

if (error) {
  console.error('Error:', error)
  // Handle error (show message, etc.)
  return
}

// Use data
console.log(data)
```

### Error Types

**Network Error**:
```typescript
if (error?.code === 'PGRST116') {
  // No rows returned
}
```

**RLS Error**:
```typescript
if (error?.code === '42501') {
  // Permission denied
}
```

**Validation Error**:
```typescript
if (error?.code === '23505') {
  // Unique constraint violation
}
```

### Generic Error Handling

```typescript
async function fetchData() {
  try {
    const { data, error } = await supabase
      .from('table_name')
      .select('*')
    
    if (error) {
      throw error
    }
    
    return { data, error: null }
  } catch (err) {
    console.error('Unexpected error:', err)
    return { data: null, error: err }
  }
}
```

---

## 🔐 Authentication Queries

### Sign In

```typescript
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'password'
})
```

### Sign Out

```typescript
const { error } = await supabase.auth.signOut()
```

### Get Session

```typescript
const { data: { session } } = await supabase.auth.getSession()
```

### Get Current User

```typescript
const { data: { user } } = await supabase.auth.getUser()
```

---

## 📝 Best Practices

1. **Always Check Errors**:
   ```typescript
   if (error) {
     // Handle error
     return
   }
   ```

2. **Use Specific Column Selection**:
   ```typescript
   // Good
   .select('id, name, email')
   
   // Avoid (unless necessary)
   .select('*')
   ```

3. **Handle Loading States**:
   ```typescript
   const [loading, setLoading] = useState(true)
   // ... fetch data
   setLoading(false)
   ```

4. **Use TypeScript Types**:
   ```typescript
   const { data, error } = await supabase
     .from('users')
     .select('*')
     .single()
   
   const user: User = data
   ```

5. **Sanitize Inputs**:
   ```typescript
   const sanitized = sanitizeText(userInput)
   ```

---

## 📚 Additional Resources

- [Supabase JavaScript Client](https://supabase.com/docs/reference/javascript/introduction)
- [PostgREST API](https://postgrest.org/en/stable/api.html)
- [Database Schema](./04_Database_Schema.md)

---

**Last Updated**: January 2026

