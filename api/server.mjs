import { createServer } from 'node:http'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { copyFile, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const bundledDbPath = join(__dirname, 'db.json')
const dbPath = process.env.FUZZY_DB_PATH ?? (process.env.VERCEL ? join('/tmp', 'fuzzy-db.json') : bundledDbPath)
const port = Number(process.env.API_PORT ?? 4000)
const tokenTtlMs = 1000 * 60 * 60 * 24
const jwtSecret = process.env.JWT_SECRET ?? 'fuzzy-dev-secret'

const ensureDb = async () => {
  try {
    await readFile(dbPath, 'utf8')
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    await copyFile(bundledDbPath, dbPath)
  }
}

const readDb = async () => {
  await ensureDb()
  return JSON.parse(await readFile(dbPath, 'utf8'))
}
const writeDb = async (db) => writeFile(dbPath, JSON.stringify(db, null, 2))

const json = (res, status, data) => {
  res.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json; charset=utf-8',
  })
  res.end(JSON.stringify(data))
}

const parseBody = (req) => new Promise((resolve, reject) => {
  let raw = ''
  req.on('data', (chunk) => {
    raw += chunk
    if (raw.length > 1_000_000) req.destroy()
  })
  req.on('end', () => {
    if (!raw) {
      resolve({})
      return
    }
    try {
      resolve(JSON.parse(raw))
    } catch (error) {
      reject(error)
    }
  })
})

const sign = (value) => createHmac('sha256', jwtSecret).update(value).digest('base64url')

const encodeToken = (payload) => {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = sign(`${header}.${body}`)
  return `${header}.${body}.${signature}`
}

const decodeToken = (token) => {
  try {
    const [header, body, signature] = token.split('.')
    if (!header || !body || !signature) return null
    const expected = sign(`${header}.${body}`)
    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    return payload.exp > Date.now() ? payload : null
  } catch {
    return null
  }
}

const publicUser = (user) => {
  const { password: _password, ...safeUser } = user
  return safeUser
}

const getAuthUser = (req, db) => {
  const auth = req.headers.authorization ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  const payload = decodeToken(token)
  if (!payload) return null
  return db.users.find((user) => user.id === payload.userId) ?? null
}

const isAdmin = (user) => user?.role === 'admin'
const normalizeEmail = (value) => String(value ?? '').trim().toLowerCase()
const adminEmailAliases = ['admin@fuzzy.local', 'admin@fuzzy.com']

const needsAdmin = (req, url) => {
  if (req.method === 'GET' && url.pathname === '/api/users') return true
  if (req.method === 'PATCH' && /^\/api\/users\/\d+\/status$/.test(url.pathname)) return true
  if (req.method === 'GET' && url.pathname === '/api/orders' && url.searchParams.get('all') === 'true') return true
  if (req.method === 'GET' && url.pathname === '/api/products' && url.searchParams.get('includeHidden') === 'true') return true
  if (['POST', 'PUT', 'DELETE'].includes(req.method ?? '') && /^\/api\/(products|categories|attributes)(?:\/|$)/.test(url.pathname)) return true
  if (req.method === 'PATCH' && /^\/api\/orders\/[^/]+\/status$/.test(url.pathname)) return true
  return false
}

const nextId = (items) => items.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1

const requireFields = (body, fields) => fields.filter((field) => !body[field])
const orderStatuses = ['Cho xac nhan', 'Dang chuan bi', 'Dang giao', 'Hoan thanh', 'Da huy']
const nextOrderStatuses = {
  'Cho xac nhan': ['Dang chuan bi', 'Da huy'],
  'Dang chuan bi': ['Dang giao', 'Da huy'],
  'Dang giao': ['Hoan thanh'],
  'Hoan thanh': [],
  'Da huy': [],
}
const normalizedProduct = (product) => ({
  ...product,
  images: Array.isArray(product.images) && product.images.length ? product.images : [product.image],
})

const uniqueText = (items) => [...new Set(items.map((item) => String(item).trim()).filter(Boolean))]

