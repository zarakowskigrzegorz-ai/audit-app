import os
import json
import random
from typing import Dict, Any, List

# ==============================================================================
# 1. MATRYCA TECHNOLOGICZNA STREF
# ==============================================================================

TECH_ZONES = [
    {
        "id": "raw_materials_silos",
        "name": "Magazyn Surowców, Silosy i Naważalnia",
        "type": "RAW",
        "allowed_ccp_oprp": ["Sita wibracyjne (oPRP)", "Pułapki magnetyczne (oPRP)"],
        "user_openers": [
            "jestem na magazynie surowcow i nawazalni",
            "sekcja silosow i dozowania surowca",
            "strefa przyjecia surowcow i mieszalnikow",
            "magazyn glowny komponentow sypkich",
            "stanowisko nawazalni surowcow"
        ]
    },
    {
        "id": "processing_thermal",
        "name": "Strefa Obróbki Termicznej, Pasteryzator i Formierka",
        "type": "PROCESS",
        "allowed_ccp_oprp": ["Pasteryzator / Piec (CCP2 - Czas/Temperatura)", "Filtry cieczy (oPRP)"],
        "user_openers": [
            "strefa pasteryzacji i obrobki termicznej",
            "sekcja formowania i pieca przelotowego",
            "obszar glowicy dozujacej i pasteryzatora",
            "stanowisko obrobki cieplnej masy"
        ]
    },
    {
        "id": "cooling_high_care",
        "name": "Tunel Chłodniczy i Strefa Wysokiego Ryzyka (High Care)",
        "type": "HIGH_CARE",
        "allowed_ccp_oprp": ["Filtracja powietrza HEPA (GHP)", "Wymiennik chłodniczy"],
        "user_openers": [
            "tunel chlodniczy sekcja high care",
            "strefa chlodzenia przed pakowaniem",
            "obszar czysty po wyjsciu z chlodni"
        ]
    },
    {
        "id": "primary_packaging_ccp1",
        "name": "Strefa Pakowania Pierwotnego i Detekcji Metali (CCP1)",
        "type": "PACKAGING_PRIMARY",
        "allowed_ccp_oprp": ["Detektor metali (CCP1)", "Waga dynamiczna (QCP)", "Zgrzewarka"],
        "user_openers": [
            "strefa pakowania pierwotnego i detektor metali",
            "sekcja detektora ccp1 przy pakowaczce",
            "linia pakowania jednostkowego i odrzutnik ccp1",
            "stanowisko kontroli ccp1 na pakowaniu"
        ]
    },
    {
        "id": "secondary_packaging",
        "name": "Strefa Pakowania Wtórnego, Kartonowanie i Paletyzacja",
        "type": "PACKAGING_SECONDARY",
        "allowed_ccp_oprp": ["Drukarka kodów i etykieciarka (oPRP - Alergeny/LOT)", "Owijarka palet"],
        "user_openers": [
            "pakowanie wtorne i kartonowanie",
            "sekcja etykietowania kartonow zbiorczych",
            "strefa paletyzacji i owijarki",
            "koniec linii strefa kartoniarki"
        ]
    },
    {
        "id": "machine_infrastructure",
        "name": "Infrastruktura Maszynowa i Napędy Przenośników",
        "type": "SAFETY_BHP",
        "allowed_ccp_oprp": ["Wyłączniki awaryjne E-STOP", "Osłony krańcowe napędów", "Kurtyny optyczne"],
        "user_openers": [
            "konstrukcja napedu glownego transportera",
            "panel zasilania i wylacznik awaryjny e-stop",
            "oslona mechaniczna motoreduktora linii",
            "bramka bezpieczenstwa z kurtyna swietlna"
        ]
    }
]

# ==============================================================================
# 2. ENCYJNA MATRYCA INCYDENTÓW Z PRZYPISANIEM SPLITU (TRAIN / VAL / TEST)
# ==============================================================================

# split_assignment:
# 'TRAIN' -> wyłącznie w train (80% puli)
# 'VAL'   -> wyłącznie w validation (10% puli - nieznane w train, test generalizacji w trakcie nauki)
# 'TEST'  -> wyłącznie w test (10% puli - ślepy test końcowy)

