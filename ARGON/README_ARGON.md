# 🛡️ PAKIET AUDYTU ARCHITEKTURY, LOGIKI I BEZPIECZEŃSTWA (DLA ARGONA)

System: **Quality Audit Enterprise (IFS Food v8 / BRCGS v9 / HACCP)**  
Data przygotowania: **2026-10-15**  
Lokalizacja paczki: `/Users/grzegorzzarakowski/Desktop/audit_app/ARGON/`

---

## 📂 1. STRUKTURA PLIKÓW W TEJ PACZCE

```text
ARGON/
├── main.py                     # Główny serwer FastAPI, CORS, nagłówki bezpieczeństwa, routing
├── security.py                 # RBAC (MANAGER vs AUDITOR), tokeny JWT, haszowanie PIN, ISO 27001
├── database.py                 # Schemat bazy SQLite, migracje, integralność kluczy
├── routers/                    # Endpoints API i logika serwerowa
│   ├── auth.py                 # Logowanie PIN, sesja, rate limiting
│   ├── audits.py               # Zapis audytów, reguły Knock-Out (KO), blokady HOLD LOT, korekty
│   ├── schedule.py             # Harmonogram, auto-planner, walidacja dat i przypisań
│   ├── checklist.py            # Baza pytań IFS Food v8, wagi punktowe, wskaźniki KO
│   ├── users.py                # Zarządzanie audytorami, zabezpieczenie przed usunięciem kont
│   ├── lines.py                # Linie produkcyjne, strefy ryzyka
│   ├── notes.py                # Notatki audytorów i komunikacja z kierownikiem
│   ├── reports.py              # Raporty jakościowe i wskaźniki KPI
│   └── agent.py                # Asystent AI i guardraile zapytań
├── static/js/                  # Frontendowa logika biznesowa (JavaScript)
│   ├── app.js                  # Globalny stan (state), nawigacja, uruchamianie audytu
│   ├── audit_form.js           # Silnik checklisty, suwaki ocen 1-5, KO badge, upload foto, SLM
│   ├── calendar.js             # Renderowanie harmonogramu, filtry HACCP/GMP/GHP, akcje kafelków
│   ├── manager_dashboard.js    # Panel decyzyjny kierownika, akceptacja wniosków o korektę
│   ├── mock_api.js             # Autonomiczny silnik Mock API (LocalStorage) dla wersji offline
│   ├── production_lines.js     # Obsługa wyboru linii i stref higienicznych
│   ├── audit_history.js        # Przegląd historii i archiwum audytów
│   └── live_chat.js            # Kanał komunikacji audytor <-> manager
├── tests/                      # Zestaw testów weryfikacyjnych pytest
│   ├── test_audit_rules.py     # Testy reguł KO i statusu HOLD LOT
│   ├── test_auth_roles.py      # Testy kontroli dostępu RBAC
│   ├── test_schedule_api.py    # Testy harmonogramu i autoryzacji
│   ├── test_users_api.py       # Testy integralności kont
│   └── conftest.py             # Konfiguracja środowiska testowego
├── index.html                  # Główny szablon DOM aplikacji
├── audit_app_standalone.html   # Kompletna wersja jednoplisowa (HTML+CSS+JS w 1 pliku)
└── README_ARGON.md             # Niniejszy przewodnik audytowy
```

---

## 🎯 2. KLUCZOWE OBSZARY LOGIKI BIZNESOWEJ DO SPRAWDZENIA

### A. Reguła Knock-Out (KO) i HOLD LOT (IFS Food v8)
- **Pliki:** `routers/audits.py`, `static/js/audit_form.js`, `tests/test_audit_rules.py`
- **Założenie:** Jeśli pytanie oznaczone jako `is_ko = True` otrzyma ocenę krytyczną (1 lub 2 punkty lub status NOK), audyt **musi natychmiast** otrzymać status negatywny, a powiązana partia produkcyjna zostaje oznaczona statusem `HOLD LOT` (kwarantanna jakościowa).
- **Punkt do sprawdzenia:** Czy audytor może w jakikolwiek sposób obejść status HOLD LOT po stronie klienta i wymusić werdykt zgodny.

### B. Wymóg 100% oceny pytań przed zapisem
- **Pliki:** `static/js/audit_form.js`, `routers/audits.py`
- **Założenie:** Zgodnie z procedurą audytor nie może zarejestrować audytu częściowego. Wszystkie punkty muszą być ocenione i zatwierdzone.
- **Punkt do sprawdzenia:** Czy endpoint `POST /api/audit` na backendzie weryfikuje kompletność przesłanych danych w `checklist_results`, czy polega wyłącznie na blokadzie przycisku w przeglądarce.

### C. Niezmienność zablokowanego rekordu (Audit Trail / ISO 27001)
- **Pliki:** `routers/audits.py`, `static/js/manager_dashboard.js`
- **Założenie:** Zapisany rekord ma status `ZABLOKOWANY`. Audytor nie może go edytować bez zgody Kierownika (`require_manager`). Odblokowanie wymaga wniosku o korektę i zatwierdzenia przez Kierownika.

---

## 🔒 3. OBSZARY AUDYTU BEZPIECZEŃSTWA (LUKI I ZAGROŻENIA)

1. **Role-Based Access Control (RBAC):**
   - Sprawdź `security.py` i dekoratory `@require_manager` oraz `@require_auditor_or_manager`.
   - Czy audytor (rola `AUDITOR`) może wywołać endpointy kierownicze (np. `/api/users/delete`, `/api/schedule/clear-all`, odblokowanie korekty)?

2. **Insecure Direct Object References (IDOR):**
   - Sprawdź endpoints w `routers/schedule.py` oraz `routers/audits.py` (np. `PUT /api/schedule/{sched_id}`, `GET /api/schedule/{sched_id}`).
   - Czy użytkownik może modyfikować zadania przypisane do innego audytora?

3. **SQL Injection / Parametryzacja:**
   - Sprawdź zapytania w `routers/schedule.py`, `routers/audits.py`, `routers/users.py`.
   - Czy wszystkie zapytania używają `?` i krotek parametrów (`await conn.execute(sql, params)`), czy gdzieś występuje konkatenacja stringów `f"SELECT ... {variable}"`?

4. **Uwierzytelnianie i Zarządzanie Sesją:**
   - Sprawdź `routers/auth.py` oraz `security.py`.
   - Czy PIN logowania jest odpowiednio zabezpieczony, jak wygląda format JWT, ważność tokenu i obsługa wygaśnięcia sesji.

5. **Przesyłanie plików (File Upload):**
   - Sprawdź `routers/audits.py` (obsługa fotografii dowodowej).
   - Czy sprawdzane są rozszerzenia, typy MIME, rozmiary plików oraz czy pliki nie są zapisywane w miejscach pozwalających na zdalne wykonanie kodu (RCE).
