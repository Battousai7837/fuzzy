import { type ChangeEvent, type FormEvent, type RefObject, useCallback, useEffect, useRef, useState } from 'react'
import { useSwipeable } from 'react-swipeable'
import { useUserStore } from './stores/userStore'
import './App.scss'

const API_URL = '/api'
const CART_KEY = 'fuzzy_cart_items'
const INSTALL_DISMISSED_KEY = 'fuzzy_install_dismissed'

type View = 'home' | 'shop' | 'detail' | 'cart' | 'checkout' | 'orders' | 'profile' | 'profileEdit' | 'admin' | 'auth'
type AuthMode = 'login' | 'register' | 'admin'
type OrderStatus = 'Cho xac nhan' | 'Dang chuan bi' | 'Dang giao' | 'Hoan thanh' | 'Da huy'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

type Address = {
  id: number
  label: string
  detail: string
  default: boolean
}

type User = {
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

type Product = {
  id: number
  name: string
  description: string
  category: string
  price: number
  oldPrice: number | null
  stock: number
  rating: number
  colors: string[]
  sizes: string[]
  image: string
  images: string[]
  hidden: boolean
}

type ProductPage = {
  items: Product[]
  total: number
  page: number
  limit: number
  hasMore: boolean
}

type AttributeData = {
  colors: string[]
  sizes: string[]
}

type CartItem = {
  productId: number
  name: string
  image: string
  price: number
  stock: number
  color: string
  size: string
  qty: number
}

type Order = {
  id: string
  userId?: number
  createdAt: string
  status: OrderStatus
  statusHistory?: Array<{ status: OrderStatus; at: string }>
  restocked?: boolean
  paymentMethod: string
  address: Address
  customer?: { id: number; name: string; email: string; phone: string }
  items: Array<{ productId: number; name: string; image?: string; price: number; qty: number; subtotal: number }>
  total: number
}

type ProductForm = {
  name: string
  description: string
  category: string
  price: number
  oldPrice: number | null
  stock: number
  rating: number
  image: string
  images: string[]
  colors: string[]
  sizes: string[]
}

type ProfilePayload = {
  name: string
  email: string
  phone: string
  birthday: string
  avatar: string
}

const statusFlow: OrderStatus[] = ['Cho xac nhan', 'Dang chuan bi', 'Dang giao', 'Hoan thanh']
const statusOptions: OrderStatus[] = [...statusFlow, 'Da huy']
const paymentMethods = ['COD', 'Chuyen khoan', 'VNPay/Momo']

const nextOrderStatuses = (status: OrderStatus): OrderStatus[] => {
  if (status === 'Cho xac nhan') return ['Dang chuan bi', 'Da huy']
  if (status === 'Dang chuan bi') return ['Dang giao', 'Da huy']
  if (status === 'Dang giao') return ['Hoan thanh']
  return []
}

const adminStatusLabel = (current: OrderStatus, next: OrderStatus) => {
  if (current === 'Cho xac nhan' && next === 'Dang chuan bi') return 'Duyet don'
  if (current === 'Cho xac nhan' && next === 'Da huy') return 'Tu choi'
  if (next === 'Dang giao') return 'Giao hang'
  if (next === 'Hoan thanh') return 'Hoan thanh'
  if (next === 'Da huy') return 'Huy don'
  return next
}

const emptyProductForm: ProductForm = {
  name: '',
  description: '',
  category: 'Chair',
  price: 0,
  oldPrice: null,
  stock: 0,
  rating: 4.5,
  image: '/mobile/fuzzy/assets/images/product/1.png',
  images: ['/mobile/fuzzy/assets/images/product/1.png'],
  colors: ['Brown'],
  sizes: ['M'],
}

const currency = (value: number) => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
}).format(value)

const readJson = <T,>(key: string, fallback: T): T => {
  try {
    const value = localStorage.getItem(key)
    return value ? JSON.parse(value) as T : fallback
  } catch {
    return fallback
  }
}

const viewFromUrl = (): View => {
  const value = new URLSearchParams(window.location.search).get('view')
  return ['home', 'shop', 'cart', 'orders', 'profile', 'profileEdit', 'admin', 'auth'].includes(value ?? '') ? value as View : 'home'
}

