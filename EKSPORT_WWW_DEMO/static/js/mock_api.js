// ============================================================
// MOCK API LAYER DLA WERSJI STATYCZNEJ (BEZ BACKENDU PYTHONA)
// Pozwala uruchomić całą aplikację na GitHub Pages, Netlify Drop, Vercel
// lub lokalnie z pliku HTML, z zachowaniem 100% funkcjonalności!
// ============================================================

(function() {
    // Sprawdzamy czy backend odpowiada. Jeśli nie lub jesteśmy na file://, włączamy Mock API
    const isFileProto = window.location.protocol === 'file:';
    let isMockMode = isFileProto;

    // Początkowe dane demonstracyjne
    const defaultUsers = [
        { id: 1, full_name: "Administrator Jakości", role: "MANAGER", qualifications: ["HACCP", "GMP", "GHP", "IFS Food v8"], pin: "9999" },
        { id: 143, full_name: "Grzegorz Zarakowski", role: "AUDITOR", qualifications: ["HACCP", "GMP", "GHP", "IFS Food v8", "BRCGS"], pin: "0000" },
        { id: 2, full_name: "G. Zarakowski", role: "AUDITOR", qualifications: ["HACCP", "GMP", "GHP"], pin: "1001" },
        { id: 3, full_name: "J. Kowalski", role: "AUDITOR", qualifications: ["HACCP", "GMP", "GHP"], pin: "1002" },
        { id: 4, full_name: "A. Nowak", role: "AUDITOR", qualifications: ["HACCP"], pin: "1003" }
    ];

    const defaultLines = [
        { id: 1, name: "Linia L1 (Masa Konszowanie)", default_zone: "High Care", line_status: "PRODUKCJA (Zwolniona)" },
        { id: 2, name: "Linia L2 (Pakowanie Czekolady)", default_zone: "Strefa Pakowania", line_status: "PRODUKCJA (Zwolniona)" },
        { id: 3, name: "Linia L3 (Formowanie Pralin)", default_zone: "High Care", line_status: "PRODUKCJA (Zwolniona)" },
        { id: 107, name: "Linia L1 - Przerób Termiczny i Konszowanie", default_zone: "Medium Care", line_status: "PRODUKCJA (Zwolniona)" },
        { id: 108, name: "Linia L2 - Formowanie i Odlewanie Pralin", default_zone: "High Care", line_status: "PRODUKCJA (Zwolniona)" },
        { id: 109, name: "Linia L3 - Pakowanie Pierwotne (Flow-pack & CCP)", default_zone: "High Care", line_status: "PRODUKCJA (Zwolniona)" }
    ];

    function getStorage(key, def) {
        try {
            const v = localStorage.getItem('demo_' + key);
            return v ? JSON.parse(v) : def;
        } catch(e) { return def; }
    }

    function setStorage(key, val) {
        try {
            localStorage.setItem('demo_' + key, JSON.stringify(val));
        } catch(e) {}
    }

    // Inicjalizacja harmonogramu na bieżący miesiąc oraz miesiące sąsiednie
    function initDefaultSchedules() {
        const now = new Date();
        const scheds = [];
        let idCounter = 1;

        const types = ['HACCP', 'GMP', 'GHP'];
        const auditors = ['Grzegorz Zarakowski', 'J. Kowalski', 'A. Nowak'];
        const lines = ['Linia L1 (Masa Konszowanie)', 'Linia L2 (Pakowanie Czekolady)', 'Linia L3 (Formowanie Pralin)', 'Linia L4 (Pakowanie Wafli)'];

        // Generujemy dla miesiąca poprzedniego (-1), bieżącego (0) i kolejnego (+1)
        for (let mOffset = -1; mOffset <= 1; mOffset++) {
            const targetMonth = new Date(now.getFullYear(), now.getMonth() + mOffset, 1);
            const y = targetMonth.getFullYear();
            const m = String(targetMonth.getMonth() + 1).padStart(2, '0');
            const daysInMonth = new Date(y, targetMonth.getMonth() + 1, 0).getDate();

            for (let d = 1; d <= daysInMonth; d++) {
                const dateObj = new Date(y, targetMonth.getMonth(), d);
                const dayOfWeek = dateObj.getDay();
                // Dni robocze: poniedziałek (1) do piątku (5)
                if (dayOfWeek >= 1 && dayOfWeek <= 5) {
                    const dayStr = `${y}-${m}-${String(d).padStart(2, '0')}`;
                    const isPast = dateObj < new Date(now.getFullYear(), now.getMonth(), now.getDate());

                    // Dodaj 2-3 audyty na każdy dzień roboczy z różnymi typami (HACCP, GMP, GHP)
                    const countToday = (d % 3 === 0) ? 3 : 2;
                    for (let idx = 0; idx < countToday; idx++) {
                        const t = types[(d + idx) % types.length];
                        const l = lines[(d * 2 + idx) % lines.length];
                        const a = auditors[(d + idx) % auditors.length];
                        const status = isPast ? ((d + idx) % 3 === 0 ? 'WYKONANY' : 'PLANOWANY') : 'PLANOWANY';

                        scheds.push({
                            id: idCounter++,
                            scheduled_date: dayStr,
                            line: l,
                            audit_type: t,
                            lead_auditor: a,
                            backup_auditor: "Administrator Jakości",
                            status: status,
                            notes: `Zaplanowano w systemie IFS (${t})`
                        });
                    }
                }
            }
        }
        return scheds;
    }

    if (!localStorage.getItem('demo_schedules_v3')) {
        setStorage('schedules_v3', initDefaultSchedules());
    }
    if (!localStorage.getItem('demo_users')) {
        setStorage('users', defaultUsers);
    }
    if (!localStorage.getItem('demo_lines')) {
        setStorage('lines', defaultLines);
    }
    if (!localStorage.getItem('demo_audits')) {
        setStorage('audits', [
            {
                id: 1,
                timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
                auditor_id: "Grzegorz Zarakowski",
                line: "Linia L1 (Masa Konszowanie)",
                shift: "1",
                zone: "HIGH_RISK",
                audit_type: "GMP",
                compliance_verdict: "ZATWIERDZONY",
                process_status: "ZATWIERDZONY",
                record_status: "ZABLOKOWANY",
                slm_verdict: "OK",
                risk_level: "NISKIE",
                slm_analysis: "Pełna zgodność ze standardem IFS Food v8. Wszystkie CCP i strefy higieniczne spełniają kryteria.",
                notes: "Brak odchyleń."
            }
        ]);
    }

    const origFetch = window.fetch;

    window.fetch = async function(input, init) {
        const url = (typeof input === 'string') ? input : (input && input.url ? input.url : '');
        
        // Jeśli nie zaczyna się od /api, wywołujemy normalny fetch
        if (!url.startsWith('/api') && !url.includes('/api/')) {
            return origFetch.apply(this, arguments);
        }

        // Jeśli nie jesteśmy na file:// i jeszcze nie wiemy czy backend działa,
        // próbujemy normalnego fetcha, a w razie błędu przełączamy na Mock API
        if (!isMockMode) {
            try {
                const realRes = await origFetch.apply(this, arguments);
                if (realRes.status !== 404 && realRes.status !== 502 && realRes.status !== 503) {
                    return realRes;
                }
            } catch(err) {
                console.log("[Mock API] Backend offline, przełączanie na tryb demonstracyjny w przeglądarce.");
                isMockMode = true;
            }
        }

        // Mock Handler dla zapytań /api/
        const method = (init && init.method ? init.method : 'GET').toUpperCase();
        const cleanUrl = url.split('?')[0];
        const searchParams = new URLSearchParams(url.includes('?') ? url.split('?')[1] : '');

        let bodyObj = {};
        if (init && init.body) {
            try {
                bodyObj = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
            } catch(e) {}
        }

        function jsonResponse(data, status = 200) {
            return new Response(JSON.stringify(data), {
                status: status,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // 1. Logowanie PIN
        if ((cleanUrl.endsWith('/api/auth/login') || cleanUrl.endsWith('/api/auth/login-pin')) && method === 'POST') {
            const pin = String(bodyObj.pin || '').trim();
            const expectedRole = bodyObj.expected_role || '';
            const users = getStorage('users', defaultUsers);

            let matched = null;
            if (pin === '9999') {
                matched = users.find(u => u.role === 'MANAGER') || { id: 1, full_name: "Administrator Jakości", role: "MANAGER", qualifications: ["HACCP", "GMP", "GHP", "IFS Food v8"], pin: "9999" };
            } else if (pin === '0000') {
                matched = users.find(u => u.id === 143) || users.find(u => u.role === 'AUDITOR');
            } else {
                matched = users.find(u => u.pin === pin);
            }

            if (!matched && expectedRole === 'MANAGER' && pin === '9999') {
                matched = { id: 1, full_name: "Administrator Jakości", role: "MANAGER", qualifications: ["HACCP", "GMP", "GHP", "IFS Food v8"], pin: "9999" };
            }

            if (matched) {
                return jsonResponse({
                    id: matched.id,
                    full_name: matched.full_name,
                    role: matched.role,
                    qualifications: matched.qualifications || [],
                    access_token: "mock-jwt-token-demo-" + matched.id,
                    token_type: "Bearer",
                    user: {
                        id: matched.id,
                        full_name: matched.full_name,
                        role: matched.role,
                        qualifications: matched.qualifications
                    }
                });
            } else {
                return jsonResponse({ detail: "Nieprawidłowy kod PIN. Użyj 9999 dla Kierownika lub 0000 dla Audytora." }, 401);
            }
        }

        // 2. Pobieranie i zarządzanie harmonogramem
        if (cleanUrl.endsWith('/api/schedule') && method === 'GET') {
            const schedules = getStorage('schedules_v3', initDefaultSchedules());
            const auditorParam = searchParams.get('auditor');
            const roleParam = searchParams.get('role');

            if (roleParam === 'MANAGER' || !auditorParam) {
                return jsonResponse(schedules);
            } else {
                const audLower = auditorParam.toLowerCase();
                const filtered = schedules.filter(s => 
                    (s.lead_auditor && s.lead_auditor.toLowerCase().includes(audLower)) ||
                    (s.backup_auditor && s.backup_auditor.toLowerCase().includes(audLower))
                );
                return jsonResponse(filtered.length > 0 ? filtered : schedules);
            }
        }

        if (cleanUrl.endsWith('/api/schedule') && method === 'POST') {
            const schedules = getStorage('schedules_v3', initDefaultSchedules());
            const newAudit = {
                id: Date.now(),
                scheduled_date: bodyObj.scheduled_date || new Date().toISOString().slice(0, 10),
                line: bodyObj.line || 'Linia L1',
                audit_type: bodyObj.audit_type || 'GMP',
                lead_auditor: bodyObj.lead_auditor || 'Grzegorz Zarakowski',
                backup_auditor: bodyObj.backup_auditor || 'Administrator Jakości',
                status: 'PLANOWANY',
                notes: bodyObj.notes || ''
            };
            schedules.push(newAudit);
            setStorage('schedules_v3', schedules);
            return jsonResponse(newAudit, 201);
        }

        // Przenoszenie audytu (drag & drop)
        if (cleanUrl.match(/\/api\/schedule\/\d+\/reschedule$/) && method === 'PUT') {
            const parts = cleanUrl.split('/');
            const id = parseInt(parts[parts.length - 2], 10);
            const schedules = getStorage('schedules_v3', initDefaultSchedules());
            const idx = schedules.findIndex(s => s.id === id);
            if (idx !== -1) {
                schedules[idx].scheduled_date = bodyObj.new_date || schedules[idx].scheduled_date;
                setStorage('schedules_v3', schedules);
                return jsonResponse(schedules[idx]);
            }
            return jsonResponse({ detail: "Nie znaleziono" }, 404);
        }

        // Edycja pojedynczego zadania harmonogramu
        if (cleanUrl.match(/\/api\/schedule\/\d+$/) && method === 'PUT') {
            const id = parseInt(cleanUrl.split('/').pop(), 10);
            const schedules = getStorage('schedules_v3', initDefaultSchedules());
            const idx = schedules.findIndex(s => s.id === id);
            if (idx !== -1) {
                Object.assign(schedules[idx], bodyObj);
                setStorage('schedules_v3', schedules);
                return jsonResponse(schedules[idx]);
            }
            return jsonResponse({ detail: "Nie znaleziono" }, 404);
        }

        // Usuwanie z harmonogramu
        if (cleanUrl.match(/\/api\/schedule\/\d+$/) && method === 'DELETE') {
            const id = parseInt(cleanUrl.split('/').pop(), 10);
            let schedules = getStorage('schedules_v3', initDefaultSchedules());
            schedules = schedules.filter(s => s.id !== id);
            setStorage('schedules_v3', schedules);
            return jsonResponse({ status: "ok" });
        }

        // Czyszczenie wybranego miesiąca lub zakresu miesięcy z harmonogramu
        if (cleanUrl.endsWith('/api/schedule/clear-month') && method === 'POST') {
            const m = bodyObj.month || (new Date().getMonth() + 1);
            const y = bodyObj.year || new Date().getFullYear();
            const period = bodyObj.period_months || 1;
            const startDateStr = `${y}-${String(m).padStart(2, '0')}-01`;
            const endTotalMonths = m + period - 1;
            const endYear = y + Math.floor((endTotalMonths - 1) / 12);
            const endMonth = ((endTotalMonths - 1) % 12) + 1;
            const lastDay = new Date(endYear, endMonth, 0).getDate();
            const endDateStr = `${endYear}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

            let schedules = getStorage('schedules_v3', initDefaultSchedules());
            const countBefore = schedules.length;
            schedules = schedules.filter(s => {
                if (!s.scheduled_date) return true;
                if (s.scheduled_date >= startDateStr && s.scheduled_date <= endDateStr && s.status !== 'WYKONANY') {
                    return false;
                }
                return true;
            });
            setStorage('schedules_v3', schedules);
            return jsonResponse({ status: "success", deleted: countBefore - schedules.length, start_date: startDateStr, end_date: endDateStr });
        }

        // Czyszczenie zakresu harmonogramu
        if (cleanUrl.endsWith('/api/schedule/clear-range') && method === 'POST') {
            const months = bodyObj.months || 1;
            const today = new Date();
            const todayStr = today.toISOString().slice(0, 10);
            const endDate = new Date(today.getTime() + months * 30 * 86400000).toISOString().slice(0, 10);
            let schedules = getStorage('schedules_v3', initDefaultSchedules());
            schedules = schedules.filter(s => !s.scheduled_date || s.scheduled_date < todayStr || s.scheduled_date > endDate);
            setStorage('schedules_v3', schedules);
            return jsonResponse({ status: "success" });
        }

        // Pobieranie pojedynczego zadania harmonogramu
        if (cleanUrl.match(/\/api\/schedule\/\d+$/) && method === 'GET') {
            const id = parseInt(cleanUrl.split('/').pop(), 10);
            const schedules = getStorage('schedules_v3', initDefaultSchedules());
            const found = schedules.find(s => s.id === id);
            return found ? jsonResponse(found) : jsonResponse({ detail: "Nie znaleziono" }, 404);
        }

        // 4. Linie produkcyjne
        if (cleanUrl.endsWith('/api/lines')) {
            return jsonResponse(getStorage('lines', defaultLines));
        }

        // 5. Użytkownicy / Audytorzy
        if (cleanUrl.endsWith('/api/auth/auditors') || cleanUrl.endsWith('/api/auditors') || cleanUrl.endsWith('/api/users')) {
            const users = getStorage('users', defaultUsers);
            if (cleanUrl.includes('auditors')) {
                const typeParam = searchParams.get('type');
                let list = users.filter(u => u.role === 'AUDITOR' || u.role === 'MANAGER');
                if (typeParam) {
                    list = list.filter(u => !u.qualifications || u.qualifications.length === 0 || u.qualifications.includes(typeParam) || u.qualifications.some(q => String(q).includes(typeParam)));
                }
                return jsonResponse(list.map(u => ({ id: u.id, full_name: u.full_name, name: u.full_name, role: u.role })));
            }
            return jsonResponse(users);
        }

        // 6. Lista audytów
        if (cleanUrl.endsWith('/api/audits') && method === 'GET') {
            return jsonResponse(getStorage('audits', []));
        }

        // 7. Zapis nowego audytu
        if (cleanUrl.endsWith('/api/audit') && method === 'POST') {
            const audits = getStorage('audits', []);
            let line = "Linia L1 (Masa Konszowanie)";
            let auditType = "HACCP";
            let scheduleId = null;

            if (init.body instanceof FormData) {
                line = init.body.get('line') || line;
                auditType = init.body.get('audit_type') || auditType;
                scheduleId = init.body.get('schedule_id');
            }

            const newAudit = {
                id: audits.length + 1,
                timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
                auditor_id: "Grzegorz Zarakowski",
                line: line,
                shift: "1",
                zone: "HIGH_RISK",
                audit_type: auditType,
                compliance_verdict: "ZATWIERDZONY",
                process_status: "ZATWIERDZONY",
                record_status: "ZABLOKOWANY",
                slm_verdict: "OK",
                risk_level: "NISKIE",
                slm_analysis: "Audyt pomyślnie zarejestrowany. Spełnia wymogi IFS Food v8.",
                notes: "Zapisano w wersji demonstracyjnej."
            };
            audits.unshift(newAudit);
            setStorage('audits', audits);

            // Zamykanie w harmonogramie
            const schedules = getStorage('schedules', []);
            if (scheduleId) {
                const target = schedules.find(s => s.id == scheduleId);
                if (target) target.status = 'WYKONANY';
            } else {
                const target = schedules.find(s => s.line === line && s.status === 'PLANOWANY');
                if (target) target.status = 'WYKONANY';
            }
            setStorage('schedules', schedules);

            return jsonResponse({
                status: "OK",
                audit_id: newAudit.id,
                slm_verdict: "OK",
                message: "Audyt zarejestrowany pomyślnie."
            });
        }

        // 8. Live Chat & Notatki
        if (cleanUrl.includes('/api/auditor-notes')) {
            if (cleanUrl.endsWith('/chat-messages')) {
                let msgs = getStorage('chat_messages', [
                    {
                        id: 1,
                        timestamp: new Date(Date.now() - 3600000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        sender_name: "Grzegorz Zarakowski",
                        sender_role: "AUDITOR",
                        line_name: "Linia L1 (Masa Konszowanie)",
                        priority: "INFO",
                        message: "Rozpoczynam audyt higieniczny GMP na linii L1. Wszystkie parametry mycia CIP zgodne."
                    },
                    {
                        id: 2,
                        timestamp: new Date(Date.now() - 1800000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        sender_name: "Kierownik Jakości (Key User)",
                        sender_role: "MANAGER",
                        line_name: "Hala Produkcyjna",
                        priority: "CHAT",
                        message: "Przyjęto zgłoszenie. Zwróć szczególną uwagę na stan uszczelek głowic pasteryzatora."
                    }
                ]);
                return jsonResponse(msgs);
            }

            if (cleanUrl.endsWith('/chat-send') && method === 'POST') {
                const body = reqData.body ? JSON.parse(reqData.body) : {};
                let msgs = getStorage('chat_messages', []);
                const newMsg = {
                    id: Date.now(),
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    sender_name: body.sender_name || 'Audytor',
                    sender_role: body.sender_role || 'AUDITOR',
                    line_name: body.line_name || 'Hala Główna',
                    priority: body.priority || 'CHAT',
                    message: body.message || ''
                };
                msgs.push(newMsg);
                setStorage('chat_messages', msgs);
                return jsonResponse({ status: "success", id: newMsg.id });
            }

            if (cleanUrl.endsWith('/chat-clear') && method === 'POST') {
                setStorage('chat_messages', []);
                return jsonResponse({ status: "success", message: "Czat wyczyszczony" });
            }

            if (cleanUrl.endsWith('/counts')) {
                return jsonResponse({ unread_count: 0, auditor_unread: 0 });
            }
            return jsonResponse([]);
        }

        // 9. Wnioski o edycję audytów
        if (cleanUrl.includes('/api/audits/edit-requests')) {
            return jsonResponse([]);
        }

        // 10. Raporty
        if (cleanUrl.endsWith('/api/reports/kpi')) {
            const audits = getStorage('audits', []);
            return jsonResponse({
                total_audits: audits.length || 1,
                compliance_rate: 100.0,
                incidents_count: 0,
                recent_audits: audits.slice(0, 5)
            });
        }

        // Domyślny fallback dla pozostałych endpointów
        return jsonResponse({ status: "success" });
    };

    console.log("🚀 [Mock API] Silnik demonstracyjny załadowany (obsługa trybu offline / bez backendu).");
})();