const ensureCatalog = (db) => {
  db.categories = uniqueText(db.categories ?? [])
  db.attributes = {
    colors: uniqueText(db.attributes?.colors ?? db.products.flatMap((product) => product.colors ?? [])),
    sizes: uniqueText(db.attributes?.sizes ?? db.products.flatMap((product) => product.sizes ?? [])),
  }
}

const routes = {
  'GET /api/health': async () => ({ ok: true, service: 'fuzzy-api' }),

  'POST /api/auth/register': async ({ body, db }) => {
    const missing = requireFields(body, ['name', 'email', 'password'])
    if (missing.length) return [400, { message: `Missing fields: ${missing.join(', ')}` }]
    if (!/^\S+@\S+\.\S+$/.test(body.email)) return [400, { message: 'Email is invalid' }]
    if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(body.password)) {
      return [400, { message: 'Password must be at least 8 characters and include letters and numbers' }]
    }
    if (db.users.some((user) => user.email === body.email)) return [409, { message: 'Email already exists' }]

    const user = {
      id: nextId(db.users),
      name: body.name,
      email: body.email,
      password: body.password,
      role: 'customer',
      phone: body.phone ?? '',
      birthday: body.birthday ?? '',
      avatar: body.avatar ?? '/mobile/fuzzy/assets/images/icons/profile.png',
      addresses: [],
    }
    db.users.push(user)
    await writeDb(db)
    return [201, issueAuth(user)]
  },

  'POST /api/auth/login': async ({ body, db }) => {
    const missing = requireFields(body, ['email', 'password'])
    if (missing.length) return [400, { message: 'Vui long nhap email va mat khau' }]
    const email = normalizeEmail(body.email)
    if (!/^\S+@\S+\.\S+$/.test(email)) return [400, { message: 'Email khong dung dinh dang' }]
    const user = db.users.find((item) => normalizeEmail(item.email) === email && item.password === body.password)
    if (user && user.active === false) return [403, { message: 'Tai khoan da ngung hoat dong' }]
    if (!user) return [401, { message: 'Sai email hoac mat khau' }]
    return issueAuth(user)
  },

  'POST /api/auth/admin/login': async ({ body, db }) => {
    const missing = requireFields(body, ['email', 'password'])
    if (missing.length) return [400, { message: 'Vui long nhap email va mat khau admin' }]
    const email = normalizeEmail(body.email)
    if (!/^\S+@\S+\.\S+$/.test(email)) return [400, { message: 'Email khong dung dinh dang' }]
    const user = db.users.find((item) => {
      if (item.password !== body.password || item.role !== 'admin') return false
      const itemEmail = normalizeEmail(item.email)
      return itemEmail === email || adminEmailAliases.includes(email) && adminEmailAliases.includes(itemEmail)
    })
    if (!user) return [401, { message: 'Sai tai khoan admin hoac khong co quyen admin' }]
    return issueAuth(user)
  },

  'POST /api/auth/oauth': async ({ body, db }) => {
    const missing = requireFields(body, ['provider', 'email', 'name'])
    if (missing.length) return [400, { message: `Missing fields: ${missing.join(', ')}` }]
    const user = db.users.find((item) => item.email === body.email)
    if (!user) {
      return [401, { message: 'Tai khoan OAuth chua duoc dang ky' }]
    }
    if (user.active === false) return [403, { message: 'Tai khoan da ngung hoat dong' }]
    return issueAuth(user)
  },

  'GET /api/users': async ({ db }) => db.users.filter((user) => user.role !== 'admin').map(publicUser),

  'GET /api/users/me': async ({ user }) => publicUser(user),

  'PUT /api/users/me': async ({ body, db, user }) => {
    if (body.email !== undefined) {
      const email = String(body.email).trim()
      if (!/^\S+@\S+\.\S+$/.test(email)) return [400, { message: 'Email khong dung dinh dang' }]
      if (db.users.some((entry) => entry.id !== user.id && entry.email === email)) return [409, { message: 'Email already exists' }]
      user.email = email
    }
    Object.assign(user, {
      name: body.name ?? user.name,
      phone: body.phone ?? user.phone,
      birthday: body.birthday ?? user.birthday,
      avatar: body.avatar ?? user.avatar,
    })
    await writeDb(db)
    return publicUser(user)
  },

  'POST /api/users/me/addresses': async ({ body, db, user }) => {
    const missing = requireFields(body, ['label', 'detail'])
    if (missing.length) return [400, { message: `Missing fields: ${missing.join(', ')}` }]
    const address = {
      id: nextId(user.addresses),
      label: body.label,
      detail: body.detail,
      default: Boolean(body.default),
    }
    if (address.default) user.addresses = user.addresses.map((item) => ({ ...item, default: false }))
    user.addresses.push(address)
    await writeDb(db)
    return [201, address]
  },

  'GET /api/categories': async ({ db }) => {
    ensureCatalog(db)
    return db.categories
  },

  'POST /api/categories': async ({ body, db }) => {
    ensureCatalog(db)
    const name = String(body.name ?? '').trim()
    if (!name) return [400, { message: 'Category name is required' }]
    if (!db.categories.includes(name)) db.categories.push(name)
    await writeDb(db)
    return [201, db.categories]
  },

  'GET /api/attributes': async ({ db }) => {
    ensureCatalog(db)
    return db.attributes
  },

  'GET /api/products': async ({ db, url }) => {
    ensureCatalog(db)
    let products = db.products.map(normalizedProduct)
    const category = url.searchParams.get('category')
    const color = url.searchParams.get('color')
    const size = url.searchParams.get('size')
    const search = url.searchParams.get('search')?.trim().toLowerCase()
    const includeHidden = url.searchParams.get('includeHidden') === 'true'
    const sort = url.searchParams.get('sort')
    if (!includeHidden) products = products.filter((product) => !product.hidden)
    if (category) products = products.filter((product) => product.category === category)
    if (color) products = products.filter((product) => product.colors?.includes(color))
    if (size) products = products.filter((product) => product.sizes?.includes(size))
    if (search) {
      products = products.filter((product) => [product.name, product.description, product.category].some((value) => String(value).toLowerCase().includes(search)))
    }
    if (sort === 'price_asc') products = [...products].sort((a, b) => a.price - b.price)
    if (sort === 'price_desc') products = [...products].sort((a, b) => b.price - a.price)
    if (sort === 'rating_desc') products = [...products].sort((a, b) => b.rating - a.rating)
    if (url.searchParams.get('paginate') === 'true') {
      const page = Math.max(1, Number(url.searchParams.get('page') ?? 1))
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? 10)))
      const start = (page - 1) * limit
      return {
        items: products.slice(start, start + limit),
        total: products.length,
        page,
        limit,
        hasMore: start + limit < products.length,
      }
    }
    return products
  },

  'POST /api/products': async ({ body, db }) => {
    ensureCatalog(db)
    const missing = requireFields(body, ['name', 'category', 'price', 'stock', 'image'])
    if (missing.length) return [400, { message: `Missing fields: ${missing.join(', ')}` }]
    const product = {
      id: nextId(db.products),
      description: '',
      oldPrice: null,
      rating: 0,
      colors: [],
      sizes: [],
      images: [],
      hidden: false,
      ...body,
      price: Number(body.price),
      stock: Number(body.stock),
    }
    product.images = Array.isArray(product.images) && product.images.length ? product.images : [product.image]
    if (!db.categories.includes(product.category)) db.categories.push(product.category)
    db.attributes.colors = uniqueText([...db.attributes.colors, ...product.colors])
    db.attributes.sizes = uniqueText([...db.attributes.sizes, ...product.sizes])
    db.products.push(product)
    await writeDb(db)
    return [201, product]
  },

  'POST /api/orders': async ({ body, db, user }) => {
    const missing = requireFields(body, ['items', 'addressId', 'paymentMethod'])
    if (missing.length) return [400, { message: `Missing fields: ${missing.join(', ')}` }]
    if (!Array.isArray(body.items) || body.items.length === 0) return [400, { message: 'Order items are required' }]
    const address = user.addresses.find((item) => item.id === Number(body.addressId))
    if (!address) return [404, { message: 'Address not found' }]

    const orderItems = []
    for (const item of body.items) {
      const product = db.products.find((entry) => entry.id === Number(item.productId))
      const qty = Number(item.qty)
      if (!product) return [404, { message: `Product ${item.productId} not found` }]
      if (qty < 1) return [400, { message: 'Quantity must be greater than zero' }]
      if (product.stock < qty) return [409, { message: `${product.name} is out of stock` }]
      product.stock -= qty
      orderItems.push({
        productId: product.id,
        name: product.name,
        image: product.image,
        price: product.price,
        qty,
        subtotal: product.price * qty,
      })
    }

    const order = {
      id: `FZ${Date.now().toString().slice(-8)}`,
      userId: user.id,
      createdAt: new Date().toISOString(),
      status: 'Cho xac nhan',
      statusHistory: [{ status: 'Cho xac nhan', at: new Date().toISOString() }],
      restocked: false,
      paymentMethod: body.paymentMethod,
      customer: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone ?? '',
      },
      address,
      items: orderItems,
      total: orderItems.reduce((sum, item) => sum + item.subtotal, 0),
    }
    db.orders.unshift(order)
    await writeDb(db)
    return [201, order]
  },

  'GET /api/orders': async ({ db, user, url }) => {
    const all = url.searchParams.get('all') === 'true'
    return all ? db.orders : db.orders.filter((order) => order.userId === user.id)
  },
}

