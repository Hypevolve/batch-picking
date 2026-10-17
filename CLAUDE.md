# CLAUDE.md — Libar Batch Picking

Operativna pravila za rad na ovom repozitoriju. Vidi README.md, DEVELOPER.md i USER_GUIDE.md za arhitekturu.

## Isporuka: potpuno funkcionalno i testirano

**SVE ŠTO SE ISPORUČUJE MORA BITI POTPUNO FUNKCIONALNO. TESTIRAJ PRIJE ISPORUKE.**

- Riječ "gotovo" se izgovara samo nakon izvršenja: pokreni kod, testove, build ili linter i pokaži stvarni izlaz.
- Ako se nije moglo pokrenuti (nema kredencijala, okruženja, pristupa), to je **prva** rečenica odgovora, nikad prešućena.
- Nikakav tihi stub. Svaki TODO, mock, placeholder, hardkodirana vrijednost ili preskočen rubni slučaj ide u sekciju **`NIJE NAPRAVLJENO`** na **vrhu** odgovora, ne zakopan u kod.
- Opseg se ne smanjuje bez pitanja. Ako nešto blokira, dovrši sve ostalo u cijelosti pa navedi što je ostalo i zašto.
- Prije isporuke proći cijeli tok kao korisnik, ne samo happy path: prazan unos, krivi format, istekao token, prazan rezultat, dupli zahtjev. Napiši što je stvarno isprobano, a što nije.
- Svaki popravljeni bug dobiva test koji **pada na starom kodu**.
- Commit i push samo kad Zrinko izričito traži.

