import { createContext, useState, useContext, useEffect, useCallback } from 'react'
import axios from 'axios'
import { clearPermissionsCache } from '../hooks/usePermissions'

const AuthContext = createContext(null)

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // Logout function (defined early for interceptor)
  const performLogout = useCallback(() => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    delete axios.defaults.headers.common['Authorization']
    clearPermissionsCache()
    setUser(null)
  }, [])

  // Set up axios interceptor for handling token expiration
  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        // Check if error is due to token expiration
        if (error.response?.status === 401) {
          const errorCode = error.response?.data?.error?.code
          if (errorCode === 'TOKEN_EXPIRED' || errorCode === 'INVALID_TOKEN' || errorCode === 'UNAUTHORIZED') {
            // Token expired or invalid - logout and redirect
            performLogout()
            // Redirect to login page
            window.location.href = '/login'
          }
        }
        return Promise.reject(error)
      }
    )

    // Cleanup interceptor on unmount
    return () => {
      axios.interceptors.response.eject(interceptor)
    }
  }, [performLogout])

  // Check if user is logged in on mount
  useEffect(() => {
    const token = localStorage.getItem('token')
    const storedUser = localStorage.getItem('user')

    if (token && storedUser) {
      try {
        setUser(JSON.parse(storedUser))
        // Set axios default header
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
      } catch (error) {
        console.error('Error parsing stored user:', error)
        localStorage.removeItem('token')
        localStorage.removeItem('user')
      }
    }

    setLoading(false)
  }, [])

  const login = async (username, password) => {
    try {
      const response = await axios.post('/api/v1/auth/login', {
        username,
        password
      })

      const { token, user: userData } = response.data.data

      // Store token and user
      localStorage.setItem('token', token)
      localStorage.setItem('user', JSON.stringify(userData))

      // Set axios default header
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`

      setUser(userData)

      return { success: true }
    } catch (error) {
      console.error('Login error:', error)
      return {
        success: false,
        error: error.response?.data?.error?.message || 'Login failed'
      }
    }
  }

  const logout = () => {
    performLogout()
    // Optionally call logout endpoint
    axios.post('/api/v1/auth/logout').catch(() => {})
  }

  const value = {
    user,
    loading,
    login,
    logout
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