const issueAuth = (user) => ({
  token: encodeToken({ userId: user.id, exp: Date.now() + tokenTtlMs }),
  user: publicUser(user),
})

const handleDynamicRoute = async ({ req, url, body, db, user }) => {
  const categoryMatch = url.pathname.match(/^\/api\/categories\/(.+)$/)
  if (categoryMatch) {
    ensureCatalog(db)
    const currentName = decodeURIComponent(categoryMatch[1])
    const index = db.categories.findIndex((item) => item === currentName)
    if (index === -1) return [404, { message: 'Category not found' }]
    if (req.method === 'PUT') {
      const nextName = String(body.name ?? '').trim()
      if (!nextName) return [400, { message: 'Category name is required' }]
      db.categories[index] = nextName
      db.products = db.products.map((product) => product.category === currentName ? { ...product, category: nextName } : product)
      await writeDb(db)
      return db.categories
    }
    if (req.method === 'DELETE') {
      db.categories = db.categories.filter((item) => item !== currentName)
      db.products = db.products.map((product) => product.category === currentName ? { ...product, hidden: true } : product)
      await writeDb(db)
      return { message: 'Category removed and matching products hidden', categories: db.categories }
    }
  }

  const attributeMatch = url.pathname.match(/^\/api\/attributes\/(colors|sizes)(?:\/(.+))?$/)
  if (attributeMatch) {
    ensureCatalog(db)
    const type = attributeMatch[1]
    const value = attributeMatch[2] ? decodeURIComponent(attributeMatch[2]) : String(body.value ?? '').trim()
    if (!value) return [400, { message: 'Attribute value is required' }]
    if (req.method === 'POST') {
      db.attributes[type] = uniqueText([...db.attributes[type], value])
      await writeDb(db)
      return [201, db.attributes]
    }
    if (req.method === 'DELETE') {
      db.attributes[type] = db.attributes[type].filter((item) => item !== value)
      db.products = db.products.map((product) => ({ ...product, [type]: (product[type] ?? []).filter((item) => item !== value) }))
      await writeDb(db)
      return db.attributes
    }
  }

  const productMatch = url.pathname.match(/^\/api\/products\/(\d+)$/)
  if (productMatch) {
    const product = db.products.find((item) => item.id === Number(productMatch[1]))
    if (!product) return [404, { message: 'Product not found' }]
    if (req.method === 'GET') return normalizedProduct(product)
    if (req.method === 'PUT') {
      ensureCatalog(db)
      Object.assign(product, body, {
        price: body.price === undefined ? product.price : Number(body.price),
        stock: body.stock === undefined ? product.stock : Number(body.stock),
      })
      product.images = Array.isArray(product.images) && product.images.length ? product.images : [product.image]
      if (!db.categories.includes(product.category)) db.categories.push(product.category)
      db.attributes.colors = uniqueText([...db.attributes.colors, ...(product.colors ?? [])])
      db.attributes.sizes = uniqueText([...db.attributes.sizes, ...(product.sizes ?? [])])
      await writeDb(db)
      return product
    }
    if (req.method === 'DELETE') {
      db.products = db.products.filter((item) => item.id !== product.id)
      await writeDb(db)
      return { message: 'Product deleted', product }
    }
  }

  const addressMatch = url.pathname.match(/^\/api\/users\/me\/addresses\/(\d+)$/)
  if (addressMatch) {
    const address = user.addresses.find((item) => item.id === Number(addressMatch[1]))
    if (!address) return [404, { message: 'Address not found' }]
    if (req.method === 'PUT') {
      Object.assign(address, body)
      if (address.default) user.addresses = user.addresses.map((item) => ({ ...item, default: item.id === address.id }))
      await writeDb(db)
      return address
    }
    if (req.method === 'DELETE') {
      user.addresses = user.addresses.filter((item) => item.id !== address.id)
      await writeDb(db)
      return { message: 'Address deleted' }
    }
  }

  const userStatusMatch = url.pathname.match(/^\/api\/users\/(\d+)\/status$/)
  if (userStatusMatch && req.method === 'PATCH') {
    const target = db.users.find((entry) => entry.id === Number(userStatusMatch[1]))
    if (!target) return [404, { message: 'User not found' }]
    if (target.role === 'admin') return [409, { message: 'Cannot change admin account status' }]
    target.active = body.active !== false
    await writeDb(db)
    return publicUser(target)
  }

  const orderStatusMatch = url.pathname.match(/^\/api\/orders\/([^/]+)\/status$/)
  if (orderStatusMatch && req.method === 'PATCH') {
    if (!orderStatuses.includes(body.status)) return [400, { message: 'Invalid order status' }]
    const order = db.orders.find((item) => item.id === orderStatusMatch[1])
    if (!order) return [404, { message: 'Order not found' }]
    const allowedNext = nextOrderStatuses[order.status] ?? []
    if (order.status !== body.status && !allowedNext.includes(body.status)) {
      return [409, { message: `Cannot move order from ${order.status} to ${body.status}` }]
    }
    if (body.status === 'Da huy' && !order.restocked) {
      for (const item of order.items) {
        const product = db.products.find((entry) => entry.id === Number(item.productId))
        if (product) product.stock += Number(item.qty)
      }
      order.restocked = true
    }
    order.status = body.status
    order.statusHistory = Array.isArray(order.statusHistory) ? order.statusHistory : []
    if (!order.statusHistory.some((item) => item.status === body.status)) {
      order.statusHistory.push({ status: body.status, at: new Date().toISOString() })
    }
    await writeDb(db)
    return order
  }

  return [404, { message: 'Route not found' }]
}

