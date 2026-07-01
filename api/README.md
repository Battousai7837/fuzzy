# Fuzzy API

Backend chinh dung Next.js API Routes tai `app/api/[[...path]]/route.js`.

Chay Next API:

```bash
npm run api
```

Base URL:

`http://127.0.0.1:4000`

Fallback Node API cu van con tai `api/server.mjs`:

```bash
npm run api:node
```

Tai khoan seed:

```json
{
  "email": "agasya@fuzzy.vn",
  "password": "Fuzzy2026"
}
```

## Auth

`POST /api/auth/register`

```json
{
  "name": "Nguyen Minh Anh",
  "email": "minhanh@fuzzy.vn",
  "password": "Fuzzy2026",
  "phone": "0901234567"
}
```

`POST /api/auth/login`

```json
{
  "email": "agasya@fuzzy.vn",
  "password": "Fuzzy2026"
}
```

Response tra ve `token`. Cac API ben duoi gui header:

`Authorization: Bearer <token>`

## User

- `GET /api/users/me`
- `PUT /api/users/me`
- `POST /api/users/me/addresses`
- `PUT /api/users/me/addresses/:id`
- `DELETE /api/users/me/addresses/:id`

## Product

- `GET /api/categories`
- `POST /api/categories`
- `PUT /api/categories/:name`
- `DELETE /api/categories/:name`
- `GET /api/attributes`
- `POST /api/attributes/colors`
- `POST /api/attributes/sizes`
- `DELETE /api/attributes/colors/:value`
- `DELETE /api/attributes/sizes/:value`
- `GET /api/products`
- `GET /api/products?category=Chair&sort=price_asc`
- `GET /api/products?paginate=true&page=1&limit=6&search=chair&color=Brown`
- `GET /api/products/:id`
- `POST /api/products`
- `PUT /api/products/:id`
- `DELETE /api/products/:id`

`DELETE /api/products/:id` se an san pham bang `hidden: true`.

## Order

`POST /api/orders`

```json
{
  "addressId": 1,
  "paymentMethod": "COD",
  "items": [
    {
      "productId": 1,
      "qty": 2
    }
  ]
}
```

- `GET /api/orders`
- `GET /api/orders?all=true`
- `PATCH /api/orders/:id/status`

```json
{
  "status": "Dang giao"
}
```

Trang thai hop le:

- `Cho xac nhan`
- `Dang chuan bi`
- `Dang giao`
- `Hoan thanh`
- `Da huy`

Luồng trạng thái được kiểm soát:

- `Cho xac nhan` -> `Dang chuan bi` hoặc `Da huy`
- `Dang chuan bi` -> `Dang giao` hoặc `Da huy`
- `Dang giao` -> `Hoan thanh`

Khi tạo đơn, API trừ tồn kho theo từng sản phẩm. Khi admin chuyển đơn sang `Da huy`, API hoàn lại tồn kho một lần và ghi lịch sử vào `statusHistory`.
