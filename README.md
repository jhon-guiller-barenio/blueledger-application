# BlueLedger — Money Tracker

A responsive personal finance dashboard for daily expenses, budgets, planned purchases, manually entered bank balances, net worth, and admin access monitoring. The UI uses a calm blue palette and defaults to Philippine pesos.

## Preview

Open `dist/index.html` in a browser for the browser-local demo. Demo changes are stored only in that browser. The sign-in form and server API become available when deployed to Vercel with a Neon Postgres connection and the environment variables below.

## Backend

The app uses Vercel Node.js Functions in `api/` and Neon Postgres. The schema keeps each user’s transactions, budgets, products, and accounts scoped by `user_id`. Passwords are hashed with bcrypt. Sessions are opaque, stored as hashes, and set in secure HTTP-only cookies. `api/admin.js` checks the signed-in user’s role on the server before returning account and access-event data.

1. Provision a **separate Neon database for BlueLedger** through Vercel Marketplace; do not point this project at another app’s database.
2. Run `schema.sql` once in the new database’s SQL editor.
3. Set these Vercel project environment variables for Production, Preview, and Development:
   - `DATABASE_URL` — pooled Neon connection string.
   - `SESSION_SECRET` — at least 32 random characters.
   - `ADMIN_EMAIL` — the email that should receive the admin role at registration.
4. Deploy the project. Create the admin account using the exact `ADMIN_EMAIL` value. Other registrations receive the standard user role.

A connected admin can review registered accounts, active sessions, successful and failed sign-ins, and account activity. Financial records are not included in the admin activity response. The product intentionally uses manual balances; it never asks for bank credentials.

## Native Android and iOS app

`mobile/` is a native Expo / React Native app, not a browser wrapper. It connects to the same Vercel API and database as the web dashboard. It includes sign-in and registration, secure session storage on the device, transaction entry, monthly budgets, savings goals, manual bank balances, and an admin-only access activity view. It uses the account’s live server data rather than the browser preview’s sample data.

To run it locally, install the current Expo toolchain and dependencies from `mobile/`, copy `mobile/.env.example` to `mobile/.env`, and set `EXPO_PUBLIC_API_URL` to the deployed Vercel project URL. Then run `npx expo start`. To create Android and iOS install builds, configure an Expo EAS project and run `eas build --platform android` or `eas build --platform ios` from `mobile/`. Vercel hosts the website and shared API; the Android/iOS install packages are built separately.

## Vercel deployment

This folder is ready to import as a new Vercel project. Use the project root (the folder containing `package.json`) and set the output directory to `dist`. Vercel auto-detects the `api/` Node.js Functions. The frontend is in `dist/`.

The current connected Vercel team rejected creating a new project with a 403 permission error. The Neon organization is also Vercel-managed, so direct Neon project creation is restricted. No production deployment or database was created from this workspace. An account with project-creation permission can import this folder and provision its separate database through Vercel Marketplace.

## Main features

- Dashboard with balance, monthly income and expenses, savings rate, category chart, recent transactions, and budget progress.
- Transaction entry for income and expenses, CSV export, and filters.
- Budget categories and monthly limits.
- Product and savings-goal list.
- Manual bank/cash/credit balances and net-worth calculation.
- Account creation and sign-in, persistent per-user data, and admin-only access monitoring when the backend is configured.
