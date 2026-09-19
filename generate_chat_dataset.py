import os
import json
import random

# ==============================================================================
# BAZA ZMIENNYCH KOMBINATORYCZNYCH DO GENEROWANIA DIALOGÓW AUDYTORSKICH (IFS v8)
# ==============================================================================

ZONES = [
    {
        "id": "raw_materials",
        "name": "Strefa Przygotowania Surowców / Magazyn Surowców / Mieszalnik",
        "keywords": ["surowca", "surowce", "magazyn surowca", "silosy", "nawazalnia", "mieszalnik", "zasyp"],
        "is_raw": True
    },
    {
        "id": "forming",
        "name": "Strefa Formowania / Dozowania / Ekstrudery",
        "keywords": ["formowania", "formierka", "ekstruder", "glowica dozujaca", "matryce", "nalewak"],
        "is_raw": False
    },
    {
        "id": "thermal",
        "name": "Strefa Obróbki Termicznej / Piec Przelotowy / Smażalnik",
        "keywords": ["piec", "wypiek", "smazalnik", "obrobka termiczna", "pasteryzator"],
        "is_raw": False
    },
    {
        "id": "cooling",
        "name": "Strefa Chłodzenia / Tunel Chłodniczy (High Care)",
        "keywords": ["chlodzenie", "tunel chlodniczy", "chlodnia", "cooling", "strefa chlodzenia"],
        "is_raw": False
    },
    {
        "id": "packaging_ccp1",
        "name": "Strefa Pakowania Jednostkowego i Detektora Metali (CCP1)",
        "keywords": ["pakowanie", "detektor", "ccp1", "waga dynamiczna", "foliarka", "pakowaczka"],
        "is_raw": False
    },
    {
        "id": "secondary_packaging",
        "name": "Strefa Pakowania Zbiorczego / Kartonowanie / Etykietowanie",
        "keywords": ["kartonowanie", "kartoniarka", "etykietowanie", "paletyzacja", "pakowanie wtorne"],
        "is_raw": False
    },
    {
        "id": "hygiene_sluice",
        "name": "Śluza Sanitarna / Szatnia Czysta (GHP)",
        "keywords": ["sluza sanitarna", "szatnia", "wejscie na hale", "myjka obuwia", "dezynfekcja"],
        "is_raw": False
    },
    {
        "id": "general_conveyor",
        "name": "Transporter Główny / Taśma Produkcyjna Międzyoperacyjna",
        "keywords": ["tasma", "transporter", "przenosnik modulowy", "tasma transportowa"],
        "is_raw": False
    }
]

RAW_ISSUES = [
    {
        "desc": "rozerwany worek z surowcem, rozsypany proszek i widoczne zbrylenia",
        "user_phrases": [
            "rozerwany worek z maka i widac zbrylenia",
            "inny niz podane, rozerwany worek i dziwny zapach",
            "pekniety worek z cukrem, jest wilgotny",
            "uszkodzone opakowanie skrobi, czuc wilgoc i stechly zapach",
            "rozerwany worek z premiksem witaminowym"
        ],
        "risk": "Zagrożenie mikrobiologiczne, pleśń oraz utrata sterylności surowca (IFS Food v8 KO 4).",
        "clause": "IFS Food v8 p. 4.4.1 (KO 4 - Specyfikacje surowców)"
    },
    {
        "desc": "obecność żywych lub martwych szkodników/owadów w pobliżu palety z surowcem",
        "user_phrases": [
            "zauwazylem mole i larwy przy palecie z orzechami",
            "inny problem, chrabaszcz lazi po worku z maka",
            "slady szkodnikow na palecie z surowcem w magazynie",
            "odchody gryzoni w kacie magazynu surowcow"
        ],
        "risk": "Krytyczne naruszenie ochrony przed szkodnikami (Pest Control) - ryzyko biologiczne (IFS v8 KO 6).",
        "clause": "IFS Food v8 p. 4.13 (Ochrona przed szkodnikami - Pest Control)"
    },
    {
        "desc": "brak etykiety partii / numeru LOT / certyfikatu CoA dostawcy",
        "user_phrases": [
            "brak etykiety partii na worku z aromatem",
            "zamazana data przydatnosci i brak numeru lot na surowcu",
            "inny problem, paleta z surowcem nie ma zadnej etykiety identyfikacyjnej",
            "brak certyfikatu jakosci coa od dostawcy dla biezacej partii"
        ],
        "risk": "Utrata pełnej identyfikowalności i brak możliwości bilansu masowego (IFS KO 5).",
        "clause": "IFS Food v8 p. 4.18 (KO 5 - Identyfikowalność i bilans partii)"
    },
    {
        "desc": "drewniana uszkodzona paleta w strefie przygotowania surowca (zakaz drewna)",
        "user_phrases": [
            "drewniana polamana paleta wprowadzona do strefy czystej",
            "odlamki drewna leza kolo leja zasypowego",
            "dostawca przywiozl surowiec na zgnilej drewnianej palecie"
        ],
        "risk": "Ryzyko zanieczyszczenia fizycznego drzazgami drewna w strefie otwartego produktu (GMP 4.10).",
        "clause": "IFS Food v8 p. 4.10.1 (Zarządzanie ciałami obcymi i zakaz drewna)"
    }
]