function App() {
  const [view, setView] = useState<View>(viewFromUrl)
  const [authMode, setAuthMode] = useState<AuthMode>('login')
  const [registeredCredentials, setRegisteredCredentials] = useState({ email: '', password: '' })
  const { token, user, setUser, setAuth, clearAuth } = useUserStore()
  const [categories, setCategories] = useState<string[]>([])
  const [colors, setColors] = useState<string[]>([])
  const [sizes, setSizes] = useState<string[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [cart, setCart] = useState<CartItem[]>(() => readJson<CartItem[]>(CART_KEY, []))
  const [orders, setOrders] = useState<Order[]>([])
  const [allOrders, setAllOrders] = useState<Order[]>([])
  const [customers, setCustomers] = useState<User[]>([])
  const [category, setCategory] = useState('All')
  const [sort, setSort] = useState('rating_desc')
  const [search, setSearch] = useState('')
  const [selectedColor, setSelectedColor] = useState('All')
  const [productPage, setProductPage] = useState(1)
  const [productTotal, setProductTotal] = useState(0)
  const [hasMoreProducts, setHasMoreProducts] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('fuzzy_dark') === 'true')
  const [rtl, setRtl] = useState(() => localStorage.getItem('fuzzy_rtl') === 'true')
  const [checkoutStep, setCheckoutStep] = useState(1)
  const [paymentMethod, setPaymentMethod] = useState(paymentMethods[0])
  const [lastOrderId, setLastOrderId] = useState('')
  const [toast, setToast] = useState('')
  const [apiReady, setApiReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installDismissed, setInstallDismissed] = useState(() => localStorage.getItem(INSTALL_DISMISSED_KEY) === 'true')
  const [adminProduct, setAdminProduct] = useState<ProductForm>(emptyProductForm)
  const [editingProductId, setEditingProductId] = useState<number | null>(null)
  const [newCategory, setNewCategory] = useState('')
  const [newColor, setNewColor] = useState('')
  const [newSize, setNewSize] = useState('')
  const loaderRef = useRef<HTMLDivElement | null>(null)
  const isAuthed = Boolean(token && user)
  const isAdmin = user?.role === 'admin'

  const request = useCallback(async <T,>(path: string, options: RequestInit = {}): Promise<T> => {
    const headers = new Headers(options.headers)
    headers.set('Content-Type', 'application/json')
    if (token) headers.set('Authorization', `Bearer ${token}`)
    const response = await fetch(`${API_URL}${path}`, { ...options, headers })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      if (response.status === 401) {
        clearAuth()
        setView('auth')
      }
      throw new Error(data.message ?? 'Request failed')
    }
    return data as T
  }, [clearAuth, token])

  const preserveScroll = useCallback(async <T,>(task: () => Promise<T>): Promise<T> => {
    const scrollLeft = window.scrollX
    const scrollTop = window.scrollY
    try {
      return await task()
    } finally {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          const maxTop = Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
          window.scrollTo({ left: scrollLeft, top: Math.min(scrollTop, maxTop), behavior: 'auto' })
        })
      })
    }
  }, [])

  const refreshProducts = useCallback(async (page = 1, append = false, includeHidden = false) => {
    const params = new URLSearchParams()
    if (category !== 'All') params.set('category', category)
    if (selectedColor !== 'All') params.set('color', selectedColor)
    if (search.trim()) params.set('search', search.trim())
    if (sort) params.set('sort', sort)
    if (includeHidden) params.set('includeHidden', 'true')
    params.set('page', String(page))
    params.set('limit', includeHidden ? '100' : '6')
    params.set('paginate', 'true')
    const data = await request<ProductPage>(`/products?${params.toString()}`)
    setProducts((items) => append ? [...items, ...data.items] : data.items)
    setProductPage(data.page)
    setProductTotal(data.total)
    setHasMoreProducts(data.hasMore)
  }, [category, request, search, selectedColor, sort])

  const refreshCatalog = useCallback(async () => {
    const [categoryData, attributeData] = await Promise.all([
      request<string[]>('/categories'),
      request<AttributeData>('/attributes'),
    ])
    setCategories(categoryData)
    setColors(attributeData.colors)
    setSizes(attributeData.sizes)
  }, [request])

  const refreshMe = useCallback(async () => {
    if (!token) return
    const data = await request<User>('/users/me')
    setUser(data)
  }, [request, setUser, token])

  const refreshOrders = useCallback(async () => {
    if (!token) return
    const data = await request<Order[]>('/orders')
    setOrders(data)
    if (user?.role === 'admin') {
      const adminData = await request<Order[]>('/orders?all=true')
      setAllOrders(adminData)
    } else {
      setAllOrders([])
    }
  }, [request, token, user?.role])

  const refreshCustomers = useCallback(async () => {
    if (!token || user?.role !== 'admin') {
      setCustomers([])
      return
    }
    const data = await request<User[]>('/users')
    setCustomers(data)
  }, [request, token, user?.role])

  useEffect(() => {
    let active = true
    Promise.all([
      request<{ ok: boolean }>('/health').then(() => setApiReady(true)).catch(() => setApiReady(false)),
      refreshCatalog(),
    ]).finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [refreshCatalog, request])

  useEffect(() => {
    refreshProducts(1, false, view === 'admin').catch((error) => setToast(error.message))
  }, [refreshProducts, view])

  useEffect(() => {
    refreshMe().catch(() => {
      clearAuth()
    })
  }, [clearAuth, refreshMe])

  useEffect(() => {
    if (token) refreshOrders().catch(() => undefined)
  }, [refreshOrders, token])

  useEffect(() => {
    if (!isAdmin || view !== 'admin') return
    refreshOrders().catch(() => undefined)
    refreshCustomers().catch(() => undefined)
    const timer = window.setInterval(() => {
      refreshOrders().catch(() => undefined)
      refreshCustomers().catch(() => undefined)
    }, 10000)
    return () => window.clearInterval(timer)
  }, [isAdmin, refreshCustomers, refreshOrders, view])

  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(cart))
  }, [cart])

  useEffect(() => {
    localStorage.setItem('fuzzy_dark', String(darkMode))
    document.body.classList.toggle('fuzzy-dark', darkMode)
  }, [darkMode])

  useEffect(() => {
    localStorage.setItem('fuzzy_rtl', String(rtl))
    document.documentElement.dir = rtl ? 'rtl' : 'ltr'
  }, [rtl])

  useEffect(() => {
    const node = loaderRef.current
    if (!node) return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        if (hasMoreProducts) {
          refreshProducts(productPage + 1, true, view === 'admin').catch((error) => setToast(error.message))
        }
      }
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasMoreProducts, productPage, refreshProducts, view])

  useEffect(() => {
    const updateOnline = () => setIsOnline(navigator.onLine)
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as BeforeInstallPromptEvent)
    }
    window.addEventListener('online', updateOnline)
    window.addEventListener('offline', updateOnline)
    window.addEventListener('beforeinstallprompt', handleInstallPrompt)
    return () => {
      window.removeEventListener('online', updateOnline)
      window.removeEventListener('offline', updateOnline)
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt)
    }
  }, [])

  useEffect(() => {
    const url = new URL(window.location.href)
    const urlView = view === 'detail' ? 'shop' : view === 'checkout' ? 'cart' : view
    if (urlView === 'home') {
      url.searchParams.delete('view')
    } else {
      url.searchParams.set('view', urlView)
    }
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
  }, [view])

  const installApp = async () => {
    if (!installPrompt) return
    await installPrompt.prompt()
    await installPrompt.userChoice.catch(() => undefined)
    setInstallPrompt(null)
    setInstallDismissed(true)
    localStorage.setItem(INSTALL_DISMISSED_KEY, 'true')
  }

  const dismissInstall = () => {
    setInstallDismissed(true)
    localStorage.setItem(INSTALL_DISMISSED_KEY, 'true')
  }

  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0)
  const defaultAddress = user?.addresses.find((address) => address.default) ?? user?.addresses[0]

  const notify = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 2600)
  }

  const openProtected = (next: View) => {
    if (!token || !user) {
      setAuthMode('login')
      setView('auth')
      return
    }
    setView(next)
  }

  const openAdmin = () => {
    if (isAdmin) {
      setView('admin')
      return
    }
    setAuthMode('admin')
    setView('auth')
  }

  const openDetail = (product: Product) => {
    setSelectedProduct(product)
    setView('detail')
  }

  const addToCart = (product: Product, color = product.colors[0] ?? 'Default', size = product.sizes[0] ?? 'One Size') => {
    setCart((items) => {
      const found = items.find((item) => item.productId === product.id && item.color === color && item.size === size)
      if (found) {
        return items.map((item) => item === found ? { ...item, qty: Math.min(item.qty + 1, product.stock) } : item)
      }
      return [...items, {
        productId: product.id,
        name: product.name,
        image: product.image,
        price: product.price,
        stock: product.stock,
        color,
        size,
        qty: 1,
      }]
    })
    notify('Da them vao gio hang')
  }

  const updateCartQty = (item: CartItem, delta: number) => {
    setCart((items) => items.flatMap((entry) => {
      if (entry !== item) return entry
      const qty = entry.qty + delta
      return qty > 0 ? [{ ...entry, qty: Math.min(qty, entry.stock) }] : []
    }))
  }

  const handleAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = Object.fromEntries(new FormData(event.currentTarget))
    const payload = {
      name: String(data.name ?? ''),
      email: String(data.email ?? ''),
      password: String(data.password ?? ''),
      phone: String(data.phone ?? ''),
    }
    if (!/^\S+@\S+\.\S+$/.test(payload.email)) {
      notify('Email chua dung dinh dang')
      return
    }
    if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(payload.password)) {
      notify('Mat khau can toi thieu 8 ky tu, co chu va so')
      return
    }
    try {
      const data = await request<{ token: string; user: User }>(authMode === 'admin' ? '/auth/admin/login' : authMode === 'login' ? '/auth/login' : '/auth/register', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      if (authMode === 'admin') {
        setAuth(data.token, data.user)
        setView('admin')
        notify('Dang nhap admin thanh cong')
        return
      }
      if (authMode === 'register') {
        clearAuth()
        setRegisteredCredentials({ email: payload.email, password: payload.password })
        setAuthMode('login')
        notify('Dang ky thanh cong. Hay dang nhap bang email va mat khau vua tao')
        return
      }
      setAuth(data.token, data.user)
      setView('home')
      notify('Dang nhap thanh cong')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Auth failed')
    }
  }

  const handleOAuth = async (provider: 'Google' | 'Facebook') => {
    notify(`${provider} OAuth chua cau hinh. Vui long dang ky bang email va mat khau`)
  }

  const handleProfile = async (payload: ProfilePayload): Promise<boolean> => {
    const email = payload.email.trim()
    const name = payload.name.trim()
    const phone = payload.phone.trim()
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      notify('Email chua dung dinh dang')
      return false
    }
    if (!name) {
      notify('Vui long nhap ten')
      return false
    }
    try {
      await request<User>('/users/me', {
        method: 'PUT',
        body: JSON.stringify({
          name,
          email,
          phone,
          birthday: payload.birthday,
          avatar: payload.avatar,
        }),
      })
      const savedUser = await request<User>('/users/me')
      setUser(savedUser)
      notify('Da luu ho so')
      return true
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Khong luu duoc ho so')
      return false
    }
  }

  const addAddress = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = Object.fromEntries(new FormData(event.currentTarget))
    await request<Address>('/users/me/addresses', {
      method: 'POST',
      body: JSON.stringify({ label: data.label, detail: data.detail, default: data.default === 'on' }),
    })
    await refreshMe()
    event.currentTarget.reset()
    notify('Da them dia chi')
  }

  const deleteAddress = async (id: number) => {
    await request(`/users/me/addresses/${id}`, { method: 'DELETE' })
    await refreshMe()
    notify('Da xoa dia chi')
  }

  const updateAddress = async (id: number, patch: Partial<Address>) => {
    await request<Address>(`/users/me/addresses/${id}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    })
    await refreshMe()
    notify('Da cap nhat dia chi')
  }

  const placeOrder = async () => {
    if (!defaultAddress) {
      notify('Vui long them dia chi giao hang')
      setView('profile')
      return
    }
    if (!cart.length) {
      notify('Gio hang dang trong')
      return
    }
    const order = await request<Order>('/orders', {
      method: 'POST',
      body: JSON.stringify({
        addressId: defaultAddress.id,
        paymentMethod,
        items: cart.map((item) => ({ productId: item.productId, qty: item.qty })),
      }),
    })
    setCart([])
    setLastOrderId(order.id)
    setCheckoutStep(3)
    await refreshProducts()
    await refreshOrders()
  }

  const saveAdminProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const body = {
      ...adminProduct,
      price: Number(adminProduct.price),
      oldPrice: adminProduct.oldPrice ? Number(adminProduct.oldPrice) : null,
      stock: Number(adminProduct.stock),
      rating: Number(adminProduct.rating),
    }
    if (!body.name.trim()) {
      notify('Vui long nhap ten san pham')
      return
    }
    if (!body.image.trim()) {
      notify('Vui long them anh san pham')
      return
    }
    if (editingProductId) {
      await request<Product>(`/products/${editingProductId}`, { method: 'PUT', body: JSON.stringify(body) })
    } else {
      await request<Product>('/products', { method: 'POST', body: JSON.stringify(body) })
    }
    await preserveScroll(async () => {
      setAdminProduct(emptyProductForm)
      setEditingProductId(null)
      await refreshProducts(1, false, true)
    })
    notify(editingProductId ? 'Da cap nhat san pham' : 'Da them san pham')
  }

  const updateProduct = async (product: Product, patch: Partial<Product>) => {
    await request<Product>(`/products/${product.id}`, { method: 'PUT', body: JSON.stringify(patch) })
    await preserveScroll(() => refreshProducts(1, false, true))
  }

  const editProduct = (product: Product) => {
    setEditingProductId(product.id)
    setAdminProduct({
      name: product.name,
      description: product.description,
      category: product.category,
      price: product.price,
      oldPrice: product.oldPrice,
      stock: product.stock,
      rating: product.rating,
      image: product.image,
      images: product.images?.length ? product.images : [product.image],
      colors: product.colors ?? [],
      sizes: product.sizes ?? [],
    })
  }

  const cancelProductEdit = () => {
    setEditingProductId(null)
    setAdminProduct(emptyProductForm)
  }

  const hideProduct = async (product: Product) => {
    if (product.hidden) {
      await updateProduct(product, { hidden: false })
      notify('Da hien san pham')
      return
    }
    await updateProduct(product, { hidden: true })
    notify('Da an san pham')
  }

  const deleteProduct = async (product: Product) => {
    const confirmed = window.confirm(`Xoa san pham "${product.name}"?`)
    if (!confirmed) return
    await request(`/products/${product.id}`, { method: 'DELETE' })
    await preserveScroll(async () => {
      await refreshProducts(1, false, true)
      if (editingProductId === product.id) cancelProductEdit()
    })
    notify('Da xoa san pham')
  }

  const addCategory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await request<string[]>('/categories', { method: 'POST', body: JSON.stringify({ name: newCategory }) })
    await preserveScroll(async () => {
      setNewCategory('')
      await refreshCatalog()
    })
    notify('Da them danh muc')
  }

  const deleteCategory = async (name: string) => {
    await request(`/categories/${encodeURIComponent(name)}`, { method: 'DELETE' })
    await preserveScroll(async () => {
      await refreshCatalog()
      await refreshProducts(1, false, view === 'admin')
    })
    notify('Da xoa danh muc')
  }

  const addAttribute = async (type: 'colors' | 'sizes', value: string) => {
    await request<AttributeData>(`/attributes/${type}`, { method: 'POST', body: JSON.stringify({ value }) })
    await preserveScroll(async () => {
      if (type === 'colors') setNewColor('')
      if (type === 'sizes') setNewSize('')
      await refreshCatalog()
    })
    notify('Da them thuoc tinh')
  }

  const deleteAttribute = async (type: 'colors' | 'sizes', value: string) => {
    await request<AttributeData>(`/attributes/${type}/${encodeURIComponent(value)}`, { method: 'DELETE' })
    await preserveScroll(refreshCatalog)
    notify('Da xoa thuoc tinh')
  }

  const updateOrderStatus = async (order: Order, status: OrderStatus) => {
    await request<Order>(`/orders/${order.id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) })
    await preserveScroll(refreshOrders)
    notify('Da cap nhat don hang')
  }

  const updateCustomerStatus = async (customer: User, active: boolean) => {
    await request<User>(`/users/${customer.id}/status`, { method: 'PATCH', body: JSON.stringify({ active }) })
    await preserveScroll(refreshCustomers)
    notify(active ? 'Da kich hoat tai khoan' : 'Da ngung hoat dong tai khoan')
  }

  const logout = () => {
    clearAuth()
    setOrders([])
    setAllOrders([])
    setCustomers([])
    setView('home')
  }

  const content = () => {
    if (loading) return <EmptyState title="Dang tai Fuzzy" action="Thu lai" onClick={() => window.location.reload()} />
    if (!apiReady) return <ApiDown offline={!isOnline} />
    if (view === 'home') return <Home products={products.slice(0, 4)} categories={categories} user={user} onShop={() => setView('shop')} onCategory={(value) => { setCategory(value); setView('shop') }} onDetail={openDetail} onAdd={addToCart} />
    if (view === 'shop') return <Shop products={products} total={productTotal} hasMore={hasMoreProducts} categories={categories} colors={colors} category={category} color={selectedColor} sort={sort} search={search} loaderRef={loaderRef} filterOpen={filterOpen} onSearch={setSearch} onCategory={setCategory} onColor={setSelectedColor} onSort={setSort} onFilter={setFilterOpen} onDetail={openDetail} onAdd={addToCart} />
    if (view === 'detail' && selectedProduct) return <Detail product={selectedProduct} onBack={() => setView('shop')} onAdd={addToCart} />
    if (view === 'cart') return <Cart cart={cart} total={cartTotal} onQty={updateCartQty} onDelete={(item) => setCart((items) => items.filter((entry) => entry !== item))} onShop={() => setView('shop')} onCheckout={() => openProtected('checkout')} />
    if (view === 'checkout') return <Checkout step={checkoutStep} cart={cart} total={cartTotal} address={defaultAddress} payment={paymentMethod} orderId={lastOrderId} onStep={setCheckoutStep} onPayment={setPaymentMethod} onOrder={placeOrder} onProfile={() => setView('profile')} onOrders={() => setView('orders')} />
    if (view === 'orders') return <Orders orders={orders} />
    if (view === 'profile') return <Profile user={user} onEdit={() => setView('profileEdit')} onAddress={addAddress} onUpdateAddress={updateAddress} onDeleteAddress={deleteAddress} onLogout={logout} />
    if (view === 'profileEdit') return <ProfileEdit user={user} onBack={() => setView('profile')} onSave={async (payload) => { const saved = await handleProfile(payload); if (saved) setView('profile'); return saved }} />
    if (view === 'admin') {
      if (!isAdmin) return <Auth mode="admin" user={user} credentials={registeredCredentials} onMode={setAuthMode} onSubmit={handleAuth} onOAuth={handleOAuth} />
      return <Admin products={products} orders={allOrders} customers={customers} categories={categories} colors={colors} sizes={sizes} form={adminProduct} editingProductId={editingProductId} newCategory={newCategory} newColor={newColor} newSize={newSize} onForm={setAdminProduct} onCancelEdit={cancelProductEdit} onEdit={editProduct} onNewCategory={setNewCategory} onNewColor={setNewColor} onNewSize={setNewSize} onSave={saveAdminProduct} onAddCategory={addCategory} onDeleteCategory={deleteCategory} onAddAttribute={addAttribute} onDeleteAttribute={deleteAttribute} onStock={updateProduct} onHide={hideProduct} onDelete={deleteProduct} onStatus={updateOrderStatus} onCustomerStatus={updateCustomerStatus} />
    }
    return <Auth mode={authMode} user={user} credentials={registeredCredentials} onMode={setAuthMode} onSubmit={handleAuth} onOAuth={handleOAuth} />
  }

  return (
    <main className="app-shell">
      {view !== 'profileEdit' && <Header user={user} cartCount={cart.length} onSidebar={() => setSidebarOpen(true)} onAdmin={openAdmin} />}
      {!isOnline && <div className="offline-banner">Khong co ket noi mang</div>}
      <section className={`screen ${view === 'profileEdit' ? 'screen-flush' : ''}`}>{content()}</section>
      {view !== 'profileEdit' && <BottomNav view={view} cartCount={cart.length} onOpen={(next) => next === 'cart' || next === 'orders' || next === 'profile' ? openProtected(next) : setView(next)} />}
      <Sidebar open={sidebarOpen} user={user} dark={darkMode} rtl={rtl} isAuthed={isAuthed} onDark={setDarkMode} onRtl={setRtl} onClose={() => setSidebarOpen(false)} onAuth={() => { setSidebarOpen(false); setView('auth') }} onLogout={logout} />
      {installPrompt && !installDismissed && <InstallPrompt onInstall={installApp} onDismiss={dismissInstall} />}
      {toast && <div className="toast">{toast}</div>}
    </main>
  )
}

