import React, { useState, useEffect } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import LandingPage from './components/LandingPage'
import Dashboard from './components/Dashboard'

function AppContent() {
  const { isAuthenticated, loading } = useAuth()
  // 'dashboard' | 'home'
  const [currentView, setCurrentView] = useState('home')

  useEffect(() => {
    if (isAuthenticated) {
      // Auto-redirect to dashboard on login
      setCurrentView('dashboard')
    } else {
      // On logout, go back to home/landing
      setCurrentView('home')
    }
  }, [isAuthenticated])

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

  // Authenticated + dashboard view → show Dashboard
  if (isAuthenticated && currentView === 'dashboard') {
    return (
      <div className="app-root">
        <Dashboard goHome={() => setCurrentView('home')} />
      </div>
    )
  }

  // Authenticated + home view → landing with "Go to Dashboard" button
  if (isAuthenticated && currentView === 'home') {
    return (
      <div className="app-root">
        <LandingPage goToDashboard={() => setCurrentView('dashboard')} />
      </div>
    )
  }

  // Not authenticated → normal landing page
  return (
    <div className="app-root">
      <LandingPage />
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
