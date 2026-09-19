import os
import json
import re
import sqlite3
import httpx
from typing import Dict, Any, List, Optional

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "audits.db")
OLLAMA_API_URL = os.getenv("OLLAMA_API_URL", "http://127.0.0.1:11434/api/generate")
OLLAMA_CHAT_URL = os.getenv("OLLAMA_CHAT_URL", "http://127.0.0.1:11434/api/chat")
MODEL_NAME = os.getenv("SLM_MODEL", "slm-audit")

STANDARD_ACTIONS_CCP1 = [
    "Natychmiastowe zatrzymanie linii produkcyjnej i fizyczne odizolowanie wyrobów od ostatniego zaliczonego testu",
    "Założenie blokady systemowej w ERP (status HOLD) na całą podejrzaną partię",
    "Przegląd mechaniczny ramienia, kontrola manometrów pneumatyki oraz walidacja pętli detektora metali",
    "100% ponowna inspekcja zatrzymanej partii na sprawnym detektorze rezerwowym"
]

PREVENTIVE_ACTIONS_CCP1 = [
    "Skrócenie interwału weryfikacji wzorców Fe/Non-Fe/SS do 1 godziny do czasu zakończenia przeglądu technicznego",
    "Wdrożenie procedury kontroli czujnika ciśnienia układu pneumatycznego odrzutnika przed każdą zmianą",
    "Kalibracja pętli detekcyjnej przez certyfikowany serwis zewnętrzny"
]

CRITICAL_FALLBACK = {
    "status": "NOK",
    "poziom_ryzyka": "KRYTYCZNE (HOLD LOT)",
    "decyzja": "Awaria CCP1 (Detektor Metali). Natychmiastowe wstrzymanie linii produkcyjnej oraz blokada magazynowa wyrobu (Hold Lot) od ostatniej poprawnej kontroli.",
    "akcje_korygujace": STANDARD_ACTIONS_CCP1,
    "podpowiedzi_prewencyjne": PREVENTIVE_ACTIONS_CCP1
}


def clean_json_response(raw_text: str) -> Dict[str, Any]:
    text = raw_text.strip()
    if "```json" in text:
        text = text.split("```json")[1].split("```")[0].strip()
    elif "```" in text:
        text = text.split("```")[1].split("```")[0].strip()

    start_idx = text.find("{")
    end_idx = text.rfind("}")
    if start_idx != -1 and end_idx != -1:
        text = text[start_idx:end_idx + 1]

    try:
        return json.loads(text, strict=False)
    except Exception:
        # Zastąpienie nieliteralnych nowych linii wewnątrz stringów
        sanitized = re.sub(r':\s*"([^"]*)"', lambda m: ': "' + m.group(1).replace('\n', '\\n').replace('\r', '') + '"', text)
        return json.loads(sanitized, strict=False)


HALLUCINATION_TERMS = [
    "sanityzacja głowicy ramienia", "pułapka rejestracyjna",
    "głowa ramienia", "weryfikacji rejestracji fizycznej",
    "przez 72 godziny", "omówionej partii", "odzieżowych",
    "odzieżow", "na całe tempo", "clothing", "sita odzieżowego",
    "ccp02", "clo1_check", "sitom sita", "sprawy sita", "ciałko sita",
    "sensor check", "sita roboczego", "zabezpieczenia obuwia",
    "magnetycznej śruba", "ryzyko materiala", "drutzie odrzutnika",
    "nakrętka przyciskowa", "whistla", "podlewniczej", "rękawic poliwęglanych",
    "wzorzec kontrolny na śluzce", "kwarantannia", "factory-liczniku",
    "całka stopu", "iminem operatora", "linii tillowa", "wdróżbienie",
    "restricted access pod kontrolę urzędu", "wykrztuszyć", "tesci", "trojekowego"
]

def is_garbage_or_hallucinated(text: str) -> bool:
    if not text or len(text.strip()) < 10:
        return True
    tl = text.lower()
    for term in HALLUCINATION_TERMS:
        if term in tl:
            return True
    # Wykrywanie niespójnych zbitek słownych i łamanej polszczyzny
    suspicious_patterns = [
        r"\b\w{12,}nego\b", # nienaturalne zlepy
        r"(obuwi\w*.*odrzutnik|odrzutnik\w*.*obuwi)",
        r"(drut\w*.*nakretk|nakretk\w*.*drut)",
        r"(stability|factory|cleansing|tillowa|iminem|tesci|kwarantannia)"
    ]
    for pat in suspicious_patterns:
        if re.search(pat, tl):
            return True
    return False


def sanitize_text(text: str) -> str:
    for term in HALLUCINATION_TERMS:
        if term in text.lower():
            return "Awaria CCP (Detektor Metali / Sita). Zatrzymanie linii oraz blokada magazynowa partii wyrobu (Hold Lot) od ostatniego poprawnego testu wzorców."
    return text


def sanitize_audit_vocabulary(text_list: List[str]) -> List[str]:
    cleaned = []
    for item in text_list:
        if not any(term in item.lower() for term in HALLUCINATION_TERMS):
            cleaned.append(item)
    return cleaned


def format_json_verdict_to_markdown(data: Dict[str, Any], context_line: str = "Linia") -> str:
    status = str(data.get("status", "OK")).upper()
    risk = str(data.get("poziom_ryzyka", "NISKIE")).upper()
    decyzja = sanitize_text(str(data.get("decyzja", "Zezwolenie na kontynuację operacji.")))
    
    akcje = sanitize_audit_vocabulary(data.get("akcje_korygujace", []))
    if not akcje and ("NOK" in status or "KRYTYCZ" in risk or "HOLD" in risk):
        akcje = STANDARD_ACTIONS_CCP1
        
    podpowiedzi = sanitize_audit_vocabulary(data.get("podpowiedzi_prewencyjne", []))
    if not podpowiedzi and ("NOK" in status or "KRYTYCZ" in risk or "HOLD" in risk):
        podpowiedzi = PREVENTIVE_ACTIONS_CCP1
        
    status_icon = "🚨" if ("NOK" in status or "KRYTYCZ" in risk) else "✅"
    
    md = [
        f"### {status_icon} WERDYKT: **{status}** | Poziom Ryzyka: **{risk}**\n",
        f"**🛑 Decyzja Operacyjna:**\n> {decyzja}\n"
    ]
    
    if akcje:
        md.append("**🛠️ Natychmiastowe Działania Korygujące (CAPA):**")
        for a in akcje:
            md.append(f"- ⚠️ {a}")
        md.append("")
        
    if podpowiedzi:
        md.append("**🛡️ Wytyczne Prewencyjne i Standardy Jakości:**")
        for p in podpowiedzi:
            md.append(f"- 🔹 {p}")
            
    return "\n".join(md)


