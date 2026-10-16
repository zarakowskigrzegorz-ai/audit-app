BEGIN TRANSACTION;
CREATE TABLE audit_change_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            audit_id INTEGER NOT NULL,
            modified_by TEXT NOT NULL,
            field_name TEXT NOT NULL,
            old_value TEXT,
            new_value TEXT,
            change_reason TEXT NOT NULL,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(audit_id) REFERENCES audits(id)
        );
INSERT INTO "audit_change_logs" VALUES(1,3,'MANAGER','shift','Zmiana C','2','pppppp','2026-09-08 09:56:39');
INSERT INTO "audit_change_logs" VALUES(2,1,'MANAGER','shift','Zmiana A','3','11111','2026-09-08 09:57:28');
CREATE TABLE audit_checklist_templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT, audit_type TEXT NOT NULL, clause TEXT NOT NULL, question TEXT NOT NULL, is_ko INTEGER DEFAULT 0
        );
INSERT INTO "audit_checklist_templates" VALUES(1,'HACCP','KO 2 (2.3.11.1)','Czy system monitorowania każdego CCP jest wdrożony, udokumentowany i ściśle przestrzegany na stanowisku?',1);
INSERT INTO "audit_checklist_templates" VALUES(2,'HACCP','KO 6 (4.12.1)','Czy procedury zapobiegania zanieczyszczeniu ciałami obcymi (detektory, sita) działają bez odchyleń?',1);
INSERT INTO "audit_checklist_templates" VALUES(3,'HACCP','KO 7 (4.18.1)','Czy system identyfikowalności umożliwia powiązanie partii surowców z wyrobem gotowym?',1);
INSERT INTO "audit_checklist_templates" VALUES(4,'HACCP','Klauzula 2.3.5','Czy wykonano test wzorców detektora metali (Fe 1.5mm, Non-Fe 2.0mm, SS 2.5mm) w interwale max. 2h?',0);
INSERT INTO "audit_checklist_templates" VALUES(5,'HACCP','Klauzula 4.12.3','Czy sita wibracyjne i pułapki magnetyczne są sprawne i wolne od uszkodzeń mechanicznych?',0);
INSERT INTO "audit_checklist_templates" VALUES(6,'GMP','KO 3 (3.2.2)','Czy personel w strefie High Care w pełni stosuje wymagania higieny osobistej, czystości dłoni i odzieży roboczej?',1);
INSERT INTO "audit_checklist_templates" VALUES(7,'GMP','KO 5 (4.4.1)','Czy receptury technologiczne oraz procedury dozowania alergenów są ściśle przestrzegane?',1);
INSERT INTO "audit_checklist_templates" VALUES(8,'GMP','Klauzula 4.9.1','Czy stan posadzek, ścian, sufitów i odbojników wyklucza ryzyko fizycznego zanieczyszczenia produktu?',0);
INSERT INTO "audit_checklist_templates" VALUES(9,'GMP','Klauzula 4.10.2','Czy rejestr szkła i twardego plastiku jest aktualny, a osłony świetlówek nienaruszone?',0);
INSERT INTO "audit_checklist_templates" VALUES(10,'GMP','Klauzula 4.13.1','Czy strefa bezpośredniego kontaktu z produktem jest całkowicie wolna od palet drewnianych (Polityka Drewna)?',0);
INSERT INTO "audit_checklist_templates" VALUES(11,'GHP','KO 10 (5.11.1)','Czy działania korygujące dla poprzednio zidentyfikowanych odchyleń zostały skutecznie zrealizowane i zamknięte?',1);
INSERT INTO "audit_checklist_templates" VALUES(12,'GHP','Klauzula 3.2.1','Czy śluzy higieniczne są w pełni wyposażone w mydło antybakteryjne, środek dezynfekcyjny i ręczniki?',0);
INSERT INTO "audit_checklist_templates" VALUES(13,'GHP','Klauzula 4.11.1','Czy stanowisko produkcyjne i taśmy transportowe po myciu CIP są wolne od pozostałości organicznych?',0);
INSERT INTO "audit_checklist_templates" VALUES(14,'GHP','Klauzula 4.14.2','Czy odpady poprodukcyjne są gromadzone w oznakowanych, zamkniętych pojemnikach i regularnie usuwane?',0);
CREATE TABLE audit_edit_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            audit_id INTEGER NOT NULL,
            requested_by TEXT NOT NULL,
            reason TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'OCZEKUJE' CHECK(status IN ('OCZEKUJE', 'ZATWIERDZONY', 'ODRZUCONY')),
            manager_comment TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            resolved_at TIMESTAMP,
            FOREIGN KEY(audit_id) REFERENCES audits(id)
        );
INSERT INTO "audit_edit_requests" VALUES(1,3,'G. Zarakowski','oooooooo','ZATWIERDZONY','ok','2026-09-04 08:40:24','2026-09-04 08:41:01');
INSERT INTO "audit_edit_requests" VALUES(2,19,'J. Kowalski','ppppppppp','ZATWIERDZONY','ooooo','2026-09-08 12:35:38','2026-09-08 12:36:35');
CREATE TABLE audit_schedules (
            id INTEGER PRIMARY KEY AUTOINCREMENT, scheduled_date TEXT, line TEXT, audit_type TEXT DEFAULT 'HACCP',
            lead_auditor TEXT, backup_auditor TEXT, status TEXT DEFAULT 'PLANOWANY', notes TEXT, completed_at TEXT
        );
INSERT INTO "audit_schedules" VALUES(1,'2026-08-28','Linia L1 (Masa Konszowanie)','HACCP','G. Zarakowski','Administrator Jakości','PLANOWANY','Weryfikacja CCP1-CCP3 na zmianie A',NULL);
INSERT INTO "audit_schedules" VALUES(2,'2026-08-28','Linia L2 (Pakowanie Czekolady)','GMP','G. Zarakowski','Brak','PLANOWANY','Inspekcja ciał obcych i rejestru PR15.01',NULL);
INSERT INTO "audit_schedules" VALUES(3,'2026-08-29','Linia L3 (Formowanie Pralin)','GHP','G. Zarakowski','Brak','PLANOWANY','Monitoring ATP i procedury higieny śluzy',NULL);
INSERT INTO "audit_schedules" VALUES(4,'2026-08-30','Linia L1 (Masa Konszowanie)','HACCP','G. Zarakowski','Brak','PLANOWANY','Okresowa walidacja magnesu 10 000G',NULL);
INSERT INTO "audit_schedules" VALUES(5,'2026-08-31','Linia L2 (Pakowanie Czekolady)','GMP','G. Zarakowski','Brak','PLANOWANY','Kontrola strefy pakowania',NULL);
INSERT INTO "audit_schedules" VALUES(12,'2026-09-01','Linia L2 (Pakowanie Czekolady)','GMP','Grzegorz Zarakowski (Lead Auditor)','Piotr Kowalski (Audytor)','PLANOWANY','Wygenerowano automatycznie',NULL);
INSERT INTO "audit_schedules" VALUES(214,'2026-09-07','linia 4454','HACCP','GZ','Jarosław','WYKONANY','','2026-09-08 10:12:25');
INSERT INTO "audit_schedules" VALUES(216,'2026-09-09','linia 4454','HACCP','A. Nowak','Jarosław','PLANOWANY','','2026-09-08 11:25:50');
CREATE TABLE audits (
            id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp TEXT, auditor_id TEXT, line TEXT, shift TEXT, zone TEXT,
            audit_type TEXT DEFAULT 'HACCP', compliance_verdict TEXT DEFAULT 'ZGODNY', total_score_pct REAL DEFAULT 100.0,
            photo_path TEXT, slm_analysis TEXT, notes TEXT
        , health_ok TEXT NOT NULL DEFAULT 'TAK', dispense_no TEXT DEFAULT 'BRAK', ppe_ok TEXT NOT NULL DEFAULT 'ZGODNY', allergen_clean_ok TEXT NOT NULL DEFAULT 'ZGODNY', wood_policy_ok TEXT NOT NULL DEFAULT 'ZGODNY', line_status TEXT NOT NULL DEFAULT 'Produkcja Ciągła', ccp1_fe_ok TEXT NOT NULL DEFAULT 'ZGODNY', ccp1_nonfe_ok TEXT NOT NULL DEFAULT 'ZGODNY', ccp1_ss_ok TEXT NOT NULL DEFAULT 'ZGODNY', ccp1_reject_ok TEXT NOT NULL DEFAULT 'ZGODNY', ccp1_bin_locked TEXT NOT NULL DEFAULT 'ZGODNY', ccp2_magnet_ok TEXT NOT NULL DEFAULT 'ZGODNY', ccp3_sieve_ok TEXT NOT NULL DEFAULT 'ZGODNY', cleanliness_rating INTEGER NOT NULL DEFAULT 5, wood_plastic_status TEXT NOT NULL DEFAULT 'ZGODNY', waste_disposal_ok TEXT NOT NULL DEFAULT 'ZGODNY', estop_ok TEXT NOT NULL DEFAULT 'ZGODNY', atex_zone_ok TEXT NOT NULL DEFAULT 'ZGODNY', cip_lockout_ok TEXT NOT NULL DEFAULT 'ZGODNY', ko_failed INTEGER NOT NULL DEFAULT 0, risk_level TEXT NOT NULL DEFAULT 'NISKIE', slm_verdict TEXT NOT NULL DEFAULT 'OK', record_status TEXT NOT NULL DEFAULT 'ZABLOKOWANY', process_status TEXT NOT NULL DEFAULT 'IN_PROGRESS', signoff_leader TEXT DEFAULT NULL, signoff_quality TEXT DEFAULT NULL, audit_score REAL DEFAULT 100.0, audit_points INTEGER DEFAULT 0, audit_code TEXT, glass_plastic_ok TEXT DEFAULT 'TAK', gmp_cleanliness_ok TEXT DEFAULT 'TAK', gmp_wood_score INTEGER DEFAULT 100, gmp_foreign_score INTEGER DEFAULT 100, gmp_waste_ok TEXT DEFAULT 'TAK', bhp_estop_ok TEXT DEFAULT 'TAK', bhp_atex_ok TEXT DEFAULT 'TAK', bhp_hot_cip_ok TEXT DEFAULT 'TAK', bhp_evac_ppoz_ok TEXT DEFAULT 'TAK', bhp_status TEXT DEFAULT 'OK', checklist_results TEXT);
