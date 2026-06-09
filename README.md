# WioryLeca Server

Backend API dla formularza kontaktowego strony Wiory Leca Meble na Wymiar. Serwer dziala na Express, TypeScript i Resend.

## Funkcje

- endpoint zdrowia aplikacji: `GET /health`
- endpoint glowny: `GET /`
- wysylka wiadomosci z formularza kontaktowego: `POST /send-email`
- walidacja wymaganych pol formularza i limitow dlugosci
- obsluga CORS dla domen produkcyjnych i lokalnego developmentu
- konfiguracja przez zmienne srodowiskowe

## Wymagania

- Node.js
- npm
- konto Resend i aktywny `RESEND_API_KEY`

## Instalacja

```bash
npm install
```

Skopiuj plik `.env.example` do `.env` i uzupelnij wartosci:

```bash
cp .env.example .env
```

Na Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

## Zmienne srodowiskowe

| Zmienna | Opis | Przyklad |
| --- | --- | --- |
| `RESEND_API_KEY` | Klucz API uslugi Resend wymagany do wysylki emaili. | `re_...` |
| `PORT` | Port lokalnego serwera. | `3000` |
| `API_BASE_URL` | Bazowy adres API, przydatny dla konfiguracji srodowiska. | `http://localhost:3000` |
| `FRONTEND_BASE_URL` | Bazowy adres frontendu dopuszczony w CORS. | `https://wioryleca-meblenawymiar.pl` |
| `CORS_ALLOWED_ORIGINS` | Dodatkowe dozwolone originy oddzielone przecinkami. | `http://localhost:5173,https://example.com` |

`DATABASE_URL` znajduje sie w `.env.example`, ale aktualny kod serwera go nie uzywa.

## Uruchomienie

Tryb developerski z automatycznym restartem:

```bash
npm run dev
```

Build TypeScript:

```bash
npm run build
```

Uruchomienie zbudowanej aplikacji:

```bash
npm start
```

## Endpointy

### `GET /health`

Zwraca status aplikacji.

Przykladowa odpowiedz:

```json
{
  "ok": true,
  "service": "WioryLeca Meblenawymiar server is running",
  "message": "WioryLeca Meblenawymiar server is running"
}
```

### `GET /`

Zwraca taki sam status jak `/health`.

### `POST /send-email`

Wysyla email kontaktowy przez Resend.

Body:

```json
{
  "name": "Jan Kowalski",
  "contact": "jan@example.com",
  "message": "Prosze o kontakt w sprawie wyceny.",
  "preferable": "Telefon po 16:00"
}
```

Wymagane pola:

- `name`
- `contact`
- `message`

Opcjonalne pole:

- `preferable`

Limity:

- `name`: maksymalnie 100 znakow
- `contact`: maksymalnie 100 znakow
- `message`: maksymalnie 2500 znakow
- `preferable`: maksymalnie 250 znakow

Poprawna odpowiedz:

```json
{
  "ok": true
}
```

Brak wymaganych pol:

```json
{
  "ok": false,
  "message": "Missing required fields"
}
```

Blad wysylki:

```json
{
  "ok": false,
  "message": "Email could not be sent"
}
```

## Deploy

Projekt zawiera `vercel.json`, ktory konfiguruje `app.ts` jako funkcje Vercel Node.

Przed deployem ustaw w panelu Vercel wymagane zmienne srodowiskowe:

- `RESEND_API_KEY`
- `FRONTEND_BASE_URL`
- `CORS_ALLOWED_ORIGINS`, jesli potrzebne sa dodatkowe domeny

## Struktura projektu

```text
.
|-- app.ts          # konfiguracja Express, CORS i endpointow
|-- server.ts       # lokalne uruchomienie serwera
|-- sendEmail.ts    # walidacja i wysylka emaila przez Resend
|-- vercel.json     # konfiguracja deployu na Vercel
|-- tsconfig.json   # konfiguracja TypeScript
`-- package.json    # skrypty i zaleznosci npm
```