export const handler = async (req, res) => {
  if (req.method === 'OPTIONS') {
    json(res, 204, {})
    return
  }

  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
    const body = ['POST', 'PUT', 'PATCH'].includes(req.method ?? '') ? await parseBody(req) : {}
    const db = await readDb()
    const key = `${req.method} ${url.pathname}`
    const adminOnly = needsAdmin(req, url)
    const needsAuth = adminOnly
      || !key.startsWith('GET /api/health')
      && !key.startsWith('POST /api/auth/')
      && !key.startsWith('GET /api/products')
      && key !== 'GET /api/categories'
      && key !== 'GET /api/attributes'
      && !(req.method === 'GET' && /^\/api\/products\/\d+$/.test(url.pathname))
    const user = needsAuth ? getAuthUser(req, db) : null

    if (needsAuth && !user) {
      json(res, 401, { message: 'Bearer token is required or expired' })
      return
    }

    if (adminOnly && !isAdmin(user)) {
      json(res, 403, { message: 'Admin permission is required' })
      return
    }

    const route = routes[key]
    const result = route
      ? await route({ req, url, body, db, user })
      : await handleDynamicRoute({ req, url, body, db, user })
    const [status, data] = Array.isArray(result) && typeof result[0] === 'number' ? result : [200, result]
    json(res, status, data)
  } catch (error) {
    json(res, 500, { message: 'Internal server error', detail: error.message })
  }
}

export default handler

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createServer(handler).listen(port, () => {
    console.log(`Fuzzy API running at http://127.0.0.1:${port}`)
  })
}
