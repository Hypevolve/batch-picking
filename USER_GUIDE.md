# Batch Picking — Upute za skladište

> **Verzija**: 1.1.0  
> **Zadnje ažuriranje**: 2026-06-11

---

## Sadržaj

- [Sto je Batch Picking](#sto-je-batch-picking)
- [Admin — Upravljanje](#admin--upravljanje)
- [Picker — Skupljanje](#picker--skupljanje)
- [AI Asistent](#ai-asistent)
- [Razine pristupa](#razine-pristupa)
- [Cesta pitanja (FAQ)](#cesta-pitanja-faq)

---

## Sto je Batch Picking

**Batch Picking** je sustav koji pomaze skladistu Antikvarijata Libar da brze i efikasnije skuplja narudzbe.

Umjesto da se svaka narudzba skuplja zasebno, sustav **grupira do 5 narudzbi** u jedan "batch". Picker jednom prode kroz skladiste i skuplja sve knjige za te 5 narudzbi odjednom.

### Kako to funkcionira

```
WooCommerce ──> Sustav grupira narudzbe ──> Batch (5 narudzbi, max 2 zone)
                                                  │
                                                  ▼
                                      Picker skuplja knjige
                                      po ruti kroz 1-2 susjedne zone
                                                  │
                                     Spakirano ──> Isporuceno
```

### Sto je novo u verziji 1.1.0

- **Zone grupiranje** — sustav sada grupira narudzbe prema skladisnim zonama, ne samo prema SKU-ovima
- **Max 2 susjedne zone** — batch sadrzi knjige iz max 2 susjedne zone (npr. A+B ili C+D), pa picker ne mora trcati preko cijelog skladista
- **AI asistent** — chatbot za brza pitanja o narudzbama i workflowu
- **Dashboard** — pregled statistika i aktivnosti

---

## Admin — Upravljanje

### Prijava

1. Otvori aplikaciju u browseru
2. Unesi email i lozinku
3. Admin vidi **Dashboard** s pregledom stanja

### Dashboard

Prikazuje:
- **Ukupno narudzbi** — koliko je uvezeno iz WooCommercea
- **Batchevi** — koliko ih je generirano
- **Skupljeno** — batch-evi u statusu "picked"
- **Spakirano** — batch-evi u statusu "packed"
- **Activity log** — nedavne aktivnosti (sync, generacija, status promjene)

### Sinkronizacija narudzbi

1. Klikni **"Sinkroniziraj"** na Dashboardu ili Batchevima
2. Sustav povlaci nove narudzbe iz WooCommercea
3. Prikazuje broj uvezenih i preskocenih narudzbi

**Reset & Sync** (oprezno!):
- Brise SVE batcheve, narudzbe i stavke
- Pokrece svjezi sync iz WooCommercea
- Koristi samo ako zelis poceti ispocetka

### Generiranje batch-eva

1. Nakon sinkronizacije, klikni **"Generiraj"**
2. Sustav grupira narudzbe u batcheve od max 5 narudzbi
3. Narudzbe se grupiraju tako da svaki batch pokriva **max 2 susjedne zone**
4. Narudzbe bez definiranih lokacija grupiraju se po slicnosti artikala
5. Batch-evi se pojave na listi

### Pregled batcha

1. Klikni na batch na listi
2. Vidis:
   - Kod batcha (npr. B-001)
   - Tip batcha (smart/mixed/partial)
   - Broj narudzbi i SKU-ova
   - Konsolidirani picking list
   - Zone i police za svaki SKU
   - Autora knjige

### Upravljanje lokacijama

**Prije generiranja batch-eva, moras definirati lokacije!**

1. Odi na **Lokacije**
2. Dodaj novu lokaciju:
   - **SKU** — identifikator knjige
   - **Zona** — skladisna zona (npr. ZONA-A, ZONA-B)
   - **Polica** — oznaka police (npr. A-3, B-7)
   - **Pozicija** — redni broj u picking ruti
3. Spremi
4. Alternativno: koristi **CSV import** za masovni unos

### Upravljanje zonama

Zone definiraju fizicke dijelove skladista. Svaka zona ima:
- **Kod zone** — npr. ZONA-A, ZONA-B
- **Naziv** — opisno ime
- **Sort order** — redni broj koji odreduje susjednost (1, 2, 3...)

Trenutno definirane zone:

| Zona | Sort Order | Susjedne zone |
|------|-----------|---------------|
| ZONA-A | 1 | ZONA-B |
| ZONA-B | 2 | ZONA-A, ZONA-C |
| ZONA-C | 3 | ZONA-B, ZONA-D |
| ZONA-D | 4 | ZONA-C, ZONA-E |
| ZONA-E | 5 | ZONA-D, ZONA-F |
| ZONA-F | 6 | ZONA-E, ZONA-G |
| ZONA-G | 7 | ZONA-F |

**Vazno:** Sustav dopusta grupiranje narudzbi iz max 2 susjedne zone. Npr. batch moze sadrzavati narudzbe iz ZONA-A i ZONA-B, ali NE iz ZONA-A i ZONA-C.

### Upravljanje korisnicima

1. Odi na **Korisnici** u admin panelu
2. Dodaj novog korisnika (email, ime, uloga, lozinka)
3. Uloge: **Admin** (puni pristup) ili **Picker** (samo skupljanje)
4. Mozes deaktivirati korisnika bez brisanja

### Status batcha

Admin moze promijeniti status batcha:

| Status | Znacenje | Tko mijenja |
|--------|----------|-------------|
| Draft | Nalog je kreiran | Sustav (automatski) |
| Ready | Spreman za picking | Admin |
| In Progress | Picker aktivno skuplja | Picker |
| Picked | Sve knjige skupljene | Picker |
| Packed | Spakirano za otpremu | Admin |
| Synced | Status azuriran u WooCommerce | Admin |

---

## Picker — Skupljanje

### Prijava

1. Otvori aplikaciju na tabletu ili mobitelu
2. Unesi picker email i lozinku
3. Vidis listu aktivnih batch-eva

### Lista batch-eva

- **Spremni** — batch-evi spremni za picking (klikni da pocnes)
- **U tijeku** — batch-evi koje skupljas trenutno
- **Pokupljeni** — zavrseni batch-evi

### Picking screen

Kada otvoris batch:

1. **Pregled knjiga** — sortirane po ruti kroz skladiste
   - Slika knjige
   - Naziv i autor
   - Zona i polica
   - Ukupna kolicina
   - Breakdown po kosevima (A, B, C...)

2. **Skupljanje** — za svaku knjigu:
   - Idi do zone i police
   - Uzmi potrebnu kolicinu
   - Rasporedi u koseve prema breakdownu
   - Oznaci kao **"Picked"**

3. **Zavrsetak** — kada su sve knjige oznacene:
   - Klikni **"Zavrsi batch"**
   - Batch prelazi u status "Picked"

### Kosevi (Basket labels)

Svaka narudzba u batchu ima svoj kos:

- **Kos A** — prva narudzba u batchu
- **Kos B** — druga narudzba
- itd. do **Kos E**

Picker skuplja isti SKU za sve koseve odjednom, a breakdown mu kaze koliko komada ide u koji kos.

**Primjer:**
```
SKU: "9789531234567" — Harry Potter
Ukupno: 3 kom
Breakdown: A: 1, B: 2
→ Uzmi 3 komada, stavi 1 u kos A, 2 u kos B
```

### Ruta kroz skladiste

Knjige su sortirane po:
1. **Zoni** (A, B, C...) — po sort_order
2. **Poziciji** u ruti (route_position)

Picker ide redom — ne skace po skladistu. Zahvaljujuci zone adjacency ogranicenju, batch pokriva samo 1-2 susjedne zone.

---

## AI Asistent

### Sto je AI asistent?

AI asistent je chatbot dostupan u admin panelu koji pomaze s brzim pitanjima o:
- Narudzbama i batchevima
- Lokacijama i zonama
- Skladisnom workflowu
- Basket labelima i picking procesu

### Kako koristiti

1. Klikni ikonu chata u donjem desnom kutu ekrana
2. Napisi pitanje na hrvatskom jeziku
3. AI ce odgovoriti s relevantnim informacijama

**Napomena:** AI asistent ne moze pristupiti stvarnim podacima iz baze. Za konkretne podatke o narudzbama koristite admin panel.

---

## Razine pristupa

| Funkcija | Admin | Picker |
|----------|-------|--------|
| Dashboard i statistike | Da | Ne |
| Narudzbe | Da | Ne |
| Batchevi | Da | Ne |
| Lokacije i zone | Da | Ne |
| Korisnici | Da | Ne |
| Sync / Reset | Da | Ne |
| Generiraj batch | Da | Ne |
| AI asistent | Da | Ne |
| Picking (skupljanje) | Da | Da |
| Oznaci picked | Da | Da |
| Oznaci packed | Da | Ne |

---

## Cesta pitanja (FAQ)

### Zasto ne vidim narudzbe nakon synca?

- Provjeri da WooCommerce ima narudzbe sa statusom `processing`
- Ako nema, provjeri sa adminom treba li promijeniti `SYNC_DAYS_BACK` na veci broj

### Zasto se batch ne moze generirati?

- Mora postojati barem jedna narudzba sa statusom `pending_batch`
- Narudzbe moraju imati stavke s validnim SKU-ovima
- Lokacije moraju biti definirane za SKU-ove (inace se koristi fallback algoritam)

### Sto ako knjiga nema lokaciju?

Picker ce vidjeti knjigu na listi, ali bez zone i police. Admin treba dodati lokaciju. Narudzbe bez lokacija koriste stariji algoritam grupiranja (po slicnosti SKU-ova umjesto zona).

### Zasto su neke narudzbe u zasebnom batchu?

Moguce je da:
- Narudzba nema dovoljno zajednickih zona s drugima (zone_jaccard < 30%)
- Dodavanje narudzbe bi prosirilo batch izvan 2 susjedne zone
- Nema slobodnih narudzbi za grupiranje

### Mogu li oznaciti batch kao picked ako nisam sve skupljao?

Ne — sustav zahtijeva da su SVE stavke oznacene kao "picked" prije nego sto batch moze preci u "picked" status.

### Sto ako se predomislim — oznacio sam picked, a nisam zapravo uzeo?

Admin moze vratiti status batcha nazad. Kontaktiraj admina.

### Koliko narudzbi moze biti u jednom batchu?

**Maksimalno 5**. Sustav moze generirati i manje ako nema dovoljno slicnih narudzbi iz susjednih zona.

### Sto znaci "smart" batch?

Batch je oznacen kao "smart" ako narudzbe imaju >10% SKU overlapa — znaci da picker puno manje putuje po skladistu.

### Sto znaci "max 2 susjedne zone"?

Sustav grupira narudzbe tako da picker mora posjetiti najvise 2 susjedne zone (npr. ZONA-A i ZONA-B, ili ZONA-C i ZONA-D). Nece spojiti narudzbe iz ZONA-A i ZONA-C jer bi picker morao proci kroz 3 zone.

### Mogu li skupljati vise batch-eva istovremeno?

Ne — picker radi jedan batch po jedan.

### Sto ako je u batchu 5 razlicitih narudzbi, a sve traze istu knjigu?

Picker skuplja tu knjigu jednom i rasporeduje u koseve prema breakdownu.

### Kako znam koji kos pripada kojoj narudzbi?

Kosevi su oznaceni slovima (A, B, C...). Breakdown za svaki SKU prikazuje koliko komada ide u koji kos.

### Kako koristiti AI asistenta?

Klikni ikonu chata u donjem desnom kutu i postavi pitanje na hrvatskom. AI pomaze s opcim pitanjima o workflowu, ali ne pristupa stvarnim podacima iz baze.

---

## Kontakt

Ako imate tehnickih poteskoca, kontaktirajte:

- **Email**: info@antikvarijat-libar.com
- **Telefon**: 031/201-230
- **Adresa**: Zupanijska ulica 17, 31000 Osijek
- **Radno vrijeme**: Pon–Pet 08:00–20:00, Sub 08:00–13:00

---

Razvijeno za **Antikvarijat Libar** — Dante d.o.o., Osijek
