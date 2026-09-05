import os
import json
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

    return json.loads(text)


def sanitize_audit_vocabulary(text_list: List[str]) -> List[str]:
    cleaned = []
    hallucination_terms = [
        "sanityzacja głowicy ramienia", "pułapka rejestracyjna",
        "głowa ramienia", "weryfikacji rejestracji fizycznej",
        "przez 72 godziny", "omówionej partii", "odzieżowych"
    ]
    for item in text_list:
        if not any(term in item.lower() for term in hallucination_terms):
            cleaned.append(item)
    return cleaned


def get_recent_line_history(line_name: str, limit: int = 5) -> List[Dict[str, Any]]:
    if not os.path.exists(DB_PATH):
        return []
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, line, ccp1_fe_ok, ccp1_reject_ok, health_ok, 
                   gmp_cleanliness_ok, risk_level, slm_analysis, created_at
            FROM audits
            WHERE line = ?
            ORDER BY id DESC
            LIMIT ?
        """, (line_name, limit))
        rows = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return rows
    except Exception:
        return []


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
    line = line_name or audit_payload.get("line", "Linia ogólna")
    history = get_recent_line_history(line, limit=5)
    
    prompt = (
        f"Jesteś asystentem jakości SLM AI Co-Pilot (IFS Food v8, BRCGS v9, HACCP).\n"
        f"BIEŻĄCY AUDYT LINII: {line}\n"
        f"Dane: {json.dumps(audit_payload, ensure_ascii=False)}\n\n"
        f"OSTATNIE 5 ZDARZEŃ DLA TEJ LINII Z BAZY AUDYTS.DB:\n"
        f"{json.dumps(history, ensure_ascii=False, indent=2)}\n\n"
        f"Przeanalizuj ryzyko i podaj zwięzłe podsumowanie:\n"
        f"1. Werdykt i Poziom Ryzyka\n"
        f"2. Decyzja operacyjna (Hold Lot / Dispatch)\n"
        f"3. Działania korygujące i prewencja"
    )

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            res = await client.post(OLLAMA_API_URL, json={
                "model": MODEL_NAME,
                "prompt": prompt,
                "stream": False,
                "options": {"temperature": 0.1}
            })
            if res.status_code == 200:
                data = res.json()
                return data.get("response", "").strip()
    except (httpx.HTTPError, json.JSONDecodeError, Exception) as e:
        print(f"Error calling Ollama: {e}")

    ccp_err = any(str(audit_payload.get(k, "")).upper() == "NIEZGODNY" for k in ["ccp1_fe_ok", "ccp1_reject_ok"])
    if ccp_err:
        return (
            "### RAPORT SLM CO-PILOT (Rygor IFS Food v8)\n"
            "**1. Werdykt:** NOK | **Poziom Ryzyka:** KRYTYCZNE (HOLD LOT)\n"
            "**2. Decyzja:** Natychmiastowe zatrzymanie linii i wdrożenie procedury kwarantanny partii.\n"
            "**3. Akcje Korygujące:**\n"
            "- Zablokowanie partii wyrobów w systemie ERP od ostatniego poprawnego testu wzorców\n"
            "- Przegląd układu pneumatyki ramienia odrzucającego i pętli detektora metali"
        )
    return (
        "### RAPORT SLM CO-PILOT (Rygor IFS Food v8)\n"
        "**1. Werdykt:** OK | **Poziom Ryzyka:** NISKIE\n"
        "**2. Decyzja:** Zezwolenie na kontynuację operacji pakowania.\n"
        "**3. Zalecenia:** Utrzymanie planowego harmonogramu testów CCP co 2 godziny."
    )