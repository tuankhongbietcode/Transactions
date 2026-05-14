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

For a stable public URL, use Render with the included `Dockerfile` and `render.yaml`.

1. Push this project to a GitHub repository.
2. In Render, create a new Blueprint or Web Service from that repository.
3. Add these environment variables:

```env
PUBLIC_BASE_URL=https://your-render-service.onrender.com
PAYOS_CLIENT_ID=...
PAYOS_API_KEY=...
PAYOS_CHECKSUM_KEY=...
```

4. Set the payOS webhook URL:

```text
https://your-render-service.onrender.com/api/payos/webhook
```

The included Render disk mounts `/app/data`, so local JSON and Excel exports survive restarts.

For any Node host, the build/run commands are:

```bash
npm install
npm run build
npm run start
```

Use Node 22 or newer. The app listens on `PORT` if the host provides it.

## 5. Excel export

The app automatically keeps an Excel file updated when registrations, payments, or check-ins change.

Download it from:

```text
https://your-public-url.com/api/export/registrations.xlsx
```

## 6. Production note

The current prototype stores registrations in `data/registrations.json`. That is fine for trial runs and demos. For a serious event, move the store to Supabase, Postgres, MySQL, or another managed database so data is durable across deploys and multiple server instances.
