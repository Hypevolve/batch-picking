# Batch Picking — Libar

Sustav za batch picking narudžbi iz WooCommercea. Grupira 5 narudžbi u jedan prolaz kroz skladište koristeći smart SKU-overlap algoritam.

## Tech Stack

- **Next.js 15** (App Router) + TypeScript
- **Tailwind CSS** + shadcn/ui + Lucide icons
- **tRPC** — end-to-end type-safe API
- **Drizzle ORM** + PostgreSQL
- **NextAuth.js** — credential-based auth with roles (admin/picker)
- **TanStack Query** — server state management

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL database (local or hosted, e.g. Supabase/Neon)

### Setup

```bash
# Install dependencies
npm install

# Copy env template and fill in credentials
cp .env.example .env.local

# Run database migrations
npx drizzle-kit push

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment Variables

See `.env.example` for required variables:
- `DATABASE_URL` — PostgreSQL connection string
- `NEXTAUTH_SECRET` — Auth encryption secret
- `WOO_API_URL` / `WOO_CONSUMER_KEY` / `WOO_CONSUMER_SECRET` — WooCommerce API

## Project Structure

```
src/
├── app/              # Next.js App Router pages
│   ├── (auth)/       # Login
│   ├── (admin)/      # Admin dashboard, locations, batches
│   ├── (picker)/     # Picker batch list + picking screen
│   └── api/          # tRPC + NextAuth endpoints
├── components/       # UI components
├── lib/              # Utilities, auth config, WooCommerce client
├── server/
│   ├── db/           # Drizzle schema + connection
│   ├── trpc/         # tRPC routers
│   └── services/     # Business logic (batch engine, sync, status)
└── types/            # Shared TypeScript types
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npx drizzle-kit push` | Push schema to database |
| `npx drizzle-kit studio` | Open Drizzle Studio GUI |

## Roles

- **Admin** — manages SKU locations, generates batches, syncs orders
- **Picker** — views and executes assigned batches on tablet/mobile