CCP_ISSUES = [
    {
        "desc": "brak reakcji lub brak odrzutu wzorca Fe 1.5mm / Non-Fe 2.0mm / SS 2.5mm na detektorze",
        "user_phrases": [
            "brak reakcji detektora na wzorzec fe 1.5mm",
            "odrzutnik nie zrzucil wzorca ss 2.5mm",
            "detektor ccp1 nie dziala prawidlowo na tescie non-fe",
            "wzorzec testowy przeszedl przez glowice bez alarmu",
            "awaria ccp1, ramię odrzutnika nie ma cisnienia"
        ],
        "risk": "Awaria punktu krytycznego CCP1 – bezpośrednie zagrożenie przeoczenia ciała obcego (KO 2).",
        "clause": "IFS Food v8 p. 2.3.11 (KO 2 - Nadzór nad punktami krytycznymi CCP)"
    },
    {
        "desc": "przetarte lub pęknięte sito kontrolne / nasycony magnes neodymowy (oPRP/CCP)",
        "user_phrases": [
            "peknieta siatka w sicie wibracyjnym nad mieszalnikiem",
            "dziura w sicie kontrolnym o wielkosci 5mm",
            "magnes neodymowy caly oblepiony opilkami zelaza",
            "sito inspekcyjne ma przetarcia na laczeniach"
        ],
        "risk": "Przedostanie się ciał obcych o wielkości przekraczającej limit krytyczny (oPRP/CCP).",
        "clause": "IFS Food v8 p. 2.3.11 i p. 4.10 (Nadzór nad sitami i magnesami)"
    }
]

PHYSICAL_ISSUES = [
    {
        "desc": "stłuczka szkła lub twardego tworzywa sztucznego (klosz lampy, osłona z pleksi)",
        "user_phrases": [
            "rozbity klosz lampy oswietleniowej nad linia",
            "stluczka szkla w strefie otwartego produktu",
            "pekla oslona z pleksi i odlamki polecialy na tasme",
            "operator rozbil szklany sloik na hali"
        ],
        "risk": "Krytyczne zagrożenie zanieczyszczenia ostrymi odłamkami szkła/tworzywa (procedura PR15.01).",
        "clause": "IFS Food v8 p. 4.10.5 (Procedura pęknięć szkła i tworzyw twardych)"
    },
    {
        "desc": "odłamek niebieskiego plastiku z modułu taśmy lub uszczelki",
        "user_phrases": [
            "odlamal sie zabek z plastikowej tasmy modulowej",
            "znalazlem kawalek niebieskiego plastiku w masie",
            "peknieta uszczelka silikonowa przy glowicy nalewaka",
            "brak kawalka prowizorycznej plastikowej prowadnicy"
        ],
        "risk": "Zagrożenie fizyczne ciałem obcym w wyrobie gotowym (GMP 4.10).",
        "clause": "IFS Food v8 p. 4.10.2 (Konserwacja i stan techniczny tworzyw sztucznych)"
    },
    {
        "desc": "luźna metalowa śruba, nakrętka lub podkładka w pobliżu produktu",
        "user_phrases": [
            "wypadla sruba z oslony bocznej na tasme",
            "znalazlem metalowa podkladke w poblizu leja",
            "odkrecila sie nakretka ramienia i wpadla pod transporter"
        ],
        "risk": "Zagrożenie fizyczne metalem i ryzyko uszkodzenia urządzeń (IFS v8 GMP).",
        "clause": "IFS Food v8 p. 4.10.3 (Zabezpieczenie elementów złącznych maszyn)"
    }
]

