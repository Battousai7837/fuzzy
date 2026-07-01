import { create } from 'zustand'

const TOKEN_KEY = 'fuzzy_secure_token'

type Address = {
  id: number
  label: string
  detail: string
  default: boolean
}

export type AuthUser = {
  id: number
  name: string
  email: string
  role?: 'customer' | 'admin'
  active?: boolean
  phone: string
  birthday: string
  avatar: string
  addresses: Address[]
}

type UserState = {
  token: string
  user: AuthUser | null
  setToken: (token: string) => void
  setUser: (user: AuthUser | null) => void
  setAuth: (token: string, user: AuthUser) => void
  clearAuth: () => void
}

const readToken = () => {
  try {
    const raw = localStorage.getItem(TOKEN_KEY)
    if (!raw) return ''
    const token = JSON.parse(atob(raw)).token as string
    const payload = JSON.parse(atob(token.split('.')[1]))
    if (payload.exp <= Date.now()) {
      localStorage.removeItem(TOKEN_KEY)
      return ''
    }
    return token
  } catch {
    localStorage.removeItem(TOKEN_KEY)
    return ''
  }
}

const persistToken = (token: string) => {
  if (!token) {
    localStorage.removeItem(TOKEN_KEY)
    return
  }
  localStorage.setItem(TOKEN_KEY, btoa(JSON.stringify({ token, savedAt: Date.now() })))
}

export const useUserStore = create<UserState>((set) => ({
  token: readToken(),
  user: null,
  setToken: (token) => {
    persistToken(token)
    set({ token })
  },
  setUser: (user) => set({ user }),
  setAuth: (token, user) => {
    persistToken(token)
    set({ token, user })
  },
  clearAuth: () => {
    localStorage.removeItem(TOKEN_KEY)
    set({ token: '', user: null })
  },
}))
