# Public deploy checklist

## 1. Local test

```bash
npm install
npm run build
npm run start
```

Open `http://127.0.0.1:8080`.

Without payOS keys, paid plans use mock checkout. This is intentional so the full flow can be tested before real money is involved.

## 2. Ladipage links

Point the three Ladipage buttons to the public app URL:

```text
https://your-public-url.com/?plan=free
https://your-public-url.com/?plan=standard
https://your-public-url.com/?plan=mastery
```

## 3. Environment variables

For real payOS payment links:

```env
PUBLIC_BASE_URL=https://your-public-url.com
PAYOS_CLIENT_ID=...
PAYOS_API_KEY=...
PAYOS_CHECKSUM_KEY=...
```

The webhook endpoint to configure in payOS is:

```text
https://your-public-url.com/api/payos/webhook
```

## 4. Suggested hosting: Render

For a no-cost public test URL, use Render with the included `Dockerfile` and `render.yaml`.

1. Push this project to a GitHub repository.
2. In Render, create a new Blueprint or Web Service from that repository.
3. Add these environment variables:

```env
PUBLIC_BASE_URL=https://your-render-service.onrender.com
PAYOS_CLIENT_ID=...
PAYOS_API_KEY=...
PAYOS_CHECKSUM_KEY=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

4. Set the payOS webhook URL:

```text
https://your-render-service.onrender.com/api/payos/webhook
```

The included `render.yaml` uses Render's free web service tier so you can test without monthly compute cost.

Important: the free tier does not include a persistent disk. Use Supabase Free for durable registration storage.

## 5. Supabase Free setup

1. Create a Supabase project.
2. Open SQL Editor and run `supabase-schema.sql`.
3. Copy the project URL into `SUPABASE_URL`.
4. Copy the server-side `service_role` key into `SUPABASE_SERVICE_ROLE_KEY`.

Do not put the service role key in frontend code. It belongs only in Render environment variables.

For any Node host, the build/run commands are:

```bash
npm install
npm run build
npm run start
```

Use Node 22 or newer. The app listens on `PORT` if the host provides it.

## 6. Excel export

The app automatically keeps an Excel file updated when registrations, payments, or check-ins change.

Download it from:

```text
https://your-public-url.com/api/export/registrations.xlsx
```

## 7. Production note

When `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set, registrations are stored in Supabase. Without those variables, the app falls back to `data/registrations.json`, which is useful for local demos but not durable on free hosting.