def get_recent_line_history(line_name: str = None, limit: int = 5) -> List[Dict[str, Any]]:
    if not os.path.exists(DB_PATH):
        return []
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        if not line_name or line_name in ["Cały Zakład", "Ogólna", "Wszystkie"]:
            cursor.execute("""
                SELECT id, line, shift, zone, audit_type, 
                       ccp1_fe_ok, ccp1_nonfe_ok, ccp1_ss_ok, ccp1_reject_ok, health_ok, 
                       cleanliness_rating, ko_failed, risk_level, slm_verdict, slm_analysis, 
                       notes, checklist_results, timestamp
                FROM audits
                ORDER BY id DESC
                LIMIT ?
            """, (limit,))
        else:
            search_pattern = f"%{line_name.strip()}%"
            cursor.execute("""
                SELECT id, line, shift, zone, audit_type, 
                       ccp1_fe_ok, ccp1_nonfe_ok, ccp1_ss_ok, ccp1_reject_ok, health_ok, 
                       cleanliness_rating, ko_failed, risk_level, slm_verdict, slm_analysis, 
                       notes, checklist_results, timestamp
                FROM audits
                WHERE line LIKE ?
                ORDER BY id DESC
                LIMIT ?
            """, (search_pattern, limit))
        raw_rows = [dict(row) for row in cursor.fetchall()]
        conn.close()

        rows = []
        for r in raw_rows:
            notes = r.get("notes") or ""
            chk_raw = r.get("checklist_results")
            if chk_raw:
                try:
                    c_data = json.loads(chk_raw)
                    extracted = []
                    for q_id, q_val in c_data.items():
                        if isinstance(q_val, dict) and q_val.get("notes"):
                            clause_label = q_val.get("clause") or f"Pkt {q_id}"
                            extracted.append(f"[{clause_label}]: {q_val.get('notes')}")
                    if extracted and not notes:
                        notes = "; ".join(extracted)
                except Exception:
                    pass
            r["notes"] = notes
            rows.append(r)
        return rows
    except Exception as e:
        print(f"Error reading audit history: {e}")
        return []


async def generate_pre_audit_briefing(line_name: str) -> Dict[str, Any]:
    history = get_recent_line_history(line_name, limit=5)
    
    total = len(history)
    nok_count = sum(1 for h in history if str(h.get("slm_verdict", "")).upper() == "NOK" or h.get("ko_failed") == 1)
    ccp_issues = sum(1 for h in history if any(str(h.get(k, "")).upper() == "NIEZGODNY" for k in ["ccp1_fe_ok", "ccp1_reject_ok", "ccp1_nonfe_ok", "ccp1_ss_ok"]))
    health_issues = sum(1 for h in history if str(h.get("health_ok", "")).upper() in ["NIE", "NOK", "NIEZGODNY"])
    
    overall_status = "KRYTYCZNE" if (ccp_issues > 0 or health_issues > 0) else ("UWAGA" if nok_count > 0 else "OK")
    last_audit = history[0] if history else None
    
    checkpoints = [
        "1. Walidacja pętli detektora metali (CCP1): Weryfikacja wzorców testowych Fe 1.5mm, Non-Fe 2.0mm, SS 2.5mm oraz mechanizmu odrzutu",
        "2. Weryfikacja procedury PR15.01: Kontrola braku objawów chorobowych u personelu oraz wykrywalnych, niebieskich plastrów",
        "3. Polityka ciał obcych & Szkła: Integralność osłon oświetlenia i stan techniczny form/taśmociągów",
        "4. Czystość GMP i higiena stanowisk: Brak zalegających resztek masy i prawidłowe oznakowanie pojemników na odpady"
    ]
    
    if ccp_issues > 0:
        checkpoints.insert(0, "🚨 UWAGA CCP1: W niedawnej historii tej linii wystąpiło odchylenie na detektorze metali! Wymagany natychmiastowy test wzorców przed dopuszczeniem partii.")
    if health_issues > 0:
        checkpoints.insert(1, "🩺 UWAGA PR15.01: Odnotowano naruszenie procedury zdrowotnej. Zweryfikuj ankiety zdrowotne operatorów.")

    # RAG: Wstrzyknięcie podyktowanych uwag i odchyleń z poprzednich sesji audytowych
    for h in history:
        h_note = h.get("notes")
        if h_note and len(h_note.strip()) > 2:
            h_date = h.get("timestamp", "poprzednia zmiana")
            checkpoints.insert(0, f"📝 UWAGA Z OSTATNIEJ ZMIANY ({h_date}): \"{h_note.strip()}\" — zweryfikuj czy usterka została usunięta!")
            break

    prompt = (
        f"Jesteś certyfikowanym audytorem wiodącym IFS Food v8 i HACCP.\n"
        f"Przygotuj odprawę przedaudytową (Pre-Audit Briefing) dla audytora wchodzącego na: {line_name}.\n"
        f"STATYSTYKI LINII: Ostatnich audytów: {total}, Odchyleń (NOK): {nok_count}, Awarie CCP: {ccp_issues}, Problemy zdrowotne: {health_issues}.\n"
        f"OSTATNIE WPISY Z BAZY DANYCH:\n{json.dumps(history, ensure_ascii=False, indent=2)}\n\n"
        f"Przygotuj zwięzłe podsumowanie w punktach:\n"
        f"1. Status profilu ryzyka linii (zgodność IFS Food v8)\n"
        f"2. Najważniejsze punkty krytyczne do skontrolowania w pierwszej kolejności\n"
        f"3. Rekomendowane działania audytora w razie wykrycia odchylenia"
    )
    
    briefing_text = ""
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            res = await client.post(OLLAMA_API_URL, json={
                "model": MODEL_NAME,
                "prompt": prompt,
                "stream": False,
                "options": {"temperature": 0.1}
            })
            if res.status_code == 200:
                briefing_text = res.json().get("response", "").strip()
    except Exception as e:
        print(f"Ollama briefing error: {e}")

    if not briefing_text:
        # Inteligentny deterministyczny briefing na podstawie faktów z bazy
        briefing_text = (
            f"### 📋 ODPRAWA PRZEDAUDYTOWA: {line_name}\n"
            f"**Status Obszaru:** {overall_status} | **Przeanalizowano:** {total} ostatnich sesji audytowych\n\n"
            f"**Wnioski z historii bazy danych:**\n"
            f"- Odchylenia jakościowe (NOK): **{nok_count}**\n"
            f"- Zdarzenia na punktach krytycznych CCP1: **{ccp_issues}**\n"
            f"- Naruszenia procedury zdrowotnej PR15.01: **{health_issues}**\n\n"
            f"**Wytyczne operacyjne IFS Food v8:**\n"
            f"• Przed przystąpieniem do oceny wizualnej zażądaj od operatora bieżącej weryfikacji wzorców Fe/Non-Fe/SS.\n"
            f"• Zweryfikuj, czy pojemnik na wyroby odrzucone jest zamknięty na klucz (procedura zabezpieczenia wyrobów niezgodnych).\n"
            f"• Skontroluj stan czystości taśmy transportowej i brak ciał obcych w strefie otwartego produktu."
        )

    return {
        "line": line_name,
        "status": overall_status,
        "total_audits_checked": total,
        "nok_count": nok_count,
        "ccp_issues": ccp_issues,
        "briefing_markdown": briefing_text,
        "checkpoints": checkpoints,
        "last_audit_date": last_audit.get("timestamp") if last_audit else "Brak danych"
    }


