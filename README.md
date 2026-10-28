# Wióry Lecą — serwer formularza kontaktowego

Backend Express + TypeScript + Resend dla strony Wióry Lecą. Wdrożenie: funkcja Node na Vercel (`app.ts`). Lokalnie serwer uruchamia `server.ts`.

## Uruchomienie lokalne

```sh
npm ci
```

Skopiuj `.env.example` do `.env` (PowerShell: `Copy-Item .env.example .env`) i uzupełnij `RESEND_API_KEY`, jeśli chcesz rzeczywiście wysyłać wiadomości. Następnie:

```sh
npm run dev
```

Lokalnie bez Redis działa limit w pamięci procesu. Restart zeruje licznik. Tego trybu nie używamy na produkcji. Port domyślny: `3000`. Originy `http://localhost:<port>` oraz `http://127.0.0.1:<port>` są automatycznie dopuszczane tylko poza produkcją.

## Wdrożenie na Vercel — wymagane ustawienia

**Przed wdrożeniem ustaw Redis.** Na Vercel (`VERCEL=1`) oraz przy `NODE_ENV=production` wysyłka wymaga wspólnego magazynu limitów. Brak konfiguracji lub awaria magazynu daje `503` i nie uruchamia Resend. `/health` potwierdza tylko działanie procesu, nie gotowość poczty ani Redis.

1. Utwórz bazę Upstash Redis lub podłącz ją przez Vercel Marketplace. Nie trzeba instalować klienta Redis — backend używa REST API.
2. W Vercel → Project → Settings → Environment Variables ustaw poniższe wartości. Klucze ustawiaj wyłącznie na backendzie.
3. Upewnij się, że domena `wioryleca-meblenawymiar.pl` jest zweryfikowana w Resend, a klucz ma uprawnienie wysyłania z tej domeny.
4. Wdróż backend ponownie. Dla Preview najlepiej użyć osobnej bazy, aby testy nie zużywały limitów produkcji.

| Zmienna | Znaczenie |
| --- | --- |
| `RESEND_API_KEY` | Klucz Resend; wymagany do wysyłki. |
| `UPSTASH_REDIS_REST_URL` | Adres HTTPS REST bazy Upstash. |
| `UPSTASH_REDIS_REST_TOKEN` | Token z prawem zapisu, nie token tylko do odczytu. |
| `FRONTEND_BASE_URL` | Dodatkowy dozwolony adres frontendu. Obie domeny produkcyjne, z `www` i bez, są zawsze dozwolone. |
| `CORS_ALLOWED_ORIGINS` | Opcjonalna lista dodatkowych originów rozdzielonych przecinkiem, np. adres konkretnego podglądu. |
| `PORT` | Port serwera lokalnego, domyślnie 3000. |

Nie dodawaj localhost do produkcyjnej listy originów. Nie umieszczaj sekretów w repozytorium ani zmiennych `VITE_*`. `.env`, jego warianty i `.vercel/` są ignorowane przez Git.

## API

### `GET /health` i `GET /`

Liveness: `200 { "ok": true, "service": "Wiory Leca contact API" }`. Odpowiedź nie sprawdza zewnętrznych usług i nie ujawnia konfiguracji.

### `POST /send-email`

Nagłówek: `Content-Type: application/json`. Maksymalny rozmiar JSON: 16 KiB.

```json
{
  "name": "Jan Kowalski",
  "localization": "Wrocław",
  "contact": "jan@example.com",
  "message": "Proszę o wycenę kuchni.",
  "preferable": "Telefon po 16:00"
}
```

| Pole | Wymagane | Maksymalna długość po usunięciu skrajnych spacji |
| --- | --- | --- |
| `name` | tak | 100 |
| `localization` | tak | 100 |
| `contact` | tak | 100 |
| `message` | tak | 2500 |
| `preferable` | nie | 250 |

Wartości muszą być tekstem. Obiekty, tablice, liczby i `null` są odrzucane. Pole opcjonalne można pominąć lub wysłać jako pusty tekst. Wymagane pola nie mogą zawierać wyłącznie białych znaków. Nieznane pola nie są przekazywane dalej. `contact` może zawierać telefon lub e-mail; nie wymuszamy samego e-maila.