INCIDENTS_DATABASE = [
    # ------------------ TRAIN ONLY INCIDENTS (80%) ------------------
    {
        "incident_id": "INC_TR_01",
        "split_target": "TRAIN",
        "name": "Awaria detektora metali (brak odrzutu Fe/Non-Fe/SS)",
        "compatible_zones": ["primary_packaging_ccp1"],
        "defect_name": "brak odrzutu wzorca testowego na detektorze metali (CCP1)",
        "user_defect_phrases": [
            "detektor metali nie odrzucil wzorca testowego Non-Fe 2.0mm",
            "brak reakcji odrzutnika na wzorzec SS 2.5mm podczas rutynowego testu",
            "wzorzec testowy Fe przeszedl przez glowice bez sygnalu alarmowego"
        ],
        "is_safety_bhp": False,
        "is_ifs_ko": True,
        "ko_clause": "IFS Food v8 KO 2 (Nadzór nad CCP)",
        "risk_category": "Zagrożenie fizyczne - obecność metalu w wyrobie gotowym.",
        "contact_yes": ["produkty po niezdanym tescie pojechaly dalej na kartonowanie", "okolo 30 opakowan zjechalo do kartoniarki przed wylaczeniem"],
        "contact_no": ["weryfikacja byla robiona na biegu jalowym bez wyrobu", "tasma zatrzymana natychmiast przed partia"],
        "capa_contact": [
            "Zatrzymanie podawania wyrobów i natychmiastowa blokada systemowa w ERP (status HOLD) partii od ostatniego poprawnego testu.",
            "Oklejenie palet czerwonymi taśmami kwarantanny jakościowej z numerem incydentu CAPA.",
            "Interwencja UR: kalibracja czułości pętli detektora i kontrola ciśnienia siłownika odrzutnika.",
            "Po naprawie i trzykrotnej walidacji wzorcami: 100% ponowna detekcja (reprocessing) wstrzymanej partii."
        ],
        "capa_no_contact": [
            "Wstrzymanie startu linii do czasu usunięcia usterki układu odrzutu przez UR.",
            "Wymiana elektrozaworu pneumatycznego i trzykrotny test wzorcami Fe, Non-Fe oraz SS.",
            "Wpis do rejestru kontroli CCP1 i zwolnienie stanowiska przez Kontrolera Jakości."
        ]
    },
    {
        "incident_id": "INC_TR_02",
        "split_target": "TRAIN",
        "name": "Stłuczka osłony z pleksi / klosza lampy",
        "compatible_zones": ["primary_packaging_ccp1", "processing_thermal"],
        "defect_name": "pęknięcie osłony z pleksi nad transporterem",
        "user_defect_phrases": [
            "pekla przezroczysta oslona z pleksi nad transporterem i sa drobne odlamki",
            "pekniecie klosza swietlowki nad otwarta strefa wyrobu"
        ],
        "is_safety_bhp": False,
        "is_ifs_ko": False,
        "ko_clause": "IFS Food v8 p. 4.12 (Procedura stłuczkowa)",
        "risk_category": "Krytyczne zagrożenie fizyczne - ostre odłamki szkła lub twardego tworzywa.",
        "contact_yes": ["odlamki tworzywa wpadly bezposrednio do otwartych opakowan na tasmie", "widac kawalki plastiku na wierzchu ciasta"],
        "contact_no": ["odlamki spadly na zewnatrz na posadzke, produkt pod zadaszeniem nienaruszony", "transporter byl pusty przed szarza"],
        "capa_contact": [
            "Natychmiastowy stop linii i wyznaczenie strefy kwarantanny w promieniu min. 5 metrów od pęknięcia.",
            "Bezwzględna utylizacja wszystkich otwartych wyrobów w strefie zagrożenia (bezwzględny zakaz sortowania).",
            "Sprzątanie wyłącznie dedykowanym sprzętem stłuczkowym (czerwone szczotki) i odkurzaczem z filtrem HEPA.",
            "Inspekcja obuwia personelu, wpis do Rejestru Pęknięć Szkła i pisemny odbiór przed wznowieniem."
        ],
        "capa_no_contact": [
            "Zabezpieczenie odłamków zestawem stłuczkowym w promieniu 3 metrów.",
            "Wizualna inspekcja taśmy pod kątem mikroskopijnych odprysków tworzywa.",
            "Wymiana uszkodzonej osłony na nowy atestowany element i zwolnienie linii."
        ]
    },
    {
        "incident_id": "INC_TR_03",
        "split_target": "TRAIN",
        "name": "Zanieczyszczenie alergenem (gluten w bezglutenowym)",
        "compatible_zones": ["raw_materials_silos", "secondary_packaging"],
        "defect_name": "skażenie krzyżowe glutenem lub błędne oznakowanie alergenu",
        "user_defect_phrases": [
            "do leja z surowcem bezglutenowym wsypano worek maki pszennej",
            "na etykiecie brakuje deklaracji o zawartosci glutenu"
        ],
        "is_safety_bhp": False,
        "is_ifs_ko": True,
        "ko_clause": "IFS Food v8 KO 5 (Alergeny i identyfikowalność)",
        "risk_category": "Zagrożenie zdrowotne - niezadeklarowany alergen (ryzyko anafilaksji).",
        "contact_yes": ["surowiec zostal juz wymieszany z partia glowna w silosie zasypowym", "wyroby wyjechaly na magazyn dystrybucyjny"],
        "contact_no": ["operator zauwazyl blad przed rozcieciem worka i nie wsypal do leja", "zbiornik byl pusty, surowiec wstrzymany na palecie"],
        "capa_contact": [
            "Wstrzymanie procesu i status HOLD LOT na całą zanieczyszczoną szarżę w systemie ERP.",
            "Fizyczna kwarantanna w wydzielonym magazynie (uruchomienie procedury withdraw/recall).",
            "Testy paskowe lateral flow na obecność białek alergennych na powierzchniach urządzeń.",
            "Pełne mycie dekontaminacyjne instalacji środkiem zasadowym przed kolejną szarżą."
        ],
        "capa_no_contact": [
            "Izolacja błędnego worka surowca i odesłanie do strefy zwrotów do dostawcy.",
            "Weryfikacja procedury skanowania kodów kreskowych surowców na naważalni.",
            "Zezwolenie na kontynuację naważania po weryfikacji przez Kontrolera Jakości."
        ]
    },
    {
        "incident_id": "INC_TR_04",
        "split_target": "TRAIN",
        "name": "Zasadowe pH popłuczyn po myciu CIP",
        "compatible_zones": ["processing_thermal"],
        "defect_name": "niedopłukana instalacja CIP / obecność resztek detergentu",
        "user_defect_phrases": [
            "tester pH wykazal silny odczyn zasadowy w wodzie z ostatniego plukania CIP",
            "zapach detergentu myjacego i piana na dnie pasteryzatora"
        ],
        "is_safety_bhp": False,
        "is_ifs_ko": True,
        "ko_clause": "IFS Food v8 KO 3 (Higiena i mycie instalacji)",
        "risk_category": "Zagrożenie chemiczne - poparzenie detergentem zasadowym.",
        "contact_yes": ["produkt zostal wpuszczony do rurociagu zanim zbadano odczyn popluczyn", "piana myjaca zmieszala sie z pasteryzowana masa"],
        "contact_no": ["zawory zasilania masy byly zamkniete, wykryto resztki przed rozruchem", "kontrola odczynnika nastapila przed podaniem surowca"],
        "capa_contact": [
            "Natychmiastowe zatrzymanie linii i zrzut skażonej partii masy do neutralizacji i utylizacji.",
            "Blokada HOLD LOT w ERP na całą objętość obecną w instalacji.",
            "Ponowne płukanie wodą uzdatnioną ze stałym monitoringiem konduktometrem i pehametrem.",
            "Pobranie prób laboratoryjnych, miareczkowanie popłuczyn i formalne zwolnienie przez Laboratorium."
        ],
        "capa_no_contact": [
            "Wstrzymanie startu i powtórny cykl płukania CIP do uzyskania obojętnego pH (6.5 - 7.5).",
            "Miareczkowanie popłuczyn oraz powtórny test czystości ATP.",
            "Dopuszczenie do rozruchu po wpisie do Karty Mycia i Sanityzacji."
        ]
    },
    {
        "incident_id": "INC_TR_05",
        "split_target": "TRAIN",
        "name": "Awaria wyłącznika awaryjnego E-STOP (BHP)",
        "compatible_zones": ["machine_infrastructure"],
        "defect_name": "awaria przycisku awaryjnego E-STOP na ramie napędu",
        "user_defect_phrases": [
            "przycisk awaryjny e-stop na ramie transportera jest pekniety i nie odbija",
            "wylamany rygiel w oslonie krancowej motoreduktora glownego"
        ],
        "is_safety_bhp": True,
        "is_ifs_ko": False,
        "ko_clause": "BHP / Dyrektywa Maszynowa 2006/42/WE",
        "risk_category": "Zagrożenie wypadkowe BHP - brak funkcji zatrzymania awaryjnego.",
        "contact_yes": ["brak zanieczyszczenia wyrobu, to wylacznie usterka ukladu bezpieczenstwa maszynowego", "produkt jest zamkniety, usterka dotyczy pulpitu operatora"],
        "contact_no": ["brak kontaktu z produktem, usterka obwodu sterowniczego e-stop", "stanowisko poza strefa kontaktu z zywnoscia"],
        "capa_contact": [
            "Natychmiastowy stop linii i wdrożenie procedury blokady zasilania LOTO (Lockout/Tagout).",
            "Powiadomienie Służby BHP i UR w celu pilnej wymiany modułu wyłącznika E-STOP.",
            "BRAK BLOKADY JAKOŚCIOWEJ ŻYWNOŚCI (BRAK HOLD LOT): Wyrób spożywczy nienaruszony, partia zwolniona.",
            "Po wymianie: test pętli bezpieczeństwa SIL/PL, zdjęcie LOTO i podpisanie odbioru technicznego."
        ],
        "capa_no_contact": [
            "Procedura LOTO (odcięcie zasilania głównego) i wezwanie automatyka UR.",
            "Wymiana grzybka awaryjnego E-STOP na nowy atestowany element bezpieczeństwa.",
            "Brak procedury HOLD LOT dla wyrobu spożywczego (czysta niezgodność BHP/maszynowa).",
            "Odbiór techniczny sprawności obwodu bezpieczeństwa przed wznowieniem pracy."
        ]
    },

    # ------------------ VALIDATION ONLY INCIDENTS (10% - ZUPEŁNIE NOWE WADY) ------------------
    {
        "incident_id": "INC_VAL_01",
        "split_target": "VAL",
        "name": "Pęknięcie rurki teflonowej (PTFE) w module dozowania",
        "compatible_zones": ["processing_thermal"],
        "defect_name": "pęknięcie i wykruszenie rurki teflonowej (PTFE) układu dozowania",
        "user_defect_phrases": [
            "pekla biala rurka teflonowa w glowicy dozujacej i brakuje jej fragmentu",
            "odlamal sie kawalek rurki z teflonu PTFE przy zaworze nalewaka",
            "wykruszenie scianki rurki teflonowej nad linia dozowania"
        ],
        "is_safety_bhp": False,
        "is_ifs_ko": False,
        "ko_clause": "IFS Food v8 p. 4.12 (Ciała obce niemagnetyczne / tworzywa)",
        "risk_category": "Zagrożenie fizyczne - odłamek teflonu PTFE (niewykrywalny przez standardowy detektor metali).",
        "contact_yes": ["brakujacy fragment teflonu wpadl do leja z plynna masa produktu", "czesci rurki nie znaleziono na zewnatrz, prawdopodobnie jest w masie"],
        "contact_no": ["rurka pekla zewnetrznie w instalacji pneumatyki poza strefa produktu", "odlamany element teflonowy zostal w calosci odzyskany na tacy ociekowej"],
        "capa_contact": [
            "Natychmiastowe zatrzymanie linii dozującej i blokada magazynowa HOLD LOT całej szarży produkcyjnej.",
            "Z uwagi na niewykrywalność teflonu PTFE na detektorze metali: bezwzględny nakaz 100% inspekcji rentgenowskiej (X-Ray) lub mechanicznego przesiania masy.",
            "Wymiana przewodów teflonowych na certyfikowane węże zbrojone z certyfikatem FDA/UE do kontaktu z żywnością.",
            "Walidacja bilansu masy fragmentu uszkodzonego teflonu przed podjęciem decyzji o zwolnieniu partii przez Managera Jakości."
        ],
        "capa_no_contact": [
            "Wstrzymanie modułu dozowania i wymiana przewodu teflonowego przez mechanika UR.",
            "Dopasowanie długości i zabezpieczenie przed naprężeniami mechanicznymi zginania.",
            "Weryfikacja braku ciał obcych na stanowisku i odbiór higieniczny (Line Clearance)."
        ]
    },
    {
        "incident_id": "INC_VAL_02",
        "split_target": "VAL",
        "name": "Wyciek glikolu chłodniczego w tunelu chłodzenia",
        "compatible_zones": ["cooling_high_care"],
        "defect_name": "wyciek glikolu z nieszczelnej chłodnicy w tunelu chłodniczym",
        "user_defect_phrases": [
            "kapie zielonkawy plyn z wymiennika chlodniczego w tunelu chlodzenia",
            "wyciek glikolu chlodniczego na tasmociag w strefie high care",
            "czuc slodkawy zapach glikolu i widac krople nad otwarta linia wyrobu"
        ],
        "is_safety_bhp": False,
        "is_ifs_ko": True,
        "ko_clause": "IFS Food v8 KO 4 (Zanieczyszczenie chemiczne czynnikami chłodniczymi)",
        "risk_category": "Krytyczne zagrożenie chemiczne i toksykologiczne - skażenie żywności glikolem.",
        "contact_yes": ["glikol kapal bezposrednio na niespakowane produkty zjezdzajace z pieca", "mokre plamy z glikolu sa widoczne na powierzchni wyrobow"],
        "contact_no": ["wyciek byl pod rampa wymiennika do studzienki sciekowej poza produktem", "tunel byl pusty w trakcie przerwy sanitarno-technicznej"],
        "capa_contact": [
            "Alarmowe zatrzymanie wentylacji i taśmy tunelu chłodniczego oraz natychmiastowy HOLD LOT.",
            "Bezwzględna utylizacja wszystkich produktów obecnych w tunelu w momencie wystąpienia wycieku (zagrożenie toksyczne).",
            "Zabezpieczenie instalacji przez chłodnictwo UR, próba szczelności azotem i naprawa wymiennika.",
            "Mycie chemiczne i neutralizacja powierzchni tunelu z weryfikacją popłuczyn przed ponownym rozruchem."
        ],
        "capa_no_contact": [
            "Wstrzymanie podawania wyrobów do tunelu do momentu usunięcia nieszczelności instalacji glikolowej.",
            "Odtłuszczenie i dezynfekcja strefy wokół tacy ociekowej chłodnicy.",
            "Pisemny odbiór szczelności instalacji chłodniczej przez Kierownika Utrzymania Ruchu."
        ]
    },

    # ------------------ TEST ONLY INCIDENTS (10% - ŚLEPY TEST KOŃCOWY) ------------------
    {
        "incident_id": "INC_TEST_01",
        "split_target": "TEST",
        "name": "Wykruszenie grafitowego pierścienia dławicy pompy",
        "compatible_zones": ["processing_thermal", "raw_materials_silos"],
        "defect_name": "wykruszenie pierścienia grafitowego uszczelnienia mechanicznego pompy",
        "user_defect_phrases": [
            "czarne drobinki grafitu w masie po przejsciu przez pompe cyrkulacyjna",
            "wykruszyl sie grafitowy pierscien uszczelnienia walu mieszadla",
            "widac pyl grafitowy i drobne okruchy w filtrze liniowym pompy"
        ],
        "is_safety_bhp": False,
        "is_ifs_ko": False,
        "ko_clause": "IFS Food v8 p. 4.12 (Ciała obce niemagnetyczne / minerały)",
        "risk_category": "Zagrożenie fizyczne - twarde cząstki grafitu/węgla technicznego w masie żywnościowej.",
        "contact_yes": ["pyl grafitowy zmieszal sie z calym zbiornikiem buforowym masy", "okruchy grafitu przeszly przez pompe do formierki wyrobu"],
        "contact_no": ["filtr szczelinowy 200 mikronow zatrzymal wszystkie czastki przed zbiornikiem", "pompa pracowala na obiegu zamknietym wody technologicznej"],
        "capa_contact": [
            "Natychmiastowe wstrzymanie pompowania i blokada HOLD LOT w ERP całej masy w zbiorniku buforowym.",
            "Demontaż pompy i weryfikacja stopnia degradacji uszczelnienia grafitowego przez UR.",
            "Konieczność 100% filtracji masy przez filtr workowy lub komisyjna utylizacja szarży w razie przekroczenia limitu zanieczyszczeń.",
            "Wymiana dławicy na uszczelnienie z węglika krzemu (SiC) o podwyższonej odporności mechanicznej."
        ],
        "capa_no_contact": [
            "Zatrzymanie pompy i czyszczenie filtra liniowego z inspekcją zanieczyszczeń.",
            "Wymiana uszczelnienia mechanicznego na nowe przed podaniem surowca do procesu.",
            "Wprowadzenie dodatkowego punktu kontroli wizualnej na filtrze przez operatora."
        ]
    },
    {
        "incident_id": "INC_TEST_02",
        "split_target": "TEST",
        "name": "Zanieczyszczenie alergenem gorczycy w naważalni",
        "compatible_zones": ["raw_materials_silos"],
        "defect_name": "rozsypanie proszku gorczycy w pobliżu otwartych premiksów bezalergenowych",
        "user_defect_phrases": [
            "peknal worek z gorczyca i pyl osiadl na otwartych pojemnikach z przyprawa bezalergenowa",
            "zanieczyszczenie krzyzowe pylem gorczycowym na stanowisku nawazania",
            "pracownik uzyl tej samej szufelki do gorczycy i do mieszanki bezalergenowej"
        ],
        "is_safety_bhp": False,
        "is_ifs_ko": True,
        "ko_clause": "IFS Food v8 KO 5 (Alergeny i identyfikowalność)",
        "risk_category": "Zagrożenie zdrowotne - skażenie krzyżowe alergenem gorczycy (aneks II UE 1169/2011).",
        "contact_yes": ["szufelka z gorczyca zostala uzyta bezposrednio w zbiorniku premiksu", "pyl gorczycowy dostal sie do otwartej partii surowca"],
        "contact_no": ["pojemniki z surowcem byly szczelnie zamkniete pokrywami w momencie rozsypania", "rozsypany proszek byl na posadzce z dala od otwartego produktu"],
        "capa_contact": [
            "Natychmiastowa blokada HOLD LOT wszystkich zanieczyszczonych pojemników z surowcem na naważalni.",
            "Utylizacja skażonego surowca bezalergenowego z wpisem do rejestru strat jakościowych.",
            "Sprzątanie na sucho odkurzaczem przemysłowym z filtrem HEPA (zakaz zamiatania miotłą tworzącego aerozol alergenny).",
            "Wymazy paskowe na obecność białek gorczycy na wagach i szuflach przed wznowieniem naważania."
        ],
        "capa_no_contact": [
            "Odkurzenie posadzki odkurzaczem z filtrem HEPA i mycie na mokro strefy naważalni.",
            "Weryfikacja procedury dedykowanych kolorystycznie szufelek do surowców alergennych (np. żółte dla gorczycy).",
            "Zwolnienie stanowiska naważalni po odbiorze czystości przez Kontrolera Jakości."
        ]
    },
    {
        "incident_id": "INC_TEST_03",
        "split_target": "TEST",
        "name": "Naruszenie kurtyny optycznej strefy paletyzatora (BHP)",
        "compatible_zones": ["machine_infrastructure", "secondary_packaging"],
        "defect_name": "usterka kurtyny optycznej / czujników optoelektronicznych paletyzatora",
        "user_defect_phrases": [
            "kurtyna swietlna paletyzatora nie wylacza robota po przekroczeniu strefy przez czlowieka",
            "zasyfiona lub uszkodzona kurtyna optyczna przy wejsciu do celi paletyzacji",
            "brak reakcji bramki bezpieczenstwa na przerwanie wiazki podczerwieni"
        ],
        "is_safety_bhp": True,
        "is_ifs_ko": False,
        "ko_clause": "BHP / Dyrektywa Maszynowa PN-EN ISO 13849-1 (Funkcje bezpieczeństwa)",
        "risk_category": "Krytyczne zagrożenie wypadkowe BHP - ryzyko zmiażdżenia przez robota paletyzującego.",
        "contact_yes": ["brak kontaktu z produktem, palety sa zafoliowane, usterka dotyczy bezpieczenstwa celi robota", "chodzi o bezpieczenstwo operatora, produkt jest bezpieczny na palecie"],
        "contact_no": ["brak wplywu na wyrob spozywczy, usterka wylacznie w optyce bezpieczenstwa maszyny", "strefa robocza poza kontaktem z zywnoscia"],
        "capa_contact": [
            "Natychmiastowe zatrzymanie automatyczne celi paletyzatora i założenie blokady kłódkowej LOTO.",
            "Zakaz wstępu do wygrodzenia do czasu usunięcia usterki przez serwis robotyki i UR.",
            "BRAK BLOKADY JAKOŚCIOWEJ ŻYWNOŚCI (BRAK HOLD LOT): Palety z wyrobem gotowym są w pełni bezpieczne i dopuszczone do magazynu.",
            "Kalibracja optyki i test funkcji zatrzymania awaryjnego z podpisaniem protokołu odbioru BHP."
        ],
        "capa_no_contact": [
            "Procedura LOTO na zasilaniu celi paletyzacji i wezwanie automatyka UR.",
            "Czyszczenie soczewek nadajnika/odbiornika kurtyny lub wymiana modułu optycznego.",
            "Brak restrykcji jakościowych na produkt spożywczy (niezgodność wyłącznie maszynowa BHP).",
            "Test sprawności funkcji zatrzymania przed zdjęciem blokady LOTO."
        ]
    }
]

