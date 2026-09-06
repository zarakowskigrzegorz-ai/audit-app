from fastapi import APIRouter, HTTPException
from typing import Dict, List, Any
from database import get_db

router = APIRouter(prefix="/api/checklist-template", tags=["Checklists"])

CHECKLIST_TEMPLATES = {
    "HACCP": [
        {"id": 101, "is_ko": False, "clause": "1.1 Analiza", "question": "Aktualność Planu HACCP: Schemat technologiczny na linii (flow diagram) odzwierciedla faktyczny przebieg procesu."},
        {"id": 102, "is_ko": False, "clause": "1.2 Świadomość", "question": "Operatorzy znają główne zagrożenia (biologiczne, chemiczne, fizyczne, alergeny) dla ich stanowiska."},
        {"id": 103, "is_ko": False, "clause": "2.1 Limity CCP", "question": "Wartości docelowe i limity krytyczne są jasno zdefiniowane i widoczne przy stanowisku CCP."},
        {"id": 104, "is_ko": False, "clause": "2.2 Walidacja", "question": "Urządzenia kontrolno-pomiarowe używane w CCP posiadają ważne świadectwa kalibracji/wzorcowania."},
        {"id": 105, "is_ko": False, "clause": "3.1 Logi", "question": "Rejestracja wyników: Arkusze CCP są wypełniane na bieżąco, w czasie rzeczywistym, a nie wstecz."},
        {"id": 106, "is_ko": True, "clause": "3.2 Częstotliwość (KO)", "question": "Częstotliwość zapisów jest w 100% zgodna z Planem HACCP (np. test detektora co 1h)."},
        {"id": 107, "is_ko": False, "clause": "3.3 Autoryzacja", "question": "Podpisy: Dokumenty z CCP są czytelnie podpisane przez wyznaczonego operatora."},
        {"id": 108, "is_ko": False, "clause": "4.1 Proc. Awaryjne", "question": "Działania korygujące: Operatorzy wiedzą, co zrobić przy przekroczeniu limitu (zatrzymanie linii)."},
        {"id": 109, "is_ko": True, "clause": "4.2 Hold Lot (KO)", "question": "Status produktu: Wyroby niezgodne z CCP są natychmiast fizycznie i systemowo izolowane (Hold/Zablokowane)."},
        {"id": 110, "is_ko": False, "clause": "4.3 Raportowanie", "question": "Każde odchylenie na CCP jest w pełni udokumentowane w Raporcie Niezgodności."}
    ],
    "GMP": [
        {"id": 201, "is_ko": False, "clause": "1.1 Odzież", "question": "Personel: Pracownicy noszą czystą odzież. Włosy osłonięte. Brak biżuterii, zegarków, sztucznych paznokci."},
        {"id": 202, "is_ko": False, "clause": "1.2 Higiena rąk", "question": "Stacje higieniczne (śluzy) są w pełni sprawne, wyposażone w mydło i środek dezynfekujący."},
        {"id": 203, "is_ko": True, "clause": "1.3 Zdrowie (KO)", "question": "Stan zdrowia: Przestrzeganie procedur zgłaszania infekcji. Skaleczenia zaklejone niebieskimi plastrami."},
        {"id": 204, "is_ko": False, "clause": "2.1 Infrastruktura", "question": "Stan techniczny: Posadzki, ściany i sufity nad linią szczelne, nienasiąkliwe, wolne od pęknięć/odprysków."},
        {"id": 205, "is_ko": True, "clause": "2.2 Zabezpieczenia (KO)", "question": "Oprawy oświetleniowe i elementy szklane nad otwartym procesem są zabezpieczone przed stłuczeniem."},
        {"id": 206, "is_ko": False, "clause": "2.3 Klimat/Kurz", "question": "Wentylacja: Odpowiednia temperatura/wilgotność zachowane. Kratki wentylacyjne wolne od kurzu."},
        {"id": 207, "is_ko": False, "clause": "3.1 Wycieki", "question": "Maszyny: Mieszadła, formy i orurowanie wolne od wycieków, korozji, uszkodzeń i taśm (trytytek)."},
        {"id": 208, "is_ko": False, "clause": "3.2 Czystość/CIP", "question": "Czyszczenie: Instalacja jest czysta, weryfikacja CIP udokumentowana. Brak zalegającej starej masy."},
        {"id": 209, "is_ko": True, "clause": "3.3 Detekcja (KO)", "question": "Ciała obce: Detektory, X-Ray, magnesy i sita włączone, sprawne i regularnie testowane wzorcami."},
        {"id": 210, "is_ko": False, "clause": "3.4 Kalibracja", "question": "Nadzór nad parametrami: Czujniki temperatury w tankach i wagi mają świadectwa wzorcowania."}
    ],
    "GHP": [
        {"id": 301, "is_ko": True, "clause": "1.1 Higiena Rąk (KO)", "question": "Procedura mycia i dezynfekcji rąk: Personel poprawnie realizuje procedurę przed wejściem do strefy High Care (brak biżuterii, zegarków, sztucznych paznokci)."},
        {"id": 302, "is_ko": False, "clause": "1.2 Odzież Osobista", "question": "Czystość i kompletność odzieży: Fartuchy, czepki, osłony brody i obuwie robocze są czyste, nieuszkodzone i w 100% zakrywają włosy oraz odzież prywatną."},
        {"id": 303, "is_ko": True, "clause": "1.3 Stan Zdrowia (KO)", "question": "Kontrola stanu zdrowia i zranień (PR15.01): Brak osób z objawami infekcji pokarmowych/kataralnych; wszelkie skaleczenia zabezpieczone wykrywalnymi, niebieskimi plastrami z paskiem metalowym."},
        {"id": 304, "is_ko": False, "clause": "2.1 Śluzy Higieniczne", "question": "Infrastruktura śluz wejściowych: Dozowniki mydła, środka do dezynfekcji rąk oraz maty dezynfekujące/myjki do obuwia są w pełni zaopatrzone i sprawne."},
        {"id": 305, "is_ko": False, "clause": "2.2 Higiena Procesu", "question": "Zasady zachowania czystości na stanowisku: Brak spożywania posiłków, napojów, żucia gumy oraz palenia tytoniu w strefie produkcyjnej i magazynowej."},
        {"id": 306, "is_ko": False, "clause": "3.1 Czystość Środowiska", "question": "Porządek wokół stanowiska: Brak zalegających odpadów produkcyjnych, opakowań i surowców poza wyznaczonymi, oznakowanymi pojemnikami (zamykanymi)."},
        {"id": 307, "is_ko": False, "clause": "3.2 Sanitariat / Sprzęt", "question": "Narzędzia i sprzęt myjący: Szczotki, węże i ściągaczki są czyste, zidentyfikowane kolorystycznie (kod barwny stref) i przechowywane w sposób uniemożliwiający wtórne zanieczyszczenie."},
        {"id": 308, "is_ko": False, "clause": "4.1 Szkodniki", "question": "Zabezpieczenie przed szkodnikami: Okna i drzwi zewnętrzne są szczelnie zamknięte lub posiadają sprawne kurtyny powietrzne/moskitiery; stacje deratyzacyjne nienaruszone."},
        {"id": 309, "is_ko": False, "clause": "4.2 Chemia Myjąca", "question": "Nadzór nad środkami chemicznymi: Środki myjące i dezynfekujące używane na produkcji są zatwierdzone do kontaktu z żywnością, oznakowane i bezpiecznie przechowywane."}
    ]
}

@router.get("/{audit_type}")
def get_checklist_template(audit_type: str):
    return CHECKLIST_TEMPLATES.get(audit_type.upper().strip(), CHECKLIST_TEMPLATES["HACCP"])

