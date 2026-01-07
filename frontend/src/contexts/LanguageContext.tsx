import { createContext, useContext, useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { getTranslation } from '@/lib/translations'

export type Language = 'ar' | 'fr'

interface LanguageContextType {
  language: Language
  setLanguage: (lang: Language) => void
  t: (key: string, params?: Record<string, string | number>) => string
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined)

const LANGUAGE_STORAGE_KEY = 'app_language'

// Load language from localStorage or default to Arabic
const getStoredLanguage = (): Language => {
  if (typeof window === 'undefined') return 'ar'
  const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY) as Language
  return stored === 'fr' ? 'fr' : 'ar'
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(getStoredLanguage)

  // Save language to localStorage whenever it changes
  const setLanguage = (lang: Language) => {
    setLanguageState(lang)
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lang)
    // Update document direction for RTL/LTR
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
    document.documentElement.lang = lang
    // No reload needed - React will re-render with new translations
  }

  // Load language on mount
  useEffect(() => {
    const storedLang = getStoredLanguage()
    setLanguageState(storedLang)
    document.documentElement.dir = storedLang === 'ar' ? 'rtl' : 'ltr'
    document.documentElement.lang = storedLang
  }, [])

  // Translation function with parameter support
  const t = (key: string, params?: Record<string, string | number>): string => {
    let translation = getTranslation(language, key)
    if (params) {
      Object.keys(params).forEach(param => {
        translation = translation.replace(`{${param}}`, String(params[param]))
      })
    }
    return translation
  }

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider')
  }
  return context
}