# ==============================================================================
# 3. SYMULACJA 6-KROKOWEGO DIALOGU DLA DANEGO INCYDENTU
# ==============================================================================

def generate_multi_turn_session(inc: Dict[str, Any]) -> Dict[str, Any]:
    zone_id = random.choice(inc["compatible_zones"])
    zone_meta = next(z for z in TECH_ZONES if z["id"] == zone_id)
    
    user_zone_opener = random.choice(zone_meta["user_openers"])
    user_defect = random.choice(inc["user_defect_phrases"])
    
    has_contact = random.choice([True, False])
    if has_contact:
        user_contact_reply = random.choice(inc["contact_yes"])
        capa_chosen = inc["capa_contact"]
    else:
        user_contact_reply = random.choice(inc["contact_no"])
        capa_chosen = inc["capa_no_contact"]
        
    is_bhp = inc["is_safety_bhp"]
    is_ko = inc["is_ifs_ko"]
    
    # KROK 1: Użytkownik podaje obszar: {obszar}
    t1_user = f"Zgłoszenie z hali: {user_zone_opener}."
    
    # KROK 2: Asystent potwierdza strefę i pyta o szczegóły wady
    t2_asst = (
        f"### 📍 Zarejestrowano Sektor: {zone_meta['name']}\n"
        f"**Wnioski audytorskie:** Obszar zakwalifikowany technologicznie. Nadzorowane punkty kontrolne: "
        f"{', '.join(zone_meta['allowed_ccp_oprp'])}.\n\n"
        f"Aby precyzyjnie zakwalifikować ryzyko operacyjne:\n"
        f"1. ⚠️ **Jaki dokładnie problem wystąpił na tym stanowisku?**\n"
        f"2. 🛑 **Czy moduł w tej sekcji został prewencyjnie wstrzymany?**"
    )
    
    # KROK 3: Użytkownik opisuje wyłącznie wadę: {wada_z_matrycy}
    t3_user = f"Konkretnie: {user_defect}."
    
    # KROK 4: Asystent ocenia ryzyko pod kątem tej wady i pyta o kontakt z wyrobem
    if is_bhp:
        t4_asst = (
            f"### ⚠️ Kwalifikacja Zdarzenia: Bezpieczeństwo Maszynowe i BHP\n"
            f"**Obszar:** {zone_meta['name']} | **Standard:** {inc['ko_clause']}\n"
            f"**Zagrożenie:** {inc['risk_category']}\n\n"
            f"Awaria funkcji bezpieczeństwa maszynowego wymaga natychmiastowego zabezpieczenia personelu zgodnie z procedurą LOTO.\n\n"
            f"👉 **Pytanie kluczowe:** Czy usterka wpłynęła na stabilność mechaniczną strefy wyrobu i czy doszło do jakiegokolwiek zanieczyszczenia produktu?"
        )
    elif is_ko:
        t4_asst = (
            f"### 🚨 ALARM KRYTYCZNY: Naruszenie Standardu {inc['ko_clause']}\n"
            f"**Obszar:** {zone_meta['name']} | **Zdarzenie:** {inc['defect_name']}\n"
            f"**Kwalifikacja ryzyka:** {inc['risk_category']}\n\n"
            f"Zdarzenie bezpośrednio zagraża integralności partii żywności zgodnie z kryterium Knock-Out IFS Food v8.\n\n"
            f"👉 **Pytanie kluczowe do decyzji HOLD LOT:** Czy produkt/masa miała bezpośredni kontakt ze źródłem skażenia lub opuściła strefę po wystąpieniu wady?"
        )
    else:
        t4_asst = (
            f"### ⚠️ Kwalifikacja Incydentu Jakościowego (IFS Food v8)\n"
            f"**Obszar:** {zone_meta['name']} | **Zdarzenie:** {inc['defect_name']}\n"
            f"**Ryzyko:** {inc['risk_category']}\n\n"
            f"Zgodnie z wymaganiami GMP i procedurami ochrony przed ciałami obcymi:\n\n"
            f"👉 **Pytanie kluczowe:** Czy ciało obce miało bezpośredni kontakt z otwartym wyrobem spożywczym lub opakowaniem pierwotnym?"
        )

    # KROK 5: Użytkownik odpowiada na temat kontaktu wyrobu z: {wada_z_matrycy}
    t5_user = user_contact_reply

    # KROK 6: Asystent wydaje dedykowaną decyzję CAPA dla wady {wada_z_matrycy}
    capa_formatted = "\n".join([f"{i+1}. 🔹 {act}" for i, act in enumerate(capa_chosen)])
    
    if is_bhp:
        t6_asst = (
            f"### 🛑 DECYZJA OPERACYJNA: Procedura Techniczna LOTO (BHP)\n"
            f"**Obszar:** {zone_meta['name']} | **Status Partii Spożywczej:** BRAK BLOKADY HOLD LOT\n\n"
            f"**Wnioski i Konkluzja Audytorska:**\n"
            f"Potwierdzono brak kontaktu z produktem spożywczym. Zdarzenie nie stanowi niezgodności Knock-Out normy IFS Food v8, lecz jest krytyczną niezgodnością BHP.\n\n"
            f"**Działania korygujące (CAPA):**\n"
            f"{capa_formatted}\n\n"
            f"Zezwolenie na ponowne uruchomienie wyłącznie po formalnym odbiorze technicznym przez Służbę BHP i UR."
        )
    elif has_contact:
        t6_asst = (
            f"### 🚨 DECYZJA AUDYTORSKA: Wstrzymanie Partii (HOLD LOT)\n"
            f"**Obszar:** {zone_meta['name']} | **Status:** KRYTYCZNE ZAGROŻENIE JAKOŚCIOWE\n\n"
            f"**Wnioski i Konkluzja Audytorska:**\n"
            f"Potwierdzono bezpośrednie narażenie produktu na {inc['risk_category']}. Zgodnie z normą {inc['ko_clause']} partia nie może trafić do obrotu handlowego.\n\n"
            f"**Działania korygujące i zabezpieczające (CAPA):**\n"
            f"{capa_formatted}\n\n"
            f"📸 Wykonaj dokumentację fotograficzną partii i zarejestruj Raport Niezgodności w systemie jakości."
        )
    else:
        t6_asst = (
            f"### ✅ DECYZJA AUDYTORSKA: Izolacja Odcinkowa i Zwolnienie Linii (Line Clearance)\n"
            f"**Obszar:** {zone_meta['name']} | **Status:** Produkt Bezpieczny (Brak Kontaktu)\n\n"
            f"**Wnioski i Konkluzja Audytorska:**\n"
            f"Skuteczne wyizolowanie problemu przed strefą kontaktu z wyrobem wyklucza konieczność wstrzymywania partii handlowej (HOLD LOT).\n\n"
            f"**Warunki zwolnienia stanowiska (Line Clearance):**\n"
            f"{capa_formatted}\n\n"
            f"Wymagany podpis Kontrolera Jakości przed ponownym wpuszczeniem surowca na stanowisko."
        )

    return {
        "messages": [
            {
                "role": "system",
                "content": (
                    "Jesteś profesjonalnym audytorem wiodącym IFS Food v8, BRCGS Food Safety v9 oraz HACCP dla przemysłu spożywczego. "
                    "Działasz jako interaktywny Field Co-Pilot audytora na hali produkcyjnej. "
                    "Utrzymujesz ścisłą dyscyplinę tematu, wyciągasz natychmiastowe wnioski techniczne i wydajesz dedykowane decyzje CAPA bez powtórzeń."
                )
            },
            {"role": "user", "content": t1_user},
            {"role": "assistant", "content": t2_asst},
            {"role": "user", "content": t3_user},
            {"role": "assistant", "content": t4_asst},
            {"role": "user", "content": t5_user},
            {"role": "assistant", "content": t6_asst}
        ]
    }


