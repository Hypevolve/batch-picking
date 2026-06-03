# Batch Picking — Libar

**Batch Picking** je skladišni sustav za grupno skupljanje narudžbi iz WooCommercea. Aplikacija automatizira proces pickinga — umjesto da se svaka narudžba skuplja zasebno, sustav grupira do 5 narudžbi u jedan "batch" na temelju sličnosti SKU-ova (knjiga), smanjujući broj prolazaka kroz skladište.

---

## Sadržaj

- [Pregled](#pregled)
- [Arhitektura](#arhitektura)
- [Glavne značajke](#glavne-značajke)
- [Algoritam batch grupiranja](#algoritam-batch-grupiranja)
- [WooCommerce sinkronizacija](#woocommerce-sinkronizacija)
- [Instalacija i pokretanje](#instalacija-i-pokretanje)
- [Environment varijable](#environment-varijable)
- [Deployment na Render](#deployment-na-render)
- [Upravljanje lokacijama](#upravljanje-lokacijama)
- [Razine pristupa](#razine-pristupa)
- [Troubleshooting](#troubleshooting)

---

## Pregled

**Batch Picking** omogućuje skladištu Antikvarijata Libar da:

- **Povuče narudžbe** iz WooCommercea (samo `processing` ili custom `selling-*` statusi)
- **Grupira narudžbe** u batcheve od max 5 narudžbi po sličnosti SKU-ova
- **Optimizira rutu** kroz skladište po zonama i policama
- **Omogući pickerima** da na tabletu/mobile skupljaju knjige po batchu
- **Praćenje statusa** — od sinkronizacije do pakiranja

### Operativni tok

```
WooCommerce ──Sync──> Narudžbe u bazi ──Generate──> Batch (5 narudžbi)
                                                         │
                                                         ▼
                                            ┌─────────────────────┐
                                            │ Picker (tablet)     │
                                            │ skuplja knjige      │
                                            │ po ruti: A→B→C...   │
                                            └─────────────────────┘
                                                         │
                                    Picked ──> Packed ──> Sinkronizirano
```

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

### Struktura projekta

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
│   │   ├── shared/          # Reusable UI (header, sidebar, card, button)
│   │   └── providers/       # Theme provider, Session provider
│   ├── lib/
│   │   ├── auth.ts          # NextAuth credentials config
│   │   ├── woocommerce.ts   # WooCommerce API client
│   │   ├── trpc.ts          # tRPC client
│   │   └── utils.ts         # Pomoćne funkcije
│   ├── server/
│   │   ├── db/
│   │   │   ├── schema.ts    # Drizzle ORM schema
│   │   │   ├── index.ts     # DB connection
│   │   │   └── supabase-admin.ts  # Supabase admin client
│   │   ├── trpc/
│   │   │   ├── init.ts      # tRPC context + procedures
│   │   │   ├── router.ts    # App router
│   │   │   └── routers/     # Batches, Orders, Locations
│   │   └── services/
│   │       ├── batch-engine.ts   # Grupiranje narudžbi
│   │       ├── woo-sync.ts       # WooCommerce sync
│   │       └── status.ts         # Batch status workflow
│   └── utils/
│       └── supabase/        # Supabase client helpers
├── supabase/
│   ├── schema.sql           # SQL schema (za ručno pokretanje)
│   └── migrations/          # Migracije
├── .env.example             # Primjer env varijabli
├── render.yaml              # Render deploy konfiguracija
├── README.md                # Ova datoteka
├── DEVELOPER.md             # Tehnička dokumentacija
└── USER_GUIDE.md            # Upute za skladište
```

---

## Glavne značajke

### 1. WooCommerce sinkronizacija

- Dohvaća narudžbe sa statusom `processing` (ili custom `selling-payment` — konfigurabilno)
- Filtrira narudžbe po datumu — `SYNC_DAYS_BACK` env varijabla (default: 7 dana)
- Povlači detalje o proizvodima: SKU, naslov, slika, **autor knjige** (iz `import_autori` meta key-a)
- Backfill autora na postojeće produkte
- Webhook podrška — automatski uvoz novih narudžbi iz WooCommercea
- Idempotentna sinkronizacija — ne duplicira postojeće narudžbe

### 2. Smart batch grupiranje

- **Jaccard similarity** između SKU setova dviju narudžbi
- **Greedy grupiranje** — počinje od najsličnijeg para
- **Max 5 narudžbi** po batchu (`BATCH_SIZE = 5`)
- **Similarity threshold** — batch je "smart" ako overlap > 10%
- Autorska imena se snimaju kao snapshot na `order_items` i `batch_items`

### 3. Picking ruta

- Proizvodi imaju pridružene **zone** i **police** (`product_locations`)
- Ruta se sortira po `route_position` unutar zone
- Picker vidi knjige grupirane po lokacijama — ne skače po skladištu

### 4. Picking workflow

```
Draft ──[Admin generira]──> Ready ──[Picker počinje]──> In Progress
                                                          │
                                    Picked ──[Picker završio]──┘
                                       │
                                    Packed ──[Admin spakirao]
                                       │
                                    Synced ──[Status ažuriran u WC]
```

### 5. Basket breakdown

- Svaka narudžba u batchu dobije **basket label** (A, B, C, D, E)
- Picker skuplja sve iste SKU-ove odjednom
- Basket breakdown prikazuje koliko komada ide u koji koš

---

## Algoritam batch grupiranja

```typescript
// 1. Izračunaj Jaccard similarity za svaki par narudžbi
similarity(A, B) = |A.skus ∩ B.skus| / |A.skus ∪ B.skus|

// 2. Sortiraj parove po similarity (descending)

// 3. Greedy grupiranje:
//    a. Uzmi najsličniji par → nova grupa
//    b. Pronađi sljedeću narudžbu s najvećim prosječnim
//       similarity prema svim članovima grupe
//    c. Dodaj dok ne dosegne BATCH_SIZE (5)
//    d. Ponovi dok ima narudžbi

// 4. Za svaku grupu:
//    - Izračunaj similarity_score (prosjek svih parova)
//    - Generiraj batch_code (npr. B-001)
//    - Kreiraj batch_items (konsolidirani picking list)
```

---

## WooCommerce sinkronizacija

### Filtriranje

| Parametar | Default | Opis |
|-----------|---------|------|
| `status` | `processing` | Status narudžbi koje se povlače |
| `after` | `SYNC_DAYS_BACK` | Povlači narudžbe od N dana unazad |
| `per_page` | 100 | Max po stranici (pagination) |

### Autor knjige

WooCommerce produkti imaju meta key `import_autori` koji sadrži autora. Sustav:
1. Povlači produkt po SKU iz WooCommercea
2. Čita `meta_data` i traži `import_autori`
3. Sprema autora u `products.author`
4. Snapshot autora ide u `order_items.product_author_snapshot`
5. Prilikom generacije batcha, autor se kopira u `batch_items.author`

### Ručna sinkronizacija

Admin može pokrenuti sync s Dashboarda ili Batchevi stranice:
- **Sync** — povlači nove narudžbe bez brisanja postojećih
- **Reset & Sync** — briše SVE batcheve, narudžbe i stavke, te pokreće svježi sync

---

## Instalacija i pokretanje

### Preduvjeti

- **Node.js** ≥ 20
- **npm**
- **PostgreSQL** baza (Supabase preporučeno)
- **WooCommerce** račun s API pristupom

### Lokalno pokretanje

```bash
# 1. Kloniraj repozitorij
git clone <repo-url>
cd batch-picking

# 2. Instaliraj ovisnosti
npm install

# 3. Kopiraj primjer environment datoteke
cp .env.example .env.local

# 4. Uredi .env.local — unesi sve potrebne API ključeve
#    (vidi odjeljak "Environment varijable")

# 5. Pokreni migracije (ili ručno u Supabase SQL editoru)
npx drizzle-kit push

# 6. Pokreni dev server
npm run dev -- --port 3001
```

Otvori [http://localhost:3001](http://localhost:3001).

### Default login

| Uloga | Email | Lozinka |
|-------|-------|---------|
| Admin | `admin@libar.hr` | `admin123` |
| Picker | `picker@libar.hr` | `picker123` |

**⚠️ Promijeni lozinke odmah nakon prvog pokretanja!**

---

## Environment varijable

| Varijabla | Opis | Primjer |
|-----------|------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://...` |
| `NEXTAUTH_URL` | URL aplikacije | `http://localhost:3001` |
| `NEXTAUTH_SECRET` | NextAuth enkripcijski secret | `openssl rand -base64 32` |
| `WOO_API_URL` | WooCommerce API URL | `https://libar.hr/wp-json/wc/v3` |
| `WOO_CONSUMER_KEY` | WooCommerce API key | `ck_...` |
| `WOO_CONSUMER_SECRET` | WooCommerce API secret | `cs_...` |
| `SYNC_DAYS_BACK` | Koliko dana unazad sinkronizirati | `7` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase projekt URL | `https://...supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase anon key | `eyJ...` |

Puni popis: vidi `.env.example` i [DEVELOPER.md](DEVELOPER.md).

---

## Deployment na Render

### 1. Kreiraj novi web service

1. Otvori [render.com](https://render.com)
2. **New + → Web Service**
3. Poveži GitHub repozitorij
4. Odaberi branch: `main`

### 2. Konfiguracija

Render će prepoznati `render.yaml` iz repozitorija:

```yaml
# render.yaml (već uključen u repozitoriju)
services:
  - type: web
    name: batch-picking
    runtime: node
    plan: starter        # ⚠️ Obavezno Starter ili više!
    buildCommand: npm install && npm run build
    startCommand: npm run start
    envVars:
      - key: NODE_ENV
        value: production
```

**⚠️ Važno**: Koristi **Starter plan** ($7/mj) ili više. Besplatni plan ulazi u sleep mode — webhookovi i sync neće raditi pouzdano.

### 3. Environment varijable

U Render dashboardu → Environment → dodaj sve varijable iz `.env.example`:

1. `DATABASE_URL` — sync: false
2. `NEXTAUTH_SECRET` — sync: false
3. `WOO_CONSUMER_KEY` — sync: false
4. `WOO_CONSUMER_SECRET` — sync: false

Varijable označene `sync: false` se ne prikazuju u logovima.

### 4. Deploy

Klikni **Deploy**. Render će automatski:
1. Pokrenuti `npm install && npm run build`
2. Pokrenuti `npm run start`
3. Auto-deploy na svaki push na `main`

---

## Upravljanje lokacijama

Prije generiranja batch-eva, admin mora definirati lokacije proizvoda:

1. Odi na **Lokacije** u admin panelu
2. Dodaj novu lokaciju:
   - **SKU** — identifikator proizvoda
   - **Zona** — skladišna zona (npr. "A", "B", "C")
   - **Polica** — oznaka police (npr. "P-12")
   - **Pozicija rute** — redni broj za picking redoslijed

Bez lokacija, picker neće vidjeti gdje se knjige nalaze.

---

## Razine pristupa

### Admin

- Pregled dashboarda s metrikama
- Upravljanje lokacijama proizvoda
- Pregled svih narudžbi
- Generiranje batch-eva
- Pokretanje WooCommerce sinkronizacije
- Reset & Sync (čišćenje baze + svježi sync)

### Picker

- Pregled aktivnih batch-eva (Ready / In Progress)
- Picking screen — skupljanje knjiga po ruti
- Označavanje SKU-a kao "picked"
- Označavanje batcha kao "završen"

---

## Troubleshooting

### Sinkronizacija ne vraća narudžbe

1. Provjeri `WOO_API_URL`, `WOO_CONSUMER_KEY`, `WOO_CONSUMER_SECRET`
2. Provjeri da WooCommerce ima narudžbe sa statusom `processing`
3. Podesi `SYNC_DAYS_BACK` na veći broj (npr. `30`) ako su narudžbe starije
4. Pogledaj logove — `npm run dev` prikazuje greške u terminalu

### Batch generiranje ne radi

1. Provjeri da postoje narudžbe sa statusom `pending_batch`
2. Provjeri da narudžbe imaju stavke s validnim SKU-ovima
3. Admin mora imati dodijeljene lokacije za SKU-ove

### Autor knjige se ne prikazuje

1. Provjeri da je migracija izvršena: `product_author_snapshot` u `order_items` i `author` u `batch_items`
2. Pokreni **Reset & Sync** da se ponovno povuku svi autori
3. Provjeri da WooCommerce produkt ima `import_autori` meta key

### Login ne radi

1. Provjeri da `NEXTAUTH_SECRET` i `NEXTAUTH_URL` odgovaraju
2. Provjeri da `users` tablica ima admin i picker zapise
3. Pogledaj [DEVELOPER.md](DEVELOPER.md) za debug upute

---

## Dodatna dokumentacija

- **[DEVELOPER.md](DEVELOPER.md)** — Tehnička dokumentacija za developere
- **[USER_GUIDE.md](USER_GUIDE.md)** — Upute za skladišne radnike

---

## Autor

Razvijeno za **Antikvarijat Libar** — Dante d.o.o., Osijek

- **Verzija**: 1.0.0
- **Licenca**: MIT
