import os
import json
import re
import sqlite3
import httpx
from typing import Dict, Any, List

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "audits.db")
OLLAMA_API_URL = os.getenv("OLLAMA_API_URL", "http://127.0.0.1:11434/api/generate")
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
    "sensor check", "sita roboczego"
]


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
                       notes, timestamp
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
                       notes, timestamp
                FROM audits
                WHERE line LIKE ?
                ORDER BY id DESC
                LIMIT ?
            """, (search_pattern, limit))
        rows = [dict(row) for row in cursor.fetchall()]
        conn.close()
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


async def run_agent_turn(audit_payload: Dict[str, Any], line_name: str = None) -> str:
    line = line_name or audit_payload.get("line") or "Cały Zakład"
    history = get_recent_line_history(line, limit=5)
    user_msg = audit_payload.get("notes", "").strip()
    user_name = audit_payload.get("user", "Audytor")
    user_role = audit_payload.get("role", "AUDITOR")
    
    prompt = (
        f"Jesteś certyfikowanym audytorem wiodącym IFS Food v8, BRCGS v9 i HACCP dla przemysłu spożywczego.\n"
        f"Działasz jako interaktywny Field Co-Pilot (Asystent Terenowy Audytora) na hali produkcyjnej.\n\n"
        f"AKTUALNY KONTEKST:\n"
        f"• Audytowana Linia: {line}\n"
        f"• Użytkownik: {user_name} ({user_role})\n"
        f"• Historia ostatnich audytów z bazy:\n{json.dumps(history, ensure_ascii=False, indent=2) if history else 'Brak wcześniejszych wpisów dla tej linii.'}\n\n"
        f"PYTANIE / ZGŁOSZENIE AUDYTORA:\n\"{user_msg}\"\n\n"
        f"Instrukcje dla Twojej odpowiedzi:\n"
        f"1. Jeśli audytor pyta o odchylenie lub incydent (np. uszkodzenie osłon, brak wzorców CCP, objawy chorobowe), podaj natychmiastową decyzję operacyjną (Hold Lot / Dispatch), wskaż numer klauzuli IFS/HACCP oraz akcje korygujące CAPA.\n"
        f"2. Jeśli audytor pyta o KPI lub historię, zreferuj faktyczne dane z powyższej historii bazy.\n"
        f"3. Odpowiadaj zwięźle, konkretnie, w języku polskim, z użyciem profesjonalnej terminologii jakościowej i punktorów Markdown."
    )

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            res = await client.post(OLLAMA_API_URL, json={
                "model": MODEL_NAME,
                "prompt": prompt,
                "stream": False,
                "options": {"temperature": 0.15}
            })
            if res.status_code == 200:
                data = res.json()
                reply = data.get("response", "").strip()
                if reply:
                    if "{" in reply and "}" in reply:
                        try:
                            parsed = clean_json_response(reply)
                            if isinstance(parsed, dict) and ("status" in parsed or "poziom_ryzyka" in parsed or "decyzja" in parsed):
                                return format_json_verdict_to_markdown(parsed, context_line=line)
                        except Exception as parse_err:
                            print(f"JSON conversion error: {parse_err}")
                    return reply
    except Exception as e:
        print(f"Error calling Ollama in run_agent_turn: {e}")

    # Inteligentny fallback regułowy bazujący na słowach kluczowych
    q_lower = user_msg.lower()
    if any(w in q_lower for w in ["kpi", "zgodnoś", "statystyk", "stan zakł"]):
        nok_cnt = sum(1 for h in history if str(h.get("slm_verdict", "")).upper() == "NOK")
        ok_cnt = len(history) - nok_cnt
        rate = round((ok_cnt / len(history) * 100), 1) if history else 100.0
        return (
            f"### 📊 Raport Zgodności i Wskaźnik KPI\n"
            f"**Kontekst:** {line}\n\n"
            f"- Przeanalizowane ostatnie sesje: **{len(history)}**\n"
            f"- Zgodność nominalna: **{rate}%** ({ok_cnt} OK / {nok_cnt} NOK)\n"
            f"- Status bieżący: **{'ZGODNY z IFS Food v8' if nok_cnt == 0 else 'WYMAGA DZIAŁAŃ KORYGUJĄCYCH (CAPA)'}**\n\n"
            f"Zalecenie: Utrzymanie planowej częstotliwości weryfikacji i ciągły nadzór nad punktami krytycznymi."
        )
    elif any(w in q_lower for w in ["haccp", "plan haccp", "limity"]):
        return (
            f"### 🛡️ Standard HACCP (Zagrożenia i Punkty Krytyczne)\n"
            f"**Obszar:** {line}\n\n"
            f"1. **CCP1 (Detektor Metali):** Weryfikacja wzorcami Fe 1.5mm / Non-Fe 2.0mm / SS 2.5mm co 1-2h oraz sprawność automatycznego odrzutu.\n"
            f"2. **CCP2 / oPRP (Magnesy Neodymowe):** Inspekcja wyłapywania cząstek żelaznych, czyszczenie i rejestracja stanu.\n"
            f"3. **CCP3 (Sita kontrolne):** Weryfikacja integralności siatki (brak przetarć i dziur).\n"
            f"4. **Zasada KO:** Przekroczenie limitu krytycznego na CCP = natychmiastowe zatrzymanie procesu i blokada wyrobu (Hold Lot)."
        )
    elif any(w in q_lower for w in ["gmp", "dobra praktyka produkcyjn", "infrastruktur"]):
        return (
            f"### 🧼 Standard GMP (Dobra Praktyka Produkcyjna - IFS v8)\n"
            f"**Obszar:** {line}\n\n"
            f"1. **Infrastruktura maszyn:** Brak wycieków oleju/smarów, stabilne orurowanie, brak prowizorycznych napraw (taśmy, trytytki).\n"
            f"2. **Ochrona przed ciałami obcymi:** Osłony oświetlenia nienaruszone, bezwzględny zakaz drewna w strefie otwartego produktu, rejestr szkła i tworzyw twardych.\n"
            f"3. **Czystość i mycie (CIP/Sanityzacja):** Brak zalegających resztek masy, czyste posadzki i kratki ściekowe, właściwa segregacja odpadów."
        )
    elif any(w in q_lower for w in ["ghp", "higiena personelu", "dobra praktyka higieniczn", "odzież"]):
        return (
            f"### 🧤 Standard GHP (Dobra Praktyka Higieniczna - IFS v8)\n"
            f"**Obszar:** {line}\n\n"
            f"1. **Śluzy sanitarne:** Obowiązkowe mycie i dezynfekcja rąk przed wejściem, maty dezynfekcyjne lub myjki obuwia roboczego.\n"
            f"2. **Odzież ochronna:** Czyste fartuchy, czepki zakrywające 100% włosów, osłony brody, bezwzględny zakaz biżuterii, zegarków i sztucznych paznokci.\n"
            f"3. **Stan zdrowia (PR15.01):** Obowiązek natychmiastowego zgłaszania infekcji pokarmowych; skaleczenia zabezpieczone niebieskim, wykrywalnym plastrem z metalem."
        )
    elif any(w in q_lower for w in ["ccp", "detektor", "metal", "odrzut", "fe", "ss", "non-fe"]):
        return (
            f"### 🚨 Wytyczne Krytyczne: Detektor Metali (CCP1)\n"
            f"**Wymóg:** Zgodność z procedurą weryfikacji wzorców Fe/Non-Fe/SS (IFS KO 2 & KO 6)\n\n"
            f"**Procedura w razie odchylenia:**\n"
            f"1. **Natychmiastowe zatrzymanie linii** i zabezpieczenie wyrobów wyprodukowanych od ostatniego poprawnego testu.\n"
            f"2. **Blokada magazynowa w ERP (Status HOLD)** na całą podejrzaną partię.\n"
            f"3. **Przegląd techniczny** głowicy detektora i ciśnienia pneumatyki odrzutnika.\n"
            f"4. **100% ponowna detekcja** partii wstrzymanej na sprawnym urządzeniu rezerwowym."
        )
    elif any(w in q_lower for w in ["zdrow", "pr15", "chorob", "infekcj", "wymiot", "gorącz", "plaster"]):
        return (
            f"### 🩺 Procedura PR15.01: Stan Zdrowia Personelu (IFS KO 3)\n"
            f"**Zasada nadrzędna:** Zero tolerancji dla objawów zakaźnych w strefie kontaktu z żywnością.\n\n"
            f"**Kroki postępowania:**\n"
            f"1. **Odsunięcie pracownika** z hali High Care do strefy socjalnej/lekarza.\n"
            f"2. **Kwarantanna 48h** od ustąpienia objawów żołądkowo-jelitowych.\n"
            f"3. **Dezynfekcja stanowiska** pracy oraz narzędzi.\n"
            f"4. Dopuszczenie ran wyłącznie pod warunkiem zabezpieczenia **niebieskim, wykrywalnym plastrem z paskiem metalowym**."
        )
    elif any(w in q_lower for w in ["ko", "knock-out", "knockout"]):
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
    
    # Domyślny uniwersalny briefing jakościowy
    return (
        f"### 🤖 Asystent Jakości IFS Food v8\n"
        f"**Obszar:** {line} | **Audytor:** {user_name}\n\n"
        f"Odpowiedź na zapytanie: *\"{user_msg}\"*\n\n"
        f"Zgodnie z wymaganiami normy IFS Food v8 i planu HACCP:\n"
        f"- Wszelkie odchylenia od parametrów nominalnych na tej linii podlegają natychmiastowej rejestracji w Raporcie Niezgodności.\n"
        f"- W przypadku zagrożenia bezpieczeństwa żywności wdrożyć procedurę wstrzymania wyrobu (Hold Lot).\n"
        f"- Jeśli potrzebujesz konkretnych zaleceń, zapytaj o: **awarię CCP1**, **procedurę PR15.01**, **punkty KO** lub kliknij **Odprawę przed wejściem na linię**."
    )