# ==============================================================================
# 4. DETERMINISTYCZNA EWALUACJA JSON DLA DANEGO INCYDENTU
# ==============================================================================

def generate_evaluator_json_session(inc: Dict[str, Any]) -> Dict[str, Any]:
    zone_id = random.choice(inc["compatible_zones"])
    zone_meta = next(z for z in TECH_ZONES if z["id"] == zone_id)
    has_contact = random.choice([True, False])
    
    user_prompt = (
        f"Dokonaj formalnej ewaluacji audytowej IFS Food v8 / HACCP dla następującego incydentu:\n"
        f"• Obszar technologiczny: {zone_meta['name']}\n"
        f"• Zdarzenie: {inc['defect_name']} ({random.choice(inc['user_defect_phrases'])})\n"
        f"• Bezpośredni kontakt z wyrobem: {'TAK - stwierdzono zanieczyszczenie' if has_contact else 'NIE - brak kontaktu'}\n"
        f"Odpowiedz wyłącznie poprawnym obiektem JSON."
    )
    
    if inc["is_safety_bhp"]:
        status = "OK"
        risk_level = "NISKIE_ZYWNOSC_WYSOKIE_BHP"
        decision = "Zatrzymanie mechaniczne linii procedurą LOTO. Brak podstaw do wstrzymania partii żywności (brak kontaktu z produktem)."
        actions = inc["capa_no_contact"]
        preventive = ["Okresowy przegląd sprawności urządzeń bezpieczeństwa maszynowego co 30 dni przez UR"]
    elif inc["is_ifs_ko"] and has_contact:
        status = "NOK"
        risk_level = "KRYTYCZNE (HOLD LOT)"
        decision = f"Złamanie kryterium {inc['ko_clause']}. Natychmiastowe wstrzymanie partii w ERP i komisyjna utylizacja skażonego wyrobu."
        actions = inc["capa_contact"]
        preventive = ["Weryfikacja procedury weryfikacji punktów krytycznych i rewalidacja planu HACCP"]
    elif has_contact:
        status = "NOK"
        risk_level = "WYSOKIE (KWARANTANNA)"
        decision = "Zatrzymanie wyrobu gotowego w strefie kwarantanny jakościowej do czasu odbioru przez Kierownika Jakości."
        actions = inc["capa_contact"]
        preventive = ["Zwiększenie częstotliwości inspekcji wizualnych osłon maszyn"]
    else:
        status = "OK"
        risk_level = "NISKIE"
        decision = "Linia warunkowo dopuszczona do wznowienia operacji po usunięciu usterki i odbiorze higienicznym (Line Clearance)."
        actions = inc["capa_no_contact"]
        preventive = ["Szkolenie stanowiskowe operatorów z procedury natychmiastowego zgłaszania odchyleń"]

    json_payload = {
        "status": status,
        "poziom_ryzyka": risk_level,
        "norma_odniesienia": inc["ko_clause"],
        "decyzja": decision,
        "akcje_korygujace": actions,
        "podpowiedzi_prewencyjne": preventive
    }

    return {
        "messages": [
            {
                "role": "system",
                "content": "Jesteś analitykiem audytowym IFS Food v8 i HACCP. Zwracasz wyłącznie deterministyczny obiekt JSON."
            },
            {"role": "user", "content": user_prompt},
            {"role": "assistant", "content": json.dumps(json_payload, ensure_ascii=False, indent=2)}
        ]
    }