async def analyze_audit_risk(audit_data: Dict[str, Any]) -> Dict[str, Any]:
    ccp1_failed = any([
        audit_data.get("ccp1_fe_ok") == "NIEZGODNY",
        audit_data.get("ccp1_nonfe_ok") == "NIEZGODNY",
        audit_data.get("ccp1_ss_ok") == "NIEZGODNY",
        audit_data.get("ccp1_reject_ok") == "NIEZGODNY"
    ])
    pr15_failed = audit_data.get("health_ok") == "NIE"
    ko_failed = audit_data.get("ko_failed", False) or ccp1_failed or pr15_failed

    prompt = (
        f"Jesteś certyfikowanym audytorem wiodącym IFS Food v8 i HACCP. "
        f"Odpowiadasz WYŁĄCZNIE poprawnym obiektem JSON bez markdown.\n"
        f"DANE SESJI AUDYTOWEJ:\n"
        f"• Linia: {audit_data.get('line', 'N/A')} | Zmiana: {audit_data.get('shift', 'N/A')} | Strefa: {audit_data.get('zone', 'N/A')}\n"
        f"• Status KO: {'ZŁAMANIE KRYTERIUM KNOCK-OUT (KO)' if ko_failed else 'BRAK ZŁAMANIA KO'}\n"
        f"• Parametry CCP1: Fe={audit_data.get('ccp1_fe_ok')}, Non-Fe={audit_data.get('ccp1_nonfe_ok')}, SS={audit_data.get('ccp1_ss_ok')}, Odrzutnik={audit_data.get('ccp1_reject_ok')}\n"
        f"• Status Zdrowia PR15.01: {'BRAK ZGODY / OBJAWY' if pr15_failed else 'ZGODNY'}\n\n"
        f"Schemat JSON: {{\"status\": \"OK\"|\"NOK\", \"poziom_ryzyka\": \"NISKIE\"|\"ŚREDNIE\"|\"WYSOKIE\"|\"KRYTYCZNE (HOLD LOT)\", \"decyzja\": \"string\", \"akcje_korygujace\": [], \"podpowiedzi_prewencyjne\": []}}"
    )

    payload = {
        "model": MODEL_NAME,
        "prompt": prompt,
        "stream": False,
        "format": "json",
        "options": {
            "temperature": 0.0,
            "top_p": 0.7,
            "repeat_penalty": 1.25
        }
    }

    parsed: Dict[str, Any] = {}
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.post(OLLAMA_API_URL, json=payload)
            if res.status_code == 200:
                raw_json = res.json().get("response", "{}")
                parsed = clean_json_response(raw_json)
    except Exception:
        parsed = {}

    status_raw = str(parsed.get("status", "")).upper()
    parsed["status"] = "NOK" if (ko_failed or "NOK" in status_raw or "NIEZGODNY" in status_raw) else "OK"

    if ccp1_failed:
        parsed["status"] = "NOK"
        parsed["poziom_ryzyka"] = "KRYTYCZNE (HOLD LOT)"
        parsed["decyzja"] = (
            "Awaria CCP1 (Detektor Metali). Wstrzymanie partii (Hold Lot) od ostatniego "
            "poprawnego testu wzorców. Natychmiastowe zatrzymanie linii produkcyjnej."
        )
        akcje = sanitize_audit_vocabulary(parsed.get("akcje_korygujace", []))
        parsed["akcje_korygujace"] = akcje if len(akcje) >= 2 else STANDARD_ACTIONS_CCP1
        podpowiedzi = sanitize_audit_vocabulary(parsed.get("podpowiedzi_prewencyjne", []))
        parsed["podpowiedzi_prewencyjne"] = podpowiedzi if len(podpowiedzi) >= 2 else PREVENTIVE_ACTIONS_CCP1

    elif pr15_failed:
        parsed["status"] = "NOK"
        parsed["poziom_ryzyka"] = "KRYTYCZNE (HOLD LOT)"
        parsed["decyzja"] = (
            "Naruszenie procedury PR15.01 (Objawy chorobowe personelu w strefie czystej). "
            "Odsunięcie pracownika ze strefy i nałożenie 48h kwarantanny od ustąpienia objawów."
        )
        parsed["akcje_korygujace"] = [
            "Natychmiastowe wyprowadzenie pracownika ze strefy High Care",
            "Sanityzacja i dezynfekcja stanowiska roboczego oraz narzędzi kontaktowych",
            "Zabezpieczenie wyrobów mających kontakt z operatorem do badań mikrobiologicznych"
        ]
        parsed["podpowiedzi_prewencyjne"] = [
            "Weryfikacja ankiet zdrowotnych PR15.01 przed wejściem na halę produkcyjną",
            "Szkolenie personelu z procedur zgłaszania infekcji pokarmowych i skórnych"
        ]

    elif ko_failed:
        parsed["status"] = "NOK"
        parsed["poziom_ryzyka"] = "KRYTYCZNE (HOLD LOT)"
        parsed["decyzja"] = "Złamanie wymagania Knock-Out (KO). Zatrzymanie zwalniania partii i eskalacja do Działu Zapewnienia Jakości."
        if not parsed.get("akcje_korygujace"):
            parsed["akcje_korygujace"] = ["Zabezpieczenie bieżącej partii produkcyjnej", "Audyt doraźny obszaru"]
        if not parsed.get("podpowiedzi_prewencyjne"):
            parsed["podpowiedzi_prewencyjne"] = ["Weryfikacja procedury operacyjnej SOP"]

    elif parsed.get("status") == "OK":
        parsed["poziom_ryzyka"] = "NISKIE"
        parsed["decyzja"] = "Stanowisko w pełni zgodne z wymaganiami IFS Food v8 i HACCP. Zezwolenie na kontynuację produkcji."
        parsed["akcje_korygujace"] = ["Brak konieczności działań korygujących - stan nominalny"]
        parsed["podpowiedzi_prewencyjne"] = ["Utrzymanie regularnego interwału testowania wzorców CCP co 2 godziny"]

    return parsed


def normalize_pl(text: str) -> str:
    mapping = {
        "ą": "a", "ć": "c", "ę": "e", "ł": "l", "ń": "n",
        "ó": "o", "ś": "s", "ź": "z", "ż": "z"
    }
    t = text.lower()
    for k, v in mapping.items():
        t = t.replace(k, v)
    return t


