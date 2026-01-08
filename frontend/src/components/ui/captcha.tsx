/**
 * Simple Math CAPTCHA Component
 * 
 * This provides a lightweight CAPTCHA solution without external dependencies.
 * For production, consider using Google reCAPTCHA or hCaptcha for better security.
 */

import { useState, useEffect } from 'react'
import { Input } from './input'
import { Label } from './label'
import { Button } from './button'
import { RefreshCw } from 'lucide-react'

interface CaptchaProps {
  onVerify: (isValid: boolean) => void
  required?: boolean
}

export function Captcha({ onVerify, required = true }: CaptchaProps) {
  const [num1, setNum1] = useState(0)
  const [num2, setNum2] = useState(0)
  const [answer, setAnswer] = useState('')
  const [isValid, setIsValid] = useState(false)
  const [error, setError] = useState('')

  // Generate new CAPTCHA
  const generateCaptcha = () => {
    const n1 = Math.floor(Math.random() * 10) + 1 // 1-10
    const n2 = Math.floor(Math.random() * 10) + 1 // 1-10
    setNum1(n1)
    setNum2(n2)
    setAnswer('')
    setIsValid(false)
    setError('')
    onVerify(false)
  }

  // Generate initial CAPTCHA
  useEffect(() => {
    generateCaptcha()
  }, [])

  // Validate answer
  const handleAnswerChange = (value: string) => {
    setAnswer(value)
    setError('')
    
    if (!value.trim()) {
      setIsValid(false)
      onVerify(false)
      return
    }

    const userAnswer = parseInt(value, 10)
    const correctAnswer = num1 + num2

    if (isNaN(userAnswer)) {
      setIsValid(false)
      onVerify(false)
      return
    }

    if (userAnswer === correctAnswer) {
      setIsValid(true)
      setError('')
      onVerify(true)
    } else {
      setIsValid(false)
      setError('الإجابة غير صحيحة')
      onVerify(false)
    }
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="captcha">التحقق من الهوية</Label>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 px-4 py-2 border rounded-md bg-gray-50 dark:bg-gray-800">
          <span className="text-lg font-mono">{num1}</span>
          <span className="text-lg">+</span>
          <span className="text-lg font-mono">{num2}</span>
          <span className="text-lg">=</span>
        </div>
        <Input
          id="captcha"
          type="number"
          value={answer}
          onChange={(e) => handleAnswerChange(e.target.value)}
          placeholder="?"
          className="w-20"
          required={required}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={generateCaptcha}
          title="تحديث"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
      {error && (
        <p className="text-sm text-red-500">{error}</p>
      )}
      {isValid && (
        <p className="text-sm text-green-500">✓ تم التحقق</p>
      )}
    </div>
  )
}