| Status | Znaczenie |
| --- | --- |
| `200` | Resend przyjął wiadomość i zwrócił identyfikator; `{ "ok": true }`. Nie jest to dowód dostarczenia do skrzynki. |
| `400` | Błędny JSON, typ, puste pole lub przekroczony limit; `{ "ok": false, "code": "...", "field": "..." }` dla błędów pól. |
| `403` | Niedozwolony Origin. |
| `413` | Zbyt duże żądanie. |
| `415` | Wymagany JSON lub nieobsługiwane kodowanie. |
| `429` | Przekroczony limit; nagłówek `Retry-After` określa liczbę sekund do ponowienia. |
| `502` | Wysyłka nie została potwierdzona przez Resend. |
| `503` | Magazyn limitów nie działa, brakuje jego konfiguracji lub poprawnego IP platformy. |

Obecny frontend jest zgodny z tym kontraktem i pokazuje ogólny komunikat błędu przy odpowiedziach innych niż 2xx. Osobny komunikat dla `429` można dodać później. Nie ponawiaj automatycznie wysyłki po niejednoznacznym timeout — wiadomość mogła już zostać przyjęta.

## Ochrona formularza

- Maksymalnie **5 prób na IP / 15 minut** oraz **50 prób globalnie / godzinę**. Wspólna operacja Lua atomowo sprawdza i zużywa oba limity. Okno zaczyna się od pierwszej zaakceptowanej próby. Odrzucone próby nie przedłużają okna. Błąd Resend również zużywa próbę; błędny formularz nie zużywa limitu wysyłki.
- Na Vercel IP pochodzi z nagłówka platformy `x-vercel-forwarded-for`. Poza Vercel używamy bezpośredniego adresu połączenia, ignorując przesłane przez klienta nagłówki proxy. Nie ustawiaj ręcznie `VERCEL=1` na innym hostingu. Wdrożenie za innym reverse proxy wymaga osobnej konfiguracji zaufania.
- W Redis zapisujemy liczniki i hash IP z czasem wygaśnięcia, bez treści formularza. Wszystkie instancje korzystające z tej samej bazy i przestrzeni `contact:{quota}` dzielą limity.
- Nieznane originy są odrzucane. Brak nagłówka Origin nie omija walidacji ani limitów. CORS nie jest ochroną przed botami.
- Limity ograniczają skalę nadużyć, ale nie rozpoznają człowieka; atakujący może wyczerpać globalny limit. Jeśli pojawi się spam, kolejnym krokiem jest WAF lub weryfikacja antybotowa wraz z tokenem z frontendu.
- Treść maila jest escapowana, nowe linie zachowane, dołączona jest wersja tekstowa. `Reply-To` jest ustawiany tylko dla kontaktu wyglądającego jak pojedynczy adres e-mail. Odbiorca pozostaje stały: `wiory_leca@wp.pl`.
- Logi błędów nie zawierają treści formularza, sekretów ani pełnych odpowiedzi dostawcy.

## Testy i CI

```sh
npm test
```

Polecenie buduje TypeScript i uruchamia testy Node. Testy HTTP otwierają tylko lokalny port i korzystają z atrap wysyłki oraz magazynu Redis. Nie wysyłają wiadomości i nie wymagają kluczy. GitHub Actions wykonuje `npm ci` i `npm test` na push oraz PR; nie wdraża aplikacji.

Zakres: typy i granice długości wszystkich pól, JSON, limit body, CORS i preflight, IP i nagłówki proxy, limity i ich wygaśnięcie, błędy magazynu, kontrakt REST Redis, HTML/text/Reply-To oraz odrzucenia Resend. Testy nie potwierdzają konfiguracji prawdziwego Redis, DNS ani dostarczenia poczty; trzeba to sprawdzić po wdrożeniu.

## Końcowa kontrola po wdrożeniu

1. Sprawdź `GET /health` — oczekiwane 200.
2. Z rzeczywistej strony wyślij jedno wyraźnie oznaczone zapytanie testowe. Sprawdź odpowiedź 200, wpis w Resend oraz skrzynkę WP i spam.
3. Sprawdź, czy „Odpowiedz” kieruje na adres klienta, jeśli w formularzu podano e-mail. Przy telefonie dane kontaktowe pozostają w treści.
4. Sprawdź osobno wersję mobilną i zmianę języka frontendu.
5. Limity i awarie sprawdzaj na Preview z osobną bazą oraz atrapą Resend, aby nie wysyłać serii prawdziwych wiadomości i nie blokować klientów.

Dokumentacja: [nagłówki Vercel](https://vercel.com/docs/headers/request-headers), [Upstash REST API](https://upstash.com/docs/redis/features/restapi), [CORS w Express](https://expressjs.com/en/resources/middleware/cors/).
