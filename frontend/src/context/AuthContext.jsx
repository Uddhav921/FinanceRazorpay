import React, { createContext, useContext, useState, useEffect } from 'react'
import {
  fetchCurrentUser,
  loginDemo as apiLoginDemo,
  loginWithGoogle as apiLoginWithGoogle,
  logoutUser,
  getAuthToken,
} from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState(null)

  // Validate existing token on boot
  useEffect(() => {
    const token = getAuthToken()
    if (!token) {
      setLoading(false)
      return
    }

    fetchCurrentUser()
      .then((userData) => {
        setUser(userData)
      })
      .catch((err) => {
        console.warn('Session expired or invalid, logging out:', err.message)
        logoutUser()
        setUser(null)
      })
      .finally(() => {
        setLoading(false)
      })
  }, [])

  const handleGoogleLogin = async (credential) => {
    setAuthError(null)
    try {
      const data = await apiLoginWithGoogle(credential)
      setUser(data.user)
      return data.user
    } catch (err) {
      setAuthError(err.message || 'Google authentication failed')
      throw err
    }
  }

  const handleDemoLogin = async () => {
    setAuthError(null)
    try {
      const data = await apiLoginDemo()
      setUser(data.user)
      return data.user
    } catch (err) {
      setAuthError(err.message || 'Demo login failed')
      throw err
    }
  }

  const handleLogout = () => {
    logoutUser()
    setUser(null)
    setAuthError(null)
  }

  const refreshUser = async () => {
    try {
      const updated = await fetchCurrentUser()
      setUser(updated)
      return updated
    } catch (err) {
      console.warn('Failed to refresh user info:', err)
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        loading,
        authError,
        loginWithGoogle: handleGoogleLogin,
        loginDemo: handleDemoLogin,
        logout: handleLogout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}
