import { useState } from 'react'
import type { FormEvent } from 'react'
import type { User } from '../types'

interface LoginFormProps {
  users: User[]
  onLogin: (username: string, pin: string) => Promise<void>
  errorMessage: string
}

export const LoginForm = ({ users, onLogin, errorMessage }: LoginFormProps) => {
  const [username, setUsername] = useState('admin')
  const [pin, setPin] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSubmitting(true)
    try {
      await onLogin(username, pin)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="auth-card">
      <h1>MiNegocioFinde</h1>
      <p>Control offline de inventario y ventas para fin de semana.</p>

      <form onSubmit={handleSubmit} className="grid-form">
        <label>
          Usuario
          <input
            list="users-list"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="admin"
            autoComplete="username"
          />
        </label>
        <datalist id="users-list">
          {users.map((user) => (
            <option key={user.id} value={user.username} />
          ))}
        </datalist>

        <label>
          PIN
          <input
            type="password"
            value={pin}
            onChange={(event) => setPin(event.target.value)}
            placeholder="****"
            autoComplete="current-password"
          />
        </label>

        {errorMessage ? <p className="error-text">{errorMessage}</p> : null}

        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Entrando...' : 'Entrar'}
        </button>
      </form>

      <div className="auth-help">
        <strong>Usuarios demo:</strong>
        <p>`admin / 1234` y `cajero / 0000`</p>
      </div>
    </section>
  )
}