function Header({ user, cartCount, onSidebar, onAdmin }: { user: User | null; cartCount: number; onSidebar: () => void; onAdmin: () => void }) {
  return (
    <header className="topbar">
      <button type="button" className="round-btn" onClick={onSidebar} aria-label="Open menu">☰</button>
      <div className="hello">
        <img src={user?.avatar || '/mobile/fuzzy/assets/images/icons/profile.png'} alt="" />
        <div>
          <span>Hello</span>
          <strong>{user?.name || 'Agasya!'}</strong>
        </div>
      </div>
      <button type="button" className="round-btn" onClick={onAdmin} aria-label="Admin">A</button>
      {cartCount > 0 && <span className="cart-badge">{cartCount}</span>}
    </header>
  )
}

function Home(props: { products: Product[]; categories: string[]; user: User | null; onShop: () => void; onCategory: (category: string) => void; onDetail: (product: Product) => void; onAdd: (product: Product) => void }) {
  const icons = ['S', 'C', 'T', 'B', 'L', 'D']
  return (
    <>
      <section className="hero">
        <img src="/mobile/fuzzy/assets/images/banner/banner-1.jpg" alt="Best selling sofa" />
        <div>
          <p>Best Selling</p>
          <h1>Comforts & Modern life Stylish Sofa</h1>
          <button type="button" onClick={props.onShop}>View More</button>
        </div>
      </section>
      <section className="category-icons" aria-label="Product categories">
        {props.categories.map((item, index) => (
          <button type="button" key={item} onClick={() => props.onCategory(item)}>
            <span>{icons[index % icons.length]}</span>
            <strong>{item}</strong>
          </button>
        ))}
      </section>
      <Title title={`New Arrivals${props.user ? ` for ${props.user.name}` : ''}`} action="View All" onAction={props.onShop} />
      <ProductGrid products={props.products} onDetail={props.onDetail} onAdd={props.onAdd} />
      <Title title="Trending Furniture" action="Shop" onAction={props.onShop} />
      <div className="horizontal-list">
        {props.products.slice(0, 3).map((product) => <HorizontalProduct key={product.id} product={product} onDetail={props.onDetail} onAdd={props.onAdd} />)}
      </div>
      <section className="mini-banners">
        <img src="/mobile/fuzzy/assets/images/banner/banner-3.jpg" alt="Wingback chair" />
        <img src="/mobile/fuzzy/assets/images/banner/banner-4.jpg" alt="Modern chair" />
      </section>
    </>
  )
}

