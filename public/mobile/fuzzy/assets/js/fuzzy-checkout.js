const FUZZY_ORDER_API = 'http://127.0.0.1:4000/api'
const FUZZY_ORDER_TOKEN = 'fuzzy_secure_token'
const FUZZY_LAST_ORDER = 'fuzzy_last_order'

const demoOrderItems = [
  { productId: 1, qty: 1 },
  { productId: 2, qty: 1 },
  { productId: 4, qty: 1 },
]

function readOrderToken() {
  try {
    const raw = localStorage.getItem(FUZZY_ORDER_TOKEN)
    if (!raw) return ''
    const token = JSON.parse(atob(raw)).token
    return typeof token === 'string' ? token : ''
  } catch {
    return ''
  }
}

async function orderRequest(path, options = {}) {
  const token = readOrderToken()
  if (!token) {
    window.location.href = 'login.html'
    throw new Error('Vui long dang nhap de dat hang')
  }
  const response = await fetch(`${FUZZY_ORDER_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.message || 'Khong tao duoc don hang')
  return data
}

async function ensureCheckoutAddress() {
  const user = await orderRequest('/users/me')
  const currentAddress = user.addresses?.find((address) => address.default) || user.addresses?.[0]
  if (currentAddress) return currentAddress
  return orderRequest('/users/me/addresses', {
    method: 'POST',
    body: JSON.stringify({
      label: 'Home',
      detail: '3501 Maloy Court, East Emhurst, New York City, NY 11369',
      default: true,
    }),
  })
}

async function createCheckoutOrder() {
  const address = await ensureCheckoutAddress()
  const order = await orderRequest('/orders', {
    method: 'POST',
    body: JSON.stringify({
      addressId: address.id,
      paymentMethod: 'COD',
      items: demoOrderItems,
    }),
  })
  localStorage.setItem(FUZZY_LAST_ORDER, JSON.stringify(order))
  return order
}

function money(value) {
  return `$${Number(value || 0).toFixed(0)}`
}

function orderDate(value) {
  return new Date(value || Date.now()).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function orderTime(value) {
  return new Date(value || Date.now()).toLocaleString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

async function loadTrackedOrder() {
  const params = new URLSearchParams(window.location.search)
  const wantedId = params.get('order')
  const orders = await orderRequest('/orders')
  if (wantedId) return orders.find((order) => order.id === wantedId) || null
  try {
    const last = JSON.parse(localStorage.getItem(FUZZY_LAST_ORDER) || '{}')
    return orders.find((order) => order.id === last.id) || last
  } catch {
    return orders[0] || null
  }
}

function renderJourney(order) {
  const steps = [
    ['Cho xac nhan', 'Order Information Received', 'box'],
    ['Dang chuan bi', 'The Parcel is being collected', 'box-time'],
    ['Dang giao', 'Ready To be Send', 'truck-fast'],
    ['Dang giao', 'Dispatch in Local Wear House', 'truck-fast'],
    ['Hoan thanh', 'Parcel Delivered', 'gift'],
  ]
  const statusRank = {
    'Cho xac nhan': 0,
    'Dang chuan bi': 1,
    'Dang giao': 3,
    'Hoan thanh': 4,
    'Da huy': 0,
  }
  const rank = statusRank[order.status] ?? 0
  const list = document.querySelector('[data-order-journey]')
  if (!list) return
  if (order.status === 'Da huy') {
    list.innerHTML = `
      <li class="order-process ongoing">
        <div class="d-flex gap-3 w-100">
          <span><i class="iconsax process-icon" data-icon="close-circle"></i></span>
          <div class="process-details">
            <h4>Order was cancelled</h4>
            <h5>${orderTime(order.statusHistory?.at(-1)?.at || order.createdAt)}</h5>
          </div>
        </div>
      </li>
    `
    return
  }
  list.innerHTML = steps.map((step, index) => {
    const done = index <= rank
    const current = index === rank && order.status !== 'Hoan thanh'
    const className = done && !current ? 'completed' : current ? 'ongoing' : ''
    const icon = done && !current
      ? '<img class="process-icon" src="assets/images/svg/chack.svg" alt="check" />'
      : `<i class="iconsax ${current ? 'process-icon' : 'pending-icon'}" data-icon="${step[2]}"></i>`
    const time = order.statusHistory?.find((entry) => entry.status === step[0])?.at || order.createdAt
    return `
      <li class="order-process ${className}">
        <div class="d-flex gap-3 w-100">
          <span>${icon}</span>
          <div class="process-details">
            <h4>${step[1]}</h4>
            <h5>${orderTime(time)}</h5>
          </div>
        </div>
      </li>
    `
  }).join('')
}

function renderTrackedOrder(order) {
  if (!order) return
  document.querySelectorAll('[data-order-date]').forEach((node) => {
    node.textContent = orderDate(order.createdAt)
  })
  document.querySelectorAll('[data-order-id]').forEach((node) => {
    node.textContent = `Order ID : #${order.id}`
  })
  document.querySelectorAll('[data-order-subtotal]').forEach((node) => {
    node.textContent = money(order.total)
  })
  document.querySelectorAll('[data-order-shipping]').forEach((node) => {
    node.textContent = '$0.00'
  })
  document.querySelectorAll('[data-order-discount]').forEach((node) => {
    node.textContent = '$0.00'
  })
  document.querySelectorAll('[data-order-grand-total], [data-order-amount]').forEach((node) => {
    node.textContent = money(order.total)
  })
  renderJourney(order)
  if (window.iconsax) window.iconsax()
}

function initPaymentOrder() {
  const payButton = document.querySelector('[data-place-order]')
  if (!payButton) return
  const modal = document.querySelector('#success')
  const message = document.querySelector('[data-order-message]')
  const trackLink = document.querySelector('[data-track-order-link]')
  payButton.addEventListener('click', async (event) => {
    event.preventDefault()
    payButton.classList.add('disabled')
    payButton.textContent = 'Creating order...'
    if (message) message.textContent = ''
    try {
      const order = await createCheckoutOrder()
      if (trackLink) trackLink.href = `order-tracking.html?order=${encodeURIComponent(order.id)}`
      if (message) message.textContent = `Order ${order.id} is waiting for admin approval.`
      if (window.bootstrap && modal) window.bootstrap.Modal.getOrCreateInstance(modal).show()
    } catch (error) {
      if (message) message.textContent = error.message || 'Khong tao duoc don hang'
    } finally {
      payButton.classList.remove('disabled')
      payButton.textContent = 'Pay Now'
    }
  })
}

function initOrderTracker() {
  if (!document.querySelector('[data-order-tracker]')) return
  loadTrackedOrder().then(renderTrackedOrder).catch(() => undefined)
}

initPaymentOrder()
initOrderTracker()
