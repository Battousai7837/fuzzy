# Implementation Roadmap

## Day 1: Bootstrap, PWA & Database

- React Vite user app in `src/`.
- Next.js API route in `app/api/[[...path]]/route.js`.
- Node API fallback in `api/server.mjs`.
- TailwindCSS configured through `@tailwindcss/vite`.
- SCSS enabled through Sass with `src/App.scss`.
- PWA files:
  - `public/manifest.json`
  - `public/sw.js`
  - `public/offline.html`
- Database seed and schema-like JSON:
  - `api/db.json`
  - Users, products, categories, attributes, orders.

## Day 1: User Management & Authentication

- Register, login, OAuth mock, profile API.
- Fuzzy login/register UI integrated in React.
- JWT token saved in localStorage.
- Zustand global user store in `src/stores/userStore.ts`.
- Protected views redirect to Auth when token is missing or expired.

## Day 2: Product Management & Client UI

- Product CRUD API.
- Category and product attributes API.
- Home, category icon grid, product grid, product detail carousel.
- Infinite scroll using server-side pagination.
- Mobile bottom-sheet filter and sort.

## Day 2: Cart & Order Management

- Cart state synced to localStorage.
- Touch/swipe delete using `react-swipeable`.
- Checkout flow:
  - Shipping address confirmation.
  - Payment method selection.
  - Success screen with order code.
- Order API deducts product stock.
- Order history timeline uses server `statusHistory`.

## Day 3 + 4: Admin, Polish & Mobile Testing

- Admin product management.
- Admin category, size, color management.
- Admin order status workflow:
  - Cho xac nhan -> Dang chuan bi -> Dang giao -> Hoan thanh / Da huy.
- Cancelled orders restock products once.
- PWA install prompt and offline state.
- Mobile browser targets:
  - Chrome Android.
  - Safari iOS.
