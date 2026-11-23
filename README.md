# FORME

FORME combines an outfit fitting studio with a Bangladeshi clothing store. The original studio, its 2,916 outfit combinations, saved looks and 72 colour-specific product images are preserved. Newly added shirts, trousers and shoes can use AI fitting previews generated from their own product photographs. Shopping, checkout, order tracking and administration use an Express API and MySQL database.

The frontend is a React + TypeScript single-page app built with Vite. Express 5 serves the API and the production frontend; MySQL 8.4 stores products, variants, inventory, orders, customers, coupons, staff, sessions and settings. Prices and stock are calculated by the server. Monetary values are integer BDT minor units: `10000` means ৳100.00.

## Start locally on Windows

Use Node.js 24 and npm. Run these commands from this directory:

```sh
npm ci --legacy-peer-deps
npm run db:setup
npm run db:seed
npm run dev
```

The first database setup downloads an isolated MySQL 8.4 runtime, creates the `forme` and `forme_test` databases, and generates private local credentials. It uses port 3307 and leaves other MySQL installations alone. Existing `.env` files are preserved; if you already have one, check its database settings before seeding.

| Open                | Address                          |
| ------------------- | -------------------------------- |
| Fitting studio      | http://127.0.0.1:5174/           |
| Shop                | http://127.0.0.1:5174/shop       |
| Admin               | http://127.0.0.1:5174/admin      |
| Order tracking      | http://127.0.0.1:5174/track      |
| API/database health | http://127.0.0.1:4000/api/health |

Sign in using the owner email and generated password in the private `.local/access.txt` file. Open **My account** and change the password after the first sign-in. A password change signs out every existing session; the password originally written in the access file is no longer valid. Do not share or commit that file, `.env`, or `.local/mysql-secrets.json`.

After restarting your computer, start the database and application with:

```sh
npm run db:start
npm run dev
```

The local database lives in `.local/mysql-data`; uploaded product images live in `uploads`. Keep both if you want to retain local data. `db:seed` creates missing schema/catalog records and the first owner when configured; it preserves existing catalog edits and does not reset an existing owner password.

When updating an existing installation to add AI fitting previews, run `npm run db:seed` before restarting the API. It adds the `product_tryon`, `tryon_jobs` and `tryon_usage` tables without deleting existing products, orders or credentials.

