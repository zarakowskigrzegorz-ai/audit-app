import os
import json
import sqlite3
import random
from typing import List, Dict, Any

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_NAME = os.path.join(BASE_DIR, "audits.db")

SYSTEM_PROMPT = (
    "Jesteś autonomicznym silnikiem wnioskowania jakościowego IFS Food v8 i BRCGS v9. "
    "Analizujesz dane z audytu produkcyjnego i zwracasz wyłącznie poprawny obiekt JSON "
    "z polami: status, poziom_ryzyka, decyzja, akcje_korygujace, podpowiedzi_prewencyjne."
)

SYNTHETIC_TEMPLATES = [
    {
        "clause": "IFS KO 2 & KO 6",
        "failures": ["ccp1_fe_ok: NIEZGODNY", "ccp1_reject_ok: NIEZGODNY"],
        "context": "Test wzorca Fe 1.5mm co 2h zakończony brakiem reakcji ramienia odrzucającego.",
        "ko_failed": True,
        "output": {
            "status": "NOK",
            "poziom_ryzyka": "KRYTYCZNE",
            "decyzja": "Wstrzymanie partii (Hold Lot). Zatrzymanie linii i blokada wyrobów od ostatniego poprawnego testu.",
            "akcje_korygujace": [
                "Zablokowanie w systemie ERP partii wyprodukowanej w ostatnich 2 godzinach",
                "Przegląd pneumatyki ramienia odrzutnika i weryfikacja czułości detektora",
                "Ponowne 100% przepuszczenie zatrzymanego asortymentu przez sprawny detektor rezerwowy"
            ],
            "podpowiedzi_prewencyjne": [
                "Skrócenie interwału weryfikacji wzorców do 1h do czasu kalibracji",
                "Kontrola stabilności napięcia zasilania głowicy detektora"
            ]
        }
    },
    {
        "clause": "IFS KO 3 (Higiena Personelu)",
        "failures": ["health_ok: NIE", "ppe_ok: ZGODNY"],
        "context": "Operator zgłosił objawy żołądkowe po wejściu przez śluzę do strefy High Care.",
        "ko_failed": True,
        "output": {
            "status": "NOK",
            "poziom_ryzyka": "KRYTYCZNE",
            "decyzja": "Natychmiastowe odsunięcie pracownika ze strefy produkcyjnej i wdrożenie kwarantanny PR15.01.",
            "akcje_korygujace": [
                "Skierowanie pracownika na 48-godzinną kwarantannę od ustąpienia objawów",
                "Pełna sanityzacja i dezynfekcja stanowiska roboczego operatora",
                "Wycofanie partii mającej bezpośredni kontakt z operatorem do badań mikrobiologicznych"
            ],
            "podpowiedzi_prewencyjne": [
                "Przeszkolenie brygadzistów z weryfikacji formularzy PR15.01 przed rozpoczęciem zmiany",
                "Audyt sprawności rejestracji wejść na śluzach High Care"
            ]
        }
    },
    {
        "clause": "IFS KO 6 / PR08",
        "failures": ["wood_policy_ok: NIEZGODNY", "gmp_wood_score: 1"],
        "context": "Wprowadzono uszkodzoną paletę drewnianą do strefy otwartego produktu (High Care).",
        "ko_failed": True,
        "output": {
            "status": "NOK",
            "poziom_ryzyka": "KRYTYCZNE",
            "decyzja": "Wstrzymanie strefy konfekcjonowania do czasu usunięcia drewna i inspekcji czystości.",
            "akcje_korygujace": [
                "Natychmiastowe usunięcie palety drewnianej ze strefy High Care na magazyn zewnętrzny",
                "Przeprowadzenie inspekcji wizualnej taśmociągu pod kątem drzazg i ciał obcych",
                "Przepakowanie surowców na atestowane palety plastikowe dedykowane strefie czystej"
            ],
            "podpowiedzi_prewencyjne": [
                "Instalacja fizycznych barier uniemożliwiających wjazd wózków z paletami drewnianymi",
                "Weryfikacja strefy przeładunkowej w śluzie materiałowej"
            ]
        }
    },
    {
        "clause": "IFS Klauzula 4.12.3",
        "failures": ["ccp3_sieve_ok: NIEZGODNY"],
        "context": "Stwierdzono pęknięcie siatki sita wibracyjnego 1.0mm podczas inspekcji międzyzmianowej.",
        "ko_failed": False,
        "output": {
            "status": "NOK",
            "poziom_ryzyka": "WYSOKIE",
            "decyzja": "Zatrzymanie dozowania surowca sypkiego. Blokada partii masy od poprzedniej kontroli sita.",
            "akcje_korygujace": [
                "Założenie blokady magazynowej (Hold Lot) na całą masę przetworzoną od ostatniego odbioru sita",
                "Wymiana wkładu sita wibracyjnego na nowy certyfikowany komponent",
                "Kontrola partii przy użyciu pułapki magnetycznej i dodatkowego przesiewania"
            ],
            "podpowiedzi_prewencyjne": [
                "Wdrożenie prewencyjnej wymiany siatek sit po określonej liczbie roboczogodzin",
                "Rejestrowanie grubości drutu sit w raportach TPM"
            ]
        }
    },
    {
        "clause": "IFS Food v8 Pełna Zgodność",
        "failures": [],
        "context": "Brak odchyleń. Wzorce CCP1 wykryte poprawnie, sita całe, odzież kompletna, czystość wzorowa.",
        "ko_failed": False,
        "output": {
            "status": "OK",
            "poziom_ryzyka": "NISKIE",
            "decyzja": "Linia spełnia wszystkie wymagania IFS Food v8. Zezwolenie na kontynuację produkcji.",
            "akcje_korygujace": [
                "Brak konieczności akcji natychmiastowych - stan stabilny"
            ],
            "podpowiedzi_prewencyjne": [
                "Utrzymanie standardowego interwału kontroli CCP co 2 godziny",
                "Prowadzenie rutynowych wpisów w karcie kontrolnej"
            ]
        }
    }
]

