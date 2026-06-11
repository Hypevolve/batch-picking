# Batch Picking — Libar

**Batch Picking** je skladišni sustav za grupno skupljanje narudžbi iz WooCommercea. Aplikacija automatizira proces pickinga — umjesto da se svaka narudžba skuplja zasebno, sustav grupira do 5 narudžbi u jedan "batch" na temelju zonske blizine i sličnosti artikala, smanjujući broj prolazaka i hodanje kroz skladište.

> **Verzija**: 1.1.0  
> **Zadnje ažuriranje**: 2026-06-11

---

## Sadržaj

- [Pregled](#pregled)
- [Arhitektura](#arhitektura)
- [Glavne značajke](#glavne-značajke)
- [Algoritam batch grupiranja](#algoritam-batch-grupiranja)
- [Zone i ruta](#zone-i-ruta)
- [WooCommerce sinkronizacija](#woocommerce-sinkronizacija)
- [AI Asistent](#ai-asistent)
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
- **Grupira narudžbe** u batcheve od max 5 narudžbi po zonskoj blizini (v3) ili sličnosti SKU-ova (v2 fallback)
- **Ograniči batch na 2 susjedne zone** — picker ne mora trčati preko cijelog skladišta
- **Optimizira rutu** kroz skladište po zonama i policama (`route_position`)
- **Omogući pickerima** da na tabletu/mobile skupljaju knjige po batchu
- **Prati status** — od sinkronizacije do pakiranja
- **AI asistent** — chatbot za brza pitanja o narudžbama i workflowu

### Operativni tok

```
WooCommerce ──Sync──> Narudžbe u bazi ──Generate──> Batch (5 narudžbi, max 2 zone)
                                                         │
                                                         ▼
                                            ┌─────────────────────┐
                                            │ Picker (tablet)     │
                                            │ skuplja knjige      │
                                            │ po ruti: A→B       │
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

### Tehnološki stack

| Sloj | Tehnologija |
|------|-------------|
| Frontend | Next.js 16 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS 4, shadcn/ui, Lucide icons |
| State | TanStack Query (React Query), tRPC |
| Auth | NextAuth.js 5 (Credentials provider) |
| DB | PostgreSQL (Supabase) |
| API | tRPC 11 (end-to-end type-safe) |
| AI | OpenRouter API (GPT-4.1-mini + Gemini fallback) |
| Testovi | Vitest, Playwright |

### Struktura projekta

```
batch-picking/
├── src/
│   ├── app/
│   │   ├── (auth)/          # Login stranica
│   │   ├── (admin)/         # Dashboard, Narudžbe, Batchevi, Lokacije, Korisnici
│   │   ├── (picker)/        # Lista batch-eva, Picking screen
│   │   ├── api/             # tRPC, NextAuth, Woo webhooks, Health
│   │   └── layout.tsx       # Root layout
│   ├── components/
│   │   ├── shared/          # Reusable UI (header, sidebar, AI asistent)
│   │   └── providers/       # Theme provider, Session provider
│   ├── lib/                 # Auth, WooCommerce client, tRPC client, utils
│   ├── server/
│   │   ├── db/              # Drizzle ORM schema, Supabase admin client, seed
│   │   ├── trpc/            # tRPC init, app router, routers (batches, orders, locations, ai)
│   │   └── services/        # batch-engine, woo-sync, ai-service, status
│   └── utils/
├── tests/unit/              # 26 unit testova (batch-engine)
├── supabase/                # SQL schema + migracije
├── render.yaml              # Render deploy konfiguracija
├── DEVELOPER.md             # Tehnička dokumentacija
└── USER_GUIDE.md            # Upute za skladište
```

---

## Glavne značajke

### 1. Zone-based batch grupiranje (v3)

- **Zone Jaccard similarity** — grupira narudžbe koje dijele skladišne zone
- **Zone adjacency constraint** — batch može sadržavati narudžbe iz max 2 susjedne zone (npr. A+B, ali ne A+C)
- **Max 5 narudžbi** po batchu (`BATCH_SIZE = 5`)
- **Fallback na SKU Jaccard** (v2) za narudžbe bez definiranih lokacija

### 2. WooCommerce sinkronizacija

- Dohvaća narudžbe sa statusom `processing` (ili custom `selling-payment`)
- Filtrira po datumu — `SYNC_DAYS_BACK` (default: 7 dana)
- Povlači detalje o proizvodima: SKU, naslov, slika, **autor knjige** (iz `import_autori` meta key-a)
- Webhook podrška — automatski uvoz novih narudžbi
- Idempotentna sinkronizacija — ne duplicira postojeće

### 3. Optimizacija rute

- Proizvodi imaju pridružene **zone** i **police** (`product_locations`)
- Route position formula: `zone_sort_order * 1000 + shelf_number`
- Picker vidi knjige sortirane po fizičkoj lokaciji — ne skače po skladištu
- Zone adjacency osigurava da picker pokriva max 2 susjedne zone po batchu

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

### 6. AI Asistent

- Chatbot za skladišno osoblje (dostupan u admin panelu)
- Odgovara na hrvatskom jeziku
- Pomaže s pitanjima o narudžbama, batchevima, lokacijama
- OpenRouter API s model fallback mehanizmom

### 7. Admin Dashboard

- Statistike: ukupno narudžbi, batchevi, skupljeno, spakirano
- Activity log s vremenskim oznakama
- User management (admin/picker korisnici)

---

## Algoritam batch grupiranja

### v3 — Zone-based grupiranje (primarni)

```
1. Svaka narudžba dobije zone profil (Set zona njezinih SKU-ova)
2. Izračunaj Zone Jaccard za svaki par:
   zone_similarity(A, B) = |A.zones ∩ B.zones| / |A.zones ∪ B.zones|

3. Filtriraj parove:
   - zone_jaccard ≥ 30% (ZONE_JACCARD_THRESHOLD)
   - kombinirane zone moraju biti susjedne (max 2 zone po sort_order)

4. Greedy grupiranje:
   a. Seed — najsličniji kvalificirani par → nova grupa
   b. Grow — dodaj narudžbe koje dijele zone i ne krše adjacency
   c. Solo — narudžbe bez partnera idu kao pojedinačni batch

5. Za svaku grupu:
   - Klasificiraj (smart/mixed/partial)
   - Generiraj batch_code, batch_items s route_position
```

### v2 — SKU Jaccard (fallback)

```
similarity(A, B) = |A.skus ∩ B.skus| / |A.skus ∪ B.skus|
```

Koristi se samo za narudžbe čiji SKU-ovi nemaju definirane lokacije u `product_locations`.

### Konstante

```typescript
BATCH_SIZE = 5                    // max narudžbi po batchu
SMART_THRESHOLD = 0.1             // 10% SKU overlap = "smart" batch
ZONE_JACCARD_THRESHOLD = 0.3      // 30% zone overlap za seeding
MAX_ZONE_SPAN = 2                 // max 2 susjedne zone po batchu
EXCLUDED_SKUS = ["9075"]          // dostava — nije fizički artikl
```

---

## Zone i ruta

### Definirane zone

| Zona | Sort Order | Susjedne |
|------|-----------|----------|
| ZONA-A | 1 | B |
| ZONA-B | 2 | A, C |
| ZONA-C | 3 | B, D |
| ZONA-D | 4 | C, E |
| ZONA-E | 5 | D, F |
| ZONA-F | 6 | E, G |
| ZONA-G | 7 | F |

### Adjacency primjeri

| Kombinacija | Sort span | Dopušteno? |
|-------------|-----------|------------|
| A + B | 1 | Da |
| B + C | 1 | Da |
| A + C | 2 | Ne |
| A + D | 3 | Ne |
| {A,B} + {B} | 1 | Da |
| {A,B} + {B,C} | 2 | Ne |

### Route position

Picking ruta se računa formulom: `zone_sort_order * 1000 + shelf_number`

| Zona | Polica | Route Position |
|------|--------|----------------|
| ZONA-A | A-3 | 1003 |
| ZONA-B | B-7 | 2007 |
| ZONA-C | C-1 | 3001 |

Itemi u batchu su sortirani po route_position — picker ide redom kroz skladište.

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

- **Sync** — povlači nove narudžbe bez brisanja postojećih
- **Reset & Sync** — briše SVE batcheve, narudžbe i stavke, te pokreće svježi sync

---

## AI Asistent

Integrirani chatbot za skladišno osoblje:

- Dostupan kao floating gumb u donjem desnom kutu admin panela
- Odgovara isključivo na hrvatskom jeziku
- Kontekst: batch picking, narudžbe, lokacije, koševi, WooCommerce workflow
- Multi-turn konverzacija (do 10 poruka)
- Model fallback: ako primarni model (GPT-4.1-mini) ne uspije, koristi Gemini 2.5 Flash

Za korištenje potreban je `OPENROUTER_API_KEY` u environment varijablama.

---

## Instalacija i pokretanje

### Preduvjeti

- **Node.js** >= 20
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

# 5. Pokreni migracije
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

**Promijeni lozinke odmah nakon prvog pokretanja!**

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
| `WOO_WEBHOOK_SECRET` | WooCommerce webhook HMAC secret | `...` |
| `SYNC_DAYS_BACK` | Koliko dana unazad sinkronizirati | `7` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase projekt URL | `https://...supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase anon key | `eyJ...` |
| `OPENROUTER_API_KEY` | OpenRouter API ključ (za AI asistenta) | `sk-or-...` |
| `OPENROUTER_MODEL` | Primarni AI model | `openai/gpt-4.1-mini` |
| `OPENROUTER_FALLBACK_MODEL` | Fallback AI model | `google/gemini-2.5-flash` |

Puni popis: vidi `.env.example` i [DEVELOPER.md](DEVELOPER.md).

---

## Deployment na Render

### 1. Kreiraj novi web service

1. Otvori [render.com](https://render.com)
2. **New + -> Web Service**
3. Poveži GitHub repozitorij
4. Odaberi branch: `main`

### 2. Konfiguracija

Render prepoznaje `render.yaml` iz repozitorija:

```yaml
services:
  - type: web
    name: batch-picking
    runtime: node
    plan: starter
    buildCommand: npm install && npm run build
    startCommand: npm run start
    envVars:
      - key: NODE_ENV
        value: production
```

**Koristi Starter plan ($7/mj) ili više.** Besplatni plan ulazi u sleep mode — webhookovi i sync neće raditi pouzdano.

### 3. Environment varijable

U Render dashboardu -> Environment -> dodaj sve varijable iz `.env.example`.

### 4. Deploy

Render automatski builda i deploya na svaki push na `main`.

---

## Upravljanje lokacijama

Prije generiranja batch-eva, admin mora definirati lokacije proizvoda:

1. Odi na **Lokacije** u admin panelu
2. Dodaj novu lokaciju:
   - **SKU** — identifikator proizvoda
   - **Zona** — skladišna zona (npr. ZONA-A, ZONA-B)
   - **Polica** — oznaka police (npr. A-3, B-7)
   - **Pozicija rute** — redni broj za picking redoslijed
3. Ili koristi **CSV import** za masovni unos

**Važno:** Zone moraju biti definirane u `picking_routes` tablici (sa `sort_order`) da bi zone adjacency constraint radio ispravno.

---

## Razine pristupa

### Admin

- Pregled dashboarda s metrikama i activity logom
- Upravljanje lokacijama i zonama
- Pregled svih narudžbi
- Generiranje batch-eva
- Pokretanje WooCommerce sinkronizacije
- Reset & Sync
- User management (dodavanje/uređivanje korisnika)
- AI asistent

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
3. Podesi `SYNC_DAYS_BACK` na veći broj (npr. `30`)

### Batch generiranje ne radi

1. Provjeri da postoje narudžbe sa statusom `pending_batch`
2. Provjeri da narudžbe imaju stavke s validnim SKU-ovima
3. Admin mora imati dodijeljene lokacije za SKU-ove (za v3 algoritam)
4. Narudžbe bez lokacija koriste v2 fallback algoritam

### Batchevi spajaju udaljene zone

1. Provjeri da `picking_routes` tablica ima ispravne `sort_order` vrijednosti
2. Zone moraju imati uzastopne sort_order vrijednosti (1, 2, 3...)
3. Konstanta `MAX_ZONE_SPAN = 2` ograničava na 2 susjedne zone

### Autor knjige se ne prikazuje

1. Pokreni **Reset & Sync** da se ponovno povuku svi autori
2. Provjeri da WooCommerce produkt ima `import_autori` meta key

### AI asistent ne radi

1. Provjeri da je `OPENROUTER_API_KEY` postavljen
2. Ostatak aplikacije radi normalno bez AI ključa

### Login ne radi

1. Provjeri `NEXTAUTH_SECRET` i `NEXTAUTH_URL`
2. Pogledaj [DEVELOPER.md](DEVELOPER.md) za debug upute

---

## Dodatna dokumentacija

- **[DEVELOPER.md](DEVELOPER.md)** — Tehnička dokumentacija za developere
- **[USER_GUIDE.md](USER_GUIDE.md)** — Upute za skladišne radnike

---

## Changelog

### v1.1.0 (2026-06-11)
- Zone-based batch grupiranje (v3) sa zone adjacency constraint (max 2 susjedne zone)
- AI asistent (OpenRouter: GPT-4.1-mini + Gemini fallback)
- Admin dashboard sa statistikama i activity logom
- User management
- Zone management
- N+1 query eliminacija (bulk preload)
- Health endpoint i Render deployment
- 26 unit testova

### v1.0.0 (2026-06-02)
- SKU Jaccard batch grupiranje (v2)
- WooCommerce sync s webhook podrškom
- Picker workflow s basket breakdown
- Admin panel s lokacijama i batchevima

---

## Autor

Razvijeno za **Antikvarijat Libar** — Dante d.o.o., Osijek

- **Verzija**: 1.1.0
- **Licenca**: MIT
