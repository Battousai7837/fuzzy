const FUZZY_PROFILE_API = 'http://127.0.0.1:4000/api'
const FUZZY_PROFILE_KEY = 'fuzzy_profile'
const FUZZY_PROFILE_TOKEN = 'fuzzy_secure_token'

const defaultProfile = {
  name: 'Marlin Watkin',
  email: 'marlinw25@gmail.com',
  phone: '+4498456215',
  birthday: '',
  avatar: 'assets/images/icons/profile1.png',
}

function readStoredProfile() {
  try {
    return { ...defaultProfile, ...JSON.parse(localStorage.getItem(FUZZY_PROFILE_KEY) || '{}') }
  } catch {
    return defaultProfile
  }
}

function writeStoredProfile(profile) {
  localStorage.setItem(FUZZY_PROFILE_KEY, JSON.stringify({ ...readStoredProfile(), ...profile }))
}

function normalizeProfile(profile) {
  return {
    name: profile?.name || defaultProfile.name,
    email: profile?.email || defaultProfile.email,
    phone: profile?.phone || defaultProfile.phone,
    birthday: profile?.birthday || defaultProfile.birthday,
    avatar: profile?.avatar || defaultProfile.avatar,
  }
}

function readBearerToken() {
  try {
    const raw = localStorage.getItem(FUZZY_PROFILE_TOKEN)
    if (!raw) return ''
    const token = JSON.parse(atob(raw)).token
    return typeof token === 'string' ? token : ''
  } catch {
    return ''
  }
}

function applyProfileToPage(profile) {
  const normalized = normalizeProfile(profile)
  document.querySelectorAll('[data-profile-name]').forEach((node) => {
    node.textContent = normalized.name
  })
  document.querySelectorAll('[data-profile-email]').forEach((node) => {
    node.textContent = normalized.email
  })
  document.querySelectorAll('[data-profile-phone]').forEach((node) => {
    node.textContent = normalized.phone || 'Chua co so dien thoai'
  })
  document.querySelectorAll('[data-profile-avatar]').forEach((node) => {
    node.setAttribute('src', normalized.avatar || defaultProfile.avatar)
  })
}

async function fetchServerProfile() {
  const token = readBearerToken()
  if (!token) return null
  const response = await fetch(`${FUZZY_PROFILE_API}/users/me`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) return null
  return response.json()
}

async function saveServerProfile(profile) {
  const token = readBearerToken()
  if (!token) return profile
  const response = await fetch(`${FUZZY_PROFILE_API}/users/me`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(profile),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.message || 'Khong luu duoc ho so')
  return data
}

function initProfileDisplay() {
  const profile = readStoredProfile()
  applyProfileToPage(profile)
  window.addEventListener('pageshow', () => {
    applyProfileToPage(readStoredProfile())
  })
  fetchServerProfile().then((serverProfile) => {
    if (!serverProfile) return
    const merged = normalizeProfile({ ...profile, ...serverProfile })
    writeStoredProfile(merged)
    applyProfileToPage(merged)
  }).catch(() => undefined)
}

function initProfileForm() {
  const form = document.querySelector('[data-profile-form]')
  if (!form) return
  const profile = readStoredProfile()
  const nameInput = document.querySelector('[data-profile-input-name]')
  const emailInput = document.querySelector('[data-profile-input-email]')
  const phoneInput = document.querySelector('[data-profile-input-phone]')
  const message = document.querySelector('[data-profile-message]')
  const saveButton = document.querySelector('[data-profile-save]')

  const fillForm = (nextProfile) => {
    const normalized = normalizeProfile(nextProfile)
    if (nameInput) {
      nameInput.value = normalized.name
      nameInput.removeAttribute('readonly')
      nameInput.removeAttribute('disabled')
    }
    if (emailInput) {
      emailInput.value = normalized.email
      emailInput.removeAttribute('readonly')
      emailInput.removeAttribute('disabled')
    }
    if (phoneInput) {
      phoneInput.value = normalized.phone
      phoneInput.removeAttribute('readonly')
      phoneInput.removeAttribute('disabled')
    }
  }

  fillForm(profile)
  fetchServerProfile().then((serverProfile) => {
    if (!serverProfile) return
    const merged = normalizeProfile({ ...readStoredProfile(), ...serverProfile })
    writeStoredProfile(merged)
    fillForm(merged)
    applyProfileToPage(merged)
  }).catch(() => undefined)

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const currentProfile = readStoredProfile()
    const nextProfile = {
      ...currentProfile,
      name: nameInput?.value.trim() || '',
      email: emailInput?.value.trim() || '',
      phone: phoneInput?.value.trim() || '',
    }

    if (!nextProfile.name) {
      if (message) message.textContent = 'Vui long nhap ten'
      return
    }
    if (!/^\S+@\S+\.\S+$/.test(nextProfile.email)) {
      if (message) message.textContent = 'Email chua dung dinh dang'
      return
    }

    saveButton?.classList.add('disabled')
    if (saveButton) saveButton.textContent = 'Saving...'
    try {
      writeStoredProfile(nextProfile)
      const saved = await saveServerProfile(nextProfile)
      writeStoredProfile(normalizeProfile({ ...nextProfile, ...saved }))
      if (message) message.textContent = 'Da luu ho so'
      window.location.replace(`profile.html?updated=${Date.now()}`)
    } catch (error) {
      if (message) message.textContent = error.message || 'Khong luu duoc ho so'
      saveButton?.classList.remove('disabled')
      if (saveButton) saveButton.textContent = 'Save'
    }
  })
}

initProfileDisplay()
initProfileForm()
