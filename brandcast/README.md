# Brandcast

Static landing page (`index.html`) plus Vercel serverless functions in `api/`, with Supabase for login, database and file storage.

## Setup
1. Create a Supabase project and run `supabase/schema.sql` in the SQL editor.
2. Copy `.env.example` values into Vercel environment variables.
3. Push this folder to GitHub, import the repo in Vercel and deploy.
4. Paystack: set the webhook URL to `https://YOUR-DOMAIN/api/paystack/webhook`.

## How payment protects the ad
- Prices live only in `api/_lib.js`. The browser sends a plan name, never an amount.
- A payment row is created as `pending`; an ad becomes `paid` only after PayPal confirms the capture, or Paystack confirms the charge by signed webhook plus a server-side check.
- Users cannot set an ad to `paid` themselves (row-level security blocks it).
