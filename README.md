# Fuzzy Mobile E-commerce

Ung dung React Vite mobile-first dua tren template Fuzzy, da noi voi API backend Next/Node de chay du cac module chinh.

Template goc van duoc copy vao:

`public/mobile/fuzzy/landing.html`

App React full chay tai:

`http://127.0.0.1:5173`

Template goc mo truc tiep tai:

`http://127.0.0.1:5173/mobile/fuzzy/landing.html`

## Chuc nang da lam

- User Management: dang ky, dang nhap, JWT co chu ky HMAC, OAuth mock Google/Facebook, profile, CRUD dia chi.
- Global State: Zustand store cho user/token tai `src/stores/userStore.ts`.
- Product Management: category slider/icon, product grid 2 cot, search, filter bottom sheet, sort, infinite scroll dung API phan trang, product detail carousel, sticky add-to-cart.
- Cart & Order: cart localStorage, tang/giam so luong, swipe-to-delete, checkout 3 buoc, POST order, tru ton kho, timeline order.
- Admin: CRUD/an-hien san pham, cap nhat gia/ton kho, quan ly danh muc, quan ly Size/Color, cap nhat trang thai don hang.
- PWA: manifest day du icon/theme, service worker cache app shell/static assets/images, offline page "Khong co ket noi mang", popup Add to Home Screen, touch/swipe bang `react-swipeable`.
- Styling: TailwindCSS cau hinh qua Vite plugin, SCSS/Sass cho stylesheet chinh.
- Template Fuzzy goc: giu nguyen trong `public/mobile/fuzzy` de doi chieu giao dien.

## Cach chay

```bash
npm install
npm run dev
```

Mo `http://127.0.0.1:5173`.

Chay API:

```bash
npm run api
```

API base URL:

`http://127.0.0.1:4000`

Tai lieu API nam tai [api/README.md](api/README.md).

## Kiem tra

```bash
npm run lint
npm run build
```

## Ghi chu ky thuat

Frontend la React Vite. Backend chinh la Next.js API Routes tai `app/api/[[...path]]/route.js`, luu du lieu vao `api/db.json`. File `api/server.mjs` duoc giu lai lam fallback Node API.