On Linux/macOS, use an existing MySQL 8.4 server instead of the Windows database helper. Copy `.env.example` to `.env`, fill in your own database credentials and independent secrets, set the database port (normally 3306), create `forme`, then run `npm run db:seed` and `npm run dev`. Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` to create the first owner. For integration tests, also create a separate `forme_test` database and grant the configured application user access to it.

## Store and admin

The store includes a product catalog, colour/size selection, stock-aware bag, checkout, server-calculated quotes, coupons and order tracking. Customers can recover an order with its order number and checkout mobile number. New products use their uploaded photos in the shop and become available for AI fitting after their preview photos are configured. Editing a prepared garment's palette or shape disables its old prepared preview; its new photos can then be configured for AI fitting.

Admin provides:

- **Overview:** revenue, order totals, low stock, recent orders and 30 days of actual order history.
- **Products / Inventory:** create or archive products, upload PNG/JPEG/WebP images up to 5 MB, edit variants, prices, SKUs and stock.
- **Orders:** inspect items/customer details, review submitted payments and move orders through confirmation, processing, shipping and delivery. Cancellation releases stock once. Cancelling a paid order records a refund requirement; it does not send a refund automatically.
- **Customers / Discounts:** customer purchase history and fixed/percentage coupons with dates, minimum spend and usage limits.
- **Store & payments:** shop/contact details, delivery fees, free-shipping threshold and payment setup.
- **AI fitting room:** AI connection, daily generation limit, model reference photos and recent preview jobs. Each product has its own **Fitting preview** action for colour-specific source photos.
- **Team access / Activity log / My account:** staff permissions, recorded administrative activity and password changes.

Owners manage staff. Owners, administrators and managers can manage products, stock, orders, coupons and shop details. Payment settings, payment approval and the activity log require an owner or administrator. Support accounts can read shop operations and change their own password. Sessions use an HttpOnly cookie; authenticated changes require a CSRF token.

Seed prices, stock quantities, shipping fees and shop details are starter data. Review them before accepting customer orders.

## Add new products to the fitting room

New products need their actual garment photographs to create a photographic preview. Their category alone cannot identify their print, fabric, cut or shoe details. Existing prepared outfits continue to load directly without calling AI.

1. Sign in as an owner or administrator and open **AI fitting room**. Add a **Lovable AI project key**, choose the available image model, set a daily limit and enable new image generation. The project key belongs to Lovable's built-in AI connector; it is different from a Lovable workspace API key, an OpenAI key or a ChatGPT subscription. See [Lovable AI setup](https://docs.lovable.dev/features/ai). You can supply the same project key through the server-only `LOVABLE_API_KEY` environment variable instead of saving it in admin. Saved keys are encrypted and masked.
2. Keep the supplied male/female model references or upload clear full-body model photographs in **AI fitting room**. The selected reference controls the adult model used for newly generated outfits.
3. Add a product in **Products**, choosing its correct gender, category, colours and sizes. Upload its shop image, save the product, then open **Fitting preview**. Owners, administrators and managers can configure product preview photos.
4. Upload a clear front photograph for **every colour** and enable **Make this product available for AI fitting previews**. Use the real product in that exact colour; one black photo does not establish the details of its other colour variants. Photos must be PNG, JPEG or WebP, at most 5 MB, uploaded to this store. External image URLs are not fetched by the AI service integration. Add stock in **Inventory** when the product is ready to sell.
5. Select the product in the fitting room. A missing outfit combination enters the image generation queue; the interface shows progress and displays the completed full-outfit image. Selecting the same combination again reuses its cached image. Opening saved-look thumbnails only checks for an existing image and does not start a paid generation.

The integration uses the Lovable image-editing gateway with `openai/gpt-image-2`, supplying the model plus the selected top, trousers and shoes as references. It generates the whole outfit together. New combinations are created on demand rather than preparing every future catalogue combination in advance. Changes to source photos, colours, garment details or model references invalidate affected cached previews.

AI fitting is a **visual styling preview, not a measurement or physical fit guarantee**. Image editing can change prints, logos, textures, footwear details or proportions. Review representative results against the actual items before relying on them for your store. Shoe previews use general image editing alongside the clothing references; exact footwear fidelity has not been verified with a live provider here.

The daily limit uses the UTC day and counts reserved generation attempts, including explicit retries and failed attempts. It is an attempt limit, not a currency spending cap. Cached images do not consume another attempt. Turning off new generation keeps existing cached previews available. The job list records pending, processing, ready and failed work; an interrupted generation requires an explicit retry rather than automatically spending another attempt.

No AI credentials are shipped and no charged live generation has been verified in this workspace. The queue, caching, image processing and interface are tested with simulated provider responses. A valid project connection and available provider credits are needed to create new photographic previews. Keep `ENCRYPTION_KEY` stable so saved AI credentials remain readable.

## Payments

**Cash on delivery is enabled by default.** bKash, Nagad and bank transfer remain unavailable until an administrator configures and enables them in **Store & payments**. No merchant account or payment credentials are included.

- **Manual bKash / Nagad:** choose manual mode, enter the receiving account and customer instructions, then enable the method. Customers submit a transaction reference and sender mobile number. A reference creates a payment review; a human administrator must independently verify it before approving payment.
- **Bank transfer:** enter the bank, account name/number, branch/routing information and instructions, then enable it. Submitted transfer references also require human verification.
- **Online bKash / Nagad:** enter your SSLCOMMERZ store ID/password, select sandbox or live, enable the gateway, then enable the desired mobile method in gateway mode. Available payment channels depend on the merchant account. Credentials are encrypted at rest with AES-256-GCM and masked in admin responses.

Online success/IPN callbacks are validated with SSLCOMMERZ from the server, including transaction, amount, currency and session checks. A browser redirect alone never marks an order paid. Repeated callbacks cannot deduct stock twice; late or risk-flagged payments remain under review. Another online payment cannot be started while a payment is under review.

Checkout reserves stock transactionally. Unpaid online/manual reservations expire after `RESERVATION_MINUTES`; submitted manual references remain reserved while being reviewed. Non-COD orders cannot progress to fulfillment until payment is verified. COD orders record cash collection when an administrator marks them delivered.

Live charges have not been verified without merchant accounts. Test your own sandbox account, public callback delivery, reconciliation and refund process before enabling live payments. Keep `ENCRYPTION_KEY` stable and backed up; changing it makes saved gateway credentials unreadable until they are entered again.

## Checks

```sh
npm run check
npm test
npm run test:server
npm run build
```

Frontend tests cover studio and bag rules. Payment adapter tests use mocked provider HTTP. The integration suite exercises the actual Express API and a real MySQL database, including sessions/roles, uploads, prices, stock races, coupons, payment review, retries and reservation expiry.

The completed local verification includes 47 frontend tests, 56 server tests, and browser checks of desktop/mobile studio, checkout and admin pages. The AI tests cover provider request validation, local photo safety, settings permissions, queue deduplication, daily limits, midnight rollover, whole-frame image output, source revisions, rapid selections and explicit retry. Browser tests added new shirt, trouser and shoe products, configured their fitting photos, selected all three in the studio and verified cache reuse. Browser tests also created manual bKash, Nagad and bank-transfer orders in the separate test database and verified administrator payment approval. Provider responses and payments are simulated; no real money was transferred or charged AI calls made.

The integration suite runs only when `MYSQL_DATABASE_TEST` names a separate database ending in `_test`. It uses its own fixtures and never targets the application's `forme` database. The Windows setup configures `forme_test` automatically. You can run it directly with:

```sh
node --test --test-concurrency=1 server/commerce.integration.test.mjs
node --test --test-concurrency=1 server/tryon.integration.test.mjs
```

Rebuild the prepared product images only after changing the garment/profile source:

```sh
npm run images:build
```

## Production deployment

Use a Node host and a persistent MySQL 8.4 database. A static-only host cannot run this API. After installing dependencies and providing production environment values:

```sh
npm run build
npm run db:seed
npm start
```

Express serves `dist`, `/api` and uploaded images on port 4000. Put it behind an HTTPS reverse proxy. Set the proxy's request/upload limit above 5 MB so the application can apply its own image limit. Forward the original host and protocol and set `TRUST_PROXY` to the number of trusted proxy hops.

Keep `public` alongside `server` and `dist`: the AI worker reads the prepared product photographs and default model references from it. The runtime also needs the production `sharp` dependency for validating source images and storing generated WebP previews. Persist `uploads`, including its `try-on` directory, with the database.

| Variable                                                                     | Production value/purpose                                                                             |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                                                   | `production`                                                                                         |
| `API_HOST`, `API_PORT`                                                       | Container/listening address and port, typically `0.0.0.0` and `4000`                                 |
| `APP_URL`                                                                    | Public HTTPS storefront origin; used for customer return links                                       |
| `PUBLIC_BASE_URL`                                                            | Public HTTPS API origin; provider callbacks use `/api/payments/sslcommerz/{success,fail,cancel,ipn}` |
| `ALLOWED_ORIGINS`                                                            | Comma-separated exact storefront origins, without trailing slashes                                   |
| `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD` | Your MySQL connection; an external server normally uses port 3306                                    |
| `SESSION_SECRET`                                                             | Stable random secret of at least 32 characters                                                       |
| `ENCRYPTION_KEY`                                                             | Independent stable 32-byte key, encoded as 64 hexadecimal characters or base64                       |
| `UPLOAD_DIR`                                                                 | Persistent writable directory for product uploads                                                    |
| `LOVABLE_API_KEY`                                                            | Optional server-only Lovable AI project key; alternatively configure it in admin **AI fitting room** |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`                                | First-owner bootstrap only; password must contain 12–200 characters                                  |