def detect_dialogue_zone(user_turns: List[str]):
    # Sprawdzamy strefy od najnowszej do najstarszej wypowiedzi
    for turn in reversed(user_turns):
        nt = normalize_pl(turn)
        if re.search(r"\b(pakow\w*|karton\w*|foli\w*|konfekcj\w*|etykiet\w*|wag\w*|detektor\w*|ccp1)\b", nt):
            return "Strefa Pakowania i Detekcji CCP1", True
        if re.search(r"\b(chlodz\w*|chlodn\w*|cooling|tunel\w*)\b", nt):
            return "Strefa Chłodzenia / Tunel Chłodniczy", True
        if re.search(r"\b(formow\w*|ekstrud\w*|glowic\w*|matryc\w*|nalew\w*|dozow\w*)\b", nt):
            return "Strefa Formowania / Dozowania", True
        if re.search(r"\b(surow\w*|nawaz\w*|mieszal\w*|zasyp\w*|przyjec\w*|leja|leje|leju|lejem)\b", nt):
            return "Strefa Przygotowania Surowców / Mieszalnik", True
        if re.search(r"\b(piec\w*|wypiek\w*|smaz\w*|termicz\w*|pasteryz\w*)\b", nt):
            return "Strefa Obróbki Termicznej / Piec", True
    
    # Ogólny transporter / taśma (niesprecyzowana strefa)
    for turn in reversed(user_turns):
        nt = normalize_pl(turn)
        if re.search(r"\b(tasm\w*|transporter\w*|przenosnik\w*|rolk\w*)\b", nt):
            return "Transporter Główny / Taśma Produkcyjna", False
            
    return None, False


def detect_dialogue_defect(user_turns: List[str]):
    for turn in reversed(user_turns):
        nt = normalize_pl(turn)
        if re.search(r"\b(wzorzec\w*|fe 1|non-fe|ss 2|brak odrzutu|odrzutnik\w*|nie wykrywa|brak reakcji|nie zrzucil\w*)\b", nt):
            return "CCP_FAIL", "Awaria detektora metali / brak odrzutu wzorca (CCP1)"
        if re.search(r"\b(stluczk\w*|pekn\w*.*szkl\w*|rozbit\w*.*szkl\w*|odlamek\w*.*szkl\w*|klosz\w*|lampa\w*|swietlowk\w*)\b", nt):
            return "GLASS_BREAKAGE", "Stłuczka szkła lub twardego tworzywa (PR15.01)"
        if re.search(r"\b(olej\w*|smar\w*|wyciek\w*|plyn\w*|kapi\w*|skroplin\w*|ciekn\w*|nieszczeln\w*|rop\w*|hydraulik\w*)\b", nt):
            return "FLUID_OIL", "Wyciek oleju / smaru technicznego"
        if re.search(r"\b(szkl\w*|plastik\w*|metal\w*|odlamek\w*|srub\w*|uszczelk\w*|drut\w*|drewn\w*|zylk\w*|farb\w*|odprysk\w*|kawalk\w*|cialo obce)\b", nt):
            return "FOREIGN_BODY", "Obecność ciała obcego na linii"
        if re.search(r"\b(zacieci\w*|zablokow\w*|zerwan\w*|spadl\w*|halas\w*|drgani\w*|ociera\w*|urwan\w*)\b", nt):
            return "MECHANICAL", "Awaria mechaniczna / zacięcie taśmy"
        if re.search(r"\b(wymiot\w*|goraczk\w*|biegunk\w*|krew\w*|skaleczen\w*|ran\w*|plaster\w*|chory\w*|infekcj\w*|bizuteri\w*|czepk\w*)\b", nt):
            return "HYGIENE_HEALTH", "Naruszenie higieny personelu / incydent zdrowotny (PR15.01)"
        if re.search(r"\b(zgrzew\w*|nieszczel\w*|kod\w*|dat\w*|brak daty|alergen\w*|bledna etykiet\w*|niedowag\w*)\b", nt):
            return "PACKAGING", "Błąd zgrzewu lub znakowania wyrobów"
    return None, None


def run_stateful_dialogue_fallback(line: str, user_msg: str, chat_history: List[Dict[str, Any]], history_db: List[Dict[str, Any]]) -> str:
    # 1. Zbudowanie pełnej sekwencji wypowiedzi użytkownika w tej sesji
    user_turns = []
    if chat_history:
        for m in chat_history:
            if m.get("role") == "user" and m.get("content"):
                user_turns.append(m.get("content").strip())
    if not user_turns or user_turns[-1] != user_msg.strip():
        user_turns.append(user_msg.strip())

    full_norm = normalize_pl(" ".join(user_turns))
    curr_norm = normalize_pl(user_msg.strip())

    # 2. Samodzielne pytania o standardy/wiedzę (jeśli użytkownik pyta wprost o definicje/raport)
    if len(user_turns) <= 1 or any(w in curr_norm for w in ["pokaz kpi", "wskaznik kpi", "co to jest haccp", "zasady gmp", "zasady ghp", "jakie sa punkty ko"]):
        if any(w in curr_norm for w in ["kpi", "zgodnos", "statystyk", "stan zakl"]):
            nok_cnt = sum(1 for h in history_db if str(h.get("slm_verdict", "")).upper() == "NOK")
            ok_cnt = len(history_db) - nok_cnt
            rate = round((ok_cnt / len(history_db) * 100), 1) if history_db else 100.0
            return (
                f"### 📊 Raport Zgodności i Wskaźnik KPI\n"
                f"**Kontekst:** {line}\n\n"
                f"- Przeanalizowane ostatnie sesje: **{len(history_db)}**\n"
                f"- Zgodność nominalna: **{rate}%** ({ok_cnt} OK / {nok_cnt} NOK)\n"
                f"- Status bieżący: **{'ZGODNY z IFS Food v8' if nok_cnt == 0 else 'WYMAGA DZIAŁAŃ KORYGUJĄCYCH (CAPA)'}**\n\n"
                f"Zalecenie: Utrzymanie planowej częstotliwości weryfikacji i ciągły nadzór nad punktami krytycznymi."
            )
        if any(w in curr_norm for w in ["haccp", "plan haccp", "limity krytycz"]):
            return (
                f"### 🛡️ Standard HACCP (Zagrożenia i Punkty Krytyczne)\n"
                f"**Obszar:** {line}\n\n"
                f"1. **CCP1 (Detektor Metali):** Weryfikacja wzorcami Fe 1.5mm / Non-Fe 2.0mm / SS 2.5mm co 1-2h oraz sprawność odrzutnika.\n"
                f"2. **CCP2 / oPRP (Magnesy Neodymowe):** Inspekcja wyłapywania cząstek ferromagnetycznych i rejestracja stanu.\n"
                f"3. **CCP3 (Sita kontrolne):** Weryfikacja integralności siatki (brak przetarć i dziur).\n"
                f"4. **Zasada KO:** Przekroczenie limitu krytycznego na CCP = natychmiastowe zatrzymanie procesu i blokada wyrobu (Hold Lot)."
            )
        if any(w in curr_norm for w in ["gmp", "dobra praktyka produkcyjn", "infrastruktur"]):
            return (
                f"### 🧼 Standard GMP (Dobra Praktyka Produkcyjna - IFS v8)\n"
                f"**Obszar:** {line}\n\n"
                f"1. **Infrastruktura maszyn:** Brak wycieków oleju/smarów, stabilne orurowanie, brak prowizorycznych napraw.\n"
                f"2. **Ochrona przed ciałami obcymi:** Osłony oświetlenia nienaruszone, rejestr szkła i tworzyw twardych.\n"
                f"3. **Czystość i sanityzacja:** Brak zalegających resztek masy, czyste posadzki i kratki ściekowe."
            )
        if any(w in curr_norm for w in ["ghp", "higiena personelu", "dobra praktyka higieniczn"]):
            return (
                f"### 🧤 Standard GHP (Dobra Praktyka Higieniczna - IFS v8)\n"
                f"**Obszar:** {line}\n\n"
                f"1. **Śluzy sanitarne:** Mycie i dezynfekcja rąk, higiena obuwia roboczego.\n"
                f"2. **Odzież ochronna:** Czyste fartuchy, czepki zakrywające 100% włosów, bezwzględny zakaz biżuterii.\n"
                f"3. **Stan zdrowia (PR15.01):** Obowiązek zgłaszania infekcji pokarmowych; niebieskie wykrywalne plastry."
            )
        if any(w in curr_norm for w in ["ko", "knock-out", "knockout"]):
            return (
                f"### 📋 Główne Wymagania Knock-Out (IFS Food v8)\n"
                f"Złamanie któregokolwiek punktu KO skutkuje oceną **NOK** i brakiem certyfikacji:\n"
                f"- **KO 1:** Odpowiedzialność kierownictwa i polityka jakości\n"
                f"- **KO 2:** Nadzór nad każdym CCP i limitami krytycznymi\n"
                f"- **KO 3:** Higiena personelu i zgłaszanie infekcji (PR15.01)\n"
                f"- **KO 4:** Specyfikacje surowców i wyrobów gotowych\n"
                f"- **KO 5:** Identyfikowalność i bilans masowy partii\n"
                f"- **KO 6:** Działania korygujące i procedura Hold Lot"
            )

