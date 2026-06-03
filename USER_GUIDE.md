# Batch Picking — Upute za skladište

> **Verzija**: 1.0.0  
> **Zadnje ažuriranje**: 2026-06-02

---

## Sadržaj

- [Što je Batch Picking](#što-je-batch-picking)
- [Admin — Upravljanje](#admin--upravljanje)
- [Picker — Skupljanje](#picker--skupljanje)
- [Razine pristupa](#razine-pristupa)
- [Česta pitanja (FAQ)](#česta-pitanja-faq)

---

## Što je Batch Picking

**Batch Picking** je sustav koji pomaže skladištu Antikvarijata Libar da brže i efikasnije skuplja narudžbe.

Umjesto da se svaka narudžba skuplja zasebno, sustav **grupira do 5 narudžbi** u jedan "batch". Picker jednom prođe kroz skladište i skuplja sve knjige za te 5 narudžbi odjednom.

### Kako to funkcionira

```
WooCommerce ──> Sustav grupira narudžbe ──> Batch (5 narudžbi)
                                                  │
                                                  ▼
                                      Picker skuplja knjige
                                      po ruti kroz skladište
                                                  │
                                     Spakirano ──> Isporučeno
```

---

## Admin — Upravljanje

### Prijava

1. Otvori aplikaciju u browseru
2. Unesi email i lozinku
3. Admin vidi **Dashboard** s pregledom stanja

### Dashboard

Prikazuje:
- **Ukupno narudžbi** — koliko je uvezeno iz WooCommercea
- **Batchevi** — koliko ih je generirano
- **Skupljeno** — batch-evi u statusu "picked"
- **Spakirano** — batch-evi u statusu "packed"

### Sinkronizacija narudžbi

1. Klikni **"Sinkroniziraj"** na Dashboardu ili Batchevima
2. Sustav povlači nove narudžbe iz WooCommercea
3. Prikazuje broj uvezenih i preskočenih narudžbi

**Reset & Sync** (oprezno!):
- Briše SVE batcheve, narudžbe i stavke
- Pokreće svježi sync iz WooCommercea
- Koristi samo ako želiš početi ispočetka

### Generiranje batch-eva

1. Nakon sinkronizacije, klikni **"Generiraj"**
2. Sustav grupira narudžbe u batcheve od max 5 narudžbi
3. Batch-evi se pojave na listi

### Pregled batcha

1. Klikni na batch na listi
2. Vidiš:
   - Kod batcha (npr. B-001)
   - Broj narudžbi i SKU-ova
   - Konsolidirani picking list
   - Zone i police za svaki SKU
   - Autora knjige

### Upravljanje lokacijama

**Prije generiranja batch-eva, moraš definirati lokacije!**

1. Odi na **Lokacije**
2. Dodaj novu lokaciju:
   - **SKU** — identifikator knjige
   - **Zona** — skladišna zona (npr. "A", "B")
   - **Polica** — oznaka police (npr. "P-12")
   - **Pozicija** — redni broj u picking ruti
3. Spremi

### Status batcha

Admin može promijeniti status batcha:

| Status | Značenje | Tko mijenja |
|--------|----------|-------------|
| Draft | Nalog je kreiran | Sustav (automatski) |
| Ready | Spreman za picking | Admin |
| In Progress | Picker aktivno skuplja | Picker |
| Picked | Sve knjige skupljene | Picker |
| Packed | Spakirano za otpremu | Admin |
| Synced | Status ažuriran u WooCommerce | Admin |

---

## Picker — Skupljanje

### Prijava

1. Otvori aplikaciju na tabletu ili mobitelu
2. Unesi picker email i lozinku
3. Vidiš listu aktivnih batch-eva

### Lista batch-eva

- **Spremni** — batch-evi spremni za picking (klikni da počneš)
- **U tijeku** — batch-evi koje skupljaš trenutno
- **Pokupljeni** — završeni batch-evi

### Picking screen

Kada otvoriš batch:

1. **Pregled knjiga** — sortirane po ruti kroz skladište
   - Slika knjige
   - Naziv i autor
   - Zona i polica
   - Ukupna količina
   - Breakdown po koševima (A, B, C...)

2. **Skupljanje** — za svaku knjigu:
   - Idi do zone i police
   - Uzmi potrebnu količinu
   - Rasporedi u koševe prema breakdownu
   - Označi kao **"Picked"**

3. **Završetak** — kada su sve knjige označene:
   - Klikni **"Završi batch"**
   - Batch prelazi u status "Picked"

### Koševi (Basket labels)

Svaka narudžba u batchu ima svoj koš:

- **Koš A** — prva narudžba u batchu
- **Koš B** — druga narudžba
- itd. do **Koš E**

Picker skuplja isti SKU za sve koševe odjednom, a breakdown mu kaže koliko komada ide u koji koš.

**Primjer:**
```
SKU: "9789531234567" — Harry Potter
Ukupno: 3 kom
Breakdown: A: 1, B: 2
→ Uzmi 3 komada, stavi 1 u koš A, 2 u koš B
```

### Ruta kroz skladište

Knjige su sortirane po:
1. Zoni (A, B, C...)
2. Poziciji u ruti (route_position)

Picker ide redom — ne skače po skladištu.

---

## Razine pristupa

| Funkcija | Admin | Picker |
|----------|-------|--------|
| Dashboard | ✅ | ❌ |
| Narudžbe | ✅ | ❌ |
| Batchevi | ✅ | ❌ |
| Lokacije | ✅ | ❌ |
| Sync / Reset | ✅ | ❌ |
| Generiraj batch | ✅ | ❌ |
| Picking (skupljanje) | ✅ | ✅ |
| Označi picked | ✅ | ✅ |
| Označi packed | ✅ | ❌ |

---

## Česta pitanja (FAQ)

### Zašto ne vidim narudžbe nakon synca?

- Provjeri da WooCommerce ima narudžbe sa statusom `processing`
- Ako nema, provjeri sa adminom treba li promijeniti `SYNC_DAYS_BACK` na veći broj

### Zašto se batch ne može generirati?

- Mora postojati barem jedna narudžba sa statusom `pending_batch`
- Narudžbe moraju imati stavke s validnim SKU-ovima
- Lokacije moraju biti definirane za SKU-ove

### Što ako knjiga nema lokaciju?

Picker će vidjeti knjigu na listi, ali bez zone i police. Admin treba dodati lokaciju.

### Mogu li označiti batch kao picked ako nisam sve skupljao?

Ne — sustav zahtijeva da su SVE stavke označene kao "picked" prije nego što batch može preći u "picked" status.

### Što ako se predomislim — označio sam picked, a nisam zapravo uzeo?

Admin može vratiti status batcha nazad. Kontaktiraj admina.

### Koliko narudžbi može biti u jednom batchu?

**Maksimalno 5**. Sustav može generirati i manje ako nema dovoljno sličnih narudžbi.

### Što znači "smart" batch?

Batch je označen kao "smart" ako narudžbe imaju >10% SKU overlapa — znači da picker puno manje putuje po skladištu.

### Mogu li skupljati više batch-eva istovremeno?

Ne — picker radi jedan batch po jedan.

### Što ako je u batchu 5 različitih narudžbi, a sve traže istu knjigu?

Picker skuplja tu knjigu jednom i raspoređuje u koševe prema breakdownu.

### Kako znam koji koš pripada kojoj narudžbi?

Koševi su označeni slovima (A, B, C...). Breakdown za svaki SKU prikazuje koliko komada ide u koji koš.

---

## Kontakt

Ako imate tehničkih poteškoća, kontaktirajte:

- **Email**: info@antikvarijat-libar.com
- **Telefon**: 031/201-230
- **Adresa**: Županijska ulica 17, 31000 Osijek
- **Radno vrijeme**: Pon–Pet 08:00–20:00, Sub 08:00–13:00

---

Razvijeno za **Antikvarijat Libar** — Dante d.o.o., Osijek