INSERT INTO "audits" VALUES(1,'2026-08-20 08:30:00','G. Zarakowski','Linia L1 (Masa Konszowanie)','3','Wysoka Higiena (High Care)','HACCP','ZGODNY',100.0,'','Wszystkie punkty krytyczne CCP1-CCP3 w 100% zgodne.','Audyt startowy przedsezonowy','TAK','BRAK','ZGODNY','ZGODNY','ZGODNY','Produkcja Ciągła','ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY',5,'ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY',0,'NISKIE','OK','ZABLOKOWANY','IN_PROGRESS',NULL,NULL,100.0,0,'AUD-LEGACY-1','TAK','TAK',100,100,'TAK','TAK','TAK','TAK','TAK','OK',NULL);
INSERT INTO "audits" VALUES(2,'2026-08-21 14:15:00','G. Zarakowski','Linia L2 (Pakowanie Czekolady)','Zmiana B','Strefa Pakowania','GMP','ZGODNY',95.0,'','Wzorowa gospodarka odpadami i brak drewna na hali.','Rutynowa inspekcja GMP','TAK','BRAK','ZGODNY','ZGODNY','ZGODNY','Produkcja Ciągła','ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY',5,'ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY',0,'NISKIE','OK','ZABLOKOWANY','IN_PROGRESS',NULL,NULL,100.0,0,'AUD-LEGACY-2','TAK','TAK',100,100,'TAK','TAK','TAK','TAK','TAK','OK',NULL);
INSERT INTO "audits" VALUES(3,'2026-08-22 22:10:00','G. Zarakowski','Linia L3 (Formowanie Pralin)','2','Wysoka Higiena (High Care)','GHP','ZGODNY',100.0,'','Wymazy ATP < 15 RLU, pełna higiena śluzy sanitarnej.','Weryfikacja sanitacji nocnej','TAK','BRAK','ZGODNY','ZGODNY','ZGODNY','Produkcja Ciągła','ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY',5,'ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY',0,'NISKIE','OK','ZABLOKOWANY','IN_PROGRESS',NULL,NULL,100.0,0,'AUD-LEGACY-3','TAK','TAK',100,100,'TAK','TAK','TAK','TAK','TAK','OK',NULL);
INSERT INTO "audits" VALUES(7,'2026-09-08 13:08:02','A. Nowak','linia 4454','Zmiana A','Wysoka Higiena (High Care)','HACCP','ZGODNY',100.0,NULL,'{
  "status": "NOK",
  "poziom_ryzyka": "KRYTYCZNE (HOLD LOT)",
  "decyzja": "Wstrzymanie partii (Hold Lot) od ostatniego poprawnego testu wzorca CCP1 Fe. Natychmiastowe zatrzymanie linii.",
  "akcje_korygujace": [
    "Założenie blokady fizycznej i magazynowej (status HOLD w ERP) na całą linię od ostatniego poprawnego testu wzorca CCP1 Fe",
    "Przegląd mechaniczny i reasortowanie surowca do nowej partii gotowego wyrobów",
    "Ponowne 100% przetestowanie weryfikacji sita roboczego na całe tempo"
  ],
  "podpowiedzi_prewencyjne": [
    "Zatrzymanie wpuszczenia surowca do sita roboczego przez 24 godziny od ostatniego poprawnego testu",
    "Przejrzenie partii wizualnej na wykrycie drutów i ciał objawy ataku PR1"
  ]
}',NULL,'TAK','BRAK','ZGODNY','ZGODNY','ZGODNY','Produkcja Ciągła','ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY',5,'ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY',0,'KRYTYCZNE (HOLD LOT)','NOK','ZABLOKOWANY','IN_PROGRESS',NULL,NULL,100.0,0,NULL,'ZGODNY','ZGODNY',5,5,'ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY','BRAK ZGŁOSZEŃ','{"101":{"status":"OK","is_ko":false,"clause":"1.1 Analiza","question":"Aktualność Planu HACCP: Schemat technologiczny na linii (flow diagram) odzwierciedla faktyczny przebieg procesu.","score":5,"notes":""},"102":{"status":"OK","is_ko":false,"clause":"1.2 Świadomość","question":"Operatorzy znają główne zagrożenia (biologiczne, chemiczne, fizyczne, alergeny) dla ich stanowiska.","score":5,"notes":""},"103":{"status":"OK","is_ko":false,"clause":"2.1 Limity CCP","question":"Wartości docelowe i limity krytyczne są jasno zdefiniowane i widoczne przy stanowisku CCP.","score":5,"notes":""},"104":{"status":"OK","is_ko":false,"clause":"2.2 Walidacja","question":"Urządzenia kontrolno-pomiarowe używane w CCP posiadają ważne świadectwa kalibracji/wzorcowania.","score":5,"notes":""},"105":{"status":"OK","is_ko":false,"clause":"3.1 Logi","question":"Rejestracja wyników: Arkusze CCP są wypełniane na bieżąco, w czasie rzeczywistym, a nie wstecz.","score":5,"notes":""},"106":{"status":"OK","is_ko":true,"clause":"3.2 Częstotliwość (KO)","question":"Częstotliwość zapisów jest w 100% zgodna z Planem HACCP (np. test detektora co 1h).","score":5,"notes":""},"107":{"status":"OK","is_ko":false,"clause":"3.3 Autoryzacja","question":"Podpisy: Dokumenty z CCP są czytelnie podpisane przez wyznaczonego operatora.","score":5,"notes":""},"108":{"status":"OK","is_ko":false,"clause":"4.1 Proc. Awaryjne","question":"Działania korygujące: Operatorzy wiedzą, co zrobić przy przekroczeniu limitu (zatrzymanie linii).","score":5,"notes":""},"109":{"status":"OK","is_ko":true,"clause":"4.2 Hold Lot (KO)","question":"Status produktu: Wyroby niezgodne z CCP są natychmiast fizycznie i systemowo izolowane (Hold/Zablokowane).","score":5,"notes":""},"110":{"status":"OK","is_ko":false,"clause":"4.3 Raportowanie","question":"Każde odchylenie na CCP jest w pełni udokumentowane w Raporcie Niezgodności.","score":5,"notes":""}}');
INSERT INTO "audits" VALUES(8,'2026-09-08 13:08:02','A. Nowak','linia 4454','Zmiana A','Wysoka Higiena (High Care)','HACCP','ZGODNY',100.0,NULL,'{
  "status": "NOK",
  "poziom_ryzyka": "KRYTYCZNE (HOLD LOT)",
  "decyzja": "Wstrzymanie partii (Hold Lot) od ostatniego poprawnego testu wzorca CCP1 Fe. Natychmiastowe zatrzymanie linii.",
  "akcje_korygujace": [
    "Założenie blokady fizycznej i magazynowej (status HOLD w ERP) na całą linię od ostatniego poprawnego testu wzorca CCP1 Fe",
    "Przegląd mechaniczny i reasortowanie surowca do nowej partii gotowego wyrobów",
    "Ponowne 100% przetestowanie weryfikacji sita roboczego na całe tempo"
  ],
  "podpowiedzi_prewencyjne": [
    "Zatrzymanie wpuszczenia surowca do strefy roboczé od ostatniego poprawnego testu wzorca CCP1 Fe",
    "Przegląd i stabilizacja napięcia zasilania głowicy detektora sita roboczego"
  ]
}',NULL,'TAK','BRAK','ZGODNY','ZGODNY','ZGODNY','Produkcja Ciągła','ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY',5,'ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY',0,'KRYTYCZNE (HOLD LOT)','NOK','ZABLOKOWANY','IN_PROGRESS',NULL,NULL,100.0,0,NULL,'ZGODNY','ZGODNY',5,5,'ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY','BRAK ZGŁOSZEŃ','{"101":{"status":"OK","is_ko":false,"clause":"1.1 Analiza","question":"Aktualność Planu HACCP: Schemat technologiczny na linii (flow diagram) odzwierciedla faktyczny przebieg procesu.","score":5,"notes":""},"102":{"status":"OK","is_ko":false,"clause":"1.2 Świadomość","question":"Operatorzy znają główne zagrożenia (biologiczne, chemiczne, fizyczne, alergeny) dla ich stanowiska.","score":5,"notes":""},"103":{"status":"OK","is_ko":false,"clause":"2.1 Limity CCP","question":"Wartości docelowe i limity krytyczne są jasno zdefiniowane i widoczne przy stanowisku CCP.","score":5,"notes":""},"104":{"status":"OK","is_ko":false,"clause":"2.2 Walidacja","question":"Urządzenia kontrolno-pomiarowe używane w CCP posiadają ważne świadectwa kalibracji/wzorcowania.","score":5,"notes":""},"105":{"status":"OK","is_ko":false,"clause":"3.1 Logi","question":"Rejestracja wyników: Arkusze CCP są wypełniane na bieżąco, w czasie rzeczywistym, a nie wstecz.","score":5,"notes":""},"106":{"status":"OK","is_ko":true,"clause":"3.2 Częstotliwość (KO)","question":"Częstotliwość zapisów jest w 100% zgodna z Planem HACCP (np. test detektora co 1h).","score":5,"notes":""},"107":{"status":"OK","is_ko":false,"clause":"3.3 Autoryzacja","question":"Podpisy: Dokumenty z CCP są czytelnie podpisane przez wyznaczonego operatora.","score":5,"notes":""},"108":{"status":"OK","is_ko":false,"clause":"4.1 Proc. Awaryjne","question":"Działania korygujące: Operatorzy wiedzą, co zrobić przy przekroczeniu limitu (zatrzymanie linii).","score":5,"notes":""},"109":{"status":"OK","is_ko":true,"clause":"4.2 Hold Lot (KO)","question":"Status produktu: Wyroby niezgodne z CCP są natychmiast fizycznie i systemowo izolowane (Hold/Zablokowane).","score":5,"notes":""},"110":{"status":"OK","is_ko":false,"clause":"4.3 Raportowanie","question":"Każde odchylenie na CCP jest w pełni udokumentowane w Raporcie Niezgodności.","score":5,"notes":""}}');
INSERT INTO "audits" VALUES(9,'2026-09-08 13:08:02','A. Nowak','linia 4454','Zmiana A','Wysoka Higiena (High Care)','HACCP','ZGODNY',100.0,NULL,'{
  "status": "NOK",
  "poziom_ryzyka": "KRYTYCZNE (HOLD LOT)",
  "decyzja": "Wstrzymanie partii (Hold Lot) od ostatniego poprawnego testu wzorca CCP1 Fe. Natychmiastowe zatrzymanie linii.",
  "akcje_korygujace": [
    "Założenie blokady fizycznej i magazynowej (status HOLD w ERP) na całą linię od ostatniego poprawnego testu wzorca CCP1 Fe",
    "Przegląd mechaniczny i reasortowanie surowca do nowej partii gotowego wyrobów",
    "Ponowne 100% przetestowanie weryfikacji sita roboczego na całe tempo"
  ],
  "podpowiedzi_prewencyjne": [
    "Zatrzymanie wpuszczenia surowca do strefy roboczé od ostatniego poprawnego testu wzorca CCP1 Fe",
    "Przegląd i stabilizacja napięcia zasilania głowicy detektora sita roboczego"
  ]
}',NULL,'TAK','BRAK','ZGODNY','ZGODNY','ZGODNY','Produkcja Ciągła','ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY',5,'ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY',0,'KRYTYCZNE (HOLD LOT)','NOK','ZABLOKOWANY','IN_PROGRESS',NULL,NULL,100.0,0,NULL,'ZGODNY','ZGODNY',5,5,'ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY','BRAK ZGŁOSZEŃ','{"101":{"status":"OK","is_ko":false,"clause":"1.1 Analiza","question":"Aktualność Planu HACCP: Schemat technologiczny na linii (flow diagram) odzwierciedla faktyczny przebieg procesu.","score":5,"notes":""},"102":{"status":"OK","is_ko":false,"clause":"1.2 Świadomość","question":"Operatorzy znają główne zagrożenia (biologiczne, chemiczne, fizyczne, alergeny) dla ich stanowiska.","score":5,"notes":""},"103":{"status":"OK","is_ko":false,"clause":"2.1 Limity CCP","question":"Wartości docelowe i limity krytyczne są jasno zdefiniowane i widoczne przy stanowisku CCP.","score":5,"notes":""},"104":{"status":"OK","is_ko":false,"clause":"2.2 Walidacja","question":"Urządzenia kontrolno-pomiarowe używane w CCP posiadają ważne świadectwa kalibracji/wzorcowania.","score":5,"notes":""},"105":{"status":"OK","is_ko":false,"clause":"3.1 Logi","question":"Rejestracja wyników: Arkusze CCP są wypełniane na bieżąco, w czasie rzeczywistym, a nie wstecz.","score":5,"notes":""},"106":{"status":"OK","is_ko":true,"clause":"3.2 Częstotliwość (KO)","question":"Częstotliwość zapisów jest w 100% zgodna z Planem HACCP (np. test detektora co 1h).","score":5,"notes":""},"107":{"status":"OK","is_ko":false,"clause":"3.3 Autoryzacja","question":"Podpisy: Dokumenty z CCP są czytelnie podpisane przez wyznaczonego operatora.","score":5,"notes":""},"108":{"status":"OK","is_ko":false,"clause":"4.1 Proc. Awaryjne","question":"Działania korygujące: Operatorzy wiedzą, co zrobić przy przekroczeniu limitu (zatrzymanie linii).","score":5,"notes":""},"109":{"status":"OK","is_ko":true,"clause":"4.2 Hold Lot (KO)","question":"Status produktu: Wyroby niezgodne z CCP są natychmiast fizycznie i systemowo izolowane (Hold/Zablokowane).","score":5,"notes":""},"110":{"status":"OK","is_ko":false,"clause":"4.3 Raportowanie","question":"Każde odchylenie na CCP jest w pełni udokumentowane w Raporcie Niezgodności.","score":5,"notes":""}}');
INSERT INTO "audits" VALUES(10,'2026-09-08 13:08:02','A. Nowak','linia 4454','Zmiana A','Wysoka Higiena (High Care)','HACCP','ZGODNY',100.0,NULL,'{
  "status": "NOK",
  "poziom_ryzyka": "KRYTYCZNE (HOLD LOT)",
  "decyzja": "Wstrzymanie partii (Hold Lot) od ostatniego poprawnego testu wzorca CCP1 Fe. Natychmiastowe zatrzymanie linii.",
  "akcje_korygujace": [
    "Założenie blokady fizycznej i magazynowej (status HOLD w ERP) na całą linię od ostatniego poprawnego testu wzorca CCP1 Fe",
    "Przegląd mechaniczny i reasortowanie surowca do nowej partii gotowego wyrobów",
    "Weryfikacja głowicy detektora wzorcovego roboczego na 100% odzieżowych strefach wibracyjnych"
  ],
  "podpowiedzi_prewencyjne": [
    "Zatrzymanie wpuszczenia surowca do systemu linii od ostatniego poprawnego testu wzorca CCP1 Fe",
    "Przegląd i blokada magazynowa partii gotowego wyrobów przetworzonych w ostatnich 2 godzinach"
  ]
}',NULL,'TAK','BRAK','ZGODNY','ZGODNY','ZGODNY','Produkcja Ciągła','ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY',5,'ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY',0,'KRYTYCZNE (HOLD LOT)','NOK','ZABLOKOWANY','IN_PROGRESS',NULL,NULL,100.0,0,NULL,'ZGODNY','ZGODNY',5,5,'ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY','BRAK ZGŁOSZEŃ','{"101":{"status":"OK","is_ko":false,"clause":"1.1 Analiza","question":"Aktualność Planu HACCP: Schemat technologiczny na linii (flow diagram) odzwierciedla faktyczny przebieg procesu.","score":5,"notes":""},"102":{"status":"OK","is_ko":false,"clause":"1.2 Świadomość","question":"Operatorzy znają główne zagrożenia (biologiczne, chemiczne, fizyczne, alergeny) dla ich stanowiska.","score":5,"notes":""},"103":{"status":"OK","is_ko":false,"clause":"2.1 Limity CCP","question":"Wartości docelowe i limity krytyczne są jasno zdefiniowane i widoczne przy stanowisku CCP.","score":5,"notes":""},"104":{"status":"OK","is_ko":false,"clause":"2.2 Walidacja","question":"Urządzenia kontrolno-pomiarowe używane w CCP posiadają ważne świadectwa kalibracji/wzorcowania.","score":5,"notes":""},"105":{"status":"OK","is_ko":false,"clause":"3.1 Logi","question":"Rejestracja wyników: Arkusze CCP są wypełniane na bieżąco, w czasie rzeczywistym, a nie wstecz.","score":5,"notes":""},"106":{"status":"OK","is_ko":true,"clause":"3.2 Częstotliwość (KO)","question":"Częstotliwość zapisów jest w 100% zgodna z Planem HACCP (np. test detektora co 1h).","score":5,"notes":""},"107":{"status":"OK","is_ko":false,"clause":"3.3 Autoryzacja","question":"Podpisy: Dokumenty z CCP są czytelnie podpisane przez wyznaczonego operatora.","score":5,"notes":""},"108":{"status":"OK","is_ko":false,"clause":"4.1 Proc. Awaryjne","question":"Działania korygujące: Operatorzy wiedzą, co zrobić przy przekroczeniu limitu (zatrzymanie linii).","score":5,"notes":""},"109":{"status":"OK","is_ko":true,"clause":"4.2 Hold Lot (KO)","question":"Status produktu: Wyroby niezgodne z CCP są natychmiast fizycznie i systemowo izolowane (Hold/Zablokowane).","score":5,"notes":""},"110":{"status":"OK","is_ko":false,"clause":"4.3 Raportowanie","question":"Każde odchylenie na CCP jest w pełni udokumentowane w Raporcie Niezgodności.","score":5,"notes":""}}');
INSERT INTO "audits" VALUES(11,'2026-09-08 13:08:02','A. Nowak','linia 4454','Zmiana A','Wysoka Higiena (High Care)','HACCP','ZGODNY',100.0,NULL,'{
  "status": "NOK",
  "poziom_ryzyka": "KRYTYCZNE (HOLD LOT)",
  "decyzja": "Wstrzymanie partii (Hold Lot) od ostatniego poprawnego testu wzorca CCP1 Fe. Natychmiastowe zatrzymanie linii.",
  "akcje_korygujace": [
    "Założenie blokady fizycznej i magazynowej (status HOLD w ERP) na całą linię od ostatniego poprawnego testu wzorca CCP1 Fe",
    "Przegląd mechaniczny i reasortowanie surowca do nowej partii gotowego wyrobów",
    "Ponowne 100% przetestowanie weryfikacji sita roboczego na całe tempo"
  ],
  "podpowiedzi_prewencyjne": [
    "Zatrzymanie wpuszczenia surowca do strefy roboczé od ostatniego poprawnego testu wzorca CCP1 Fe",
    "Przegląd i stabilizacja napięcia zasilania głowicy detektora sita roboczego"
  ]
}',NULL,'TAK','BRAK','ZGODNY','ZGODNY','ZGODNY','Produkcja Ciągła','ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY',5,'ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY',0,'KRYTYCZNE (HOLD LOT)','NOK','ZABLOKOWANY','IN_PROGRESS',NULL,NULL,100.0,0,NULL,'ZGODNY','ZGODNY',5,5,'ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY','BRAK ZGŁOSZEŃ','{"101":{"status":"OK","is_ko":false,"clause":"1.1 Analiza","question":"Aktualność Planu HACCP: Schemat technologiczny na linii (flow diagram) odzwierciedla faktyczny przebieg procesu.","score":5,"notes":""},"102":{"status":"OK","is_ko":false,"clause":"1.2 Świadomość","question":"Operatorzy znają główne zagrożenia (biologiczne, chemiczne, fizyczne, alergeny) dla ich stanowiska.","score":5,"notes":""},"103":{"status":"OK","is_ko":false,"clause":"2.1 Limity CCP","question":"Wartości docelowe i limity krytyczne są jasno zdefiniowane i widoczne przy stanowisku CCP.","score":5,"notes":""},"104":{"status":"OK","is_ko":false,"clause":"2.2 Walidacja","question":"Urządzenia kontrolno-pomiarowe używane w CCP posiadają ważne świadectwa kalibracji/wzorcowania.","score":5,"notes":""},"105":{"status":"OK","is_ko":false,"clause":"3.1 Logi","question":"Rejestracja wyników: Arkusze CCP są wypełniane na bieżąco, w czasie rzeczywistym, a nie wstecz.","score":5,"notes":""},"106":{"status":"OK","is_ko":true,"clause":"3.2 Częstotliwość (KO)","question":"Częstotliwość zapisów jest w 100% zgodna z Planem HACCP (np. test detektora co 1h).","score":5,"notes":""},"107":{"status":"OK","is_ko":false,"clause":"3.3 Autoryzacja","question":"Podpisy: Dokumenty z CCP są czytelnie podpisane przez wyznaczonego operatora.","score":5,"notes":""},"108":{"status":"OK","is_ko":false,"clause":"4.1 Proc. Awaryjne","question":"Działania korygujące: Operatorzy wiedzą, co zrobić przy przekroczeniu limitu (zatrzymanie linii).","score":5,"notes":""},"109":{"status":"OK","is_ko":true,"clause":"4.2 Hold Lot (KO)","question":"Status produktu: Wyroby niezgodne z CCP są natychmiast fizycznie i systemowo izolowane (Hold/Zablokowane).","score":5,"notes":""},"110":{"status":"OK","is_ko":false,"clause":"4.3 Raportowanie","question":"Każde odchylenie na CCP jest w pełni udokumentowane w Raporcie Niezgodności.","score":5,"notes":""}}');
INSERT INTO "audits" VALUES(12,'2026-09-08 13:08:02','A. Nowak','linia 4454','Zmiana A','Wysoka Higiena (High Care)','HACCP','ZGODNY',100.0,NULL,'{
  "status": "NOK",
  "poziom_ryzyka": "KRYTYCZNE (HOLD LOT)",
  "decyzja": "Wstrzymanie partii (Hold Lot) od ostatniego poprawnego testu wzorca CCP1 Fe. Natychmiastowe zatrzymanie linii.",
  "akcje_korygujace": [
    "Założenie blokady fizycznej i magazynowej (status HOLD w ERP) na całą linię od ostatniego poprawnego testu wzorca CCP1 Fe",
    "Przegląd mechaniczny i reasortowanie surowca do nowej partii gotowego wyrobów",
    "Ponowne 100% przetestowanie weryfikacji sita roboczego na całe tempo"
  ],
  "podpowiedzi_prewencyjne": [
    "Zatrzymanie wpuszczenia surowca do strefy roboczé od ostatniego poprawnego testu wzorca CCP1 Fe",
    "Przegląd i stabilizacja napięcia zasilania głowicy detektora sita roboczego"
  ]
}',NULL,'TAK','BRAK','ZGODNY','ZGODNY','ZGODNY','Produkcja Ciągła','ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY',5,'ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY',0,'KRYTYCZNE (HOLD LOT)','NOK','ZABLOKOWANY','IN_PROGRESS',NULL,NULL,100.0,0,NULL,'ZGODNY','ZGODNY',5,5,'ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY','BRAK ZGŁOSZEŃ','{"101":{"status":"OK","is_ko":false,"clause":"1.1 Analiza","question":"Aktualność Planu HACCP: Schemat technologiczny na linii (flow diagram) odzwierciedla faktyczny przebieg procesu.","score":5,"notes":""},"102":{"status":"OK","is_ko":false,"clause":"1.2 Świadomość","question":"Operatorzy znają główne zagrożenia (biologiczne, chemiczne, fizyczne, alergeny) dla ich stanowiska.","score":5,"notes":""},"103":{"status":"OK","is_ko":false,"clause":"2.1 Limity CCP","question":"Wartości docelowe i limity krytyczne są jasno zdefiniowane i widoczne przy stanowisku CCP.","score":5,"notes":""},"104":{"status":"OK","is_ko":false,"clause":"2.2 Walidacja","question":"Urządzenia kontrolno-pomiarowe używane w CCP posiadają ważne świadectwa kalibracji/wzorcowania.","score":5,"notes":""},"105":{"status":"OK","is_ko":false,"clause":"3.1 Logi","question":"Rejestracja wyników: Arkusze CCP są wypełniane na bieżąco, w czasie rzeczywistym, a nie wstecz.","score":5,"notes":""},"106":{"status":"OK","is_ko":true,"clause":"3.2 Częstotliwość (KO)","question":"Częstotliwość zapisów jest w 100% zgodna z Planem HACCP (np. test detektora co 1h).","score":5,"notes":""},"107":{"status":"OK","is_ko":false,"clause":"3.3 Autoryzacja","question":"Podpisy: Dokumenty z CCP są czytelnie podpisane przez wyznaczonego operatora.","score":5,"notes":""},"108":{"status":"OK","is_ko":false,"clause":"4.1 Proc. Awaryjne","question":"Działania korygujące: Operatorzy wiedzą, co zrobić przy przekroczeniu limitu (zatrzymanie linii).","score":5,"notes":""},"109":{"status":"OK","is_ko":true,"clause":"4.2 Hold Lot (KO)","question":"Status produktu: Wyroby niezgodne z CCP są natychmiast fizycznie i systemowo izolowane (Hold/Zablokowane).","score":5,"notes":""},"110":{"status":"OK","is_ko":false,"clause":"4.3 Raportowanie","question":"Każde odchylenie na CCP jest w pełni udokumentowane w Raporcie Niezgodności.","score":5,"notes":""}}');
INSERT INTO "audits" VALUES(13,'2026-09-08 13:08:02','A. Nowak','linia 4454','Zmiana A','Wysoka Higiena (High Care)','HACCP','ZGODNY',100.0,NULL,'{
  "status": "NOK",
  "poziom_ryzyka": "KRYTYCZNE (HOLD LOT)",
  "decyzja": "Wstrzymanie partii (Hold Lot) od ostatniego poprawnego testu wzorca CCP1 Fe. Natychmiastowe zatrzymanie linii.",
  "akcje_korygujace": [
    "Założenie blokady fizycznej i magazynowej (status HOLD w ERP) na całą linię od ostatniego poprawnego testu wzorca CCP1 Fe",
    "Przegląd mechaniczny i reasortowanie surowca do nowej partii gotowego wyrobów",
    "Ponowne 100% przetestowanie weryfikacji sita roboczego na całe tempo"
  ],
  "podpowiedzi_prewencyjne": [
    "Zatrzymanie wpuszczenia surowca do strefy roboczé od ostatniego poprawnego testu wzorca CCP1 Fe",
    "Przegląd i stabilizacja napięcia zasilania głowicy detektora sita roboczego"
  ]
}',NULL,'TAK','BRAK','ZGODNY','ZGODNY','ZGODNY','Produkcja Ciągła','ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY',5,'ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY',0,'KRYTYCZNE (HOLD LOT)','NOK','ZABLOKOWANY','IN_PROGRESS',NULL,NULL,100.0,0,NULL,'ZGODNY','ZGODNY',5,5,'ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY','BRAK ZGŁOSZEŃ','{"101":{"status":"OK","is_ko":false,"clause":"1.1 Analiza","question":"Aktualność Planu HACCP: Schemat technologiczny na linii (flow diagram) odzwierciedla faktyczny przebieg procesu.","score":5,"notes":""},"102":{"status":"OK","is_ko":false,"clause":"1.2 Świadomość","question":"Operatorzy znają główne zagrożenia (biologiczne, chemiczne, fizyczne, alergeny) dla ich stanowiska.","score":5,"notes":""},"103":{"status":"OK","is_ko":false,"clause":"2.1 Limity CCP","question":"Wartości docelowe i limity krytyczne są jasno zdefiniowane i widoczne przy stanowisku CCP.","score":5,"notes":""},"104":{"status":"OK","is_ko":false,"clause":"2.2 Walidacja","question":"Urządzenia kontrolno-pomiarowe używane w CCP posiadają ważne świadectwa kalibracji/wzorcowania.","score":5,"notes":""},"105":{"status":"OK","is_ko":false,"clause":"3.1 Logi","question":"Rejestracja wyników: Arkusze CCP są wypełniane na bieżąco, w czasie rzeczywistym, a nie wstecz.","score":5,"notes":""},"106":{"status":"OK","is_ko":true,"clause":"3.2 Częstotliwość (KO)","question":"Częstotliwość zapisów jest w 100% zgodna z Planem HACCP (np. test detektora co 1h).","score":5,"notes":""},"107":{"status":"OK","is_ko":false,"clause":"3.3 Autoryzacja","question":"Podpisy: Dokumenty z CCP są czytelnie podpisane przez wyznaczonego operatora.","score":5,"notes":""},"108":{"status":"OK","is_ko":false,"clause":"4.1 Proc. Awaryjne","question":"Działania korygujące: Operatorzy wiedzą, co zrobić przy przekroczeniu limitu (zatrzymanie linii).","score":5,"notes":""},"109":{"status":"OK","is_ko":true,"clause":"4.2 Hold Lot (KO)","question":"Status produktu: Wyroby niezgodne z CCP są natychmiast fizycznie i systemowo izolowane (Hold/Zablokowane).","score":5,"notes":""},"110":{"status":"OK","is_ko":false,"clause":"4.3 Raportowanie","question":"Każde odchylenie na CCP jest w pełni udokumentowane w Raporcie Niezgodności.","score":5,"notes":""}}');
INSERT INTO "audits" VALUES(14,'2026-09-08 13:08:02','A. Nowak','linia 4454','Zmiana A','Wysoka Higiena (High Care)','HACCP','ZGODNY',100.0,NULL,'{
  "status": "NOK",
  "poziom_ryzyka": "KRYTYCZNE (HOLD LOT)",
  "decyzja": "Wstrzymanie partii (Hold Lot) od ostatniego poprawnego testu wzorca CCP1 Fe. Natychmiastowe zatrzymanie linii.",
  "akcje_korygujace": [
    "Założenie blokady fizycznej i magazynowej (status HOLD w ERP) na całą linię od ostatniego poprawnego testu wzorca CCP1 Fe",
    "Przegląd mechaniczny i reasortowanie surowca do nowej partii gotowego wyrobów",
    "Ponowne 100% przetestowanie weryfikacji situacony czułości sita odzieżowego na całe tempo"
  ],
  "podpowiedzi_prewencyjne": [
    "Zatrzymanie wpuszczenia surowca do strefy roboczéj linii przez 48 godzin",
    "Przegląd i blokada magazynowa partii wyprodukowanej od ostatniego poprawnego testu sita"
  ]
}',NULL,'TAK','BRAK','ZGODNY','ZGODNY','ZGODNY','Produkcja Ciągła','ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY',5,'ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY',0,'KRYTYCZNE (HOLD LOT)','NOK','ZABLOKOWANY','IN_PROGRESS',NULL,NULL,100.0,0,NULL,'ZGODNY','ZGODNY',5,5,'ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY','BRAK ZGŁOSZEŃ','{"101":{"status":"OK","is_ko":false,"clause":"1.1 Analiza","question":"Aktualność Planu HACCP: Schemat technologiczny na linii (flow diagram) odzwierciedla faktyczny przebieg procesu.","score":5,"notes":""},"102":{"status":"OK","is_ko":false,"clause":"1.2 Świadomość","question":"Operatorzy znają główne zagrożenia (biologiczne, chemiczne, fizyczne, alergeny) dla ich stanowiska.","score":5,"notes":""},"103":{"status":"OK","is_ko":false,"clause":"2.1 Limity CCP","question":"Wartości docelowe i limity krytyczne są jasno zdefiniowane i widoczne przy stanowisku CCP.","score":5,"notes":""},"104":{"status":"OK","is_ko":false,"clause":"2.2 Walidacja","question":"Urządzenia kontrolno-pomiarowe używane w CCP posiadają ważne świadectwa kalibracji/wzorcowania.","score":5,"notes":""},"105":{"status":"OK","is_ko":false,"clause":"3.1 Logi","question":"Rejestracja wyników: Arkusze CCP są wypełniane na bieżąco, w czasie rzeczywistym, a nie wstecz.","score":5,"notes":""},"106":{"status":"OK","is_ko":true,"clause":"3.2 Częstotliwość (KO)","question":"Częstotliwość zapisów jest w 100% zgodna z Planem HACCP (np. test detektora co 1h).","score":5,"notes":""},"107":{"status":"OK","is_ko":false,"clause":"3.3 Autoryzacja","question":"Podpisy: Dokumenty z CCP są czytelnie podpisane przez wyznaczonego operatora.","score":5,"notes":""},"108":{"status":"OK","is_ko":false,"clause":"4.1 Proc. Awaryjne","question":"Działania korygujące: Operatorzy wiedzą, co zrobić przy przekroczeniu limitu (zatrzymanie linii).","score":5,"notes":""},"109":{"status":"OK","is_ko":true,"clause":"4.2 Hold Lot (KO)","question":"Status produktu: Wyroby niezgodne z CCP są natychmiast fizycznie i systemowo izolowane (Hold/Zablokowane).","score":5,"notes":""},"110":{"status":"OK","is_ko":false,"clause":"4.3 Raportowanie","question":"Każde odchylenie na CCP jest w pełni udokumentowane w Raporcie Niezgodności.","score":5,"notes":""}}');
INSERT INTO "audits" VALUES(15,'2026-09-08 13:08:02','A. Nowak','linia 4454','Zmiana A','Wysoka Higiena (High Care)','HACCP','ZGODNY',100.0,NULL,'{
  "status": "NOK",
  "poziom_ryzyka": "KRYTYCZNE (HOLD LOT)",
  "decyzja": "Wstrzymanie partii (Hold Lot) od ostatniego poprawnego testu wzorca CCP1 Fe. Natychmiastowe zatrzymanie linii.",
  "akcje_korygujace": [
    "Założenie blokady fizycznej i magazynowej (status HOLD w ERP) na całą linię od ostatniego poprawnego testu wzorca CCP1 Fe",
    "Przegląd mechaniczny i reasortowanie surowca do nowej partii gotowego wyrobów",
    "Ponowne 100% przetestowanie weryfikacji sita roboczego na całe tempo"
  ],
  "podpowiedzi_prewencyjne": [
    "Zatrzymanie wpuszczenia surowca do strefy roboczé od ostatniego poprawnego testu wzorca CCP1 Fe",
    "Przegląd i stabilizacja napięcia zasilania głowicy detektora sita roboczego"
  ]
}',NULL,'TAK','BRAK','ZGODNY','ZGODNY','ZGODNY','Produkcja Ciągła','ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY',5,'ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY',0,'KRYTYCZNE (HOLD LOT)','NOK','ZABLOKOWANY','IN_PROGRESS',NULL,NULL,100.0,0,NULL,'ZGODNY','ZGODNY',5,5,'ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY','BRAK ZGŁOSZEŃ','{"101":{"status":"OK","is_ko":false,"clause":"1.1 Analiza","question":"Aktualność Planu HACCP: Schemat technologiczny na linii (flow diagram) odzwierciedla faktyczny przebieg procesu.","score":5,"notes":""},"102":{"status":"OK","is_ko":false,"clause":"1.2 Świadomość","question":"Operatorzy znają główne zagrożenia (biologiczne, chemiczne, fizyczne, alergeny) dla ich stanowiska.","score":5,"notes":""},"103":{"status":"OK","is_ko":false,"clause":"2.1 Limity CCP","question":"Wartości docelowe i limity krytyczne są jasno zdefiniowane i widoczne przy stanowisku CCP.","score":5,"notes":""},"104":{"status":"OK","is_ko":false,"clause":"2.2 Walidacja","question":"Urządzenia kontrolno-pomiarowe używane w CCP posiadają ważne świadectwa kalibracji/wzorcowania.","score":5,"notes":""},"105":{"status":"OK","is_ko":false,"clause":"3.1 Logi","question":"Rejestracja wyników: Arkusze CCP są wypełniane na bieżąco, w czasie rzeczywistym, a nie wstecz.","score":5,"notes":""},"106":{"status":"OK","is_ko":true,"clause":"3.2 Częstotliwość (KO)","question":"Częstotliwość zapisów jest w 100% zgodna z Planem HACCP (np. test detektora co 1h).","score":5,"notes":""},"107":{"status":"OK","is_ko":false,"clause":"3.3 Autoryzacja","question":"Podpisy: Dokumenty z CCP są czytelnie podpisane przez wyznaczonego operatora.","score":5,"notes":""},"108":{"status":"OK","is_ko":false,"clause":"4.1 Proc. Awaryjne","question":"Działania korygujące: Operatorzy wiedzą, co zrobić przy przekroczeniu limitu (zatrzymanie linii).","score":5,"notes":""},"109":{"status":"OK","is_ko":true,"clause":"4.2 Hold Lot (KO)","question":"Status produktu: Wyroby niezgodne z CCP są natychmiast fizycznie i systemowo izolowane (Hold/Zablokowane).","score":5,"notes":""},"110":{"status":"OK","is_ko":false,"clause":"4.3 Raportowanie","question":"Każde odchylenie na CCP jest w pełni udokumentowane w Raporcie Niezgodności.","score":5,"notes":""}}');
INSERT INTO "audits" VALUES(16,'2026-09-08 13:08:02','A. Nowak','linia 4454','Zmiana A','Wysoka Higiena (High Care)','HACCP','ZGODNY',100.0,NULL,'{
  "status": "NOK",
  "poziom_ryzyka": "KRYTYCZNE (HOLD LOT)",
  "decyzja": "Wstrzymanie partii (Hold Lot) od ostatniego poprawnego testu wzorca CCP1 Fe. Natychmiastowe zatrzymanie linii.",
  "akcje_korygujace": [
    "Założenie blokady fizycznej i magazynowej (status HOLD w ERP) na całą linię od ostatniego poprawnego testu wzorca CCP1 Fe",
    "Przegląd mechaniczny i reasortowanie surowca do nowej partii gotowego wyrobów",
    "Ponowne 100% przetestowanie weryfikacji situacony czułości sita odzieżowego na całe tempo"
  ],
  "podpowiedzi_prewencyjne": [
    "Zatrzymanie wpuszczenia surowca do strefy roboczéj linii przez 48 godzin",
    "Przegląd i blokada magazynowa ramienia odrzucającego sita odzieżowych w śluzach wejściowych"
  ]
}',NULL,'TAK','BRAK','ZGODNY','ZGODNY','ZGODNY','Produkcja Ciągła','ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY',5,'ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY',0,'KRYTYCZNE (HOLD LOT)','NOK','ZABLOKOWANY','IN_PROGRESS',NULL,NULL,100.0,0,NULL,'ZGODNY','ZGODNY',5,5,'ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY','BRAK ZGŁOSZEŃ','{"101":{"status":"OK","is_ko":false,"clause":"1.1 Analiza","question":"Aktualność Planu HACCP: Schemat technologiczny na linii (flow diagram) odzwierciedla faktyczny przebieg procesu.","score":5,"notes":""},"102":{"status":"OK","is_ko":false,"clause":"1.2 Świadomość","question":"Operatorzy znają główne zagrożenia (biologiczne, chemiczne, fizyczne, alergeny) dla ich stanowiska.","score":5,"notes":""},"103":{"status":"OK","is_ko":false,"clause":"2.1 Limity CCP","question":"Wartości docelowe i limity krytyczne są jasno zdefiniowane i widoczne przy stanowisku CCP.","score":5,"notes":""},"104":{"status":"OK","is_ko":false,"clause":"2.2 Walidacja","question":"Urządzenia kontrolno-pomiarowe używane w CCP posiadają ważne świadectwa kalibracji/wzorcowania.","score":5,"notes":""},"105":{"status":"OK","is_ko":false,"clause":"3.1 Logi","question":"Rejestracja wyników: Arkusze CCP są wypełniane na bieżąco, w czasie rzeczywistym, a nie wstecz.","score":5,"notes":""},"106":{"status":"OK","is_ko":true,"clause":"3.2 Częstotliwość (KO)","question":"Częstotliwość zapisów jest w 100% zgodna z Planem HACCP (np. test detektora co 1h).","score":5,"notes":""},"107":{"status":"OK","is_ko":false,"clause":"3.3 Autoryzacja","question":"Podpisy: Dokumenty z CCP są czytelnie podpisane przez wyznaczonego operatora.","score":5,"notes":""},"108":{"status":"OK","is_ko":false,"clause":"4.1 Proc. Awaryjne","question":"Działania korygujące: Operatorzy wiedzą, co zrobić przy przekroczeniu limitu (zatrzymanie linii).","score":5,"notes":""},"109":{"status":"OK","is_ko":true,"clause":"4.2 Hold Lot (KO)","question":"Status produktu: Wyroby niezgodne z CCP są natychmiast fizycznie i systemowo izolowane (Hold/Zablokowane).","score":5,"notes":""},"110":{"status":"OK","is_ko":false,"clause":"4.3 Raportowanie","question":"Każde odchylenie na CCP jest w pełni udokumentowane w Raporcie Niezgodności.","score":5,"notes":""}}');
INSERT INTO "audits" VALUES(17,'2026-09-08 13:08:02','A. Nowak','linia 4454','Zmiana A','Wysoka Higiena (High Care)','HACCP','ZGODNY',100.0,NULL,'{
  "status": "NOK",
  "poziom_ryzyka": "KRYTYCZNE (HOLD LOT)",
  "decyzja": "Wstrzymanie partii (Hold Lot) od ostatniego poprawnego testu wzorca CCP1 Fe. Natychmiastowe zatrzymanie linii.",
  "akcje_korygujace": [
    "Założenie blokady fizycznej i magazynowej (status HOLD w ERP) na całą linię od ostatniego poprawnego testu wzorca CCP1 Fe",
    "Przegląd mechaniczny i reasortowanie surowca do nowej partii gotowego wyrobów",
    "Ponowne 100% przetestowanie weryfikacji situacony czułości (Sensor Check) na całe masy wejściowe"
  ],
  "podpowiedzi_prewencyjne": [
    "Zatrzymanie wpuszczenia nowego surowca do systemu roboczego od użycia ostatniego poprawnego testu wzorca CCP1 Fe",
    "Przegląd i stabilizacja strefy czystości pod kątem weryfikacji situacony czułości (Sensor Check) na całe masy wejściowe"
  ]
}',NULL,'TAK','BRAK','ZGODNY','ZGODNY','ZGODNY','Produkcja Ciągła','ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY',5,'ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY',0,'KRYTYCZNE (HOLD LOT)','NOK','ZABLOKOWANY','IN_PROGRESS',NULL,NULL,100.0,0,NULL,'ZGODNY','ZGODNY',5,5,'ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY','BRAK ZGŁOSZEŃ','{"101":{"status":"OK","is_ko":false,"clause":"1.1 Analiza","question":"Aktualność Planu HACCP: Schemat technologiczny na linii (flow diagram) odzwierciedla faktyczny przebieg procesu.","score":5,"notes":""},"102":{"status":"OK","is_ko":false,"clause":"1.2 Świadomość","question":"Operatorzy znają główne zagrożenia (biologiczne, chemiczne, fizyczne, alergeny) dla ich stanowiska.","score":5,"notes":""},"103":{"status":"OK","is_ko":false,"clause":"2.1 Limity CCP","question":"Wartości docelowe i limity krytyczne są jasno zdefiniowane i widoczne przy stanowisku CCP.","score":5,"notes":""},"104":{"status":"OK","is_ko":false,"clause":"2.2 Walidacja","question":"Urządzenia kontrolno-pomiarowe używane w CCP posiadają ważne świadectwa kalibracji/wzorcowania.","score":5,"notes":""},"105":{"status":"OK","is_ko":false,"clause":"3.1 Logi","question":"Rejestracja wyników: Arkusze CCP są wypełniane na bieżąco, w czasie rzeczywistym, a nie wstecz.","score":5,"notes":""},"106":{"status":"OK","is_ko":true,"clause":"3.2 Częstotliwość (KO)","question":"Częstotliwość zapisów jest w 100% zgodna z Planem HACCP (np. test detektora co 1h).","score":5,"notes":""},"107":{"status":"OK","is_ko":false,"clause":"3.3 Autoryzacja","question":"Podpisy: Dokumenty z CCP są czytelnie podpisane przez wyznaczonego operatora.","score":5,"notes":""},"108":{"status":"OK","is_ko":false,"clause":"4.1 Proc. Awaryjne","question":"Działania korygujące: Operatorzy wiedzą, co zrobić przy przekroczeniu limitu (zatrzymanie linii).","score":5,"notes":""},"109":{"status":"OK","is_ko":true,"clause":"4.2 Hold Lot (KO)","question":"Status produktu: Wyroby niezgodne z CCP są natychmiast fizycznie i systemowo izolowane (Hold/Zablokowane).","score":5,"notes":""},"110":{"status":"OK","is_ko":false,"clause":"4.3 Raportowanie","question":"Każde odchylenie na CCP jest w pełni udokumentowane w Raporcie Niezgodności.","score":5,"notes":""}}');
INSERT INTO "audits" VALUES(18,'2026-09-08 13:08:02','A. Nowak','linia 4454','Zmiana A','Wysoka Higiena (High Care)','HACCP','ZGODNY',100.0,NULL,'{
  "status": "NOK",
  "poziom_ryzyka": "KRYTYCZNE (HOLD LOT)",
  "decyzja": "Wstrzymanie partii (Hold Lot) od ostatniego poprawnego testu wzorca CCP1 Fe. Natychmiastowe zatrzymanie linii.",
  "akcje_korygujace": [
    "Założenie blokady fizycznej i magazynowej (status HOLD w ERP) na całą linię od ostatniego poprawnego testu wzorca CCP1 Fe",
    "Przegląd mechaniczny i reasortowanie surowca do nowej partii gotowego wyrobów",
    "Ponowne 100% przetestowanie weryfikacji sita roboczego na całe tempo"
  ],
  "podpowiedzi_prewencyjne": [
    "Zatrzymanie wpuszczenia surowca do strefy roboczé od ostatniego poprawnego testu wzorca CCP1 Fe",
    "Przegląd i stabilizacja napięcia zasilania głowicy detektora sita roboczego"
  ]
}',NULL,'TAK','BRAK','ZGODNY','ZGODNY','ZGODNY','Produkcja Ciągła','ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY',5,'ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY',0,'KRYTYCZNE (HOLD LOT)','NOK','ZABLOKOWANY','IN_PROGRESS',NULL,NULL,100.0,0,NULL,'ZGODNY','ZGODNY',5,5,'ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY','BRAK ZGŁOSZEŃ','{"101":{"status":"OK","is_ko":false,"clause":"1.1 Analiza","question":"Aktualność Planu HACCP: Schemat technologiczny na linii (flow diagram) odzwierciedla faktyczny przebieg procesu.","score":5,"notes":""},"102":{"status":"OK","is_ko":false,"clause":"1.2 Świadomość","question":"Operatorzy znają główne zagrożenia (biologiczne, chemiczne, fizyczne, alergeny) dla ich stanowiska.","score":5,"notes":""},"103":{"status":"OK","is_ko":false,"clause":"2.1 Limity CCP","question":"Wartości docelowe i limity krytyczne są jasno zdefiniowane i widoczne przy stanowisku CCP.","score":5,"notes":""},"104":{"status":"OK","is_ko":false,"clause":"2.2 Walidacja","question":"Urządzenia kontrolno-pomiarowe używane w CCP posiadają ważne świadectwa kalibracji/wzorcowania.","score":5,"notes":""},"105":{"status":"OK","is_ko":false,"clause":"3.1 Logi","question":"Rejestracja wyników: Arkusze CCP są wypełniane na bieżąco, w czasie rzeczywistym, a nie wstecz.","score":5,"notes":""},"106":{"status":"OK","is_ko":true,"clause":"3.2 Częstotliwość (KO)","question":"Częstotliwość zapisów jest w 100% zgodna z Planem HACCP (np. test detektora co 1h).","score":5,"notes":""},"107":{"status":"OK","is_ko":false,"clause":"3.3 Autoryzacja","question":"Podpisy: Dokumenty z CCP są czytelnie podpisane przez wyznaczonego operatora.","score":5,"notes":""},"108":{"status":"OK","is_ko":false,"clause":"4.1 Proc. Awaryjne","question":"Działania korygujące: Operatorzy wiedzą, co zrobić przy przekroczeniu limitu (zatrzymanie linii).","score":5,"notes":""},"109":{"status":"OK","is_ko":true,"clause":"4.2 Hold Lot (KO)","question":"Status produktu: Wyroby niezgodne z CCP są natychmiast fizycznie i systemowo izolowane (Hold/Zablokowane).","score":5,"notes":""},"110":{"status":"OK","is_ko":false,"clause":"4.3 Raportowanie","question":"Każde odchylenie na CCP jest w pełni udokumentowane w Raporcie Niezgodności.","score":5,"notes":""}}');
INSERT INTO "audits" VALUES(19,'2026-09-08 13:25:50','A. Nowak','linia 4454','Zmiana A','Wysoka Higiena (High Care)','HACCP','ZGODNY',100.0,NULL,'{
  "status": "NOK",
  "poziom_ryzyka": "KRYTYCZNE (HOLD LOT)",
  "decyzja": "Wstrzymanie partii (Hold Lot) od ostatniego poprawnego testu wzorca CCP1 Fe. Natychmiastowe zatrzymanie linii.",
  "akcje_korygujace": [
    "Założenie blokady fizycznej i magazynowej (status HOLD w ERP) na całą linię od ostatniego poprawnego testu wzorca CCP1 Fe",
    "Przegląd mechaniczny i reasortowanie surowca do nowej partii gotowego wyrobów",
    "Ponowne 100% przetestowanie weryfikacji sita roboczego na całe tempo"
  ],
  "podpowiedzi_prewencyjne": [
    "Zatrzymanie wpuszczenia surowca do strefy roboczé od ostatniego poprawnego testu wzorca CCP1 Fe",
    "Przegląd i stabilizacja napięcia zasilania głowicy detektora sita roboczego"
  ]
}',NULL,'TAK','BRAK','ZGODNY','ZGODNY','ZGODNY','Produkcja Ciągła','ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY',5,'ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY',0,'KRYTYCZNE (HOLD LOT)','NOK','ODBLOKOWANY_DO_KOREKTY','IN_PROGRESS',NULL,NULL,100.0,0,NULL,'ZGODNY','ZGODNY',5,5,'ZGODNY','ZGODNY','ZGODNY','ZGODNY','ZGODNY','BRAK ZGŁOSZEŃ','{"101":{"status":"OK","is_ko":false,"clause":"1.1 Analiza","question":"Aktualność Planu HACCP: Schemat technologiczny na linii (flow diagram) odzwierciedla faktyczny przebieg procesu.","score":5,"notes":""},"102":{"status":"OK","is_ko":false,"clause":"1.2 Świadomość","question":"Operatorzy znają główne zagrożenia (biologiczne, chemiczne, fizyczne, alergeny) dla ich stanowiska.","score":5,"notes":""},"103":{"status":"OK","is_ko":false,"clause":"2.1 Limity CCP","question":"Wartości docelowe i limity krytyczne są jasno zdefiniowane i widoczne przy stanowisku CCP.","score":5,"notes":""},"104":{"status":"OK","is_ko":false,"clause":"2.2 Walidacja","question":"Urządzenia kontrolno-pomiarowe używane w CCP posiadają ważne świadectwa kalibracji/wzorcowania.","score":5,"notes":""},"105":{"status":"OK","is_ko":false,"clause":"3.1 Logi","question":"Rejestracja wyników: Arkusze CCP są wypełniane na bieżąco, w czasie rzeczywistym, a nie wstecz.","score":5,"notes":""},"106":{"status":"OK","is_ko":true,"clause":"3.2 Częstotliwość (KO)","question":"Częstotliwość zapisów jest w 100% zgodna z Planem HACCP (np. test detektora co 1h).","score":5,"notes":""},"107":{"status":"OK","is_ko":false,"clause":"3.3 Autoryzacja","question":"Podpisy: Dokumenty z CCP są czytelnie podpisane przez wyznaczonego operatora.","score":5,"notes":""},"108":{"status":"OK","is_ko":false,"clause":"4.1 Proc. Awaryjne","question":"Działania korygujące: Operatorzy wiedzą, co zrobić przy przekroczeniu limitu (zatrzymanie linii).","score":5,"notes":""},"109":{"status":"OK","is_ko":true,"clause":"4.2 Hold Lot (KO)","question":"Status produktu: Wyroby niezgodne z CCP są natychmiast fizycznie i systemowo izolowane (Hold/Zablokowane).","score":5,"notes":""},"110":{"status":"OK","is_ko":false,"clause":"4.3 Raportowanie","question":"Każde odchylenie na CCP jest w pełni udokumentowane w Raporcie Niezgodności.","score":5,"notes":""}}');
CREATE TABLE biometric_credentials (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            credential_id TEXT UNIQUE NOT NULL,
            public_key TEXT NOT NULL,
            created_at TEXT NOT NULL,
            device_name TEXT DEFAULT 'Domyślny Czytnik',
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
CREATE TABLE change_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            schedule_id INTEGER NOT NULL,
            requester TEXT NOT NULL,
            request_type TEXT DEFAULT 'TERMIN / ZASTĘPSTWO',
            reason TEXT NOT NULL,
            suggested_date TEXT,
            suggested_backup TEXT,
            status TEXT DEFAULT 'PENDING',
            ai_recommendation TEXT,
            created_at TEXT NOT NULL,
            reviewed_at TEXT,
            reviewer_note TEXT,
            FOREIGN KEY (schedule_id) REFERENCES audit_schedules(id)
        );
