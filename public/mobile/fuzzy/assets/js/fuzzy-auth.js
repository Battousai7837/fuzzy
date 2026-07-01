const FUZZY_API_URL = 'http://127.0.0.1:4000/api'
const FUZZY_PENDING_LOGIN = 'fuzzy_pending_login'
const FUZZY_TOKEN = 'fuzzy_secure_token'
const FUZZY_PROFILE = 'fuzzy_profile'

function showAuthMessage(message, type = 'error') {
  const box = document.querySelector('[data-auth-message]')
  if (!box) return
  box.textContent = message
  box.className = `auth-api-message ${type}`
}

function setButtonLoading(button, loading) {
  if (!button) return
  button.dataset.originalText = button.dataset.originalText || button.textContent
  button.textContent = loading ? 'Please wait...' : button.dataset.originalText
  button.classList.toggle('disabled', loading)
}

async function sendAuth(path, body) {
  const response = await fetch(`${FUZZY_API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.message || 'Request failed')
  return data
}

function rememberProfile(user) {
  if (!user) return
  localStorage.setItem(FUZZY_PROFILE, JSON.stringify({
    name: user.name || '',
    email: user.email || '',
    phone: user.phone || '',
    birthday: user.birthday || '',
    avatar: user.avatar || 'assets/images/icons/profile1.png',
  }))
}

function initCreateAccount() {
  const form = document.querySelector('[data-create-account-form]')
  if (!form) return

  const button = form.querySelector('[data-create-account-button]')
  button?.addEventListener('click', async (event) => {
    event.preventDefault()
    const name = document.querySelector('#inputusername')?.value.trim()
    const email = document.querySelector('#inputemail')?.value.trim()
    const password = document.querySelector('#inputPassword')?.value

    if (!name || !email || !password) {
      showAuthMessage('Vui long nhap day du ten, email va mat khau')
      return
    }

    setButtonLoading(button, true)
    try {
      await sendAuth('/auth/register', { name, email, password })
      sessionStorage.setItem(FUZZY_PENDING_LOGIN, JSON.stringify({ email, password }))
      showAuthMessage('Dang ky thanh cong. Dang chuyen sang dang nhap...', 'success')
      window.setTimeout(() => {
        window.location.href = 'login.html'
      }, 700)
    } catch (error) {
      showAuthMessage(error.message || 'Dang ky that bai')
    } finally {
      setButtonLoading(button, false)
    }
  })
}

function initLogin() {
  const form = document.querySelector('[data-login-form]')
  if (!form) return

  const saved = sessionStorage.getItem(FUZZY_PENDING_LOGIN)
  if (saved) {
    try {
      const credentials = JSON.parse(saved)
      document.querySelector('#inputusername').value = credentials.email || ''
      document.querySelector('#inputPassword').value = credentials.password || ''
      showAuthMessage('Hay dang nhap bang tai khoan vua dang ky', 'success')
    } catch {
      sessionStorage.removeItem(FUZZY_PENDING_LOGIN)
    }
  }

  const button = form.querySelector('[data-login-button]')
  const adminButton = form.querySelector('[data-admin-login-button]')
  button?.addEventListener('click', async (event) => {
    event.preventDefault()
    const email = document.querySelector('#inputusername')?.value.trim()
    const password = document.querySelector('#inputPassword')?.value

    setButtonLoading(button, true)
    try {
      const data = await sendAuth('/auth/login', { email, password })
      localStorage.setItem(FUZZY_TOKEN, btoa(JSON.stringify({ token: data.token, savedAt: Date.now() })))
      rememberProfile(data.user)
      sessionStorage.removeItem(FUZZY_PENDING_LOGIN)
      showAuthMessage('Dang nhap thanh cong', 'success')
      window.setTimeout(() => {
        window.location.href = 'landing.html'
      }, 500)
    } catch (error) {
      showAuthMessage(error.message || 'Sai email hoac mat khau')
    } finally {
      setButtonLoading(button, false)
    }
  })

  adminButton?.addEventListener('click', async (event) => {
    event.preventDefault()
    const email = document.querySelector('#inputusername')?.value.trim()
    const password = document.querySelector('#inputPassword')?.value

    setButtonLoading(adminButton, true)
    try {
      const data = await sendAuth('/auth/admin/login', { email, password })
      localStorage.setItem(FUZZY_TOKEN, btoa(JSON.stringify({ token: data.token, savedAt: Date.now() })))
      rememberProfile(data.user)
      sessionStorage.removeItem(FUZZY_PENDING_LOGIN)
      showAuthMessage('Dang nhap admin thanh cong', 'success')
      window.setTimeout(() => {
        window.location.href = '/?view=admin'
      }, 500)
    } catch (error) {
      showAuthMessage(error.message || 'Sai tai khoan admin hoac khong co quyen admin')
    } finally {
      setButtonLoading(adminButton, false)
    }
  })

  document.querySelectorAll('[data-oauth-disabled]').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault()
      showAuthMessage('Vui long dang ky va dang nhap bang email/mat khau truoc')
    })
  })
}

initCreateAccount()
initLogin()
