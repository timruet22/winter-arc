# Winter Arc

Habit-Tracker für zwei: Gym, Kreatin und No Nut November, mit Strafen (Liegestütze, Sit-ups oder eigene Übung), Streaks und einer Squad-Ansicht.

- **App:** `public/index.html` (läuft im Browser, aufs iPhone über „Zum Home-Bildschirm“)
- **API:** `src/index.js` (Cloudflare Worker)
- **Datenbank:** Cloudflare D1 `winter-arc`

## Wer sieht was?

| Teil | Wo gespeichert | Wer kann es lesen |
|---|---|---|
| Öffentlicher Teil (Wochenstand, Streaks, offene Strafe, NNN-Status, Summen) | D1, Spalte `public_json` | Alle angemeldeten Spieler |
| Privater Teil (jeder Eintrag, Einstellungen, Strafen im Detail) | D1, Spalte `state_enc`, **im Browser verschlüsselt** (AES-GCM, Schlüssel aus dem Zugangscode) | Nur wer den Zugangscode hat |

Der Server und der Cloudflare-Admin sehen den privaten Teil nur als verschlüsselten Text. In der App legst du unter **Ich → Was dein Freund sieht** fest, was in den öffentlichen Teil kommt.

## Plätze und Zugangscodes

Am Anfang gibt es zwei Plätze: `tim` (Admin) und `freund`. Der Admin kann in der App unter **Ich → Squad verwalten** Plätze anlegen, Personen entfernen und Codes zurücksetzen. Alle anderen können unter **Ich → Austreten** gehen. Jeder Platz kann **einmal** übernommen werden. Danach bekommt man einen Zugangscode (`wa_…`). Die Datenbank speichert nur dessen SHA-256-Hash.

- Den Code findest du in der App unter **Ich → Zugang → Code anzeigen**.
- Mit dem Code meldest du dich auf weiteren Geräten an und verbindest einen Pi oder eine andere App.
- Code verloren? Den Platz in D1 zurücksetzen (`token_hash`, `state_enc` auf `NULL`). Der private Teil ist dann weg, weil er mit dem alten Code verschlüsselt war.

## API (für den Pi oder eine eigene App)

Basis-URL: die Adresse der Worker-App, z. B. `https://winter-arc.<account>.workers.dev`

Jeder Aufruf außer `/api/slots` und `/api/claim` braucht den Header:

```
Authorization: Bearer wa_DEIN_CODE
```

| Methode | Pfad | Zweck |
|---|---|---|
| GET | `/api/slots` | Plätze und ob sie vergeben sind |
| POST | `/api/claim` | Platz übernehmen: `{"slot":"freund","name":"Max"}` → `{"token":"wa_…"}` (nur einmal) |
| GET | `/api/me` | Wer bin ich: `{"id","name"}` |
| GET | `/api/players` | Alle Spieler mit ihrem öffentlichen Teil |
| PUT | `/api/public` | Eigenen öffentlichen Teil setzen (Format unten) |
| GET/PUT | `/api/state` | Eigener privater Teil, verschlüsselt: `{"enc":"…"}` |
| POST | `/api/leave` | Austreten: löscht eigene Daten und Platz (nicht für den Admin) |
| POST | `/api/admin/players` | Admin: neuen freien Platz anlegen `{"name":"Jonas"}` |
| DELETE | `/api/admin/players/<id>` | Admin: Person und ihre Daten entfernen |
| POST | `/api/admin/players/<id>/reset` | Admin: Code zurücksetzen, Platz wird wieder frei (Daten weg) |

### Format des öffentlichen Teils

```json
{
  "name": "Max",
  "week": "2026-10-12",
  "habits": [
    { "name": "Gym", "target": 4, "count": 3,
      "days": [true, false, true, false, true, false, false],
      "weekStreak": 2 },
    { "name": "Kreatin", "target": 7, "count": 6,
      "days": [true, true, true, true, true, true, false],
      "weekStreak": 1, "dayStreak": 6 }
  ],
  "penalty": { "habit": "Gym", "exercise": "Liegestütze", "reps": 100, "done": 40 },
  "penaltiesDone": 1,
  "totals": { "Liegestütze": 140, "Sit-ups": 50 },
  "nnnPunish": null,
  "nnn": { "key": "live", "text": "Tag 3/30 · 3 bestätigt" }
}
```

- `week`: Montag der aktuellen Woche (`YYYY-MM-DD`). Ist er veraltet, zeigt die App 0 für diese Woche.
- `days`: Mo bis So.
- `penalty`: `null` heißt keine offene Strafe. Fehlt das Feld, wird nichts angezeigt (privat).
- Alle Felder außer `name` und `habits` sind optional. Weglassen heißt nicht teilen.

### Beispiel: Pi schickt seinen Stand (Python)

```python
import datetime, requests

BASE = "https://winter-arc.DEIN-ACCOUNT.workers.dev"
TOKEN = "wa_…"  # eigener Code, nur auf dem Pi speichern (z. B. Umgebungsvariable)
H = {"Authorization": f"Bearer {TOKEN}"}

today = datetime.date.today()
monday = today - datetime.timedelta(days=today.weekday())
gym_days = [True, False, True, False, False, False, False]

requests.put(f"{BASE}/api/public", headers=H, json={
    "name": "Max",
    "week": monday.isoformat(),
    "habits": [{"name": "Gym", "target": 4, "count": sum(gym_days), "days": gym_days}],
    "penalty": None,
}).raise_for_status()

# Stand von Tim abholen (z. B. jede Minute per cron)
for p in requests.get(f"{BASE}/api/players", headers=H).json()["players"]:
    print(p["name"], p["public"])
```

## Deployment

Cloudflare baut automatisch bei jedem Push auf `main` (Workers Builds, mit GitHub verbunden). Die D1-ID steht in `wrangler.jsonc`.

Lokal:

```bash
npm install
npx wrangler d1 migrations apply winter-arc --local
npx wrangler dev
```