function Shop(props: {
  products: Product[]
  total: number
  hasMore: boolean
  categories: string[]
  colors: string[]
  category: string
  color: string
  sort: string
  search: string
  filterOpen: boolean
  loaderRef: RefObject<HTMLDivElement | null>
  onSearch: (value: string) => void
  onCategory: (value: string) => void
  onColor: (value: string) => void
  onSort: (value: string) => void
  onFilter: (value: boolean) => void
  onDetail: (product: Product) => void
  onAdd: (product: Product) => void
}) {
  const categoryOptions = ['All', ...props.categories]
  const colorOptions = ['All', ...props.colors]
  return (
    <>
      <form className="search-box" onSubmit={(event) => event.preventDefault()}>
        <input value={props.search} placeholder="Search here..." onChange={(event) => props.onSearch(event.target.value)} />
        <button type="button" onClick={() => props.onFilter(true)}>Filter</button>
      </form>
      <div className="category-rail">
        {categoryOptions.map((item) => (
          <button type="button" key={item} className={props.category === item ? 'active' : ''} onClick={() => props.onCategory(item)}>{item}</button>
        ))}
      </div>
      <Title title="Product List" caption={`${props.total} items with infinite scroll`} />
      <ProductGrid products={props.products} onDetail={props.onDetail} onAdd={props.onAdd} />
      <div ref={props.loaderRef} className="scroll-loader">{props.hasMore ? 'Loading more...' : 'End of list'}</div>
      {props.filterOpen && (
        <div className="sheet-overlay" onClick={() => props.onFilter(false)}>
          <aside className="bottom-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="sheet-grip" />
            <h3>Filter</h3>
            <label>Sort By</label>
            <div className="segmented">
              {[
                ['rating_desc', 'Highest Rating'],
                ['price_asc', 'Lowest Price'],
                ['price_desc', 'Highest Price'],
              ].map(([value, label]) => <button type="button" className={props.sort === value ? 'active' : ''} key={value} onClick={() => props.onSort(value)}>{label}</button>)}
            </div>
            <label>Color</label>
            <div className="segmented">{colorOptions.map((item) => <button type="button" className={props.color === item ? 'active' : ''} key={item} onClick={() => props.onColor(item)}>{item}</button>)}</div>
            <label>Layout</label>
            <div className="segmented"><button type="button" className="active">Grid 2 columns</button><button type="button">Mobile list</button></div>
            <button type="button" className="primary full" onClick={() => props.onFilter(false)}>Apply</button>
          </aside>
        </div>
      )}
    </>
  )
}