Generate each secret independently with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Supply secrets through the hosting environment or a private `.env`; never put them in frontend code. Remove the bootstrap password from the runtime environment after the owner exists. Back up MySQL, uploads and the encryption key together.

### Optional Docker Compose

`Dockerfile`, `compose.yaml` and `.dockerignore` provide a production deployment template. Docker is not installed in this workspace, so the container build/deployment has not been run here.

Prepare a private production environment file with the variables above and a separate `MYSQL_ROOT_PASSWORD` for MySQL initialization. For a fresh database volume, set `ADMIN_EMAIL` and a strong `ADMIN_PASSWORD` to create the first owner. Use the same HTTPS origin for `APP_URL` and `PUBLIC_BASE_URL` when the proxy serves the entire application. Then:

```sh
docker compose --env-file .env.production up --build -d
```

The template starts MySQL, waits for its health check, runs idempotent schema/catalog/first-owner bootstrap, then starts Express. Named volumes retain database data and uploads. Only the application is published, on `127.0.0.1:4000`; terminate HTTPS in a reverse proxy on that host. `TRUST_PROXY=1` assumes exactly that one trusted proxy hop. Database credentials used for a volume's initial creation must continue to match the application configuration.

The Compose template does not create a test database or run tests. Use a separate test database/environment for integration testing. Take backups before replacing a deployment or removing volumes.