def extract_dialogue_facts(user_turns: List[str], full_text: str) -> Dict[str, Any]:
    norm_text = normalize_pl(full_text)
    
    # 1. Strefa
    zone, is_specific_zone = detect_dialogue_zone(user_turns)
    
    # 2. Defekt
    defect_type, defect_desc = detect_dialogue_defect(user_turns)
    
    # 3. Dodatkowe słowa kluczowe wskazujące problem zgłoszony własnymi słowami
    # (ignorujemy ogólne hasła otwierające typu 'awaria', 'problem na linii', 'sa bledy', 'usterka', 'cos sie dzieje')
    GENERIC_WORDS = {
        "awaria", "usterka", "blad", "bledy", "problem", "problemy", "incydent", 
        "zgloszenie", "wsparcie", "pomoc", "stop", "alarm", "linia", "tasma",
        "sa bledy", "jest blad", "mamy problem", "awaria na linii", "cos sie dzieje",
        "jakies bledy", "wykryto blad", "nie dziala", "cos nie tak"
    }
    custom_desc = None
    if not defect_type:
        for t in reversed(user_turns):
            nt = normalize_pl(t.strip())
            _, is_only_zone = detect_dialogue_zone([t])
            # Jeśli t to tylko strefa lub t to czysto ogólne hasło (np. 'sa bledy', 'awaria')
            words = set(re.findall(r"\b\w+\b", nt))
            if is_only_zone or nt in GENERIC_WORDS or words.issubset(GENERIC_WORDS):
                continue
            # Akceptujemy tylko konkretny opis (minimum 2 słowa nienależące do pustych ogólników)
            meaningful_words = [w for w in words if w not in GENERIC_WORDS and len(w) > 2]
            if len(meaningful_words) >= 1 and len(t.strip().split()) >= 2:
                custom_desc = t.strip()
                defect_type = "CUSTOM_ISSUE"
                defect_desc = f"Zgłoszenie: „{custom_desc}”"
                break
                
    # 4. Status kontaktu z produktem
    has_contact = None
    if re.search(r"\b(nie mial kontakt\w*|nie dotkn\w*|brak kontakt\w*|na posadzk\w*|na oslon\w*|nie zanieczyszcz\w*|czyst\w*|zamkniet\w*.*opakowan\w*|nie trafil\w*|nie wsypan\w*|nie dodan\w*|na paleci\w*|odizolowan\w*|wstrzyman\w* przed)\b", norm_text):
        has_contact = False
    elif re.search(r"\b(mial kontakt\w*|dotkn\w*|zanieczyszczon\w*.*produkt\w*|wpadl\w*.*do|na produkt|do masy|posypalo sie na|wsypan\w* do|trafil\w* do|w opakowani\w*)\b", norm_text):
        has_contact = True
        
    # 5. Status zatrzymania linii
    is_stopped = bool(re.search(r"\b(zatrzyman\w*|wylaczon\w*|stop|stoi|odciet\w*|hold|zablokowan\w*)\b", norm_text))
    
    # 6. Status wezwania serwisu / UR / Jakości
    ur_notified = bool(re.search(r"\b(ur|utrzymani\w*|mechanik\w*|wezwan\w*|serwis\w*|lider\w*|jakosc\w*|zgloszon\w* do)\b", norm_text))
    
    # 7. Identyfikowalność / Partia LOT
    lot_mentioned = bool(re.search(r"\b(lot|parti\w*|palet\w*|karton\w*|sztuk\w*|kg|ton\w*)\b", norm_text))

    return {
        "zone": zone,
        "is_specific_zone": is_specific_zone,
        "defect_type": defect_type,
        "defect_desc": defect_desc,
        "has_contact": has_contact,
        "is_stopped": is_stopped,
        "ur_notified": ur_notified,
        "lot_mentioned": lot_mentioned,
        "turns_count": len(user_turns)
    }