function Detail({ product, onBack, onAdd }: { product: Product; onBack: () => void; onAdd: (product: Product, color?: string, size?: string) => void }) {
  const [color, setColor] = useState(product.colors[0] ?? 'Default')
  const [size, setSize] = useState(product.sizes[0] ?? 'One Size')
  const [imageIndex, setImageIndex] = useState(0)
  const images = product.images?.length ? product.images : [product.image]
  return (
    <section className="detail">
      <button type="button" className="plain" onClick={onBack}>Back</button>
      <div className="detail-stage">
        <img src={images[imageIndex]} alt={product.name} loading="eager" />
        <button type="button" className="carousel-nav prev" onClick={() => setImageIndex((index) => (index + images.length - 1) % images.length)} aria-label="Previous image">&lt;</button>
        <button type="button" className="carousel-nav next" onClick={() => setImageIndex((index) => (index + 1) % images.length)} aria-label="Next image">&gt;</button>
        <div className="carousel-dots">{images.map((image, index) => <button type="button" className={imageIndex === index ? 'active' : ''} key={image} onClick={() => setImageIndex(index)} aria-label={`Image ${index + 1}`} />)}</div>
      </div>
      <p className="kicker">{product.category} | {product.rating} rating</p>
      <h2>{product.name}</h2>
      <p>{product.description}</p>
      <strong className="big-price">{currency(product.price)} {product.oldPrice && <del>{currency(product.oldPrice)}</del>}</strong>
      <label>Color</label>
      <div className="segmented">{product.colors.map((item) => <button type="button" className={color === item ? 'active' : ''} key={item} onClick={() => setColor(item)}>{item}</button>)}</div>
      <label>Size</label>
      <div className="segmented">{product.sizes.map((item) => <button type="button" className={size === item ? 'active' : ''} key={item} onClick={() => setSize(item)}>{item}</button>)}</div>
      <div className="sticky-buy"><span>{currency(product.price)}</span><button type="button" className="primary" onClick={() => onAdd(product, color, size)}>Add to cart</button></div>
    </section>
  )
}

function Cart({ cart, total, onQty, onDelete, onShop, onCheckout }: { cart: CartItem[]; total: number; onQty: (item: CartItem, delta: number) => void; onDelete: (item: CartItem) => void; onShop: () => void; onCheckout: () => void }) {
  if (!cart.length) return <EmptyState title="Cart is empty" action="Shop now" onClick={onShop} />
  const totalQty = cart.reduce((sum, item) => sum + item.qty, 0)
  return (
    <section>
      <Title title="Cart" caption="Swipe left or right to delete" />
      <div className="cart-list">
        {cart.map((item) => <CartRow key={`${item.productId}-${item.color}-${item.size}`} item={item} onQty={onQty} onDelete={onDelete} />)}
      </div>
      <div className="summary sticky-summary"><div><span>{totalQty} items</span><strong>{currency(total)}</strong></div><button type="button" className="primary" onClick={onCheckout}>Checkout</button></div>
    </section>
  )
}

function CartRow({ item, onQty, onDelete }: { item: CartItem; onQty: (item: CartItem, delta: number) => void; onDelete: (item: CartItem) => void }) {
  const [dragX, setDragX] = useState(0)
  const swipeHandlers = useSwipeable({
    onSwiping: ({ deltaX }) => setDragX(Math.max(-92, Math.min(92, deltaX))),
    onSwipedLeft: ({ absX }) => {
      if (absX > 70) onDelete(item)
      setDragX(0)
    },
    onSwipedRight: ({ absX }) => {
      if (absX > 70) onDelete(item)
      setDragX(0)
    },
    onTouchEndOrOnMouseUp: () => setDragX(0),
    trackMouse: true,
    preventScrollOnSwipe: true,
  })
  return (
    <div className="cart-swipe">
      <span>Delete</span>
      <article
        {...swipeHandlers}
        className="cart-row"
        style={{ transform: `translateX(${dragX}px)` }}
      >
        <img src={item.image} alt={item.name} />
        <div>
          <h3>{item.name}</h3>
          <p>{item.color} / {item.size}</p>
          <strong>{currency(item.price)}</strong>
          <div className="qty"><button type="button" onClick={() => onQty(item, -1)}>-</button><span>{item.qty}</span><button type="button" onClick={() => onQty(item, 1)}>+</button></div>
        </div>
        <button type="button" className="danger icon-danger" onClick={() => onDelete(item)} aria-label="Delete item">x</button>
      </article>
    </div>
  )
}

function Checkout(props: { step: number; cart: CartItem[]; total: number; address?: Address; payment: string; orderId: string; onStep: (step: number) => void; onPayment: (payment: string) => void; onOrder: () => void; onProfile: () => void; onOrders: () => void }) {
  if (!props.cart.length && props.step !== 3) return <EmptyState title="No items to checkout" action="Go shopping" onClick={() => props.onStep(1)} />
  const totalQty = props.cart.reduce((sum, item) => sum + item.qty, 0)
  return (
    <section className="checkout-view">
      <Title title="Checkout" caption={`Step ${props.step} of 3`} />
      <div className="checkout-steps">{['Address', 'Payment', 'Done'].map((item, index) => <span className={props.step >= index + 1 ? 'active' : ''} key={item}>{item}</span>)}</div>
      {props.step === 1 && (
        <div className="panel checkout-panel">
          <h3>Shipping Address</h3>
          <p>{props.address?.detail || 'No default address yet'}</p>
          <div className="checkout-actions">
            <button type="button" className="plain" onClick={props.onProfile}>Manage Address</button>
            <button type="button" className="primary" disabled={!props.address} onClick={() => props.onStep(2)}>Continue</button>
          </div>
        </div>
      )}
      {props.step === 2 && (
        <>
          <div className="panel checkout-panel">
            <h3>Payment</h3>
            {paymentMethods.map((item) => <label className="radio-row payment-card" key={item}><input type="radio" checked={props.payment === item} onChange={() => props.onPayment(item)} /><span>{item}</span></label>)}
          </div>
          <div className="summary sticky-summary"><div><span>{totalQty} items</span><strong>{currency(props.total)}</strong></div><button type="button" className="primary" onClick={props.onOrder}>Place Order</button></div>
        </>
      )}
      {props.step === 3 && <div className="panel success"><div>OK</div><h3>Order successful</h3><p>Order code: {props.orderId}</p><button type="button" className="primary full" onClick={props.onOrders}>Track Order</button></div>}
    </section>
  )
}

function Orders({ orders }: { orders: Order[] }) {
  if (!orders.length) return <EmptyState title="No orders yet" action="Shop now" onClick={() => undefined} />
  return (
    <section>
      <Title title="Order History" caption="Timeline status" />
      {orders.map((order) => <OrderCard key={order.id} order={order} />)}
    </section>
  )
}

function OrderCard({ order }: { order: Order }) {
  const history = order.statusHistory?.length
    ? order.statusHistory
    : statusFlow.filter((status) => statusFlow.indexOf(status) <= statusFlow.indexOf(order.status)).map((status) => ({ status, at: order.createdAt }))
  const timeline = order.status === 'Da huy' ? [...history.filter((item) => item.status !== 'Da huy'), { status: 'Da huy' as OrderStatus, at: history.at(-1)?.at ?? order.createdAt }] : history
  return (
    <article className="order-card">
      <div className="space-between"><strong>{order.id}</strong><span className={`status-pill ${order.status === 'Da huy' ? 'cancelled' : ''}`}>{order.status}</span></div>
      <p>{new Date(order.createdAt).toLocaleDateString('vi-VN')} | {order.items.length} items</p>
      <p>{order.address.detail}</p>
      <div className="timeline">{timeline.map((item) => <span className={item.status === 'Da huy' ? 'cancelled done' : 'done'} key={`${order.id}-${item.status}`}>{item.status}</span>)}</div>
      <strong>{currency(order.total)} | {order.paymentMethod}</strong>
    </article>
  )
}