CREATE TABLE checklist_answers (
            id INTEGER PRIMARY KEY AUTOINCREMENT, audit_id INTEGER NOT NULL, question_id INTEGER NOT NULL,
            answer_status TEXT NOT NULL, comment TEXT, photo_path TEXT, score_num INTEGER DEFAULT 1,
            FOREIGN KEY (audit_id) REFERENCES audits (id) ON DELETE CASCADE
        );
CREATE TABLE checklist_guidelines (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    category_label TEXT NOT NULL,
    title TEXT NOT NULL,
    question TEXT NOT NULL,
    ifs_clause TEXT NOT NULL,
    criteria TEXT NOT NULL,
    correct_action TEXT NOT NULL,
    deviation_action TEXT NOT NULL,
    risk_level TEXT DEFAULT "MAJOR",
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "checklist_guidelines" VALUES('CCP-1','CCP','CCP / OPRP','Detektor Metali / Rentgen (X-Ray) – Weryfikacja sprawności','Czy test sprawności detektora metali/X-Ray został wykonany poprawnie przed startem partii?','IFS Food v8 p. 4.12.1 • BRCGS p. 4.10','Wymagany test na 3 wzorcach (Fe, Non-Fe, SS) umieszczonych w produkcie testowym. Mechanizm odrzutu musi zadziałać i skierować produkt do zamkniętego pojemnika z blokadą.','Wszystkie 3 wzorce wykryte i odrzucone. Prawidłowy zapis w systemie rejestracji lub na karcie kontrolnej.','Natychmiastowe zatrzymanie linii, kwarantanna wyrobów od ostatniego poprawnego testu, wezwanie UR i powiadomienie QA.','KO','2026-09-08 12:29:12');
INSERT INTO "checklist_guidelines" VALUES('CCP-2','CCP','CCP / OPRP','Temperatura i parametry obróbki termicznej / chłodzenia','Czy temperatura w krytycznym punkcie procesu mieści się w dopuszczalnych limitach technologicznych?','IFS Food v8 p. 2.2.3.8','Ciągły odczyt z zarejestrowanych czujników SCADA lub skalibrowanego termometru. Brak przekroczeń zdefiniowanego limitu krytycznego.','Parametry w normie, rejestrator ciągły sprawny, wykres zatwierdzony.','Zatrzymanie partii, zablokowanie surowca/półproduktu w magazynie kwarantannowym, wszczęcie procedury postępowania z wyrobem niezgodnym.','KO','2026-09-08 12:29:12');
INSERT INTO "checklist_guidelines" VALUES('GMP-1','GMP','GMP','Czystość linii przed rozpoczęciem partii (Clearance / C&D)','Czy linia technologiczna jest wolna od pozostałości po poprzednich produktach i alergenach?','IFS Food v8 p. 4.6.1 • BRCGS p. 4.11','Całkowity brak resztek masy, posypek czy opakowań z poprzedniej szarży. Linia osuszona, wolna od stojącej wody.','Linia czysta wizualnie, test wymazowy ATP poniżej 30 RLU, protokół line clearance podpisany.','Ponowne mycie i dezynfekcja strefy zanieczyszczonej. Wstrzymanie uruchomienia produkcji do uzyskania wyniku ujemnego.','MAJOR','2026-09-08 12:29:12');
INSERT INTO "checklist_guidelines" VALUES('GMP-2','GMP','GMP','Zarządzanie nożami i narzędziami ręcznymi','Czy wszystkie noże techniczne i ostrza są zarejestrowane, zidentyfikowane i w nienaruszonym stanie?','IFS Food v8 p. 4.9.4 • BRCGS p. 4.9.6','W strefie dopuszczone wyłącznie noże jednolite bez odłamywanych segmentów. Wszystkie sztuki ponumerowane i przypisane do tablicy cieni.','Stan ostrzy nienaruszony, liczba noży na stanowisku zgodna z rejestrem wydania.','W razie wyczerpania/ubytku ostrza: natychmiastowe zatrzymanie linii, przeszukanie strefy i partii detektorem metali, protokół incydentu.','MAJOR','2026-09-08 12:29:12');
INSERT INTO "checklist_guidelines" VALUES('GMP-3','GMP','GMP','Stan techniczny urządzeń i zapobieganie wyciekom','Czy urządzenia produkcyjne są wolne od wycieków smarów technologicznych, nieszczelności i korozji?','IFS Food v8 p. 4.10.1','Brak kontaktu smarów z produktem. Stosowanie wyłącznie atestowanych środków smarnych klasy NSF H1. Brak prowizorycznych napraw (np. taśmy, sznurki).','Maszyny stabilne, osłony dokręcone, brak oznak zanieczyszczenia wyrobów.','Zgłoszenie awarii do UR, usunięcie źródła nieszczelności, kwarantanna produktów z obszaru zagrożonego.','MAJOR','2026-09-08 12:29:12');
INSERT INTO "checklist_guidelines" VALUES('GHP-1','GHP','GHP','Higiena personelu, odzież ochronna i śluzy sanitarne','Czy pracownicy przestrzegają procedury wejścia przez śluzę oraz noszenia kompletnej odzieży ochronnej?','IFS Food v8 p. 3.2.1 • BRCGS p. 7.4','Kompletne zakrycie włosów i zarostu (siatki/kominiarki). Brak biżuterii, zegarków, lakieru do paznokci i widocznych kieszeni powyżej pasa. Czyste obuwie strefowe.','100% pracowników przechodzi pełny cykl mycia rąk i dezynfekcji w śluzie sanitarnej.','Cofnięcie pracownika do szatni/śluzy w celu usunięcia nieprawidłowości. W razie kontaktu produktu z zanieczyszczeniem – dyskwalifikacja partii.','KO','2026-09-08 12:29:12');
INSERT INTO "checklist_guidelines" VALUES('GHP-2','GHP','GHP','Stan sanitarny i dezynfekcja rąk w trakcie pracy','Czy pracownicy dezynfekują ręce po każdej czynności mogącej spowodować kontaminację?','IFS Food v8 p. 3.2.2 • BRCGS p. 7.2','Dezynfekcja dłoni wymagana po dotknięciu podłogi, podniesieniu zanieczyszczonego pojemnika lub ponownym wejściu na linię.','Czyste dłonie, brak otwartych ran; skaleczenia zabezpieczone niebieskim plastrem z paskiem metalowym i rękawiczką.','Upomnienie pracownika, natychmiastowe odesłanie do myjki i dezynfektora. Ponowna weryfikacja czystości na stanowisku.','MAJOR','2026-09-08 12:29:12');
INSERT INTO "checklist_guidelines" VALUES('GHP-3','GHP','GHP','Środki do mycia, dezynfekcji i sprzęt porządkowy (5S)','Czy sprzęt do utrzymania czystości jest kodowany kolorystycznie i właściwie przechowywany?','IFS Food v8 p. 4.6.4 • BRCGS p. 4.11.6','Dedykowane kolory sprzętu (np. niebieski – kontakt z produktem, czerwony – posadzka i odpady). Sprzęt odwieszony na wieszakach cieniowych, włosie szczotek czyste.','Brak stojących szczotek w brudnej wodzie, chemia zamknięta w wyznaczonej szafce.','Wymiana uszkodzonego sprzętu, utylizacja brudnych ścierek, ponowne szkolenie z kodowania barwnego.','MINOR','2026-09-08 12:29:12');
INSERT INTO "checklist_guidelines" VALUES('FM-1','FOREIGN_MATTER','Ciała obce','Kontrola szkła, twardego plastiku i ceramiki','Czy w strefie otwartego produktu nie ma uszkodzonych osłon ani niezabezpieczonych elementów szklanych?','IFS Food v8 p. 4.9.3 • BRCGS p. 4.9','Lampy oświetleniowe w osłonach nierozbryzgowych. Osłony z pleksi/poliwęglanu nienaruszone, zarejestrowane w rejestrze materiałów kruchych.','Wszystkie pozycje z rejestru obecne i nieuszkodzone.','Natychmiastowe wstrzymanie linii w przypadku pęknięcia, zabezpieczenie strefy, kwarantanna produktu, utylizacja odpadów pod nadzorem QA.','KO','2026-09-08 12:29:12');
INSERT INTO "checklist_guidelines" VALUES('FM-2','FOREIGN_MATTER','Ciała obce','Kontrola drewna i materiałów zakazanych','Czy w obszarze przetwórczym i pakowania bezpośredniego całkowicie wyeliminowano palety drewniane i drewno?','IFS Food v8 p. 4.9.1 • BRCGS p. 4.9.1','Zakaz wjazdu palet drewnianych do strefy czystej. Stosowanie wyłącznie palet higienicznych z tworzywa sztucznego lub wózków ze stali nierdzewnej.','Zero elementów drewnianych (skrzynki, deski, ołówki) w strefie otwartego produktu.','Natychmiastowe usunięcie drewna ze strefy, kontrola wyrobów pod kątem drzazg/wiórów.','MAJOR','2026-09-08 12:29:12');
INSERT INTO "checklist_guidelines" VALUES('ALLERG-1','GMP','Alergeny / GMP','Zarządzanie alergenami i sekwencja przezbrojeń','Czy harmonogram produkcji uwzględnia sekwencjonowanie wyrobów od bezalergenowych do zawierających alergeny?','IFS Food v8 p. 4.20.1 • BRCGS p. 5.3','Harmonogram musi minimalizować przezbrojenia krzyżowe. Surowce alergenne zidentyfikowane, oznaczone żółto-czarną taśmą i magazynowane na najniższych poziomach regałów.','Produkcja zgodna z matrycą alergenów, kompletne mycie z walidacją testem lateral flow przed przejściem na partię czystą.','Wstrzymanie startu partii wolnej od alergenu. Wykonanie czyszczenia wet/dry i testu wymazowego na obecność białka docelowego.','KO','2026-09-08 12:34:03');
INSERT INTO "checklist_guidelines" VALUES('ALLERG-2','GMP','Alergeny / GMP','Dedykowany sprzęt i oznakowanie półproduktów','Czy pojemniki, łopatki i wózki technologiczne stosowane do składników alergennych posiadają jednoznaczną identyfikację barwną?','IFS Food v8 p. 4.20.3','Dedykowane narzędzia (np. fioletowe dla alergenów). Zakaz używania tego samego osprzętu bez certyfikowanego mycia w myjce automatycznej.','Narzędzia przypisane do alergenu, brak migracji sprzętu między strefami.','Natychmiastowe wycofanie sprzętu nieoznakowanego ze strefy produktu gotowego, weryfikacja czystości.','MAJOR','2026-09-08 12:34:03');
INSERT INTO "checklist_guidelines" VALUES('TRACE-1','GMP','Identyfikowalność','Identyfikowalność surowców, półproduktów i wyrobu (Traceability)','Czy każdy pojemnik z surowcem, domieszką lub masą w toku produkcji posiada czytelną etykietę z numerem szarży?','IFS Food v8 p. 4.18.1 (KO nr 6) • BRCGS p. 3.9','100% identyfikowalność wsteczna i w przód w czasie max. 2 godzin. Etykiety odporne na wilgoć, brak pojemników z nieznaną zawartością.','Etykieta zawiera: kod materiału, nr partii dostawcy, nr szarży wewnętrznej, datę ważności.','Zablokowanie materiału bez etykiety w systemie ERP, status QUARANTINE. Oddelegowanie do utylizacji w przypadku braku możliwości weryfikacji.','KO','2026-09-08 12:34:03');
INSERT INTO "checklist_guidelines" VALUES('TRACE-2','GMP','Identyfikowalność','Zgodność bilansu masowego i rozliczenie etykiet','Czy rozliczenie zużycia materiałów opakowaniowych i etykiet wyklucza ryzyko pomyłki (label mix-up)?','IFS Food v8 p. 4.18.3 • BRCGS p. 5.4','Ścisłe rozliczenie liczby pobranych i zwróconych etykiet. Natychmiastowe niszczenie etykiet unieważnionych/odrzuconych.','Zero nadmiarowych etykiet z poprzedniej partii w zasobnikach etykieciarek.','Zatrzymanie pakowania, 100% kontrola kodów kreskowych na gotowych kartonach, weryfikacja skanerem 2D.','MAJOR','2026-09-08 12:34:03');
INSERT INTO "checklist_guidelines" VALUES('FM-3','FOREIGN_MATTER','Ciała obce','Kontrola i integralność sit oraz filtrów cieczowych','Czy sita wibracyjne i filtry rurowe są kontrolowane przed startem i po zakończeniu każdej partii?','IFS Food v8 p. 4.12.3 • BRCGS p. 4.10.2','Siatki sit bez pęknięć, ubytków oczek i deformacji. Zapis stanu w rejestrze sit z podaniem wielkości oczka (np. 1.0 mm).','Sito czyste, nienaruszone mechanicznie, protokół podpisany przez operatora.','W razie pęknięcia sita: natychmiastowe wstrzymanie dystrybucji partii, zatrzymanie wyrobów od ostatniej pozytywnej kontroli, separacja partii.','KO','2026-09-08 12:34:03');
INSERT INTO "checklist_guidelines" VALUES('FM-4','FOREIGN_MATTER','Ciała obce','Inspekcja magnesów neodymowych i separatorów','Czy magnesy na zasypach surowców sypkich są regularnie czyszczone, a wychwycone cząstki badane?','IFS Food v8 p. 4.12.5 • BRCGS p. 4.10.3','Czyszczenie wg harmonogramu (min. 1x na zmianę). Odciągnięte opiłki zabezpieczone i przekazane do Działu Jakości do oceny źródła.','Brak nagromadzonych zanieczyszczeń metalicznych osłabiających pole magnetyczne separatora.','Inspekcja linii pod kątem tarcia mechanicznego elementów maszyn, test sprawności siły przyciągania magnesu (pull test).','MAJOR','2026-09-08 12:34:03');
INSERT INTO "checklist_guidelines" VALUES('INFRA-1','GHP','Infrastruktura / GHP','Czystość powietrza sprężonego i brak skroplin','Czy sprężone powietrze mające bezpośredni kontakt z produktem lub opakowaniem posiada filtry odolejające i cząstek stałych?','IFS Food v8 p. 4.15.3 • BRCGS p. 4.5','Filtry mikronowe (0.01 µm) zainstalowane przy punktach poboru. Brak śladów wody i zaolejenia w odwadniaczach.','Suchy gaz, regularne testy mikrobiologiczne i cząstkowe sprężonego powietrza.','Wymiana wkładu filtracyjnego, spuszczenie kondensatu, wstrzymanie kontaktu z produktem do weryfikacji organoleptycznej.','MAJOR','2026-09-08 12:34:03');
INSERT INTO "checklist_guidelines" VALUES('PEST-1','GHP','Pest Control / GHP','Szczelność bram, drzwi i zabezpieczenia przed gryzoniami','Czy drzwi zewnętrzne i bramy załadunkowe są szczelne (brak szczelin > 5 mm) i zamykane niezwłocznie po użyciu?','IFS Food v8 p. 4.13.1 • BRCGS p. 4.14','Szczotki i uszczelki progowe w stanie nienaruszonym. Zakaz klinowania drzwi zewnętrznych w pozycji otwartej.','Wszystkie wejścia i rampy domknięte, lampy owadobójcze (LLE) sprawne i włączone 24/7 z dala od otwartego produktu.','Natychmiastowe zamknięcie drzwi, zgłoszenie do UR uszkodzenia uszczelek, raport do firmy DDD.','MAJOR','2026-09-08 12:34:03');
CREATE TABLE checklist_questions (
            id INTEGER PRIMARY KEY AUTOINCREMENT, standard_type TEXT NOT NULL, category TEXT NOT NULL,
            question_text TEXT NOT NULL, severity TEXT DEFAULT 'MAJOR', is_active INTEGER DEFAULT 1,
            display_order INTEGER DEFAULT 1
        );
INSERT INTO "checklist_questions" VALUES(1938,'HACCP','Analiza i Dokumentacja','1.1. Aktualność Planu HACCP: Schemat technologiczny na linii (np. flow diagram) jest aktualny i odzwierciedla faktyczny przebieg procesu.','MAJOR',1,1);
INSERT INTO "checklist_questions" VALUES(1939,'HACCP','Analiza i Dokumentacja','1.2. Świadomość zagrożeń: Operatorzy znają główne zagrożenia (biologiczne, chemiczne, fizyczne, alergeny) specyficzne dla ich stanowiska.','MAJOR',1,2);
INSERT INTO "checklist_questions" VALUES(1940,'HACCP','Limity Krytyczne dla CCP','2.1. Parametry Krytyczne: Wartości docelowe i limity krytyczne (np. min. temperatura pasteryzacji, czułość detektora) są zdefiniowane.','CRITICAL_KO',1,3);
INSERT INTO "checklist_questions" VALUES(1941,'HACCP','Limity Krytyczne dla CCP','2.2. Walidacja Urządzeń: Urządzenia kontrolno-pomiarowe w CCP posiadają ważne świadectwa kalibracji/wzorcowania.','MAJOR',1,4);
INSERT INTO "checklist_questions" VALUES(1942,'HACCP','Monitorowanie CCP','3.1. Rejestracja wyników: Arkusze monitorowania CCP wypełniane na bieżąco, w czasie rzeczywistym, a nie wstecz.','CRITICAL_KO',1,5);
INSERT INTO "checklist_questions" VALUES(1943,'HACCP','Monitorowanie CCP','3.2. Częstotliwość kontroli: Zgodna w 100% z Planem HACCP.','CRITICAL_KO',1,6);
INSERT INTO "checklist_questions" VALUES(1944,'HACCP','Monitorowanie CCP','3.3. Podpisy i autoryzacja: Dokumenty czytelnie podpisane przez operatora.','MAJOR',1,7);
INSERT INTO "checklist_questions" VALUES(1945,'HACCP','Działania Korygujące','4.1. Procedury awaryjne: Znajomość kroków przy przekroczeniu limitu krytycznego.','CRITICAL_KO',1,8);
INSERT INTO "checklist_questions" VALUES(1946,'HACCP','Działania Korygujące','4.2. Status produktu (Hold): Produkty niezgodne izolowane fizycznie i systemowo.','CRITICAL_KO',1,9);
INSERT INTO "checklist_questions" VALUES(1947,'HACCP','Działania Korygujące','4.3. Zapisy z działań korygujących: Pełny Raport Niezgodności.','MAJOR',1,10);
INSERT INTO "checklist_questions" VALUES(1948,'HACCP','Zagrożenia Fizyczne','5.1. Rejestr Szkła i Plastiku: Stan elementów szklanych sprawdzany wg harmonogramu.','MAJOR',1,11);
INSERT INTO "checklist_questions" VALUES(1949,'HACCP','Zagrożenia Fizyczne','5.2. Integralność sit/filtrów: Sita i magnesy regularnie kontrolowane, brak pęknięć.','CRITICAL_KO',1,12);
INSERT INTO "checklist_questions" VALUES(1950,'HACCP','Zagrożenia Chemiczne','6.1. Smary i chemia: Wyłącznie smary z atestem spożywczym (H1).','MAJOR',1,13);
INSERT INTO "checklist_questions" VALUES(1951,'HACCP','Zagrożenia Chemiczne','6.2. Walidacja mycia: Przejścia między matrycami alergennymi udokumentowane.','CRITICAL_KO',1,14);
INSERT INTO "checklist_questions" VALUES(1952,'HACCP','Weryfikacja','7.1. Przegląd zapisów: Zapisy z CCP weryfikowane przez kontrolera jakości.','MAJOR',1,15);
INSERT INTO "checklist_questions" VALUES(1953,'GMP','Personel i Higiena','1.1. Odzież i higiena osobista: Pracownicy noszą czystą odzież, włosy pod siatką.','MAJOR',1,1);
INSERT INTO "checklist_questions" VALUES(1954,'GMP','Personel i Higiena','1.2. Mycie rąk: Śluzy sanitarne w pełni sprawne.','MAJOR',1,2);
INSERT INTO "checklist_questions" VALUES(1955,'GMP','Personel i Higiena','1.3. Stan zdrowia: Skaleczenia zabezpieczone niebieskimi, wykrywalnymi plastrami.','CRITICAL_KO',1,3);
INSERT INTO "checklist_questions" VALUES(1956,'GMP','Infrastruktura','2.1. Stan techniczny hali: Posadzki i ściany szczelne, gładkie.','MINOR',1,4);
INSERT INTO "checklist_questions" VALUES(1957,'GMP','Infrastruktura','2.2. Zabezpieczenia: Oprawy oświetleniowe zabezpieczone przed stłuczeniem.','CRITICAL_KO',1,5);
INSERT INTO "checklist_questions" VALUES(1958,'GMP','Infrastruktura','2.3. Kontrola klimatu: Odpowiednia temperatura i wilgotność na hali.','MAJOR',1,6);
INSERT INTO "checklist_questions" VALUES(1959,'GMP','Maszyny i Proces','3.1. Stan instalacji: Mieszadła i pompy wolne od wycieków i trytytek.','MAJOR',1,7);
INSERT INTO "checklist_questions" VALUES(1960,'GMP','Maszyny i Proces','3.2. Czyszczenie: Instalacja czysta, brak zalegającej starej masy.','MAJOR',1,8);
INSERT INTO "checklist_questions" VALUES(1961,'GMP','Maszyny i Proces','3.3. Detekcja ciał obcych: Detektory metalu i magnesy włączone i sprawne.','CRITICAL_KO',1,9);
INSERT INTO "checklist_questions" VALUES(1962,'GMP','Maszyny i Proces','3.4. Nadzór nad parametrami: Urządzenia kontrolne z ważną kalibracją.','MAJOR',1,10);
INSERT INTO "checklist_questions" VALUES(1963,'GMP','Surowce i Alergeny','4.1. Zabezpieczenie surowców: Półprodukty zamknięte i chronione.','MAJOR',1,11);
INSERT INTO "checklist_questions" VALUES(1964,'GMP','Surowce i Alergeny','4.2. Alergeny: Rygorystyczna separacja sprzętu i surowców.','CRITICAL_KO',1,12);
INSERT INTO "checklist_questions" VALUES(1965,'GMP','Surowce i Alergeny','4.3. Identyfikowalność: Numery LOT rejestrowane w ERP poprawnie.','CRITICAL_KO',1,13);
INSERT INTO "checklist_questions" VALUES(1966,'GMP','Organizacja Pracy','5.1. Czystość przezbrojeń: Linia wolna od wyrobów z poprzedniej partii.','MAJOR',1,14);
INSERT INTO "checklist_questions" VALUES(1967,'GMP','Organizacja Pracy','5.2. Porządek: Brak zbędnych narzędzi i palet drewnianych.','MAJOR',1,15);
INSERT INTO "checklist_questions" VALUES(1968,'GMP','Organizacja Pracy','5.3. Odpady: Składowane w zamykanych pojemnikach.','MINOR',1,16);
INSERT INTO "checklist_questions" VALUES(1969,'GHP','Bramka Zdrowotna','1.1. Zgłaszanie infekcji: Karencja min. 48h od ustąpienia objawów.','CRITICAL_KO',1,1);
INSERT INTO "checklist_questions" VALUES(1970,'GHP','Bramka Zdrowotna','1.2. Opatrunki: Wyłącznie niebieski plaster z wkładką metalową.','CRITICAL_KO',1,2);
INSERT INTO "checklist_questions" VALUES(1971,'GHP','Higiena Osobista','1.3. Odzież: Brak kieszeni zewnętrznych powyżej pasa.','MAJOR',1,3);
INSERT INTO "checklist_questions" VALUES(1972,'GHP','Higiena Osobista','1.4. Włosy i biżuteria: Całkowity zakaz biżuterii, zegarków i tipsów.','MAJOR',1,4);
INSERT INTO "checklist_questions" VALUES(1973,'GHP','Śluzy Sanitarne','2.1. Wyposażenie śluz: Automatyczne myjki obuwia sprawne.','MAJOR',1,5);
INSERT INTO "checklist_questions" VALUES(1974,'GHP','Śluzy Sanitarne','2.2. Higiena rąk: Prawidłowe mycie i dezynfekcja rąk.','MAJOR',1,6);
INSERT INTO "checklist_questions" VALUES(1975,'GHP','Sanityzacja','2.3. Wymazy ATP: Wynik poniżej 30 RLU dla powierzchni.','CRITICAL_KO',1,7);
INSERT INTO "checklist_questions" VALUES(1976,'GHP','Sanityzacja','2.4. Chemia myjąca: Atestowane środki w zamknięciu.','MAJOR',1,8);
INSERT INTO "checklist_questions" VALUES(1977,'GHP','Sprzęt','3.1. Kodowanie kolorami: Sprzęt do sprzątania oznakowany.','MAJOR',1,9);
INSERT INTO "checklist_questions" VALUES(1978,'GHP','Sprzęt','3.2. Przechowywanie: Wieszaki ścienne włosiem do dołu.','MINOR',1,10);
INSERT INTO "checklist_questions" VALUES(1979,'GHP','Jakość Mediów','4.1. Woda i para: Badane mikrobiologicznie, brak cofki.','CRITICAL_KO',1,11);
INSERT INTO "checklist_questions" VALUES(1980,'GHP','Jakość Mediów','4.2. Odpływy: Syfony i kosze czyste, brak zastoin.','MAJOR',1,12);
INSERT INTO "checklist_questions" VALUES(1981,'GHP','Zaplecze','5.1. Szatnie: Podział szafek na czyste/brudne.','MAJOR',1,13);
INSERT INTO "checklist_questions" VALUES(1982,'GHP','Zaplecze','5.2. Posiłki: Wyłącznie w wyznaczonych strefach socjalnych.','MAJOR',1,14);
INSERT INTO "checklist_questions" VALUES(1983,'GHP','Odpady','5.3. Bielizna i odpady: Usuwane na bieżąco do pralni.','MINOR',1,15);
CREATE TABLE production_lines (
            id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, code TEXT,
            default_zone TEXT DEFAULT 'Wysoka Higiena (High Care)', is_active INTEGER DEFAULT 1
        );
INSERT INTO "production_lines" VALUES(1,'Linia L1 (Masa Konszowanie)','L1-MASA','Wysoka Higiena (High Care)',0);
INSERT INTO "production_lines" VALUES(2,'Linia L2 (Pakowanie Czekolady)','L2-PAK','Strefa Pakowania',0);
INSERT INTO "production_lines" VALUES(3,'Linia L3 (Formowanie Pralin)','L3-FORM','Wysoka Higiena (High Care)',0);
INSERT INTO "production_lines" VALUES(100,'linia 4','','Wysoka Higiena (High Care)',0);
INSERT INTO "production_lines" VALUES(104,'linia 2','LIN-LINIA-2','Wysoka Higiena (High Care)',0);
INSERT INTO "production_lines" VALUES(105,'linia 4454','','Wysoka Higiena (High Care)',1);
INSERT INTO "production_lines" VALUES(106,'ttt','','Wysoka Higiena (High Care)',0);
INSERT INTO "production_lines" VALUES(107,'Linia L1 - Przerób Termiczny i Konszowanie','L-PROC-01','Medium Care',0);
INSERT INTO "production_lines" VALUES(108,'Linia L2 - Formowanie i Odlewanie Pralin','L-FORM-01','High Care',0);
INSERT INTO "production_lines" VALUES(109,'Linia L3 - Pakowanie Pierwotne (Flow-pack & CCP)','L-PACK-01','High Care',0);
INSERT INTO "production_lines" VALUES(110,'Linia L4 - Pakowanie Wtórne i Kartonowanie','L-PACK-02','Low Risk',0);
DELETE FROM "sqlite_sequence";
INSERT INTO "sqlite_sequence" VALUES('users',143);
INSERT INTO "sqlite_sequence" VALUES('production_lines',110);
INSERT INTO "sqlite_sequence" VALUES('checklist_questions',1983);
INSERT INTO "sqlite_sequence" VALUES('audits',19);
INSERT INTO "sqlite_sequence" VALUES('audit_schedules',216);
INSERT INTO "sqlite_sequence" VALUES('audit_checklist_templates',14);
INSERT INTO "sqlite_sequence" VALUES('audit_edit_requests',2);
INSERT INTO "sqlite_sequence" VALUES('audit_change_logs',2);
CREATE TABLE user_biometrics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            credential_id TEXT UNIQUE NOT NULL,
            public_key TEXT NOT NULL,
            device_name TEXT DEFAULT 'Urządzenie Mobilne',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        );
CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pin TEXT UNIQUE NOT NULL,
            full_name TEXT NOT NULL,
            role TEXT NOT NULL,
            qualifications TEXT DEFAULT 'HACCP,GMP,GHP',
            department TEXT DEFAULT 'Jakość',
            is_active INTEGER DEFAULT 1
        , biometric_cred_id TEXT, notes TEXT);
INSERT INTO "users" VALUES(1,'9999','Administrator Jakości','MANAGER','HACCP,GMP,GHP,IFS_V8,EHS_ATEX','Zarządzanie Jakością',1,NULL,'dedwd');
INSERT INTO "users" VALUES(2,'1001','G. Zarakowski','AUDITOR','HACCP,GMP,GHP,IFS_V8','Zapewnienie Jakości',0,NULL,'ffff');
INSERT INTO "users" VALUES(3,'1002','J. Kowalski','AUDITOR','GMP,GHP','Utrzymanie Ruchu',1,NULL,NULL);
INSERT INTO "users" VALUES(4,'1003','A. Nowak','AUDITOR','HACCP,GMP','Technologia',1,NULL,NULL);
INSERT INTO "users" VALUES(141,'1004','Jarosław','AUDITOR','["HACCP", "GMP", "GHP"]','Jakość',0,NULL,'');
INSERT INTO "users" VALUES(142,'1005','Jarosław','AUDITOR','["HACCP", "GMP", "GHP"]','Jakość',1,NULL,'');
INSERT INTO "users" VALUES(143,'0000','GZ','AUDITOR','["HACCP", "GMP", "GHP"]','Jakość',1,NULL,'');
CREATE UNIQUE INDEX idx_audits_audit_code ON audits(audit_code);
CREATE INDEX idx_audits_id_desc ON audits(id DESC);
CREATE INDEX idx_audits_auditor ON audits(auditor_id);
COMMIT;