CHEMICAL_ISSUES = [
    {
        "desc": "wyciek ciemnego oleju lub smaru z przekładni napędu taśmy",
        "user_phrases": [
            "wyciek oleju ze skrzyni przekladniowej",
            "czarny smar kapie z lozyska na oslone",
            "kapiacy olej nad transporterem produktu",
            "nieszczelnosc ukladu hydraulicznego silnika"
        ],
        "risk": "Zagrożenie chemiczne – zanieczyszczenie olejem przemysłowym (wymóg atestu NSF H1).",
        "clause": "IFS Food v8 p. 4.10.4 (Środki smarne i oleje dopuszczone do kontaktu z żywnością H1)"
    },
    {
        "desc": "pozostałość chemii myjącej / piany zasadowej po myciu CIP w rurociągu",
        "user_phrases": [
            "piana z chemii myjacej kapie z zaworu cip",
            "zapach chloru i kwasu myjacego w maszynie",
            "niedoplukany rurociag po nocnym myciu",
            "tester ph wykazuje silny odczyn zasadowy w plukance"
        ],
        "risk": "Zagrożenie poparzeniem chemicznym i skażenie wyrobu detergentem (IFS v8 GMP).",
        "clause": "IFS Food v8 p. 4.11 (Mycie i dezynfekcja CIP oraz walidacja płukania)"
    }
]

HYGIENE_ISSUES = [
    {
        "desc": "pracownik ze skaleczeniem / krwawiącą raną bez niebieskiego wykrywalnego plastra",
        "user_phrases": [
            "operator ma zaciety palec i zwykly bezowy plaster",
            "krew na rekawiczce pracownika pakowania",
            "pracownik nie ma niebieskiego plastra z paskiem metalowym",
            "skaleczony operator pracuje przy otwartym produkcie"
        ],
        "risk": "Zagrożenie mikrobiologiczne i biologiczne - krew w żywności (IFS KO 3 - PR15.01).",
        "clause": "IFS Food v8 p. 3.2.1 (KO 3 - Higiena personelu i skaleczenia)"
    },
    {
        "desc": "objawy infekcji pokarmowej u pracownika w strefie kontaktu z żywnością",
        "user_phrases": [
            "pracownik wymiotuje w toalecie przy hali",
            "operator zglosil ostra biegunke i goraczke",
            "chory pracownik z infekcja zoladkowa przyszedl na zmiane"
        ],
        "risk": "Krytyczne ryzyko epidemii patogenów (Norowirus, Salmonella) w żywności (IFS KO 3).",
        "clause": "IFS Food v8 p. 3.2.2 (Zgłaszanie chorób zakaźnych i kwarantanna 48h)"
    },
    {
        "desc": "biżuteria, zegarek, sztuczne rzęsy lub nieosłonięty zarost u pracownika",
        "user_phrases": [
            "operator ma obraczke i zegarek na reku",
            "pani na pakowaniu nosi sztuczne rzesy i tipsy",
            "brak oslony brody u pracownika z dlugim zarostem",
            "wlosy wystaja spod czepka ochronnego"
        ],
        "risk": "Naruszenie dyscypliny higienicznej i ryzyko ciała obcego w produkcie (GHP).",
        "clause": "IFS Food v8 p. 3.2.3 (Wymagania odzieży ochronnej i zakaz biżuterii)"
    }
]

CONTACT_ANSWERS_NO = [
    "nie mial kontaktu, wszystko zatrzymane na palecie",
    "brak kontaktu z produktem, wyciek byl na posadzke",
    "nie trafilo do leja, partia zostala odizolowana przed wsypaniem",
    "na szczescie produkt jest zamkniety w szczelnych opakowaniach",
    "nie mial kontaktu, tasma zostala natychmiast wylaczona",
    "odlamki spadly na oslone boczna, produkt czysty",
    "nie doszlo do kontaktu, pracownik zostal od razu odsuniety ze stanowiska"
]