function Profile(props: { user: User | null; onEdit: () => void; onAddress: (event: FormEvent<HTMLFormElement>) => void; onUpdateAddress: (id: number, patch: Partial<Address>) => void; onDeleteAddress: (id: number) => void; onLogout: () => void }) {
  if (!props.user) return <EmptyState title="Please login" action="Login" onClick={() => undefined} />
  const user = props.user
  const profileItems = [
    ['□', 'Orders', 'Ongoing orders, Recent orders..'],
    ['♡', 'Wishlist', 'Your save product'],
    ['▣', 'Payment', 'Saved card, Wallets'],
    ['⌖', 'Saved Address', user.addresses.length ? user.addresses.map((address) => address.label).join(', ') : 'Home, Office'],
    ['◎', 'Language', 'Select your language here'],
    ['♢', 'Notification', 'Offers, Order tracking messages'],
    ['⚙', 'Settings', 'app settings, Dark mode'],
    ['!', 'Terms & Conditions', 'T&C for use of platform'],
    ['☎', 'Help', 'Customer Support, FAQs'],
  ]

  return (
    <section className="profile-view">
      <h1>Profile</h1>
      <div className="profile-summary">
        <img src={props.user.avatar} alt="" />
        <div>
          <strong>{props.user.name}</strong>
          <span>{props.user.email}</span>
          <span>{props.user.phone || 'Chua co so dien thoai'}</span>
        </div>
        <button type="button" onClick={props.onEdit} aria-label="Edit profile">Edit</button>
      </div>
      <div className="profile-menu">
        {profileItems.map(([icon, title, caption]) => (
          <button type="button" key={title}>
            <span>{icon}</span>
            <div>
              <strong>{title}</strong>
              <p>{caption}</p>
            </div>
          </button>
        ))}
      </div>
      <Title title="Delivery Address" caption="Add, edit default, delete" />
      {props.user.addresses.map((address) => <EditableAddress key={address.id} address={address} onUpdate={props.onUpdateAddress} onDelete={props.onDeleteAddress} />)}
      <form className="panel form" onSubmit={props.onAddress}>
        <label>Label<input name="label" placeholder="Home" /></label>
        <label>Detail<input name="detail" placeholder="12 Nguyen Trai, Quan 1" /></label>
        <label className="check"><input type="checkbox" name="default" /> Set default</label>
        <button type="submit" className="primary full">Add Address</button>
      </form>
      <button type="button" className="danger full logout-button" onClick={props.onLogout}>Logout</button>
    </section>
  )
}

function ProfileEdit({ user, onBack, onSave }: { user: User | null; onBack: () => void; onSave: (payload: ProfilePayload) => Promise<boolean> }) {
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState<ProfilePayload>({
    name: user?.name ?? '',
    email: user?.email ?? '',
    phone: user?.phone ?? '',
    birthday: user?.birthday ?? '',
    avatar: user?.avatar ?? '/mobile/fuzzy/assets/images/icons/profile.png',
  })

  useEffect(() => {
    if (!user) return
    setDraft({
      name: user.name,
      email: user.email,
      phone: user.phone,
      birthday: user.birthday,
      avatar: user.avatar,
    })
  }, [user])

  if (!user) return <EmptyState title="Please login" action="Login" onClick={onBack} />

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    await onSave(draft)
    setSaving(false)
  }

  return (
    <section className="profile-edit-page">
      <div className="profile-edit-top">
        <button type="button" onClick={onBack} aria-label="Back">Back</button>
        <h1>Profile</h1>
        <span />
      </div>
      <img className="profile-edit-avatar" src={draft.avatar} alt="" />
      <form className="profile-edit-form" onSubmit={submit}>
        <label>Name<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Your name" /></label>
        <label>Email id<input type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} placeholder="you@gmail.com" /></label>
        <label>Phone Number<input type="tel" value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} placeholder="+84..." /></label>
        <div className="profile-save-bar">
          <button type="button" onClick={onBack}>Cancel</button>
          <button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
        </div>
      </form>
    </section>
  )
}

function EditableAddress({ address, onUpdate, onDelete }: { address: Address; onUpdate: (id: number, patch: Partial<Address>) => void; onDelete: (id: number) => void }) {
  const [editing, setEditing] = useState(false)
  const [label, setLabel] = useState(address.label)
  const [detail, setDetail] = useState(address.detail)

  if (editing) {
    return (
      <article className="address-card edit">
        <div className="form">
          <label>Label<input value={label} onChange={(event) => setLabel(event.target.value)} /></label>
          <label>Detail<input value={detail} onChange={(event) => setDetail(event.target.value)} /></label>
        </div>
        <div className="address-actions">
          <button type="button" className="primary" onClick={() => { onUpdate(address.id, { label, detail }); setEditing(false) }}>Save</button>
          <button type="button" className="plain" onClick={() => setEditing(false)}>Cancel</button>
        </div>
      </article>
    )
  }

  return (
    <article className="address-card">
      <div>
        <strong>{address.label}{address.default ? ' - Default' : ''}</strong>
        <p>{address.detail}</p>
      </div>
      <div className="address-actions">
        {!address.default && <button type="button" className="plain" onClick={() => onUpdate(address.id, { default: true })}>Default</button>}
        <button type="button" className="plain" onClick={() => setEditing(true)}>Edit</button>
        <button type="button" className="danger" onClick={() => onDelete(address.id)}>Delete</button>
      </div>
    </article>
  )
}

