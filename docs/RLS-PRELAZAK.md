# Prelazak na zaključane tablice (Supabase RLS)

## Zašto

Do sada je svaka tablica imala RLS politiku `USING (true) WITH CHECK (true)` bez `TO` uloge, pa je vrijedila i za ulogu `anon`. Publishable ključ (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) šalje se u preglednik, pa je svatko tko ga ima mogao preko Supabase REST API-ja čitati i mijenjati `users` (hashevi lozinki), `orders` (imena kupaca) i sve ostale tablice.

Nakon ovog prelaska:

- preglednik više ne zove Supabase; sve čitanje i pisanje ide kroz `/api/trpc` na našem serveru, s provjerom uloge (picker ili admin);
- server se spaja ključem `SUPABASE_SERVICE_ROLE_KEY`, koji nikad ne ide u preglednik;
- uloge `anon` i `authenticated` (publishable ključ) nemaju nikakva prava na tablice.

## Redoslijed (obavezno ovim redom)

Kod radi i prije koraka 1: dok ključ nije postavljen, server koristi publishable ključ kao dosad i u log upiše jedno upozorenje. SQL iz koraka 3 smije se pokrenuti tek kad su koraci 1 i 2 potvrđeni, inače aplikacija ostaje bez pristupa bazi.

### 1. Postavi `SUPABASE_SERVICE_ROLE_KEY` na Renderu

1. Supabase → Project Settings → API Keys: kopiraj **secret** ključ (`sb_secret_…`) ili, u kartici Legacy, **service_role** ključ. Ne publishable i ne anon ključ.
2. Render → servis `batch-picking` → Environment → dodaj varijablu `SUPABASE_SERVICE_ROLE_KEY` s tim ključem → Save.
3. Ime varijable ne smije imati prefiks `NEXT_PUBLIC_`. Ključ ne ide u kod, chat ni mail.

### 2. Deploy ovog koda i provjera da upozorenje nestaje

1. Kad je kod na `main`, Render ga sam deploya. Varijabla iz koraka 1 vrijedi tek od sljedećeg deploya (Render ga pri spremanju varijable nudi i sam).
2. Provjera izvana:

   ```bash
   curl -s https://batch-picking.onrender.com/api/health
   ```

   Mora vratiti `"serviceRoleConfigured": true`, a `commit` mora biti commit koji je upravo deployan.
3. U Render logovima zadnjeg deploya ne smije biti retka koji počinje s `[supabase] SUPABASE_SERVICE_ROLE_KEY`. Ako piše `is not set`, varijabla nije postavljena. Ako piše `holds a public (publishable/anon) key`, u varijablu je zalijepljen javni ključ.
4. Prijavi se i otvori Dashboard, Narudžbe, Batcheve i `/pick`. Ako je ključ pogrešan (npr. odrezan), aplikacija neće raditi već sada: ispravi ključ prije koraka 3.

Ako `serviceRoleConfigured` nije `true`, ne idi dalje.

### 3. Pokreni SQL u Supabase SQL Editoru

1. Supabase → SQL Editor → zalijepi cijeli sadržaj datoteke `supabase/migrations/0003_lock_rls.sql` → Run. Smije se pokrenuti više puta.
2. Na kraju se ispiše tablica s 10 redaka. U svakom retku mora biti: `rls_enabled = true`, `open_policies = 0`, `anon_access = false`, `authenticated_access = false`, `service_role_access = true`.
3. Odmah ponovno otvori aplikaciju (prijava, Dashboard, `/pick`) i provjeri da radi.

### 4. Provjera izvana publishable ključem

Ista naredba pokreće se prije koraka 3 (da se vidi da URL i ključ rade i da podaci trenutno cure) i poslije njega (da se vidi da više ne cure). Šalje HEAD zahtjev s brojanjem redaka, pa ne vraća nikakve podatke.

```bash
SUPABASE_URL="https://<project-ref>.supabase.co"           # vrijednost NEXT_PUBLIC_SUPABASE_URL
PUBLISHABLE_KEY="<vrijednost NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY>"
for t in users orders order_items batches batch_orders batch_items products product_locations picking_routes activity_logs; do
  printf '%-18s ' "$t"
  curl -s -o /dev/null -I -w '%{http_code} %header{content-range}\n' \
    "$SUPABASE_URL/rest/v1/$t?select=id" \
    -H "apikey: $PUBLISHABLE_KEY" \
    -H "Prefer: count=exact"
done
```

- **Prije koraka 3:** očekuje se `200` i `Content-Range` oblika `0-24/137` ili `*/137`. Broj iza `/` je broj redaka koje svatko može pročitati.
- **Poslije koraka 3:** svaka tablica mora vratiti `401` (ili `200 */0`, odnosno 0 redaka). Broj veći od 0 iza `/` znači da ta tablica još curi.
- Šalje se samo zaglavlje `apikey`. Ne dodavati `Authorization: Bearer` s publishable ključem: novi `sb_publishable_…` ključevi nisu JWT, pa bi `401` stigao iz krivog razloga.
- Ako i prije koraka 3 dobiješ `401`, URL ili ključ nisu dobri i provjera ništa ne dokazuje.
- `%header{…}` traži curl 7.84 ili noviji (macOS ga ima).

### 5. Nakon potvrde (nije hitno)

- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` više ne treba ni pregledniku ni serveru (server ga koristi samo kao prijelazno rješenje dok nema service ključa). Može se maknuti s Rendera tek nakon koraka 4.
- Podaci su bili dostupni javnim ključem. U Supabase → Logs (API / PostgREST) provjeri ima li zahtjeva na `/rest/v1/users` ili `/rest/v1/orders` koji nisu došli s našeg servera. Ako ih ima, svim korisnicima postavi nove lozinke (stari nesoljeni SHA-256 hashevi lako se razbijaju).

## Ako nešto pukne

- Aplikacija ne radi nakon koraka 3: gotovo uvijek je razlog ključ. Provjeri `/api/health` i logove iz koraka 2, ispravi `SUPABASE_SERVICE_ROLE_KEY` na Renderu i pričekaj deploy. Tablice ostaju zaključane, a aplikacija opet radi.
- SQL se ne vraća. Stare politike (`git show 543f625:supabase/schema.sql`) ponovno otvaraju sve podatke svima i smiju se vratiti samo privremeno, uz svjesnu odluku vlasnika.

## Napomene za razvoj

- Nova tablica treba isto što i postojeće: `ENABLE ROW LEVEL SECURITY`, `REVOKE ALL … FROM anon, authenticated, PUBLIC` i `GRANT ALL … TO service_role` (vidi kraj `supabase/schema.sql`). Supabase novim tablicama po defaultu daje prava ulozi `anon`.
- Supabase klijent postoji samo u `src/server/db/supabase-admin.ts` (`import "server-only"`; build pada ako ga uveze Client Component). Klijentske stranice podatke dohvaćaju preko `api` iz `src/lib/trpc-client.ts`.
- Realtime pretplate aplikacija ne koristi. Kad bi ih trebalo uvesti, trebaju vlastitu autentikaciju (Supabase Auth ili potpisani JWT), jer publishable ključ više ništa ne može čitati.
- Skripte koje uvoze server kod pokreću se s `--conditions=react-server`, npr. `npx tsx --conditions=react-server scripts/dry-run-batches.ts`, i trebaju `SUPABASE_SERVICE_ROLE_KEY` u `.env.local`.