CONTACT_ANSWERS_YES = [
    "niestety tak, produkt mial bezposredni kontakt z zanieczyszczeniem",
    "tak, olej nakapal bezposrednio na mase ciasta",
    "odlamki plastiku wpadly do leja zasypowego z surowcem",
    "worek byl wsypany do mieszalnika zanim zauwazono plesn",
    "tak, zanieczyszczona partia przeszla dalej na tasme produkcyjna",
    "wzorzec nie zostal odrzucony i produkty pojechaly do kartonowania"
]

def generate_single_dialogue(dialogue_id: int):
    zone_data = random.choice(ZONES)
    zone_name = zone_data["name"]
    zone_kw = random.choice(zone_data["keywords"])
    
    if zone_data["is_raw"]:
        cat_name, issues_pool = "RAW", RAW_ISSUES
    elif "ccp1" in zone_data["id"]:
        cat_name, issues_pool = random.choice([("CCP", CCP_ISSUES), ("PHYSICAL", PHYSICAL_ISSUES)])
    elif "hygiene" in zone_data["id"]:
        cat_name, issues_pool = "HYGIENE", HYGIENE_ISSUES
    else:
        cat_name, issues_pool = random.choice([("CHEMICAL", CHEMICAL_ISSUES), ("PHYSICAL", PHYSICAL_ISSUES), ("HYGIENE", HYGIENE_ISSUES)])
        
    issue = random.choice(issues_pool)
    user_issue_phrase = random.choice(issue["user_phrases"])
    
    style = random.choice([1, 2, 3])
    has_contact = random.choice([True, False])
    contact_reply = random.choice(CONTACT_ANSWERS_YES) if has_contact else random.choice(CONTACT_ANSWERS_NO)
    
    sys_prompt = (
        "Jesteś certyfikowanym audytorem wiodącym IFS Food v8, BRCGS v9 i HACCP. "
        "Działasz jako inteligentny, dociekliwy i intuicyjny Field Co-Pilot audytora jakości. "
        "Zawsze pamiętaj ustalenia z poprzednich pytań, nigdy nie powtarzaj tych samych pytań i wydawaj jednoznaczne decyzje CAPA / HOLD LOT."
    )
    
    messages = [{"role": "system", "content": sys_prompt}]
    
    if style == 1:
        openers = ["jest problem na tasmie", "mamy awarie na linii", "cos sie dzieje z jakoscia", "zgloszenie odchylenia", "potrzebuje wsparcia audytorskiego"]
        messages.append({"role": "user", "content": random.choice(openers)})
        messages.append({
            "role": "assistant",
            "content": f"### 🔍 Asystent Jakości IFS Food v8: Rejestracja Incydentu\nPrzyjąłem zgłoszenie. Aby właściwie zakwalifikować ryzyko:\n1. 📍 **W której dokładnie strefie linii występuje problem?**\n2. ⚠️ **Jaki jest wstępny charakter usterki?**"
        })
        messages.append({"role": "user", "content": f"strefa: {zone_kw}"})
        messages.append({
            "role": "assistant",
            "content": f"### 📍 Zarejestrowano Lokalizację: {zone_name}\nPrzyjąłem informację – obszar to **{zone_name}**.\n\nAby ocenić wpływ na produkt i konieczność procedury HOLD LOT:\n1. ⚠️ **Co dokładnie się tam dzieje?** (wyciek, ciało obce, surowiec, odchylenie parametru?)\n2. 🛑 **Czy taśma w tej sekcji została prewencyjnie zatrzymana?**"
        })
        messages.append({"role": "user", "content": user_issue_phrase})
        
    elif style == 2:
        zone_openers = [f"mam problem w sekcji {zone_kw}", f"strefa {zone_kw} zgloszenie", f"incydent: {zone_kw}"]
        messages.append({"role": "user", "content": random.choice(zone_openers)})
        messages.append({
            "role": "assistant",
            "content": f"### 📍 Zarejestrowano Lokalizację: {zone_name}\nObszar został zarejestrowany. Aby podjąć decyzję audytorską:\n1. ⚠️ **Opisz dokładnie charakter usterki w tym miejscu.**\n2. 📸 **Jeśli to możliwe, wykonaj zdjęcie telefonem.**"
        })
        messages.append({"role": "user", "content": user_issue_phrase})
        
    else:
        combo_openers = [
            f"w strefie {zone_kw}: {user_issue_phrase}",
            f"{zone_kw} - {user_issue_phrase}",
            f"zgloszenie dla {zone_kw}. {user_issue_phrase}"
        ]
        messages.append({"role": "user", "content": random.choice(combo_openers)})

    is_ccp = cat_name == "CCP"
    is_glass = "szkl" in user_issue_phrase or "lampa" in user_issue_phrase
    
    if is_ccp:
        messages.append({
            "role": "assistant",
            "content": (
                f"### 🚨 ALARM KRYTYCZNY: Awaria CCP1 (IFS KO 2)\n"
                f"**Lokalizacja:** {zone_name}\n"
                f"**Zdarzenie:** {issue['desc']}\n\n"
                f"**NATYCHMIASTOWA DECYZJA AUDYTORSKA: HOLD LOT**\n"
                f"1. 🛑 Natychmiastowe zatrzymanie linii produkcyjnej.\n"
                f"2. 🔒 Blokada w ERP (Status HOLD) wszystkich wyrobów od ostatniego zaliczonego testu wzorców.\n"
                f"3. 🛠️ Wezwanie UR do kontroli pneumatyki odrzutnika i pętli detektora.\n\n"
                f"👉 **Pytanie kluczowe:** Czy podejrzana partia została już fizycznie odizolowana i oznaczona czerwoną etykietą HOLD?"
            )
        })
        messages.append({"role": "user", "content": contact_reply})
        messages.append({
            "role": "assistant",
            "content": (
                f"✅ **Przyjęto potwierdzenie zabezpieczenia partii.**\n\n"
                f"**Dalsze kroki zwolnienia linii (IFS v8 KO 2 / KO 6):**\n"
                f"- Po kalibracji przez UR wykonaj trzykrotny test wzorcami Fe, Non-Fe i SS.\n"
                f"- Wstrzymana partia podlega w 100% powtórnej detekcji na sprawnym urządzeniu rezerwowym.\n"
                f"- Wymagany wpis do Raportu Niezgodności i podpis Kierownika Jakości."
            )
        })
    elif is_glass:
        messages.append({
            "role": "assistant",
            "content": (
                f"### 🚨 ALARM KRYTYCZNY: Procedura Stłuczkowa PR15.01 (IFS v8)\n"
                f"**Lokalizacja:** {zone_name}\n\n"
                f"**DECYZJA AUDYTORSKA: WDROŻENIE PROCEDURY STŁUCZKOWEJ**\n"
                f"1. 🛑 Natychmiastowy stop linii w promieniu min. 5 metrów od miejsca pęknięcia.\n"
                f"2. 🗑️ Wszystkie otwarte produkty w strefie zagrożenia podlegają bezwzględnej utylizacji.\n"
                f"3. 🧹 Użycie dedykowanego zestawu do stłuczek (czerwona szczotka, odkurzacz HEPA).\n\n"
                f"👉 **Pytanie kluczowe:** Czy zabezpieczono już strefę 5 metrów i czy odłamki miały kontakt z produktem?"
            )
        })
        messages.append({"role": "user", "content": contact_reply})
        messages.append({
            "role": "assistant",
            "content": (
                f"✅ **Zatwierdzono realizację procedury PR15.01.**\n\n"
                f"**Warunki ponownego uruchomienia linii (Line Clearance):**\n"
                f"1. Kontrola obuwia i odzieży personelu obecnego przy zdarzeniu.\n"
                f"2. Wpis do zakładowego Rejestru Pęknięć Szkła i Tworzyw Twardych.\n"
                f"3. Wizualny odbiór czystości taśmy przez Lidera Zmiany lub Kontrolera Jakości."
            )
        })
    else:
        messages.append({
            "role": "assistant",
            "content": (
                f"### ⚠️ Kwalifikacja Ryzyka: {zone_name}\n"
                f"**Zdarzenie:** {issue['desc']}\n"
                f"**Standard:** {issue['clause']}\n"
                f"**Ryzyko:** {issue['risk']}\n\n"
                f"**Zalecenia natychmiastowe:**\n"
                f"1. 🛑 Wstrzymaj proces w sekcji {zone_name}.\n"
                f"2. 🔒 Wdróż bufor kwarantanny (status HOLD) na podejrzaną partię.\n\n"
                f"👉 **Kluczowe pytanie do oceny skali blokady:**\n"
                f"Czy zanieczyszczenie/usterka miała bezpośredni kontakt z otwartym produktem/surowcem, czy została zatrzymana na zewnątrz?"
            )
        })
        messages.append({"role": "user", "content": contact_reply})
        
        if has_contact:
            messages.append({
                "role": "assistant",
                "content": (
                    f"### 🚨 DECYZJA AUDYTORSKA: Wstrzymanie Partii (HOLD LOT)\n"
                    f"Potwierdzono kontakt ze źródłem skażenia. Zgodnie z normą IFS Food v8:\n\n"
                    f"**Akcje korygujące (CAPA):**\n"
                    f"1. 🛑 Całkowita blokada magazynowa wyrobów i surowców mających kontakt ze skażeniem (utylizacja/zwrot do dostawcy).\n"
                    f"2. 🏷️ Fizyczne oznakowanie czerwoną etykietą HOLD i blokada w ERP.\n"
                    f"3. 🧼 Mycie, odtłuszczenie i pełna sanityzacja strefy **{zone_name}**.\n"
                    f"4. 🔬 Weryfikacja czystości testem ATP lub wymazem mikrobiologicznym przed wznowieniem."
                )
            })
        else:
            messages.append({
                "role": "assistant",
                "content": (
                    f"### ✅ Podsumowanie Audytorskie: Zabezpieczenie Procesu\n"
                    f"Bezpośredni kontakt z wyrobem został wykluczony. Zminimalizowano ryzyko skażenia partii gotowej (IFS Food v8 GMP).\n\n"
                    f"**Zalecenia do wznowienia pracy (Line Clearance):**\n"
                    f"1. 🔧 Usunięcie przyczyny źródłowej usterki przez UR lub wymiana partii surowca.\n"
                    f"2. 🧼 Oczyszczenie strefy **{zone_name}** atestowanym środkiem myjącym.\n"
                    f"3. 📋 Odnotowanie incydentu w Dzienniku Zmianowym i protokolarne zwolnienie przez Lidera Jakości."
                )
            })
            
    return {"messages": messages}

