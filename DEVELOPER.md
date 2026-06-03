# Batch Picking — Tehnička dokumentacija za developere

> **Verzija**: 1.0.0  
> **Zadnje ažuriranje**: 2026-06-02

---

## Sadržaj

- [Arhitektura](#arhitektura)
- [Podatkovni model](#podatkovni-model)
- [Servisi](#servisi)
- [tRPC Routeri](#trpc-routeri)
- [API Endpointi](#api-endpointi)
- [Konfiguracija](#konfiguracija)
- [WooCommerce integracija](#woocommerce-integracija)
- [Batch engine](#batch-engine)
- [Picking workflow](#picking-workflow)
- [Testiranje](#testiranje)
- [Rješavanje problema](#rješavanje-problema)
- [Dodavanje novih značajki](#dodavanje-novih-značajki)

---

## Arhitektura

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│  Admin      │      │  Picker     │      │ WooCommerce │
│  Dashboard  │      │  (tablet)   │      │   API       │
└──────┬──────┘      └──────┬──────┘      └──────┬──────┘
       │                    │                    │
       └────────────────────┼────────────────────┘
                            │
              ┌─────────────▼─────────────┐
              │   Next.js 16 App Router    │
              │   tRPC + NextAuth           │
              └─────────────┬───────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
   ┌────▼────┐         ┌────▼────┐        ┌────▼────┐
   │ Drizzle │         │ NextAuth│        │Supabase │
   │  ORM    │         │  Auth   │        │   DB    │
   └─────────┘         └─────────┘        └─────────┘
```

### Tehnološki stack

| Sloj | Tehnologija |
|------|-------------|
| Frontend | Next.js 16 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS 4, shadcn/ui, Lucide icons |
| State | TanStack Query (React Query), tRPC |
| Auth | NextAuth.js 5 (Credentials provider) |
| ORM | Drizzle ORM |
| DB | PostgreSQL (Supabase) |
| API | tRPC 11 (end-to-end type-safe) |

---

## Podatkovni model

### Tablice

| Tablica | Opis |
|---------|------|
| `users` | Admin i picker korisnici (email, password_hash, role) |
| `products` | Cache WooCommerce proizvoda (sku, title, image_url, author) |
| `product_locations` | Skladišne lokacije po SKU (zone_code, shelf_code, route_position) |
| `picking_routes` | Konfiguracija zona (zone_code, zone_name, sort_order) |
| `orders` | Narudžbe iz WooCommercea (woo_order_id, customer_name, status) |
| `order_items` | Stavke narudžbi (sku, quantity, product_title_snapshot, product_author_snapshot) |
| `batches` | Picking nalozi (batch_code, batch_type, status, similarity_score) |
| `batch_orders` | Veza batch ↔ narudžba (basket_label A–E) |
| `batch_items` | Konsolidirani picking list (sku, product_title, author, total_quantity, basket_breakdown) |
| `activity_logs` | Sustavni logovi (sync, generacija batcha, status promjene) |

### Statusi

**Narudžba (`order_status` enum):**
```
pending_batch → batched → picked → packed → synced
```

**Batch (`batch_status` enum):**
```
draft → ready → in_progress → picked → packed → synced
```

**Basket label (`basket_label` enum):**
```
A, B, C, D, E
```

---

## Servisi

### woo-sync.ts

**Glavne funkcije:**
- `syncOrders()` — paginirani dohvat `processing` narudžbi iz WooCommercea
- `importSingleWooOrder(wooOrder)` — idempotentni uvoz jedne narudžbe
- `ensureProductCached(sku, fallbackTitle, fallbackImage)` — cache produkta i ekstrakcija autora

**Autor ekstrakcija:**
```typescript
const AUTHOR_META_KEYS = ["import_autori", "author", "_author", "book_author"];
```
Backfill — ako cached produkt nema autora, ponovno se dohvaća s WooCommercea.

### batch-engine.ts

**Glavne funkcije:**
- `calculateJaccardSimilarity(skusA, skusB)` — Jaccard koeficijent
- `buildSimilarityMatrix(orders)` — pairwise matrica
- `generateBatches()` — greedy grupiranje narudžbi

**Konstante:**
```typescript
const BATCH_SIZE = 5;           // max narudžbi po batchu
const SMART_THRESHOLD = 0.1;    // 10% overlap za "smart" klasifikaciju
```

### status.ts

**Batch status workflow:**
```typescript
// Admin generira batch → status: "draft"
// Admin označi kao ready → status: "ready"
// Picker počne skupljati → status: "in_progress"
// Picker završi → status: "picked"
// Admin spakira → status: "packed"
// Status sync u WooCommerce → status: "synced"
```

---

## tRPC Routeri

### ordersRouter

| Metoda | Input | Output | Opis |
|--------|-------|--------|------|
| `list` | `{ status? }` | `Order[]` | Lista narudžbi s filterom |
| `getById` | `{ id: number }` | `Order + items` | Detalji narudžbe sa stavkama |
| `sync` | — | `{ synced, skipped, errors }` | Ručna WooCommerce sinkronizacija |
| `resetAndSync` | — | `{ cleaned, cleanupErrors, synced, skipped, errors }` | Cleanup + svježi sync |

### batchesRouter

| Metoda | Input | Output | Opis |
|--------|-------|--------|------|
| `list` | — | `Batch[]` | Svi batch-ovi |
| `getById` | `{ id: number }` | `Batch + items + orders` | Detalji batcha |
| `generate` | — | `{ created: number }` | Generira batch-ove od narudžbi |
| `updateStatus` | `{ id, status }` | `Batch` | Promjena statusa |
| `getNextPending` | — | `BatchItem[]` | Sljedeći ne skupljeni item |
| `markItemPicked` | `{ batchItemId }` | `BatchItem` | Označi item kao picked |
| `markBatchPicked` | `{ id }` | `Batch` | Označi cijeli batch |

### locationsRouter

| Metoda | Input | Output | Opis |
|--------|-------|--------|------|
| `list` | — | `Location[]` | Sve lokacije |
| `upsert` | `{ sku, zone_code, shelf_code, route_position }` | `Location` | Dodaj/uredi lokaciju |
| `delete` | `{ id }` | — | Obriši lokaciju |
| `importCsv` | `{ rows[] }` | `{ inserted, errors }` | Masovni uvoz |

---

## API Endpointi

### NextAuth

| Ruta | Metoda | Opis |
|------|--------|------|
| `/api/auth/[...nextauth]` | `GET/POST` | Credentials login/logout |

### tRPC

| Ruta | Opis |
|------|------|
| `/api/trpc/[trpc]` | tRPC JSON-RPC handler |

### Webhooks

| Ruta | Metoda | Opis |
|------|--------|------|
| `/api/webhooks/woocommerce` | `POST` | Primanje WooCommerce webhook događaja |

---

## Konfiguracija

### Environment varijable

```bash
# --- Baza ---
DATABASE_URL=postgresql://...

# --- NextAuth ---
NEXTAUTH_URL=http://localhost:3001
NEXTAUTH_SECRET=your-secret-here

# --- WooCommerce ---
WOO_API_URL=https://libar.hr
WOO_CONSUMER_KEY=ck_...
WOO_CONSUMER_SECRET=cs_...

# --- Sync ---
SYNC_DAYS_BACK=7

# --- Supabase ---
NEXT_PUBLIC_SUPABASE_URL=https://...supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=eyJ...
```

### Drizzle schema

Definiran u `src/server/db/schema.ts`. Za push:
```bash
npx drizzle-kit push
```

Za studio (GUI pregled baze):
```bash
npx drizzle-kit studio
```

---

## WooCommerce integracija

### Dohvat narudžbi

```typescript
// src/lib/woocommerce.ts
export async function fetchProcessingOrders(page = 1, perPage = 100): Promise<WooOrder[]> {
  const afterDate = new Date(Date.now() - SYNC_DAYS_BACK * 24 * 60 * 60 * 1000);
  return wooFetch<WooOrder[]>("/orders", {
    status: "processing",
    after: afterDate.toISOString(),
    page: String(page),
    per_page: String(perPage),
  });
}
```

### Autor ekstrakcija

```typescript
export function extractAuthor(product: WooProduct): string | null {
  for (const key of AUTHOR_META_KEYS) {
    const meta = product.meta_data.find((m) => m.key === key);
    if (meta && typeof meta.value === "string" && meta.value.trim()) {
      return meta.value.trim();
    }
  }
  return null;
}
```

### Webhook

WooCommerce webhook šalje `POST` na `/api/webhooks/woocommerce` kada se narudžba promijeni. Handler verificira HMAC potpis i poziva `importSingleWooOrder()`.

---

## Batch engine

### Jaccard similarity

```typescript
function calculateJaccardSimilarity(skusA: string[], skusB: string[]): number {
  const setA = new Set(skusA);
  const setB = new Set(skusB);
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}
```

### Greedy grupiranje

```typescript
function greedyGroupOrders(orders: OrderWithItems[]): BatchGroup[] {
  const matrix = buildSimilarityMatrix(orders);
  const ungrouped = new Set(orders.map((o) => o.orderId));
  const groups: BatchGroup[] = [];

  while (ungrouped.size > 0) {
    const group: number[] = [];

    // 1. Pronađi najsličniji par
    let bestPair: [number, number] | null = null;
    let bestScore = -1;

    for (const [key, score] of matrix) {
      if (score > bestScore) {
        const [a, b] = key.split("-").map(Number);
        if (ungrouped.has(a) && ungrouped.has(b)) {
          bestScore = score;
          bestPair = [a, b];
        }
      }
    }

    if (!bestPair) break;

    // 2. Inicijaliziraj grupu
    group.push(...bestPair);
    ungrouped.delete(bestPair[0]);
    ungrouped.delete(bestPair[1]);

    // 3. Dodaj preostale narudžbe
    while (group.length < BATCH_SIZE && ungrouped.size > 0) {
      let bestNext: number | null = null;
      let bestAvg = -1;

      for (const candidate of ungrouped) {
        const avg = group.reduce((sum, member) => {
          const key = `${Math.min(member, candidate)}-${Math.max(member, candidate)}`;
          return sum + (matrix.get(key) || 0);
        }, 0) / group.length;

        if (avg > bestAvg) {
          bestAvg = avg;
          bestNext = candidate;
        }
      }

      if (bestNext !== null) {
        group.push(bestNext);
        ungrouped.delete(bestNext);
      }
    }

    groups.push({ orderIds: group, similarityScore: bestScore });
  }

  return groups;
}
```

---

## Picking workflow

### Picker screen (`/pick/[id]`)

1. Učitava `batch_items` sortirane po `route_position`
2. Prikazuje SKU, naslov, autora, sliku, lokaciju, količinu
3. Picker označi item kao picked → `markItemPicked` mutation
4. Kada su svi itemi picked → `markBatchPicked` mutation

### Basket breakdown

```typescript
interface BasketBreakdown {
  [basketLabel: string]: number;  // npr. { A: 2, B: 1 }
}
```

Konsolidacija — ako isti SKU postoji u 3 narudžbe, picker skuplja sve odjednom i raspoređuje u koševe.

---

## Testiranje

### Pokreni testove

```bash
npm run test:run
```

### Lokalno testiranje API-ja

```bash
# Health check
curl http://localhost:3001/api/health

# WooCommerce sync (admin)
curl -X POST http://localhost:3001/api/trpc/orders.sync \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=..." \
  -d '{}'

# Generiraj batch-ove (admin)
curl -X POST http://localhost:3001/api/trpc/batches.generate \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=..." \
  -d '{}'
```

### Debug mode

```bash
# Pokreni s debug logovima
DEBUG=batch-picking npm run dev
```

---

## Rješavanje problema

### `DATABASE_URL` ne radi

Provjeri da connection string uključuje SSL:
```
postgresql://user:pass@host:5432/db?sslmode=require
```

### `next-auth.session-token` ne postoji

Provjeri da `NEXTAUTH_SECRET` i `NEXTAUTH_URL` odgovaraju. Generiraj novi secret:
```bash
openssl rand -base64 32
```

### Drizzle schema i baza su out of sync

```bash
npx drizzle-kit push
# ili ručno pokreni SQL iz supabase/schema.sql
```

### WooCommerce API vraća 401

- Provjeri da `WOO_CONSUMER_KEY` i `WOO_CONSUMER_SECRET` odgovaraju WooCommerce API kredencijalima
- Provjeri da je API omogućen u WooCommerce → Settings → Advanced → REST API

### `batch_items` nema `author` stupac

Migracija nije pokrenuta. Pokreni u Supabase SQL editoru:
```sql
ALTER TABLE batch_items ADD COLUMN IF NOT EXISTS author TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_author_snapshot TEXT;
```

---

## Dodavanje novih značajki

### Dodavanje novog statusa batcha

1. Dodaj enum u `supabase/schema.sql`:
   ```sql
   ALTER TYPE batch_status ADD VALUE 'new_status';
   ```
2. Dodaj u `src/server/db/schema.ts`:
   ```typescript
   export const batchStatusEnum = pgEnum("batch_status", [
     "draft", "ready", "in_progress", "picked", "packed", "synced", "new_status"
   ]);
   ```
3. Ažuriraj status config u UI komponentama

### Dodavanje novog tRPC routera

1. Kreiraj datoteku u `src/server/trpc/routers/nova-stvar.ts`
2. Eksportiraj router s `protectedProcedure` ili `adminProcedure`
3. Registriraj u `src/server/trpc/router.ts`:
   ```typescript
   import { novaStvarRouter } from "./routers/nova-stvar";
   
   export const appRouter = router({
     batches: batchesRouter,
     orders: ordersRouter,
     locations: locationsRouter,
     novaStvar: novaStvarRouter,
   });
   ```

---

## Struktura projekta

```
batch-picking/
├── src/
│   ├── app/
│   │   ├── (auth)/          # Login stranica
│   │   ├── (admin)/         # Dashboard, Narudžbe, Batchevi, Lokacije
│   │   ├── (picker)/        # Lista batch-eva, Picking screen
│   │   ├── api/             # tRPC router, NextAuth, Woo webhooks
│   │   └── layout.tsx       # Root layout
│   ├── components/
│   │   ├── shared/          # Reusable UI
│   │   └── providers/       # Theme, Session
│   ├── lib/
│   │   ├── auth.ts          # NextAuth config
│   │   ├── woocommerce.ts   # WooCommerce client
│   │   ├── trpc.ts          # tRPC client
│   │   └── utils.ts         # Helpers
│   ├── server/
│   │   ├── db/
│   │   │   ├── schema.ts    # Drizzle schema
│   │   │   ├── index.ts     # Connection
│   │   │   └── supabase-admin.ts
│   │   ├── trpc/
│   │   │   ├── init.ts      # Context + procedures
│   │   │   ├── router.ts    # App router
│   │   │   └── routers/     # Batches, Orders, Locations
│   │   └── services/
│   │       ├── batch-engine.ts
│   │       ├── woo-sync.ts
│   │       └── status.ts
│   └── utils/
│       └── supabase/
├── supabase/
│   ├── schema.sql
│   └── migrations/
├── .env.example
├── render.yaml
├── README.md
├── DEVELOPER.md             # Ova datoteka
└── USER_GUIDE.md
```

---

## Licenca

MIT — Razvijeno za **Antikvarijat Libar**, Dante d.o.o., Osijek