def format_user_prompt(line: str, shift: str, zone: str, failures: List[str], context: str, ko_flag: bool) -> str:
    status_ko = "ZŁAMANIE KRYTERIUM KNOCK-OUT (KO)" if ko_flag else "BRAK ZŁAMANIA KO"
    fail_str = "\n".join([f"- {f}" for f in failures]) if failures else "- Brak stwierdzonych niezgodności"
    return (
        f"DANE SESJI AUDYTOWEJ:\n"
        f"• Obszar: {line} | Zmiana: {shift} | Strefa: {zone}\n"
        f"• Status kryteriów KO: {status_ko}\n"
        f"• Raportowane niezgodności:\n{fail_str}\n"
        f"• Kontekst operacyjny: {context}\n\n"
        f"Przeprowadź ocenę ryzyka, podejmij decyzję jakościową oraz określ akcje korygujące i prewencyjne:"
    )

def build_dataset(target_count=300):
    lines = [
        ("Linia L1 (Masa Konszowanie)", "Wysoka Higiena (High Care)"),
        ("Linia L2 (Pakowanie Czekolady)", "Strefa Pakowania"),
        ("Linia L3 (Formowanie Pralin)", "Wysoka Higiena (High Care)")
    ]
    shifts = ["Zmiana A", "Zmiana B", "Zmiana C"]
    dataset = []

    for _ in range(target_count):
        tpl = random.choice(SYNTHETIC_TEMPLATES)
        line_info = random.choice(lines)
        shift = random.choice(shifts)
        prompt = format_user_prompt(line_info[0], shift, line_info[1], tpl["failures"], tpl["context"], tpl["ko_failed"])

        dataset.append({
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
                {"role": "assistant", "content": json.dumps(tpl["output"], ensure_ascii=False)}
            ]
        })

    random.shuffle(dataset)
    split_idx = int(len(dataset) * 0.9)
    train_set, val_set = dataset[:split_idx], dataset[split_idx:]

    with open("train.jsonl", "w", encoding="utf-8") as f:
        for item in train_set:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")
    with open("val.jsonl", "w", encoding="utf-8") as f:
        for item in val_set:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")

    print(f"Wygenerowano pomyślnie: train.jsonl ({len(train_set)}) oraz val.jsonl ({len(val_set)})")

if __name__ == "__main__":
    build_dataset()
