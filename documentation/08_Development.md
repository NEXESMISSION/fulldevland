# Development Guide

Complete guide for developers working on FULLLANDDEV.

---

## 📋 Table of Contents

1. [Development Setup](#development-setup)
2. [Project Structure](#project-structure)
3. [Code Architecture](#code-architecture)
4. [Development Workflow](#development-workflow)
5. [Coding Standards](#coding-standards)
6. [Testing](#testing)
7. [Common Patterns](#common-patterns)

---

## 🛠️ Development Setup

### Prerequisites

- **Node.js** 18+ ([Download](https://nodejs.org/))
- **npm** or **yarn**
- **Git**
- **Code Editor** (VS Code recommended)
- **Supabase Account**

### Initial Setup

1. **Clone Repository**:
   ```bash
   git clone https://github.com/NEXESMISSION/fulldevland.git
   cd fulldevland
   ```

2. **Install Dependencies**:
   ```bash
   cd frontend
   npm install
   ```

3. **Set Up Environment**:
   ```bash
   # Create .env file
   cp .env.example .env  # If exists
   # Or create manually
   ```

4. **Add Environment Variables**:
   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

5. **Start Development Server**:
   ```bash
   npm run dev
   ```

6. **Open Browser**:
   - Navigate to `http://localhost:5173`

---

## 📁 Project Structure

```
FULLLANDDEV/
├── frontend/
│   ├── src/
│   │   ├── components/          # Reusable components
│   │   │   ├── layout/         # Layout components
│   │   │   │   ├── MainLayout.tsx
│   │   │   │   └── Sidebar.tsx
│   │   │   └── ui/             # UI components
│   │   │       ├── button.tsx
│   │   │       ├── card.tsx
│   │   │       ├── dialog.tsx
│   │   │       ├── input.tsx
│   │   │       └── ...
│   │   ├── contexts/           # React contexts
│   │   │   └── AuthContext.tsx  # Authentication
│   │   ├── lib/                # Utilities
│   │   │   ├── supabase.ts     # Supabase client
│   │   │   ├── sanitize.ts     # Input sanitization
│   │   │   ├── throttle.ts     # Debounce/throttle
│   │   │   ├── utils.ts        # Helper functions
│   │   │   └── translations.ts # Translations
│   │   ├── pages/              # Page components
│   │   │   ├── Dashboard.tsx
│   │   │   ├── LandManagement.tsx
│   │   │   ├── Clients.tsx
│   │   │   ├── SalesNew.tsx
│   │   │   └── ...
│   │   ├── types/              # TypeScript types
│   │   │   └── database.ts     # Database types
│   │   ├── App.tsx             # Main app component
│   │   └── main.tsx            # Entry point
│   ├── public/                 # Static assets
│   ├── index.html              # HTML template
│   ├── package.json            # Dependencies
│   ├── tsconfig.json           # TypeScript config
│   ├── vite.config.ts         # Vite config
│   └── tailwind.config.js      # Tailwind config
├── documentation/              # Documentation
├── supabase_schema.sql         # Database schema
├── *.sql                       # Migration scripts
└── vercel.json                 # Vercel config
```

---

## 🏗️ Code Architecture

### Component Structure

**Pages** (`src/pages/`):
- Main application pages
- Handle data fetching
- Manage state
- Use components from `components/`

**Components** (`src/components/`):
- Reusable UI components
- Layout components
- UI primitives (Button, Card, etc.)

**Contexts** (`src/contexts/`):
- Global state management
- Authentication context
- Shared state

**Lib** (`src/lib/`):
- Utility functions
- Supabase client
- Helper functions

### State Management

**Local State**: `useState` for component-specific state

**Global State**: React Context (`AuthContext`)

**Server State**: Direct Supabase queries (no state management library)

### Data Fetching

**Pattern**:
```typescript
const [data, setData] = useState<Type[]>([])
const [loading, setLoading] = useState(true)

useEffect(() => {
  async function fetchData() {
    const { data, error } = await supabase
      .from('table')
      .select('*')
    
    if (error) {
      console.error(error)
    } else {
      setData(data)
    }
    setLoading(false)
  }
  
  fetchData()
}, [])
```

---

## 🔄 Development Workflow

### Making Changes

1. **Create Feature Branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make Changes**:
   - Write code
   - Test locally
   - Fix errors

3. **Test**:
   ```bash
   npm run build  # Check for TypeScript errors
   npm run lint   # Check for linting errors
   ```

4. **Commit**:
   ```bash
   git add .
   git commit -m "Description of changes"
   ```

5. **Push**:
   ```bash
   git push origin feature/your-feature-name
   ```

6. **Create Pull Request** (if using GitHub)

### Development Commands

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Run linter
npm run lint

# Type check
npx tsc --noEmit
```

---

## 📝 Coding Standards

### TypeScript

**Use TypeScript** for all new code:
- Define types for all data
- Use interfaces for objects
- Avoid `any` type
- Use type inference where possible

**Example**:
```typescript
interface User {
  id: string
  name: string
  email: string
  role: UserRole
}

const user: User = {
  id: '123',
  name: 'John',
  email: 'john@example.com',
  role: 'Owner'
}
```

### Naming Conventions

**Files**:
- Components: `PascalCase.tsx` (e.g., `LandManagement.tsx`)
- Utilities: `camelCase.ts` (e.g., `sanitize.ts`)
- Types: `camelCase.ts` (e.g., `database.ts`)

**Variables**:
- `camelCase` for variables and functions
- `PascalCase` for components and types
- `UPPER_CASE` for constants

**Example**:
```typescript
const userName = 'John'
const MAX_RETRIES = 3
function getUserData() { }
const UserCard: React.FC = () => { }
```

### Component Structure

**Order of code in components**:
1. Imports
2. Types/Interfaces
3. Component function
4. State declarations
5. Effects
6. Event handlers
7. Render/return

**Example**:
```typescript
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

interface Props {
  id: string
}

export function Component({ id }: Props) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  
  useEffect(() => {
    fetchData()
  }, [id])
  
  async function fetchData() {
    // ...
  }
  
  return (
    <div>
      {/* JSX */}
    </div>
  )
}
```

### Code Formatting

**Use Prettier** (if configured):
- Automatic formatting on save
- Consistent code style

**Manual formatting**:
- 2 spaces for indentation
- Single quotes for strings (or double, be consistent)
- Semicolons (or not, be consistent)
- Trailing commas in objects/arrays

---

## 🧪 Testing

### Manual Testing

**Test Checklist**:
- [ ] Feature works as expected
- [ ] No console errors
- [ ] No TypeScript errors
- [ ] Mobile responsive
- [ ] Works in different browsers
- [ ] Handles errors gracefully

### Type Checking

```bash
# Check TypeScript errors
npx tsc --noEmit

# Or use VS Code TypeScript checker
```

### Linting

```bash
# Run linter
npm run lint

# Fix auto-fixable issues
npm run lint -- --fix
```

---

## 🔧 Common Patterns

### Supabase Queries

**Select**:
```typescript
const { data, error } = await supabase
  .from('table')
  .select('column1, column2')
  .eq('column', value)
  .order('created_at', { ascending: false })
```

**Insert**:
```typescript
const { data, error } = await supabase
  .from('table')
  .insert([{ column1: value1, column2: value2 }])
  .select()
```

**Update**:
```typescript
const { data, error } = await supabase
  .from('table')
  .update({ column: newValue })
  .eq('id', id)
  .select()
```

**Delete**:
```typescript
const { error } = await supabase
  .from('table')
  .delete()
  .eq('id', id)
```

### Input Sanitization

**Always sanitize user input**:
```typescript
import { sanitizeText, sanitizePhone, sanitizeCIN } from '@/lib/sanitize'

const name = sanitizeText(userInput)
const phone = sanitizePhone(userInput)
const cin = sanitizeCIN(userInput)
```

### Error Handling

**Pattern**:
```typescript
try {
  const { data, error } = await supabase.from('table').select()
  
  if (error) {
    console.error('Error:', error)
    setError('خطأ في تحميل البيانات')
    return
  }
  
  setData(data)
} catch (err) {
  console.error('Unexpected error:', err)
  setError('حدث خطأ غير متوقع')
}
```

### Loading States

**Pattern**:
```typescript
const [loading, setLoading] = useState(true)

useEffect(() => {
  async function load() {
    setLoading(true)
    // ... fetch data
    setLoading(false)
  }
  load()
}, [])

if (loading) {
  return <div>Loading...</div>
}
```

### Debouncing

**For search inputs**:
```typescript
import { debounce } from '@/lib/throttle'

const [searchTerm, setSearchTerm] = useState('')
const [debouncedSearch, setDebouncedSearch] = useState('')

const debouncedFn = useCallback(
  debounce((value: string) => {
    setDebouncedSearch(value)
  }, 300),
  []
)

useEffect(() => {
  debouncedFn(searchTerm)
}, [searchTerm, debouncedFn])
```

### Permission Checks

**Using AuthContext**:
```typescript
import { useAuth } from '@/contexts/AuthContext'

function Component() {
  const { hasPermission } = useAuth()
  
  if (!hasPermission('edit_land')) {
    return <div>لا تملك صلاحية للوصول</div>
  }
  
  return <div>Content</div>
}
```

---

## 🐛 Debugging

### Browser DevTools

**Console**:
- Check for errors
- Log values: `console.log(data)`
- Check network requests

**React DevTools**:
- Inspect component state
- Check props
- Profile performance

### Supabase Dashboard

**SQL Editor**:
- Run queries directly
- Check data
- Test RLS policies

**Table Editor**:
- View table data
- Edit records
- Check relationships

**Logs**:
- View API logs
- Check errors
- Monitor performance

---

## 📚 Key Libraries

### React 19
- UI framework
- Hooks for state management
- Component-based architecture

### TypeScript
- Type safety
- Better IDE support
- Catch errors early

### Vite
- Build tool
- Fast development server
- Optimized production builds

### Tailwind CSS
- Utility-first CSS
- Responsive design
- Custom components

### Supabase
- Backend as a Service
- Database (PostgreSQL)
- Authentication
- Real-time (if used)

### React Router
- Client-side routing
- Navigation
- Protected routes

---

## 🔍 Code Examples

### Creating a New Page

```typescript
// src/pages/NewPage.tsx
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardContent } from '@/components/ui/card'

export function NewPage() {
  const { hasPermission } = useAuth()
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  
  useEffect(() => {
    fetchData()
  }, [])
  
  async function fetchData() {
    const { data, error } = await supabase
      .from('table')
      .select('*')
    
    if (error) {
      console.error(error)
    } else {
      setData(data)
    }
    setLoading(false)
  }
  
  if (loading) {
    return <div>Loading...</div>
  }
  
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Page Title</h1>
      <Card>
        <CardContent>
          {/* Content */}
        </CardContent>
      </Card>
    </div>
  )
}
```

### Adding Route

```typescript
// src/App.tsx
import { NewPage } from '@/pages/NewPage'

// In Routes:
<Route path="new-page" element={<NewPage />} />
```

---

## 📖 Additional Resources

- [React Documentation](https://react.dev)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
- [Vite Documentation](https://vitejs.dev)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [Supabase Documentation](https://supabase.com/docs)

---

**Last Updated**: January 2026

