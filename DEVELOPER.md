# Batch Picking — Tehnička dokumentacija za developere

> **Verzija**: 1.1.0  
> **Zadnje ažuriranje**: 2026-06-11

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
- [AI Asistent](#ai-asistent)
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
| AI | OpenRouter API (GPT-4.1-mini / Gemini 2.5 Flash fallback) |
| Testovi | Vitest 4 (unit), Playwright 1.60 (E2E) |

---

## Podatkovni model

### Tablice

| Tablica | Opis |
|---------|------|
| `users` | Admin i picker korisnici (email, password_hash, role, active) |
| `products` | Cache WooCommerce proizvoda (sku, title, image_url, author) |
| `product_locations` | Skladišne lokacije po SKU (zone_code, shelf_code, route_position) |
| `picking_routes` | Konfiguracija zona (zone_code, zone_name, sort_order) |
| `orders` | Narudžbe iz WooCommercea (woo_order_id, customer_name, status) |
| `order_items` | Stavke narudžbi (sku, quantity, product_title_snapshot, product_author_snapshot) |
| `batches` | Picking nalozi (batch_code, batch_type, status, similarity_score) |
| `batch_orders` | Veza batch ↔ narudžba (basket_label A–E) |
| `batch_items` | Konsolidirani picking list (sku, product_title, author, total_quantity, basket_breakdown, zone_code, shelf_code, route_position) |
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

### Zone (picking_routes)

| Zone Code | Naziv | Sort Order |
|-----------|-------|------------|
| ZONA-A | Područje A | 1 |
| ZONA-B | Područje B | 2 |
| ZONA-C | Područje C | 3 |
| ZONA-D | Područje D | 4 |
| ZONA-E | Područje E | 5 |
| ZONA-F | Područje F | 6 |
| ZONA-G | Područje G | 7 |

Zone A–C su kreirane seedom, D–G dodane migracijom `0002_add_missing_zones.sql`.

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

**Algoritmi:**
- **v3 (primarni)** — Zone-based Jaccard grupiranje sa zone adjacency ograničenjem
- **v2 (fallback)** — SKU Jaccard grupiranje za narudžbe bez lokacijskih podataka

**Glavne funkcije:**
- `generateBatches()` — ulazna točka; odabire v3 ili v2 algoritam po narudžbi
- `buildZoneProfiles(orders, locationMap)` — mapira SKU → zone set po narudžbi
- `calculateZoneJaccard(zonesA, zonesB)` — Jaccard koeficijent između zone setova
- `zonesAreAdjacent(zones, zoneSortMap, maxSpan)` — provjera da zone stanu u MAX_ZONE_SPAN susjednih zona
- `zoneBasedGroupOrders(ordersWithZones, zoneSortMap, batchSize)` — v3 greedy grupiranje
- `computeRoutePosition(zoneCode, shelfCode, zoneSortMap)` — formula: `sort_order * 1000 + shelf_num`
- `calculateJaccardSimilarity(skusA, skusB)` — SKU Jaccard koeficijent (v2)
- `buildSimilarityMatrix(orders)` — pairwise matrica (v2)
- `greedyGroupOrders(orders, batchSize)` — SKU-based greedy grupiranje (v2 fallback)
- `classifyBatchType(group)` — klasifikacija: smart / mixed / partial

**Konstante:**
```typescript
const BATCH_SIZE = 5;                    // max narudžbi po batchu
const SMART_THRESHOLD = 0.1;             // 10% overlap za "smart" klasifikaciju
const ZONE_JACCARD_THRESHOLD = 0.3;      // 30% zone overlap za seeding (v3)
const MAX_ZONE_SPAN = 2;                 // max susjednih zona u batchu (npr. A+B ok, A+C ne)
const EXCLUDED_SKUS = new Set(["9075"]); // SKU dostave — nije fizički artikl
const BASKET_LABELS = ["A", "B", "C", "D", "E"] as const;
```

### ai-service.ts

**AI asistent za skladište:**
- OpenRouter API integracija s model fallback mehanizmom
- Primarni model: `openai/gpt-4.1-mini`
- Fallback model: `google/gemini-2.5-flash`
- System prompt na hrvatskom jeziku — kontekst o batch pickingu, WooCommerce integraciji, skladišnom workflowu
- Podržava multi-turn konverzaciju (max 10 poruka, max 2000 znakova po poruci)

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
| `list` | `{ status? }` | `Batch[]` | Svi batch-ovi (opcijski filter po statusu) |
| `getById` | `{ id: number }` | `Batch + items + orders` | Detalji batcha sortirani po route_position |
| `generate` | — | `{ created: number }` | Generira batch-ove (zone v3 + SKU v2 fallback) |
| `updateStatus` | `{ id, status }` | `Batch` | Promjena statusa s audit logiranjem |
| `markItemPicked` | `{ batchItemId, picked }` | `BatchItem` | Toggle item picked status |
| `markBatchPicked` | `{ id }` | `Batch` | Označi cijeli batch kao picked |

### locationsRouter

| Metoda | Input | Output | Opis |
|--------|-------|--------|------|
| `list` | — | `Location[]` | Sve lokacije |
| `upsert` | `{ sku, zone_code, shelf_code, route_position }` | `Location` | Dodaj/uredi lokaciju |
| `delete` | `{ id }` | — | Obriši lokaciju |
| `importCsv` | `{ rows[] }` | `{ inserted, errors }` | Masovni uvoz iz CSV-a |
| `listRoutes` | — | `PickingRoute[]` | Dohvati sve zone |
| `upsertRoute` | `{ zone_code, zone_name, sort_order }` | `PickingRoute` | Dodaj/uredi zonu |

### aiRouter

| Metoda | Input | Output | Opis |
|--------|-------|--------|------|
| `chat` | `{ message, history[] }` | `{ reply }` | AI asistent (OpenRouter) |

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
| `/api/webhooks/woocommerce` | `POST` | Primanje WooCommerce webhook događaja (HMAC-SHA256 verifikacija) |

### Health

| Ruta | Metoda | Opis |
|------|--------|------|
| `/api/health` | `GET` | Health check za deployment monitoring |

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
WOO_WEBHOOK_SECRET=your-webhook-secret

# --- Sync ---
SYNC_DAYS_BACK=7

# --- Supabase ---
NEXT_PUBLIC_SUPABASE_URL=https://...supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=eyJ...

# --- AI Asistent (opcionalno) ---
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_MODEL=openai/gpt-4.1-mini
OPENROUTER_FALLBACK_MODEL=google/gemini-2.5-flash
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

WooCommerce webhook šalje `POST` na `/api/webhooks/woocommerce` kada se narudžba promijeni. Handler verificira HMAC-SHA256 potpis i poziva `importSingleWooOrder()`.

Podržani webhook topici:
- `order.created` (status: processing) → uvoz narudžbe
- `order.updated` → preskače ako već postoji
- `order.completed` / `order.refunded` / `order.cancelled` → ažurira lokalni status

---

## Batch engine

### Pregled algoritama

Sustav koristi dva algoritma za grupiranje narudžbi:

| Algoritam | Koristi se za | Primarna metrika |
|-----------|---------------|-----------------|
| **v3 — Zone-based** | Narudžbe s lokacijskim podacima (≥1 SKU ima `product_locations`) | Zone Jaccard similarity + adjacency constraint |
| **v2 — SKU Jaccard** (fallback) | Narudžbe bez lokacijskih podataka | SKU Jaccard similarity |

### v3 algoritam — Zone-based grupiranje (primarni)

**Trofazni greedy proces:**

1. **Seeding** — pronalazi najbolji par narudžbi sa zone_jaccard ≥ 30%, uz uvjet da kombinirane zone stanu u MAX_ZONE_SPAN (2 susjedne zone)
2. **Growth** — dodaje kandidate koji dijele ≥1 zonu s ≥2 postojeća člana, uz adjacency provjeru da batch ne prelazi 2 susjedne zone
3. **Solo** — narudžbe bez kvalificiranog partnera idu kao pojedinačni batchevi

**Zone adjacency constraint (v1.1.0):**

Ograničava batch na maksimalno 2 susjedne zone definirane po `sort_order`:

```typescript
// zonesAreAdjacent() — provjerava da max(sort_order) - min(sort_order) < MAX_ZONE_SPAN
// Primjeri (MAX_ZONE_SPAN = 2):
// ZONA-A(1) + ZONA-B(2) → span 1 → ✅ dopušteno
// ZONA-B(2) + ZONA-C(3) → span 1 → ✅ dopušteno
// ZONA-A(1) + ZONA-C(3) → span 2 → ❌ odbijeno
// ZONA-A(1) + ZONA-D(4) → span 3 → ❌ odbijeno
```

**Route position formula:**
```typescript
route_position = zone_sort_order * 1000 + shelf_number
// ZONA-B, polica B7 → 2 * 1000 + 7 = 2007
```

### v2 algoritam — SKU Jaccard (fallback)

```typescript
// Jaccard similarity
similarity(A, B) = |A.skus ∩ B.skus| / |A.skus ∪ B.skus|
```

Greedy grupiranje:
1. Izračunaj similarity maticu za sve parove
2. Sortiraj parove po similarity (descending)
3. Uzmi najsličniji par → nova grupa
4. Dodaj narudžbe s najboljim prosječnim overlap-om
5. Ponavljaj dok ne dosegne BATCH_SIZE (5)

### Klasifikacija batcha

| Tip | Uvjet |
|-----|-------|
| `smart` | Prosječni SKU Jaccard ≥ 10% i batch ima 5 narudžbi |
| `mixed` | Prosječni SKU Jaccard < 10% i batch ima 5 narudžbi |
| `partial` | Batch ima manje od 5 narudžbi |

### Tok generiranja batcha

```
generateBatches()
├─ Fetch: orders (status = pending_batch)
├─ Fetch: order_items za te narudžbe
├─ Preload: product_locations (SKU → zone + shelf) — bulk upit
├─ Preload: picking_routes (zone → sort_order) — bulk upit
├─ Preload: products (SKU → title, author, image) — bulk upit
├─ Split narudžbe:
│  ├─ S lokacijom → zoneBasedGroupOrders() [v3]
│  └─ Bez lokacije → greedyGroupOrders() [v2 fallback]
├─ Za svaku grupu:
│  ├─ classifyBatchType()
│  ├─ generateBatchCode() → npr. "B-001"
│  ├─ INSERT batches
│  ├─ INSERT batch_orders (basket labels A–E)
│  └─ INSERT batch_items (s route_position, zone_code, shelf_code, author)
├─ UPDATE orders → status: "batched"
└─ INSERT activity_logs
```

---

## Picking workflow

### Picker screen (`/pick/[id]`)

1. Učitava `batch_items` sortirane po `route_position` (zona → polica)
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

## AI Asistent

### Opis

Floating chat widget dostupan adminu za brza pitanja o batch pickingu, narudžbama i skladišnom workflowu.

### Arhitektura

- **Frontend**: `src/components/shared/ai-assistant.tsx` — React komponenta s chat UI
- **Backend**: `src/server/services/ai-service.ts` — OpenRouter API poziv
- **tRPC**: `ai.chat` mutacija u `src/server/trpc/routers/ai.ts`

### Konfiguracija

```bash
OPENROUTER_API_KEY=sk-or-...                    # Obavezno za AI asistenta
OPENROUTER_MODEL=openai/gpt-4.1-mini            # Primarni model
OPENROUTER_FALLBACK_MODEL=google/gemini-2.5-flash  # Fallback ako primarni ne uspije
```

Bez `OPENROUTER_API_KEY`, AI asistent neće raditi ali ostatak aplikacije funkcionira normalno.

---

## Testiranje

### Pokreni testove

```bash
npm run test:run     # Pokreni jednom
npm run test         # Watch mode
```

### Pokrivenost testova (26 testova)

| Grupa | Testovi |
|-------|---------|
| SKU Jaccard (v2) | Identični/disjunktni/parcijalni setovi, prazni setovi |
| Greedy grupiranje (v2) | Batch veličina, parcijalni batchevi, sličnost, solo narudžba |
| Klasifikacija batcha | partial, smart, mixed |
| Zone profili (v3) | SKU→zona mapiranje, isključivanje SKU 9075, prazni mappingi, deduplikacija |
| Zone Jaccard (v3) | Identični/disjunktni/parcijalni setovi |
| Zone-based grupiranje (v3) | Dijeljene zone, adjacency constraint, solo batchevi, batch veličina |
| Route position | Formula sort_order*1000+shelf, null → 9999 |

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

### Zone nedostaju (ZONA-D do ZONA-G)

Pokreni migraciju:
```sql
-- supabase/migrations/0002_add_missing_zones.sql
INSERT INTO picking_routes (zone_code, zone_name, sort_order)
VALUES
  ('ZONA-D', 'ZONA-D', 4),
  ('ZONA-E', 'ZONA-E', 5),
  ('ZONA-F', 'ZONA-F', 6),
  ('ZONA-G', 'ZONA-G', 7)
ON CONFLICT (zone_code) DO NOTHING;
```

### AI asistent ne odgovara

- Provjeri da je `OPENROUTER_API_KEY` postavljen i validan
- Provjeri mrežnu konekciju prema `openrouter.ai`
- Pogledaj server logove za specifičnu grešku modela

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
     ai: aiRouter,
     novaStvar: novaStvarRouter,
   });
   ```

### Promjena zone adjacency ograničenja

Za promjenu broja dopuštenih susjednih zona, izmijeni konstantu u `src/server/services/batch-engine.ts`:
```typescript
const MAX_ZONE_SPAN = 3; // npr. 3 = dopuštene 3 susjedne zone (A+B+C)
```

---

## Struktura projekta

```
batch-picking/
├── src/
│   ├── app/
│   │   ├── (auth)/          # Login stranica
│   │   ├── (admin)/         # Dashboard, Narudžbe, Batchevi, Lokacije, Korisnici
│   │   ├── (picker)/        # Lista batch-eva, Picking screen
│   │   ├── api/             # tRPC router, NextAuth, Woo webhooks, Health
│   │   └── layout.tsx       # Root layout
│   ├── components/
│   │   ├── shared/          # Reusable UI, AI asistent
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
│   │   │   ├── seed.ts      # Seed podaci (zone, lokacije, korisnici)
│   │   │   └── supabase-admin.ts
│   │   ├── trpc/
│   │   │   ├── init.ts      # Context + procedures
│   │   │   ├── router.ts    # App router (batches, orders, locations, ai)
│   │   │   └── routers/     # Batches, Orders, Locations, AI
│   │   └── services/
│   │       ├── batch-engine.ts   # Zone v3 + SKU v2 grupiranje
│   │       ├── woo-sync.ts       # WooCommerce sync
│   │       ├── ai-service.ts     # OpenRouter AI asistent
│   │       └── status.ts         # Batch status workflow
│   └── utils/
│       └── supabase/        # Supabase client helpers
├── tests/
│   └── unit/
│       └── batch-engine.test.ts  # 26 unit testova
├── supabase/
│   ├── schema.sql           # SQL schema
│   └── migrations/
│       ├── 0001_add_author_columns.sql
│       └── 0002_add_missing_zones.sql
├── .env.example             # Primjer env varijabli
├── render.yaml              # Render deploy konfiguracija
├── README.md                # Pregled projekta
├── DEVELOPER.md             # Ova datoteka
└── USER_GUIDE.md            # Upute za skladište
```

---

## Changelog

### v1.1.0 (2026-06-11)

- **Zone-based batch grupiranje (v3)** — primarni algoritam koji koristi zone umjesto SKU-ova za inteligentnije grupiranje narudžbi
- **Zone adjacency constraint** — ograničava batch na max 2 susjedne zone kako bi se smanjilo hodanje pickera
- **AI asistent** — chatbot za skladišno osoblje (OpenRouter: GPT-4.1-mini + Gemini fallback)
- **N+1 query eliminacija** — bulk preload svih product_locations, picking_routes i products
- **Admin dashboard** — statistike, activity log, status badges
- **User management** — CRUD za admin i picker korisnike
- **Zone management** — upsert/list zona kroz admin UI
- **Health endpoint** — `/api/health` za deployment monitoring
- **Render deployment** — `render.yaml` konfiguracija
- **26 unit testova** — pokrivaju oba algoritma, zone profile, route position

### v1.0.0 (2026-06-02)

- Inicijalna verzija s SKU Jaccard algoritmom (v2)
- WooCommerce sinkronizacija s webhook podrškom
- Picker workflow s basket breakdown
- Admin panel s lokacijama i batchevima

---

## Licenca

MIT — Razvijeno za **Antikvarijat Libar**, Dante d.o.o., Osijek
