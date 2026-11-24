# FORME

React + Node.js + Express + MySQL clothing store with a fitting studio and admin panel.

## Run locally on Windows

Install Node.js 24, then run from this folder:

```sh
npm ci --legacy-peer-deps
npm run db:setup
npm run db:seed
npm run dev
```

The database helper installs an isolated MySQL 8.4 instance on port **3307**, creates `forme` and `forme_test`, and saves local settings in `.env`. Existing database data, product changes and owner passwords are preserved.

| Page           | Address                          |
| -------------- | -------------------------------- |
| Fitting studio | http://127.0.0.1:5174/           |
| Shop           | http://127.0.0.1:5174/shop       |
| Admin          | http://127.0.0.1:5174/admin      |
| Order tracking | http://127.0.0.1:5174/track      |
| API health     | http://127.0.0.1:4000/api/health |

The generated owner login is in **`.local/access.txt`**. Change its password in **Admin → My account** after signing in.

After restarting your computer:

```sh
npm run db:start
npm run dev
```

Keep `.local/mysql-data`, `uploads`, `.env` and its `ENCRYPTION_KEY` to retain database records, images and saved credentials. Do not commit or share private access files.

For an existing MySQL server, copy `.env.example` to `.env`, enter its connection details and create the `forme` database before running `npm run db:seed`. The bundled database helper is Windows-only.

## Admin setup

- **Products / Inventory:** add products and images, colours, sizes, prices and stock.
- **Orders:** review payments and update delivery status.
- **Store & payments:** set contact details, delivery fees and payment methods. Cash on delivery works by default. Manual bKash/Nagad and bank transfers need receiving account details; online payments need SSLCOMMERZ merchant credentials.
- **Team access:** manage staff permissions.

## New products in the fitting room

Prepared outfits work without an AI connection. New photographic previews need an optional OpenAI API connection and API billing.

1. Open **Admin → AI fitting room** and save an **OpenAI API key**, or set the server-only `OPENAI_API_KEY` in `.env`.
2. Set the daily generation limit and enable new AI previews.
3. Save a product in **Products**, then open its **Fitting preview**.
4. Upload the actual garment photo for every colour and enable its fitting preview.
5. Use **Try in fitting room** in the shop. Missing looks are generated once and cached.

New images use the `gpt-image-2` image-editing model. The daily limit counts generation attempts, including failed attempts and explicit retries, and resets at 06:00 Bangladesh time. Saved previews do not need another generation. AI previews show appearance; they do not guarantee actual size or fit.

AI and payment credentials remain on the server. Paid AI generation and live merchant payments require your own configured accounts.

## Checks and local build

```sh
npm run check
npm test
npm run test:server
npm run build
```

Server integration tests use only the separate database named by `MYSQL_DATABASE_TEST`; it must end in `_test`.

To serve the built site and API together, set `APP_URL` and `PUBLIC_BASE_URL` to `http://127.0.0.1:4000` in `.env`, and include that origin in `ALLOWED_ORIGINS`. Then:

```sh
npm run build
npm start
```