def run_stateful_dialogue_fallback(line: str, user_msg: str, chat_history: List[Dict[str, Any]], history_db: List[Dict[str, Any]]) -> str:
    # 1. Zebranie wypowiedzi audytora
    user_turns = []
    if chat_history:
        for m in chat_history:
            if m.get("role") == "user" and m.get("content"):
                user_turns.append(m.get("content").strip())
    if not user_turns or user_turns[-1] != user_msg.strip():
        user_turns.append(user_msg.strip())

    full_conversation = " ".join(user_turns)
    curr_norm = normalize_pl(user_msg.strip())

    # 2. Pytania bazodanowe / audytowe o wskaźniki (KPI, definicje)
    if len(user_turns) <= 1 or any(w in curr_norm for w in ["pokaz kpi", "wskaznik kpi", "co to jest haccp", "zasady gmp", "zasady ghp", "jakie sa punkty ko"]):
        if any(w in curr_norm for w in ["kpi", "zgodnos", "statystyk", "stan zakl"]):
            nok_cnt = sum(1 for h in history_db if str(h.get("slm_verdict", "")).upper() == "NOK")
            ok_cnt = len(history_db) - nok_cnt
            rate = round((ok_cnt / len(history_db) * 100), 1) if history_db else 100.0
            return (
                f"### 📊 Raport Zgodności i Profil Ryzyka KPI\n"
                f"**Audytowany Obszar:** {line}\n\n"
                f"Na podstawie ostatnich **{len(history_db)}** inspekcji w zakładowej bazie audytów:\n"
                f"- Wskaźnik zgodności operacyjnej: **{rate}%** ({ok_cnt} OK / {nok_cnt} NOK)\n"
                f"- Status audytorski: **{'PEŁNA ZGODNOŚĆ (IFS Food v8)' if nok_cnt == 0 else 'WYMAGANE DZIAŁANIA KORYGUJĄCE (CAPA)'}**\n\n"
                f"**Konkluzja:** Wszelkie odchylenia na punktach krytycznych (CCP/oPRP) traktowane są priorytetowo pod kątem procedury wstrzymania partii (Hold Lot)."
            )
        if any(w in curr_norm for w in ["haccp", "plan haccp", "limity krytycz"]):
            return (
                f"### 🛡️ Matryca HACCP i Punkty Krytyczne (IFS Food v8)\n"
                f"**Kontekst:** {line}\n\n"
                f"1. **CCP1 (Detekcja Ciał Obcych):** Sprawdzanie wzorców Fe/Non-Fe/SS co 1-2h i po każdej wymianie asortymentu.\n"
                f"2. **oPRP / Magnesy i Sita:** Inspekcja integralności sit kontrolnych i siły magnetycznej separatorów.\n"
                f"3. **Zasada Krytyczna (KO 2):** Przekroczenie limitu lub awaria odrzutnika = natychmiastowe zatrzymanie linii i procedura HOLD LOT."
            )

    # 3. Kognitywna ekstrakcja faktów z całej rozmowy
    facts = extract_dialogue_facts(user_turns, full_conversation)
    zone = facts["zone"] or line
    defect_type = facts["defect_type"]
    defect_desc = facts["defect_desc"]
    has_contact = facts["has_contact"]
    is_stopped = facts["is_stopped"]
    ur_notified = facts["ur_notified"]
    lot_mentioned = facts["lot_mentioned"]
    turns_count = facts["turns_count"]

    # =========================================================================
    # INTELIGENTNE DRZEWO WNIOSKOWANIA I PYTAŃ ROZSZERZAJĄCYCH
    # =========================================================================

    # ETAP 1: Użytkownik podał tylko ogólne hasło (np. "awaria", "problem na linii", "zgloszenie")
    if not facts["is_specific_zone"] and not defect_type:
        # Zabezpieczenie przed wielokrotnym wpisywaniem tego samego słowa ("awaria", "awaria")
        repeated = len(user_turns) >= 2 and normalize_pl(user_turns[-1]) == normalize_pl(user_turns[-2])
        if repeated:
            return (
                f"### ⚠️ Rozumiem – awaria wymaga pilnej reakcji audytora\n"
                f"**Obszar roboczy:** {line}\n\n"
                f"Abyśmy nie tracili cennego czasu i natychmiast podjęli decyzję dotyczącą ewentualnego wstrzymania produkcji:\n\n"
                f"👉 **Wskaż krótko jedno z dwóch:**\n"
                f"1. **Gdzie to jest?** *(np. detektor metali, pakowaczka, tunel chłodniczy, mieszalnik)*\n"
                f"2. **Co się wydarzyło?** *(np. wyciek oleju, brak odrzutu wzorca, pęknięcie osłony, uszkodzony worek)*\n\n"
                f"Możesz też kliknąć **[ 📷 Zrób Zdjęcie ]** lub skorzystać z mikrofonu."
            )
        return (
            f"### 🔍 Asystent Jakości IFS Food v8: Rejestracja Zdarzenia\n"
            f"**Obszar roboczy:** {line}\n\n"
            f"Przyjąłem sygnał o incydencie. Aby właściwie zakwalifikować ryzyko dla wyrobu gotowego:\n\n"
            f"1. 📍 **W którym sektorze linii powstał problem?**\n"
            f"   - Strefa przygotowania surowców / dozowanie\n"
            f"   - Tunel chłodniczy / obróbka cieplna\n"
            f"   - Pakowanie i detektor metali (CCP1)\n\n"
            f"2. ⚠️ **Jaki jest wstępny charakter usterki?** *(mechaniczna, ciało obce, wyciek, wada surowca)*\n\n"
            f"📸 *Jeśli jesteś przy maszynie, załącz zdjęcie przyciskiem aparatu.*"
        )

    # ETAP 2: Znamy STREFĘ, ale nie znamy jeszcze DOKŁADNEGO DEFEKTU
    if facts["is_specific_zone"] and not defect_type:
        if "pakow" in zone.lower() or "ccp" in zone.lower():
            return (
                f"### 📍 Zarejestrowano Sektor: {zone}\n"
                f"**Wnioski audytorskie:** Sekcja pakowania to obszar podwyższonego ryzyka (strefa krytyczna CCP1 oraz zamknięcia opakowań wyrobu gotowego).\n\n"
                f"Aby natychmiast określić, czy musimy wstrzymać partię wyrobów (HOLD LOT):\n\n"
                f"1. ⚠️ **Jaki dokładnie problem wystąpił przy detektorze/pakowaczce?**\n"
                f"   - Czy detektor nie odrzucił wzorca testowego (Fe / Non-Fe / SS)?\n"
                f"   - Czy doszło do mechanicznego uszkodzenia taśmy/odrzutnika?\n"
                f"   - Czy wykryto nieszczelność zgrzewu lub błąd daty/kodu partii?\n\n"
                f"2. 🛑 **Czy taśma została już prewencyjnie wstrzymana?**\n"
                f"3. 📦 **Jaki asortyment jest w tej chwili pakowany?**"
            )
        elif "surow" in zone.lower() or "mieszal" in zone.lower():
            return (
                f"### 📍 Zarejestrowano Sektor: {zone}\n"
                f"**Wnioski audytorskie:** Magazyn i naważalnia surowców decydują o bezpieczeństwie całej szarży produkcyjnej (IFS Food v8 KO 4).\n\n"
                f"Aby wykluczyć skażenie krzyżowe lub błąd recepturowy:\n\n"
                f"1. ⚠️ **Co dokładnie stwierdzono przy surowcu?**\n"
                f"   - Uszkodzenie opakowania / wilgoć / pleśń?\n"
                f"   - Brak etykiety partii LOT lub brak atestu CoA dostawcy?\n"
                f"   - Niezgodność alergenowa / obecność szkodników?\n\n"
                f"2. 🛑 **Czy surowiec trafił już do leja/mieszalnika, czy partia została zatrzymana przed wsypaniem?**"
            )
        else:
            return (
                f"### 📍 Zarejestrowano Sektor: {zone}\n"
                f"Obszar został zidentyfikowany. Z punktu widzenia standardu IFS Food v8 musimy ocenić wpływ na bezpieczeństwo wyrobu:\n\n"
                f"1. ⚠️ **Opisz krótko charakter problemu w tej sekcji** *(np. wyciek oleju, pęknięcie osłony, zacięcie taśmy)*.\n"
                f"2. 🛑 **Czy linia w tym module została zatrzymana?**\n"
                f"3. 🔍 **Czy otwarty produkt znajduje się bezpośrednio pod miejscem awarii?**"
            )

    # ETAP 3: Znamy DEFEKT, ale NIE ZNAMY JESZCZE STREFY
    if defect_type and not facts["is_specific_zone"]:
        return (
            f"### ⚠️ Zidentyfikowano Zagrożenie: {defect_desc}\n"
            f"**Wnioski audytorskie:** Wykryto zdarzenie podlegające pod wymagania IFS Food v8. Kluczowym czynnikiem jest teraz precyzyjne odizolowanie źródła skażenia.\n\n"
            f"**Pytania pogłębiające:**\n"
            f"1. 📍 **W którym dokładnie punkcie technologicznym to występuje?** *(np. naważalnia surowców, chłodzenie, detektor metali CCP1)*\n"
            f"2. 📦 **Czy wyroby z tej strefy przemieściły się dalej w stronę pakowania zbiorczego?**\n"
            f"3. 🛑 **Zalecenie doraźne:** Wstrzymaj podawanie produktów na tym odcinku do czasu ustalenia zasięgu."
        )

    # ETAP 4: ZNAMY ZARÓWNO STREFĘ JAK I CHARAKTER ZDARZENIA (Pełna konkluzja i wnioski)
    if facts["is_specific_zone"] and defect_type:
        
        # Podscenariusz 4A: Awaria CCP1 (Detektor Metali)
        if defect_type == "CCP_FAIL":
            if has_contact is None and not is_stopped:
                return (
                    f"### 🚨 ALARM KRYTYCZNY: Awaria CCP1 – Detektor Metali (IFS KO 2)\n"
                    f"**Lokalizacja:** {zone} | **Zdarzenie:** {defect_desc}\n\n"
                    f"**KONKLUZJA I KWALIFIKACJA RYZYKA:**\n"
                    f"Brak prawidłowego odrzutu wzorca testowego oznacza natychmiastową utratę statusu CCP (Punkt Krytyczny Kontroli). Zgodnie z wymaganiem **Knock-Out 2 (IFS Food v8)** linia nie może kontynuować produkcji bez sprawnego systemu detekcji.\n\n"
                    f"**NATYCHMIASTOWE DECYZJE AUDYTORSKIE (CAPA):**\n"
                    f"1. 🛑 **STOP LINII:** Natychmiast zatrzymaj taśmę transportową i odetnij podawanie opakowań.\n"
                    f"2. 🔒 **PROCEDURA HOLD LOT:** Oznacz statusem blokady magazynowej wszystkie wyroby wyprodukowane **od ostatniego udokumentowanego, poprawnego testu wzorca**.\n"
                    f"3. 🛠️ **Wezwanie UR:** Diagnostyka ciśnienia pneumatyki odrzutnika i kalibracja pętli.\n\n"
                    f"👉 **Pytania rozszerzające do zamknięcia raportu:**\n"
                    f"- Ile czasu minęło od ostatniego poprawnego testu (ile palet/kartonów podlega wstrzymaniu)?\n"
                    f"- Czy Utrzymanie Ruchu przystąpiło już do weryfikacji odrzutnika?"
                )
            else:
                return (
                    f"### 📋 Raport Korygujący: Wstrzymanie i Zwolnienie Partii CCP1\n"
                    f"**Lokalizacja:** {zone} | **Status Partii:** Objęta procedurą HOLD LOT\n\n"
                    f"**WNIOSKI KOŃCOWE I WYMOGI ZWOLNIENIA LINII (Line Clearance):**\n"
                    f"1. 🔧 Po usunięciu usterki przez UR wykonaj **trzykrotny test testowy** każdym wzorcem (Fe, Non-Fe, SS) z rzędu.\n"
                    f"2. 🔄 **100% Reprocesing:** Cała wstrzymana partia wyrobów musi zostać powtórnie przepuszczona przez w pełni sprawny detektor metali.\n"
                    f"3. ✍️ Wymagany protokół niezgodności podpisany przez Kierownika Zapewnienia Jakości.\n\n"
                    f"Czy wstrzymana partia została już fizycznie oznaczona czerwonymi zawieszkami HOLD?"
                )

        # Podscenariusz 4B: Stłuczka szkła / tworzyw twardych
        if defect_type == "GLASS_BREAKAGE":
            return (
                f"### 🚨 ALARM KRYTYCZNY: Procedura Stłuczkowa PR15.01 (IFS v8)\n"
                f"**Lokalizacja:** {zone} | **Zdarzenie:** {defect_desc}\n\n"
                f"**KONKLUZJA I KWALIFIKACJA RYZYKA:**\n"
                f"Odłamki szkła lub twardego plastiku stanowią bezpośrednie zagrożenie zdrowia i życia konsumenta. Obowiązuje zakaz jakiegokolwiek sortowania produktów otwartych.\n\n"
                f"**DECYZJA AUDYTORSKA: WDROŻENIE PROCEDURY PR15.01:**\n"
                f"1. 🛑 **Strefa Zero (min. 5 metrów):** Natychmiastowe zatrzymanie maszyn w promieniu 5 metrów od miejsca pęknięcia.\n"
                f"2. 🗑️ **Utylizacja bezwarunkowa:** Wszystkie otwarte produkty i półprodukty w strefie podlegają bezwzględnej utylizacji.\n"
                f"3. 🧹 **Sprzątanie:** Wyłącznie dedykowanym sprzętem stłuczkowym (czerwony osprzęt) i odkurzaczem przemysłowym HEPA.\n"
                f"4. 👟 **Kontrola personelu:** Inspekcja obuwia i odzieży roboczej pracowników obecnych przy zdarzeniu.\n\n"
                f"👉 **Pytanie rozszerzające:** Czy sporządzono już wpis w zakładowym Rejestrze Pęknięć Szkła i Tworzyw Twardych?"
            )

        # Podscenariusz 4C: Wyciek oleju / cieczy technicznej
        if defect_type == "FLUID_OIL":
            if has_contact is False:
                return (
                    f"### ✅ Konkluzja Audytorska: Wyciek Poza Strefą Kontaktu\n"
                    f"**Lokalizacja:** {zone} | **Zdarzenie:** {defect_desc}\n\n"
                    f"**OCENA RYZYKA:**\n"
                    f"Brak bezpośredniego kontaktu ze strugą produktu wyklucza skażenie bieżącej partii. Incydent kwalifikuje się jako niezgodność infrastrukturalna GMP (IFS Food v8 p. 4.10).\n\n"
                    f"**DZIAŁANIA KORYGUJĄCE (CAPA):**\n"
                    f"1. 🔧 Wstrzymanie sekcji napędu i uszczelnienie przekładni przez UR (użycie wyłącznie atestowanego oleju spożywczego NSF H1).\n"
                    f"2. 🧼 Odtłuszczenie posadzki i osłon atestowanym środkiem myjącym.\n"
                    f"3. 📋 Weryfikacja wizualna czystości przed wznowieniem ruchu taśmy.\n\n"
                    f"👉 **Pytanie rozszerzające:** Czy wyciekający środek smarny posiada aktualny atest NSF H1 (dopuszczenie do incydentalnego kontaktu z żywnością)?"
                )
            else:
                return (
                    f"### 🚨 KRYTYCZNA DECYZJA AUDYTORSKA: Skażenie Produktu Olejem Technicznym\n"
                    f"**Lokalizacja:** {zone} | **Kwalifikacja:** Zagrożenie chemiczne (IFS KO 4 / GMP)\n\n"
                    f"**DECYZJA: NATYCHMIASTOWY HOLD LOT I UTYLIZACJA**\n"
                    f"1. 🛑 Całkowite zatrzymanie procesu i blokada całej partii wyrobów od miejsca wycieku.\n"
                    f"2. 🔒 Wprowadzenie statusu HOLD w ERP na partię produkcyjną.\n"
                    f"3. 🧪 Pobranie próbek kontrolnych i komisyjne spisanie protokołu zniszczenia zanieczyszczonej masy.\n\n"
                    f"👉 **Pytanie rozszerzające:** Jaka ilość surowca/wyrobu została bezpośrednio zanieczyszczona olejem?"
                )

        # Podscenariusz 4D: Inne zgłoszenia niestandardowe (CUSTOM_ISSUE, uszkodzenia mechaniczne)
        return (
            f"### ⚠️ Kwalifikacja Incydentu: {defect_desc}\n"
            f"**Lokalizacja:** {zone} | **Standard:** IFS Food v8 (wymogi GMP i kontroli procesu)\n\n"
            f"**ANALIZA RYZYKA I WNIOSKI AUDYTORSKIE:**\n"
            f"Zdarzenie w sekcji **{zone}** stwarza potencjalne ryzyko zaburzenia procesu produkcyjnego oraz integralności wyrobu.\n\n"
            f"**REKOMENDOWANE AKCJE OPERACYJNE:**\n"
            f"1. 🛑 Wstrzymaj podawanie materiału na tym odcinku linii.\n"
            f"2. 🔍 Przeprowadź natychmiastową inspekcję strefy bezpośredniego styku z produktem.\n"
            f"3. 🏷️ W razie wątpliwości nałóż kwarantannę prewencyjną na ostatnią wyprodukowaną paletę.\n\n"
            f"👉 **Pytania rozszerzające:**\n"
            f"- Czy podejrzana partia ma nadany czytelny numer identyfikacyjny (LOT)?\n"
            f"- Czy usterka ma charakter trwały i wymaga wezwania Działu Utrzymania Ruchu?"
        )

    # Scenariusz rezerwowy
    return (
        f"### 🔍 Asystent Jakości IFS Food v8\n"
        f"**Linia:** {line} | **Zgłoszenie:** *\"{user_msg}\"*\n\n"
        f"Przyjąłem informację. Abyśmy mogli podjąć jednoznaczną decyzję operacyjną, doprecyzuj proszę strefę zdarzenia oraz czy partia miała kontakt ze źródłem odchylenia."
    )