function Admin(props: {
  products: Product[]
  orders: Order[]
  customers: User[]
  categories: string[]
  colors: string[]
  sizes: string[]
  form: ProductForm
  editingProductId: number | null
  newCategory: string
  newColor: string
  newSize: string
  onForm: (form: ProductForm) => void
  onCancelEdit: () => void
  onEdit: (product: Product) => void
  onNewCategory: (value: string) => void
  onNewColor: (value: string) => void
  onNewSize: (value: string) => void
  onSave: (event: FormEvent<HTMLFormElement>) => void
  onAddCategory: (event: FormEvent<HTMLFormElement>) => void
  onDeleteCategory: (name: string) => void
  onAddAttribute: (type: 'colors' | 'sizes', value: string) => void
  onDeleteAttribute: (type: 'colors' | 'sizes', value: string) => void
  onStock: (product: Product, patch: Partial<Product>) => void
  onHide: (product: Product) => void
  onDelete: (product: Product) => void
  onStatus: (order: Order, status: OrderStatus) => void
  onCustomerStatus: (customer: User, active: boolean) => void
}) {
  const pendingOrders = props.orders.filter((order) => order.status === 'Cho xac nhan')
  const activeCustomers = props.customers.filter((customer) => customer.active !== false)
  const toggleFormValue = (field: 'colors' | 'sizes', value: string) => {
    const current = props.form[field]
    const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
    props.onForm({ ...props.form, [field]: next })
  }

  const readImageFile = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })

  const pickMainImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const image = await readImageFile(file)
    props.onForm({ ...props.form, image, images: [image, ...props.form.images.filter((item) => item !== image)] })
    event.target.value = ''
  }

  const pickGalleryImages = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    if (!files.length) return
    const images = await Promise.all(files.map(readImageFile))
    const merged = [...props.form.images, ...images].filter(Boolean)
    props.onForm({ ...props.form, image: props.form.image || images[0] || '', images: merged })
    event.target.value = ''
  }

  const removeGalleryImage = (image: string) => {
    const images = props.form.images.filter((item) => item !== image)
    props.onForm({ ...props.form, images, image: props.form.image === image ? images[0] ?? '' : props.form.image })
  }

  return (
    <section>
      <Title title="Admin Dashboard" caption="Products, stock, orders" />
      <form className="panel form" onSubmit={props.onSave}>
        {props.editingProductId && <div className="edit-banner">Editing product #{props.editingProductId}</div>}
        <label>Name<input value={props.form.name} onChange={(event) => props.onForm({ ...props.form, name: event.target.value })} /></label>
        <label>Description<input value={props.form.description} onChange={(event) => props.onForm({ ...props.form, description: event.target.value })} /></label>
        <label>Category<select value={props.form.category} onChange={(event) => props.onForm({ ...props.form, category: event.target.value })}>{props.categories.map((item) => <option key={item}>{item}</option>)}</select></label>
        <div className="two-col"><label>Price<input type="number" value={props.form.price} onChange={(event) => props.onForm({ ...props.form, price: Number(event.target.value) })} /></label><label>Stock<input type="number" value={props.form.stock} onChange={(event) => props.onForm({ ...props.form, stock: Number(event.target.value) })} /></label></div>
        <label>Image URL<input value={props.form.image} onChange={(event) => {
          const image = event.target.value
          const shouldSyncGallery = props.form.images.length === 0 || (props.form.images.length === 1 && props.form.images[0] === props.form.image)
          props.onForm({ ...props.form, image, images: shouldSyncGallery ? [image].filter(Boolean) : props.form.images })
        }} placeholder="https://example.com/product.jpg" /></label>
        <label>Upload main image<input type="file" accept="image/*" onChange={pickMainImage} /></label>
        {props.form.image && <img className="admin-image-preview" src={props.form.image} alt="" />}
        <label>Gallery image URLs<input value={props.form.images.join(', ')} onChange={(event) => props.onForm({ ...props.form, images: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} placeholder="https://..., /mobile/..." /></label>
        <label>Upload gallery images<input type="file" accept="image/*" multiple onChange={pickGalleryImages} /></label>
        {props.form.images.length > 0 && (
          <div className="admin-gallery-preview">
            {props.form.images.map((image) => <button type="button" key={image} onClick={() => removeGalleryImage(image)} aria-label="Remove gallery image"><img src={image} alt="" /><span>x</span></button>)}
          </div>
        )}
        <label>Colors</label>
        <div className="admin-chip-row">{props.colors.map((item) => <button type="button" className={props.form.colors.includes(item) ? 'active' : ''} key={item} onClick={() => toggleFormValue('colors', item)}>{item}</button>)}</div>
        <label>Sizes</label>
        <div className="admin-chip-row">{props.sizes.map((item) => <button type="button" className={props.form.sizes.includes(item) ? 'active' : ''} key={item} onClick={() => toggleFormValue('sizes', item)}>{item}</button>)}</div>
        <div className={`admin-form-actions ${props.editingProductId ? '' : 'single'}`}>
          {props.editingProductId && <button type="button" className="plain" onClick={props.onCancelEdit}>Cancel Edit</button>}
          <button type="submit" className="primary full">{props.editingProductId ? 'Save Product' : 'Add Product'}</button>
        </div>
      </form>
      <Title title="Categories" caption="Create or remove product groups" />
      <form className="panel form compact-form" onSubmit={props.onAddCategory}>
        <label>Category name<input value={props.newCategory} onChange={(event) => props.onNewCategory(event.target.value)} placeholder="Decor" /></label>
        <button type="submit" className="primary full">Add Category</button>
      </form>
      <div className="admin-chip-row manage">{props.categories.map((item) => <button type="button" key={item} onClick={() => props.onDeleteCategory(item)}>{item} x</button>)}</div>
      <Title title="Product Attributes" caption="Reusable colors and sizes" />
      <form className="panel form compact-form" onSubmit={(event) => { event.preventDefault(); props.onAddAttribute('colors', props.newColor) }}>
        <label>Color<input value={props.newColor} onChange={(event) => props.onNewColor(event.target.value)} placeholder="Walnut" /></label>
        <button type="submit" className="primary full">Add Color</button>
      </form>
      <div className="admin-chip-row manage">{props.colors.map((item) => <button type="button" key={item} onClick={() => props.onDeleteAttribute('colors', item)}>{item} x</button>)}</div>
      <form className="panel form compact-form" onSubmit={(event) => { event.preventDefault(); props.onAddAttribute('sizes', props.newSize) }}>
        <label>Size<input value={props.newSize} onChange={(event) => props.onNewSize(event.target.value)} placeholder="XL" /></label>
        <button type="submit" className="primary full">Add Size</button>
      </form>
      <div className="admin-chip-row manage">{props.sizes.map((item) => <button type="button" key={item} onClick={() => props.onDeleteAttribute('sizes', item)}>{item} x</button>)}</div>
      <Title title="Product Management" />
      {props.products.map((product) => <article className={`admin-row ${product.hidden ? 'muted' : ''}`} key={product.id}><img src={product.image} alt="" /><div><strong>{product.name}</strong><p>{currency(product.price)} | Stock {product.stock} | {product.category}</p><div className="qty"><button type="button" onClick={() => props.onStock(product, { stock: Math.max(0, product.stock - 1) })}>-</button><button type="button" onClick={() => props.onStock(product, { stock: product.stock + 1 })}>+</button><button type="button" onClick={() => props.onEdit(product)}>Edit</button><button type="button" onClick={() => props.onHide(product)}>{product.hidden ? 'Show' : 'Hide'}</button><button type="button" className="danger" onClick={() => props.onDelete(product)}>Delete</button></div></div></article>)}
      <Title title="Customer Accounts" caption="View and control customer access" />
      <div className="admin-order-stats">
        <div><strong>{activeCustomers.length}</strong><span>Active customers</span></div>
        <div><strong>{props.customers.length}</strong><span>Total customers</span></div>
      </div>
      {props.customers.length === 0 && <p className="muted-text">No customer accounts yet.</p>}
      <div className="admin-customer-list">
        {props.customers.map((customer) => {
          const active = customer.active !== false
          return (
            <article className={`admin-customer-card ${active ? '' : 'muted'}`} key={customer.id}>
              <img src={customer.avatar || '/mobile/fuzzy/assets/images/icons/profile.png'} alt="" />
              <div>
                <div className="space-between">
                  <strong>{customer.name}</strong>
                  <span className={active ? 'status-pill active' : 'status-pill inactive'}>{active ? 'Hoat dong' : 'Ngung'}</span>
                </div>
                <p>{customer.email}</p>
                <p className="muted-text">{customer.phone || 'Chua co so dien thoai'} | {customer.addresses?.length ?? 0} dia chi</p>
              </div>
              <button type="button" className={active ? 'danger' : 'primary'} onClick={() => props.onCustomerStatus(customer, !active)}>{active ? 'Ngung hoat dong' : 'Kich hoat'}</button>
            </article>
          )
        })}
      </div>
      <Title title="Order Management" />
      <div className="admin-order-stats">
        <div><strong>{pendingOrders.length}</strong><span>Awaiting approval</span></div>
        <div><strong>{props.orders.length}</strong><span>Total orders</span></div>
      </div>
      {props.orders.length === 0 && <p className="muted-text">No orders yet.</p>}
      {props.orders.map((order) => {
        const nextStatuses = nextOrderStatuses(order.status)
        const customerName = order.customer?.name ?? `User #${order.userId ?? ''}`
        return (
          <article className={`order-card admin-order-card ${order.status === 'Cho xac nhan' ? 'needs-approval' : ''}`} key={order.id}>
            <div className="space-between"><strong>{order.id}</strong><strong>{currency(order.total)}</strong></div>
            <p>{customerName} | {order.paymentMethod}</p>
            <p className="muted-text">{new Date(order.createdAt).toLocaleString()} | {order.address.label}: {order.address.detail}</p>
            <div className="admin-order-items">
              {order.items.map((item) => (
                <div className="admin-order-item" key={`${order.id}-${item.productId}-${item.name}`}>
                  <img src={item.image || '/mobile/fuzzy/assets/images/product/1.png'} alt="" />
                  <div>
                    <strong>{item.name}</strong>
                    <span>Qty {item.qty} x {currency(item.price)}</span>
                  </div>
                  <b>{currency(item.subtotal)}</b>
                </div>
              ))}
            </div>
            <div className="timeline compact">{statusOptions.map((status) => <span className={status === order.status || (status !== 'Da huy' && order.status !== 'Da huy' && statusFlow.indexOf(status) <= statusFlow.indexOf(order.status)) ? 'done' : ''} key={status}>{status}</span>)}</div>
            <div className="order-actions">
              {nextStatuses.length ? nextStatuses.map((status) => <button type="button" className={status === 'Da huy' ? 'danger' : 'primary'} key={status} onClick={() => props.onStatus(order, status)}>{adminStatusLabel(order.status, status)}</button>) : <span className="muted-text">No next action</span>}
              <select value={order.status} onChange={(event) => props.onStatus(order, event.target.value as OrderStatus)} aria-label="Manual status update">{statusOptions.map((status) => <option key={status}>{status}</option>)}</select>
            </div>
          </article>
        )
      })}
    </section>
  )
}

function Auth(props: { mode: AuthMode; user: User | null; credentials: { email: string; password: string }; onMode: (mode: AuthMode) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onOAuth: (provider: 'Google' | 'Facebook') => void }) {
  const [showPassword, setShowPassword] = useState(false)
  const isAdminLogin = props.mode === 'admin'
  return (
    <section className="auth-view">
      <img src="/mobile/fuzzy/assets/images/logo/logo.png" alt="Fuzzy" />
      <h1>{isAdminLogin ? 'Admin Login' : props.mode === 'login' ? 'Login' : 'Create Account'}</h1>
      {isAdminLogin && <p className="auth-caption">Dang nhap rieng de quan ly them, sua, xoa hang.</p>}
      <form className="panel form" key={`${props.mode}-${props.credentials.email}-${props.credentials.password}`} onSubmit={props.onSubmit}>
        {props.mode === 'register' && <label>Name<input name="name" defaultValue={props.user?.name ?? ''} /></label>}
        <label>Email<input name="email" defaultValue={props.mode === 'login' ? props.credentials.email : ''} /></label>
        {props.mode === 'register' && <label>Phone<input name="phone" placeholder="0901234567" /></label>}
        <label>Password<div className="password"><input name="password" type={showPassword ? 'text' : 'password'} defaultValue={props.mode === 'login' ? props.credentials.password : ''} /><button type="button" onClick={() => setShowPassword((value) => !value)}>{showPassword ? 'Hide' : 'Show'}</button></div></label>
        <button type="submit" className="primary full">{isAdminLogin ? 'Login Admin' : props.mode === 'login' ? 'Login' : 'Register'}</button>
      </form>
      {isAdminLogin ? (
        <button type="button" className="plain" onClick={() => props.onMode('login')}>User login</button>
      ) : (
        <>
          <button type="button" className="plain" onClick={() => props.onMode(props.mode === 'login' ? 'register' : 'login')}>{props.mode === 'login' ? 'Create new account' : 'Already have account'}</button>
          <div className="oauth-row"><button type="button" onClick={() => props.onOAuth('Google')}>Google OAuth</button><button type="button" onClick={() => props.onOAuth('Facebook')}>Facebook OAuth</button></div>
        </>
      )}
    </section>
  )
}

function ProductGrid({ products, onDetail, onAdd }: { products: Product[]; onDetail: (product: Product) => void; onAdd: (product: Product) => void }) {
  return <div className="product-grid">{products.map((product) => <ProductCard key={product.id} product={product} onDetail={onDetail} onAdd={onAdd} />)}</div>
}

function ProductCard({ product, onDetail, onAdd }: { product: Product; onDetail: (product: Product) => void; onAdd: (product: Product) => void }) {
  return (
    <article className="product-card">
      <button type="button" className="image-button" onClick={() => onDetail(product)}><img src={product.image} alt={product.name} /></button>
      <button type="button" className="like" aria-label="Wishlist">♥</button>
      <h3>{product.name}</h3>
      <p>{product.description}</p>
      <div className="space-between"><strong>{currency(product.price)}</strong><span>★ {product.rating}</span></div>
      <button type="button" className="cart-button" onClick={() => onAdd(product)}>Add</button>
    </article>
  )
}

function HorizontalProduct({ product, onDetail, onAdd }: { product: Product; onDetail: (product: Product) => void; onAdd: (product: Product) => void }) {
  return (
    <article className="horizontal-product">
      <button type="button" onClick={() => onDetail(product)}><img src={product.image} alt={product.name} /></button>
      <div><div className="space-between"><h3>{product.name}</h3><span>★ {product.rating}</span></div><p>{product.description}</p><div className="space-between"><strong>{currency(product.price)}</strong><button type="button" onClick={() => onAdd(product)}>Bag</button></div></div>
    </article>
  )
}

function Title({ title, caption, action, onAction }: { title: string; caption?: string; action?: string; onAction?: () => void }) {
  return <div className="title"><div><h2>{title}</h2>{caption && <p>{caption}</p>}</div>{action && <button type="button" className="plain" onClick={onAction}>{action}</button>}</div>
}

function BottomNav({ view, cartCount, onOpen }: { view: View; cartCount: number; onOpen: (view: View) => void }) {
  const activeView: View = view === 'detail' ? 'shop' : view === 'checkout' ? 'cart' : view === 'auth' || view === 'admin' || view === 'profileEdit' ? 'profile' : view
  const items: Array<[View, string]> = [['home', 'Home'], ['shop', 'Shop'], ['cart', `Cart${cartCount ? ` ${cartCount}` : ''}`], ['orders', 'Orders'], ['profile', 'Profile']]
  return <nav className="bottom-nav">{items.map(([key, label]) => <button type="button" className={activeView === key ? 'active' : ''} key={key} onClick={() => onOpen(key)}>{label}</button>)}</nav>
}

function Sidebar(props: { open: boolean; user: User | null; dark: boolean; rtl: boolean; isAuthed: boolean; onDark: (value: boolean) => void; onRtl: (value: boolean) => void; onClose: () => void; onAuth: () => void; onLogout: () => void }) {
  const swipeHandlers = useSwipeable({
    onSwipedLeft: () => props.onClose(),
    onSwipedRight: () => props.onClose(),
    trackMouse: true,
  })
  if (!props.open) return null
  return (
    <div className="sidebar-cover" onClick={props.onClose}>
      <aside className="sidebar" {...swipeHandlers} onClick={(event) => event.stopPropagation()}>
        <div className="sidebar-head"><img src={props.user?.avatar || '/mobile/fuzzy/assets/images/icons/profile.png'} alt="" /><h3>Hello, {props.user?.name || 'Agasya'}!</h3><button type="button" onClick={props.onClose}>x</button></div>
        <label className="switch-row">RTL<input type="checkbox" checked={props.rtl} onChange={(event) => props.onRtl(event.target.checked)} /></label>
        <label className="switch-row">Dark<input type="checkbox" checked={props.dark} onChange={(event) => props.onDark(event.target.checked)} /></label>
        <a href="/mobile/fuzzy/landing.html">Original Template</a>
        <button type="button" onClick={props.isAuthed ? props.onLogout : props.onAuth}>{props.isAuthed ? 'Logout' : 'Login'}</button>
      </aside>
    </div>
  )
}

function InstallPrompt({ onInstall, onDismiss }: { onInstall: () => void; onDismiss: () => void }) {
  return (
    <aside className="install-prompt">
      <img src="/mobile/fuzzy/assets/images/logo/48.png" alt="" />
      <div>
        <strong>Install Fuzzy</strong>
        <p>Add to Home Screen de mo nhanh nhu app mobile.</p>
      </div>
      <button type="button" className="primary" onClick={onInstall}>Install</button>
      <button type="button" className="plain" onClick={onDismiss} aria-label="Dismiss install prompt">x</button>
    </aside>
  )
}

function EmptyState({ title, action, onClick }: { title: string; action: string; onClick: () => void }) {
  return <div className="empty-state"><div>FZ</div><h2>{title}</h2><button type="button" className="primary" onClick={onClick}>{action}</button></div>
}

function ApiDown({ offline = false }: { offline?: boolean }) {
  return (
    <div className="empty-state">
      <div>API</div>
      <h2>{offline ? 'Không có kết nối mạng' : 'API chua chay'}</h2>
      <p>{offline ? 'App van mo duoc o che do offline. Hay ket noi lai de dong bo san pham va don hang.' : 'Hay chay lenh npm run api, sau do refresh trang.'}</p>
    </div>
  )
}

export default App
