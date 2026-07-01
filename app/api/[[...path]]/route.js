import { createHmac, timingSafeEqual } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { NextResponse } from 'next/server'

const dbPath = join(process.cwd(), 'api', 'db.json')
const tokenTtlMs = 1000 * 60 * 60 * 24
const jwtSecret = process.env.JWT_SECRET ?? 'fuzzy-dev-secret'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const readDb = async () => JSON.parse(await readFile(dbPath, 'utf8'))
const writeDb = async (db) => writeFile(dbPath, JSON.stringify(db, null, 2))
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
const send = (data, status = 200) => NextResponse.json(data, { status, headers: corsHeaders })
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

const sign = (value) => createHmac('sha256', jwtSecret).update(value).digest('base64url')

const encodeToken = (payload) => {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${header}.${body}.${sign(`${header}.${body}`)}`
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

const issueAuth = (user) => ({
  token: encodeToken({ userId: user.id, exp: Date.now() + tokenTtlMs }),
  user: publicUser(user),
})

const getAuthUser = (request, db) => {
  const auth = request.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  const payload = decodeToken(token)
  if (!payload) return null
  return db.users.find((user) => user.id === payload.userId) ?? null
}

const isAdmin = (user) => user?.role === 'admin'
const normalizeEmail = (value) => String(value ?? '').trim().toLowerCase()
const adminEmailAliases = ['admin@fuzzy.local', 'admin@fuzzy.com']

const needsAdmin = (method, pathname, url) => {
  if (method === 'GET' && pathname === '/api/users') return true
  if (method === 'PATCH' && /^\/api\/users\/\d+\/status$/.test(pathname)) return true
  if (method === 'GET' && pathname === '/api/orders' && url.searchParams.get('all') === 'true') return true
  if (method === 'GET' && pathname === '/api/products' && url.searchParams.get('includeHidden') === 'true') return true
  if (['POST', 'PUT', 'DELETE'].includes(method) && /^\/api\/(products|categories|attributes)(?:\/|$)/.test(pathname)) return true
  if (method === 'PATCH' && /^\/api\/orders\/[^/]+\/status$/.test(pathname)) return true
  return false
}

async function parseBody(request) {
  if (!['POST', 'PUT', 'PATCH'].includes(request.method)) return {}
  const text = await request.text()
  return text ? JSON.parse(text) : {}
}

async function handleApi(request) {
  const url = request.nextUrl
  const pathname = url.pathname
  const method = request.method
  const key = `${method} ${pathname}`
  const body = await parseBody(request)
  const db = await readDb()
  const adminOnly = needsAdmin(method, pathname, url)
  const needsAuth = adminOnly
    || !key.startsWith('GET /api/health')
    && !key.startsWith('POST /api/auth/')
    && !key.startsWith('GET /api/products')
    && key !== 'GET /api/categories'
    && key !== 'GET /api/attributes'
    && !(method === 'GET' && /^\/api\/products\/\d+$/.test(pathname))
  const user = needsAuth ? getAuthUser(request, db) : null

  if (needsAuth && !user) return send({ message: 'Bearer token is required or expired' }, 401)
  if (adminOnly && !isAdmin(user)) return send({ message: 'Admin permission is required' }, 403)

  if (key === 'GET /api/health') return send({ ok: true, service: 'fuzzy-next-api' })

  if (key === 'POST /api/auth/register') {
    const missing = requireFields(body, ['name', 'email', 'password'])
    if (missing.length) return send({ message: `Missing fields: ${missing.join(', ')}` }, 400)
    if (!/^\S+@\S+\.\S+$/.test(body.email)) return send({ message: 'Email is invalid' }, 400)
    if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(body.password)) return send({ message: 'Password must be at least 8 characters and include letters and numbers' }, 400)
    if (db.users.some((entry) => entry.email === body.email)) return send({ message: 'Email already exists' }, 409)
    const newUser = {
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
    db.users.push(newUser)
    await writeDb(db)
    return send(issueAuth(newUser), 201)
  }

  if (key === 'POST /api/auth/login') {
    const missing = requireFields(body, ['email', 'password'])
    if (missing.length) return send({ message: 'Vui long nhap email va mat khau' }, 400)
    const email = normalizeEmail(body.email)
    if (!/^\S+@\S+\.\S+$/.test(email)) return send({ message: 'Email khong dung dinh dang' }, 400)
    const found = db.users.find((entry) => normalizeEmail(entry.email) === email && entry.password === body.password)
    if (found && found.active === false) return send({ message: 'Tai khoan da ngung hoat dong' }, 403)
    return found ? send(issueAuth(found)) : send({ message: 'Sai email hoac mat khau' }, 401)
  }

  if (key === 'POST /api/auth/admin/login') {
    const missing = requireFields(body, ['email', 'password'])
    if (missing.length) return send({ message: 'Vui long nhap email va mat khau admin' }, 400)
    const email = normalizeEmail(body.email)
    if (!/^\S+@\S+\.\S+$/.test(email)) return send({ message: 'Email khong dung dinh dang' }, 400)
    const found = db.users.find((entry) => {
      if (entry.password !== body.password || entry.role !== 'admin') return false
      const entryEmail = normalizeEmail(entry.email)
      return entryEmail === email || adminEmailAliases.includes(email) && adminEmailAliases.includes(entryEmail)
    })
    return found ? send(issueAuth(found)) : send({ message: 'Sai tai khoan admin hoac khong co quyen admin' }, 401)
  }

  if (key === 'POST /api/auth/oauth') {
    const missing = requireFields(body, ['provider', 'email', 'name'])
    if (missing.length) return send({ message: `Missing fields: ${missing.join(', ')}` }, 400)
    const found = db.users.find((entry) => entry.email === body.email)
    if (!found) {
      return send({ message: 'Tai khoan OAuth chua duoc dang ky' }, 401)
    }
    if (found.active === false) return send({ message: 'Tai khoan da ngung hoat dong' }, 403)
    return send(issueAuth(found))
  }

  if (key === 'GET /api/users') {
    return send(db.users.filter((entry) => entry.role !== 'admin').map(publicUser))
  }

  const userStatusMatch = pathname.match(/^\/api\/users\/(\d+)\/status$/)
  if (userStatusMatch && method === 'PATCH') {
    const target = db.users.find((entry) => entry.id === Number(userStatusMatch[1]))
    if (!target) return send({ message: 'User not found' }, 404)
    if (target.role === 'admin') return send({ message: 'Cannot change admin account status' }, 409)
    target.active = body.active !== false
    await writeDb(db)
    return send(publicUser(target))
  }

  if (key === 'GET /api/users/me') return send(publicUser(user))

  if (key === 'PUT /api/users/me') {
    if (body.email !== undefined) {
      const email = String(body.email).trim()
      if (!/^\S+@\S+\.\S+$/.test(email)) return send({ message: 'Email khong dung dinh dang' }, 400)
      if (db.users.some((entry) => entry.id !== user.id && entry.email === email)) return send({ message: 'Email already exists' }, 409)
      user.email = email
    }
    Object.assign(user, {
      name: body.name ?? user.name,
      phone: body.phone ?? user.phone,
      birthday: body.birthday ?? user.birthday,
      avatar: body.avatar ?? user.avatar,
    })
    await writeDb(db)
    return send(publicUser(user))
  }

  if (key === 'POST /api/users/me/addresses') {
    const missing = requireFields(body, ['label', 'detail'])
    if (missing.length) return send({ message: `Missing fields: ${missing.join(', ')}` }, 400)
    const address = { id: nextId(user.addresses), label: body.label, detail: body.detail, default: Boolean(body.default) }
    if (address.default) user.addresses = user.addresses.map((entry) => ({ ...entry, default: false }))
    user.addresses.push(address)
    await writeDb(db)
    return send(address, 201)
  }

  const addressMatch = pathname.match(/^\/api\/users\/me\/addresses\/(\d+)$/)
  if (addressMatch) {
    const address = user.addresses.find((entry) => entry.id === Number(addressMatch[1]))
    if (!address) return send({ message: 'Address not found' }, 404)
    if (method === 'PUT') {
      Object.assign(address, body)
      if (address.default) user.addresses = user.addresses.map((entry) => ({ ...entry, default: entry.id === address.id }))
      await writeDb(db)
      return send(address)
    }
    if (method === 'DELETE') {
      user.addresses = user.addresses.filter((entry) => entry.id !== address.id)
      await writeDb(db)
      return send({ message: 'Address deleted' })
    }
  }

  if (key === 'GET /api/categories') {
    ensureCatalog(db)
    return send(db.categories)
  }

  if (key === 'POST /api/categories') {
    ensureCatalog(db)
    const name = String(body.name ?? '').trim()
    if (!name) return send({ message: 'Category name is required' }, 400)
    if (!db.categories.includes(name)) db.categories.push(name)
    await writeDb(db)
    return send(db.categories, 201)
  }

  const categoryMatch = pathname.match(/^\/api\/categories\/(.+)$/)
  if (categoryMatch) {
    ensureCatalog(db)
    const currentName = decodeURIComponent(categoryMatch[1])
    const index = db.categories.findIndex((entry) => entry === currentName)
    if (index === -1) return send({ message: 'Category not found' }, 404)
    if (method === 'PUT') {
      const nextName = String(body.name ?? '').trim()
      if (!nextName) return send({ message: 'Category name is required' }, 400)
      db.categories[index] = nextName
      db.products = db.products.map((product) => product.category === currentName ? { ...product, category: nextName } : product)
      await writeDb(db)
      return send(db.categories)
    }
    if (method === 'DELETE') {
      db.categories = db.categories.filter((entry) => entry !== currentName)
      db.products = db.products.map((product) => product.category === currentName ? { ...product, hidden: true } : product)
      await writeDb(db)
      return send({ message: 'Category removed and matching products hidden', categories: db.categories })
    }
  }

  if (key === 'GET /api/attributes') {
    ensureCatalog(db)
    return send(db.attributes)
  }

  const attributeMatch = pathname.match(/^\/api\/attributes\/(colors|sizes)(?:\/(.+))?$/)
  if (attributeMatch) {
    ensureCatalog(db)
    const type = attributeMatch[1]
    const value = attributeMatch[2] ? decodeURIComponent(attributeMatch[2]) : String(body.value ?? '').trim()
    if (!value) return send({ message: 'Attribute value is required' }, 400)
    if (method === 'POST') {
      db.attributes[type] = uniqueText([...db.attributes[type], value])
      await writeDb(db)
      return send(db.attributes, 201)
    }
    if (method === 'DELETE') {
      db.attributes[type] = db.attributes[type].filter((entry) => entry !== value)
      db.products = db.products.map((product) => ({ ...product, [type]: (product[type] ?? []).filter((entry) => entry !== value) }))
      await writeDb(db)
      return send(db.attributes)
    }
  }

  if (key === 'GET /api/products') {
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
    if (search) products = products.filter((product) => [product.name, product.description, product.category].some((value) => String(value).toLowerCase().includes(search)))
    if (sort === 'price_asc') products = [...products].sort((a, b) => a.price - b.price)
    if (sort === 'price_desc') products = [...products].sort((a, b) => b.price - a.price)
    if (sort === 'rating_desc') products = [...products].sort((a, b) => b.rating - a.rating)
    if (url.searchParams.get('paginate') === 'true') {
      const page = Math.max(1, Number(url.searchParams.get('page') ?? 1))
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? 10)))
      const start = (page - 1) * limit
      return send({
        items: products.slice(start, start + limit),
        total: products.length,
        page,
        limit,
        hasMore: start + limit < products.length,
      })
    }
    return send(products)
  }

  if (key === 'POST /api/products') {
    ensureCatalog(db)
    const missing = requireFields(body, ['name', 'category', 'price', 'stock', 'image'])
    if (missing.length) return send({ message: `Missing fields: ${missing.join(', ')}` }, 400)
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
    return send(product, 201)
  }

  const productMatch = pathname.match(/^\/api\/products\/(\d+)$/)
  if (productMatch) {
    const product = db.products.find((entry) => entry.id === Number(productMatch[1]))
    if (!product) return send({ message: 'Product not found' }, 404)
    if (method === 'GET') return send(normalizedProduct(product))
    if (method === 'PUT') {
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
      return send(product)
    }
    if (method === 'DELETE') {
      db.products = db.products.filter((entry) => entry.id !== product.id)
      await writeDb(db)
      return send({ message: 'Product deleted', product })
    }
  }

  if (key === 'POST /api/orders') {
    const missing = requireFields(body, ['items', 'addressId', 'paymentMethod'])
    if (missing.length) return send({ message: `Missing fields: ${missing.join(', ')}` }, 400)
    if (!Array.isArray(body.items) || body.items.length === 0) return send({ message: 'Order items are required' }, 400)
    const address = user.addresses.find((entry) => entry.id === Number(body.addressId))
    if (!address) return send({ message: 'Address not found' }, 404)

    const orderItems = []
    for (const item of body.items) {
      const product = db.products.find((entry) => entry.id === Number(item.productId))
      const qty = Number(item.qty)
      if (!product) return send({ message: `Product ${item.productId} not found` }, 404)
      if (qty < 1) return send({ message: 'Quantity must be greater than zero' }, 400)
      if (product.stock < qty) return send({ message: `${product.name} is out of stock` }, 409)
      product.stock -= qty
      orderItems.push({ productId: product.id, name: product.name, image: product.image, price: product.price, qty, subtotal: product.price * qty })
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
    return send(order, 201)
  }

  if (key === 'GET /api/orders') {
    const all = url.searchParams.get('all') === 'true'
    return send(all ? db.orders : db.orders.filter((order) => order.userId === user.id))
  }

  const statusMatch = pathname.match(/^\/api\/orders\/([^/]+)\/status$/)
  if (statusMatch && method === 'PATCH') {
    if (!orderStatuses.includes(body.status)) return send({ message: 'Invalid order status' }, 400)
    const order = db.orders.find((entry) => entry.id === statusMatch[1])
    if (!order) return send({ message: 'Order not found' }, 404)
    const allowedNext = nextOrderStatuses[order.status] ?? []
    if (order.status !== body.status && !allowedNext.includes(body.status)) {
      return send({ message: `Cannot move order from ${order.status} to ${body.status}` }, 409)
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
    if (!order.statusHistory.some((entry) => entry.status === body.status)) {
      order.statusHistory.push({ status: body.status, at: new Date().toISOString() })
    }
    await writeDb(db)
    return send(order)
  }

  return send({ message: 'Route not found' }, 404)
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}

export const GET = handleApi
export const POST = handleApi
export const PUT = handleApi
export const PATCH = handleApi
export const DELETE = handleApi