def main():
    TOTAL_SAMPLES = 2000
    TRAIN_COUNT = 1800
    VAL_COUNT = 200
    
    print(f"🚀 Rozpoczynam generowanie {TOTAL_SAMPLES} wieloturowych dialogów audytorskich IFS Food v8...")
    
    dataset = []
    for i in range(TOTAL_SAMPLES):
        dialogue = generate_single_dialogue(i)
        dataset.append(dialogue)
        
    random.shuffle(dataset)
    train_data = dataset[:TRAIN_COUNT]
    val_data = dataset[TRAIN_COUNT:]
    
    base_dir = os.path.dirname(os.path.abspath(__file__))
    train_path = os.path.join(base_dir, "chat_train.jsonl")
    val_path = os.path.join(base_dir, "chat_val.jsonl")
    
    with open(train_path, "w", encoding="utf-8") as f:
        for item in train_data:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")
            
    with open(val_path, "w", encoding="utf-8") as f:
        for item in val_data:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")
            
    train_size_mb = os.path.getsize(train_path) / (1024 * 1024)
    val_size_mb = os.path.getsize(val_path) / (1024 * 1024)
    
    print(f"✅ Zakończono sukcesem!")
    print(f"📦 Zbiór treningowy: {train_path} -> {len(train_data)} dialogów ({train_size_mb:.2f} MB)")
    print(f"📦 Zbiór walidacyjny: {val_path} -> {len(val_data)} dialogów ({val_size_mb:.2f} MB)")
    
if __name__ == "__main__":
    main()