async def run_agent_turn(audit_payload: Dict[str, Any], line_name: str = None, chat_history: Optional[List[Dict[str, Any]]] = None) -> str:
    line = line_name or audit_payload.get("line") or "Cały Zakład"
    history = get_recent_line_history(line, limit=5)
    user_msg = audit_payload.get("notes", "").strip()
    user_name = audit_payload.get("user", "Audytor")
    user_role = audit_payload.get("role", "AUDITOR")
    # Ekstrakcja faktów przed wywołaniem LLM/SLM
    user_turns_preview = []
    if chat_history:
        for m in chat_history:
            if m.get("role") == "user" and m.get("content"):
                user_turns_preview.append(m.get("content").strip())
    if not user_turns_preview or user_turns_preview[-1] != user_msg:
        user_turns_preview.append(user_msg)
        
    facts_preview = extract_dialogue_facts(user_turns_preview, " ".join(user_turns_preview))

    system_prompt = (
        f"Jesteś certyfikowanym audytorem wiodącym IFS Food v8, BRCGS v9 i HACCP dla przemysłu spożywczego.\n"
        f"Działasz jako inteligentny, dociekliwy i wysoce intuicyjny Field Co-Pilot audytora na hali produkcyjnej.\n\n"
        f"STAN WIEDZY Z DOTYCHCZASOWEJ ROZMOWY:\n"
        f"• Linia: {line}\n"
        f"• Zidentyfikowana strefa: {facts_preview['zone'] or 'Jeszcze nieustalona'}\n"
        f"• Zidentyfikowany defekt: {facts_preview['defect_desc'] or 'Jeszcze nieustalony'}\n"
        f"• Kontakt z produktem: {'TAK - Skażenie' if facts_preview['has_contact'] is True else ('NIE - Bezpieczny' if facts_preview['has_contact'] is False else 'Do ustalenia')}\n"
        f"• Liczba wymian zdań: {facts_preview['turns_count']}\n\n"
        f"ZASADY DOKONYWANIA OCENY I PYTAŃ ROZSZERZAJĄCYCH:\n"
        f"1. NIGDY NIE POWTARZAJ TYCH SAMYCH PYTAŃ: Zauważ, co audytor już podał i rozwijaj wątek.\n"
        f"2. WYCIĄGAJ WNIOSKI ZAGROŻENIA: Jeśli zgłoszono awarię detektora metali CCP1, wskaż ryzyko ciała obcego i wymaganie IFS KO 2.\n"
        f"3. ZADAWAJ PRECYZYJNE PYTANIA POGŁĘBIAJĄCE: Pytaj o czas od ostatniego testu wzorców, wielkość partii do zablokowania (Hold Lot), numer LOT lub wezwanie UR.\n"
        f"4. Odpowiadaj zwięźle i profesjonalnie po polsku w punktach Markdown."
    )

    ollama_messages = [{"role": "system", "content": system_prompt}]
    if chat_history:
        for m in chat_history:
            r = m.get("role", "user")
            c = m.get("content", "")
            if r in ["user", "assistant"] and c:
                ollama_messages.append({"role": r, "content": c})

    if not ollama_messages or ollama_messages[-1].get("role") != "user" or ollama_messages[-1].get("content") != user_msg:
        ollama_messages.append({"role": "user", "content": user_msg})

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            res = await client.post(OLLAMA_CHAT_URL, json={
                "model": MODEL_NAME,
                "messages": ollama_messages,
                "stream": False,
                "options": {"temperature": 0.1, "repeat_penalty": 1.25}
            })
            if res.status_code == 200:
                data = res.json()
                reply = data.get("message", {}).get("content", "").strip()
                if reply:
                    if "{" in reply and "}" in reply:
                        try:
                            parsed = clean_json_response(reply)
                            if isinstance(parsed, dict) and ("status" in parsed or "poziom_ryzyka" in parsed or "decyzja" in parsed):
                                return format_json_verdict_to_markdown(parsed, context_line=line)
                        except Exception as parse_err:
                            print(f"JSON conversion error: {parse_err}")

                    # Weryfikacja czystości językowej i sensu logicznego wygenerowanej odpowiedzi
                    if not is_garbage_or_hallucinated(reply):
                        return reply
                    else:
                        print(f"⚠️ Wykryto halucynację modelu SLM ({reply[:60]}...). Przełączam na czysty silnik dialogu.")
    except Exception as e:
        print(f"Ollama chat offline or error: {e}")

    # Stateful conversational fallback engine
    return run_stateful_dialogue_fallback(line=line, user_msg=user_msg, chat_history=chat_history, history_db=history)