# ==============================================================================
# 5. GENERATOR Z PODZIAŁEM 80% TRAIN / 10% VAL / 10% TEST (OUT-OF-DISTRIBUTION)
# ==============================================================================

def main():
    print("=" * 80)
    print("🚀 GENEROWANIE KORPUSU AUDYTORSKIEGO Z PODZIAŁEM 80% TRAIN / 10% VAL / 10% TEST")
    print("   Zasada: Unikalne scenariusze (np. rurka teflonowa, glikol) znajdują się WYŁĄCZNIE")
    print("   w odpowiednim splicie, aby zweryfikować zdolność generalizacji (Out-Of-Distribution).")
    print("=" * 80)

    train_incidents = [inc for inc in INCIDENTS_DATABASE if inc["split_target"] == "TRAIN"]
    val_incidents   = [inc for inc in INCIDENTS_DATABASE if inc["split_target"] == "VAL"]
    test_incidents  = [inc for inc in INCIDENTS_DATABASE if inc["split_target"] == "TEST"]

    print(f"📊 Liczba unikalnych rodzin incydentów: TRAIN={len(train_incidents)}, VAL={len(val_incidents)}, TEST={len(test_incidents)}")

    # 1. Generowanie Copilot Chat (Wieloetapowy Markdown)
    # Docelowo: ok. 2400 próbek: 1920 train (80%), 240 val (10%), 240 test (10%)
    train_chat = [generate_multi_turn_session(random.choice(train_incidents)) for _ in range(1920)]
    val_chat   = [generate_multi_turn_session(random.choice(val_incidents)) for _ in range(240)]
    test_chat  = [generate_multi_turn_session(random.choice(test_incidents)) for _ in range(240)]

    for filename, data in [
        ("train_copilot_chat.jsonl", train_chat),
        ("val_copilot_chat.jsonl", val_chat),
        ("test_copilot_chat.jsonl", test_chat)
    ]:
        with open(filename, "w", encoding="utf-8") as f:
            for item in data:
                f.write(json.dumps(item, ensure_ascii=False) + "\n")
        print(f"✅ Zapisano {filename}: {len(data)} zamkniętych sesji")

    # 2. Generowanie Evaluator JSON (Deterministyczny JSON)
    # Docelowo: ok. 1500 próbek: 1200 train (80%), 150 val (10%), 150 test (10%)
    train_json = [generate_evaluator_json_session(random.choice(train_incidents)) for _ in range(1200)]
    val_json   = [generate_evaluator_json_session(random.choice(val_incidents)) for _ in range(150)]
    test_json  = [generate_evaluator_json_session(random.choice(test_incidents)) for _ in range(150)]

    for filename, data in [
        ("train_evaluator_json.jsonl", train_json),
        ("val_evaluator_json.jsonl", val_json),
        ("test_evaluator_json.jsonl", test_json)
    ]:
        with open(filename, "w", encoding="utf-8") as f:
            for item in data:
                f.write(json.dumps(item, ensure_ascii=False) + "\n")
        print(f"✅ Zapisano {filename}: {len(data)} deterministycznych próbek JSON")

    print("\n🎉 Generowanie zakończone pełnym sukcesem! Wszystkie zbiory są w 100% odseparowane.")

if __name__ == "__main__":
    main()
