const FUZZY_GUARD_TOKEN = 'fuzzy_secure_token'

function hasStoredToken() {
  try {
    const raw = localStorage.getItem(FUZZY_GUARD_TOKEN)
    if (!raw) return false
    const parsed = JSON.parse(atob(raw))
    const token = parsed.token || ''
    const payload = JSON.parse(atob(token.split('.')[1]))
    return payload.exp > Date.now()
  } catch {
    localStorage.removeItem(FUZZY_GUARD_TOKEN)
    return false
  }
}

if (!hasStoredToken()) {
  window.location.href = 'login.html'
}
