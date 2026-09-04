import React from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import LandingPage from './components/LandingPage'
import Dashboard from './components/Dashboard'

function AppContent() {
  const { isAuthenticated, loading } = useAuth()

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0d0f1a',
        color: '#e2e8f0',
        gap: '1rem',
      }}>
        <div className="spinner" style={{ width: 36, height: 36, borderWidth: 3 }} />
        <span style={{ fontSize: '0.9rem', color: '#94a3b8', letterSpacing: '0.05em' }}>
          INITIALIZING SECURE FINOPS ENVIRONMENT...
        </span>
      </div>
    )
  }

  return (
    <div className="app-root">
      {!isAuthenticated ? (
        <LandingPage />
      ) : (
        <Dashboard />
      )}
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
