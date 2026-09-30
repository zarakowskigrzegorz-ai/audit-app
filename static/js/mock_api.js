// ============================================================
// MOCK API LAYER DLA WERSJI STATYCZNEJ (BEZ BACKENDU PYTHONA)
// Pozwala uruchomić całą aplikację na GitHub Pages, Netlify Drop, Vercel
// lub lokalnie z pliku HTML, z zachowaniem 100% funkcjonalności!
// ============================================================

(function() {
    // Sprawdzamy czy backend odpowiada. Jeśli jesteśmy na Netlify/GitHub Pages/Vercel lub file://, włączamy Mock API od razu
    const isStaticHost = window.location.protocol === 'file:' || 
                         window.location.hostname.includes('netlify.app') || 
                         window.location.hostname.includes('github.io') || 
                         window.location.hostname.includes('vercel.app') || 
                         window.location.hostname.includes('surge.sh') ||
                         window.location.hostname.includes('pages.dev');
    let isMockMode = isStaticHost;

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
                const cType = realRes.headers.get('content-type') || '';
                if (realRes.ok || (realRes.status < 500 && realRes.status !== 404 && realRes.status !== 405 && cType.includes('application/json'))) {
                    return realRes;
                }
                console.log(`[Mock API] Serwer zwrócił status ${realRes.status} (${cType}), przełączanie na tryb mock.`);
                isMockMode = true;
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
            const expectedRole = (bodyObj.expected_role || '').trim().toUpperCase();
            const allUsers = getStorage('users', defaultUsers);
            const users = expectedRole ? allUsers.filter(u => String(u.role || '').toUpperCase() === expectedRole) : allUsers;

            let matched = null;
            if (pin === '9999' && (!expectedRole || expectedRole === 'MANAGER')) {
                matched = users.find(u => u.role === 'MANAGER') || (expectedRole === 'MANAGER' ? { id: 1, full_name: "Administrator Jakości", role: "MANAGER", qualifications: ["HACCP", "GMP", "GHP", "IFS Food v8"], pin: "9999" } : null);
            } else if (pin === '0000' && (!expectedRole || expectedRole === 'AUDITOR')) {
                matched = users.find(u => u.id === 143) || users.find(u => u.role === 'AUDITOR');
            } else {
                matched = users.find(u => String(u.pin || '').trim() === pin);
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
                const detailMsg = expectedRole === 'MANAGER'
                    ? "Nieprawidłowy kod PIN dla konta Key User (Kierownik Jakości)."
                    : (expectedRole === 'AUDITOR' ? "Nieprawidłowy kod PIN dla konta Audytora." : "Nieprawidłowy kod PIN.");
                return jsonResponse({ detail: detailMsg }, 401);
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
                return jsonResponse(filtered);
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
        const schedReschedMatch = cleanUrl.replace(/\/+$/, '').match(/\/api\/schedule\/([^\/]+)\/reschedule$/);
        if (schedReschedMatch && method === 'PUT') {
            const rawId = schedReschedMatch[1];
            const schedules = getStorage('schedules_v3', initDefaultSchedules());
            const idx = schedules.findIndex(s => String(s.id) === String(rawId));
            if (idx !== -1) {
                schedules[idx].scheduled_date = bodyObj.new_date || schedules[idx].scheduled_date;
                setStorage('schedules_v3', schedules);
                return jsonResponse(schedules[idx]);
            }
            return jsonResponse({ detail: "Nie znaleziono audytu" }, 404);
        }

        // Pobranie pojedynczego zlecenia harmonogramu (dla modal-mgr-edit i modal-aud-view)
        const schedItemMatch = cleanUrl.replace(/\/+$/, '').match(/\/api\/schedule\/([^\/]+)$/);
        if (schedItemMatch && method === 'GET') {
            const rawId = schedItemMatch[1];
            const schedules = getStorage('schedules_v3', initDefaultSchedules());
            const item = schedules.find(s => String(s.id) === String(rawId));
            if (item) {
                return jsonResponse(item);
            }
            return jsonResponse({ detail: "Nie znaleziono zlecenia" }, 404);
        }

        // Edycja pojedynczego zadania harmonogramu
        if (schedItemMatch && method === 'PUT') {
            const rawId = schedItemMatch[1];
            const schedules = getStorage('schedules_v3', initDefaultSchedules());
            const idx = schedules.findIndex(s => String(s.id) === String(rawId));
            if (idx !== -1) {
                Object.assign(schedules[idx], bodyObj);
                setStorage('schedules_v3', schedules);
                return jsonResponse(schedules[idx]);
            }
            return jsonResponse({ detail: "Nie znaleziono" }, 404);
        }

        // Usuwanie z harmonogramu
        if (schedItemMatch && method === 'DELETE') {
            const rawId = schedItemMatch[1];
            let schedules = getStorage('schedules_v3', initDefaultSchedules());
            const countBefore = schedules.length;
            schedules = schedules.filter(s => String(s.id) !== String(rawId));
            setStorage('schedules_v3', schedules);
            return jsonResponse({ status: "ok", deleted: countBefore - schedules.length });
        }

        // Czyszczenie wybranego miesiąca lub zakresu miesięcy z harmonogramu
        if (cleanUrl.endsWith('/api/schedule/clear-month') && method === 'POST') {
            const m = parseInt(bodyObj.month, 10) || (new Date().getMonth() + 1);
            const y = parseInt(bodyObj.year, 10) || new Date().getFullYear();
            const period = parseInt(bodyObj.period_months, 10) || 1;
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
                const sDate = String(s.scheduled_date).slice(0, 10);
                if (sDate >= startDateStr && sDate <= endDateStr) {
                    return false;
                }
                return true;
            });
            setStorage('schedules_v3', schedules);
            return jsonResponse({ status: "success", deleted: countBefore - schedules.length, start_date: startDateStr, end_date: endDateStr });
        }

        // Czyszczenie całego harmonogramu
        if (cleanUrl.endsWith('/api/schedule/clear-all') && method === 'POST') {
            setStorage('schedules_v3', []);
            return jsonResponse({ status: "success", deleted: 0, message: "Wyczyszczono wszystkie audyty" });
        }

        // Automatyczne generowanie audytów (mock)
        if (cleanUrl.endsWith('/api/schedule/auto') && method === 'POST') {
            const lines = bodyObj.lines || ['Linia L1 (Masa Konszowanie)'];
            const auditTypes = bodyObj.audit_types || ['HACCP'];
            const startYear = bodyObj.start_year || new Date().getFullYear();
            const startMonth = bodyObj.start_month || (new Date().getMonth() + 1);
            const startDay = bodyObj.start_day || 1;
            const period = bodyObj.period_months || 1;
            const includeWeekends = Boolean(bodyObj.include_weekends);

            const startDate = new Date(startYear, startMonth - 1, startDay);
            const endTotalM = startMonth + period - 1;
            const endYear = startYear + Math.floor((endTotalM - 1) / 12);
            const endMonth = ((endTotalM - 1) % 12) + 1;
            const lastDay = new Date(endYear, endMonth, 0).getDate();
            const endDate = new Date(endYear, endMonth - 1, lastDay);

            let schedules = getStorage('schedules_v3', initDefaultSchedules());
            const pad = n => String(n).padStart(2, '0');
            const startIso = `${startYear}-${pad(startMonth)}-${pad(startDay)}`;
            const endIso = `${endYear}-${pad(endMonth)}-${pad(lastDay)}`;

            schedules = schedules.filter(s => !(s.scheduled_date && s.scheduled_date >= startIso && s.scheduled_date <= endIso));

            const auditors = ['Grzegorz Zarakowski', 'J. Kowalski', 'A. Nowak'];
            let audIdx = 0;
            let count = 0;

            let cur = new Date(startDate);
            while (cur <= endDate) {
                const dayOfWeek = cur.getDay();
                if (!includeWeekends && (dayOfWeek === 0 || dayOfWeek === 6)) {
                    cur.setDate(cur.getDate() + 1);
                    continue;
                }
                const curDateStr = `${cur.getFullYear()}-${pad(cur.getMonth() + 1)}-${pad(cur.getDate())}`;
                for (const line of lines) {
                    for (const aType of auditTypes) {
                        const leadAud = auditors[audIdx % auditors.length];
                        const backupAud = auditors[(audIdx + 1) % auditors.length];
                        audIdx++;
                        schedules.push({
                            id: Date.now() + Math.floor(Math.random() * 1000000) + count,
                            scheduled_date: curDateStr,
                            line: line,
                            audit_type: aType,
                            lead_auditor: leadAud,
                            backup_auditor: backupAud,
                            status: 'PLANOWANY',
                            notes: 'Wygenerowano automatycznie'
                        });
                        count++;
                    }
                }
                cur.setDate(cur.getDate() + 1);
            }

            setStorage('schedules_v3', schedules);
            return jsonResponse({
                status: 'success',
                count: count,
                start_date: `${pad(startDay)}.${pad(startMonth)}.${startYear}`,
                end_date: `${pad(lastDay)}.${pad(endMonth)}.${endYear}`
            });
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
                const body = bodyObj || {};
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

        // 11. Asystent AI & Odprawa Przedaudytowa (SLM)
        const agentBriefingMatch = cleanUrl.match(/\/api\/agent\/briefing\/(.+)$/);
        if (agentBriefingMatch && method === 'GET') {
            const rawLine = decodeURIComponent(agentBriefingMatch[1] || 'Linia L1');
            const audits = getStorage('audits', []);
            const lineAudits = audits.filter(a => !rawLine || rawLine === 'Cały Zakład' || String(a.line).includes(rawLine));
            const total = lineAudits.length || 3;
            const nokCount = lineAudits.filter(a => String(a.compliance_verdict || '').toUpperCase() === 'NIEZGODNY' || String(a.slm_verdict || '').toUpperCase() === 'NOK').length;
            const ccpIssues = lineAudits.filter(a => String(a.ccp1_fe_ok || '').toUpperCase() === 'NIEZGODNY' || String(a.ccp1_reject_ok || '').toUpperCase() === 'NIEZGODNY').length;
            const overallStatus = (ccpIssues > 0) ? "KRYTYCZNE" : (nokCount > 0 ? "UWAGA" : "OK");
            const lastAudit = lineAudits[0] || audits[0];
            const lastDate = lastAudit && lastAudit.timestamp ? lastAudit.timestamp : new Date().toISOString().replace('T', ' ').slice(0, 16);

            const checkpoints = [
                "1. Walidacja pętli detektora metali (CCP1): Weryfikacja wzorców testowych Fe 1.5mm, Non-Fe 2.0mm, SS 2.5mm oraz mechanizmu odrzutu",
                "2. Weryfikacja procedury PR15.01: Kontrola braku objawów chorobowych u personelu oraz wykrywalnych, niebieskich plastrów",
                "3. Polityka ciał obcych & Szkła: Integralność osłon oświetlenia i stan techniczny form/taśmociągów",
                "4. Czystość GMP i higiena stanowisk: Brak zalegających resztek masy i prawidłowe oznakowanie pojemników na odpady"
            ];
            if (ccpIssues > 0) {
                checkpoints.unshift("🚨 UWAGA CCP1: W niedawnej historii tej linii wystąpiło odchylenie na detektorze metali! Wymagany natychmiastowy test wzorców przed dopuszczeniem partii.");
            }

            const briefingMarkdown = `### 📋 ODPRAWA PRZEDAUDYTOWA: ${rawLine}
**Status Obszaru:** ${overallStatus} | **Przeanalizowano:** ${total} ostatnich sesji audytowych

**Wnioski z historii bazy danych:**
- Odchylenia jakościowe (NOK): **${nokCount}**
- Zdarzenia na punktach krytycznych CCP1: **${ccpIssues}**
- Naruszenia procedury higienicznej PR15.01: **0**

**Wytyczne operacyjne IFS Food v8:**
• Przed przystąpieniem do oceny wizualnej zażądaj od operatora bieżącej weryfikacji wzorców Fe/Non-Fe/SS.
• Zweryfikuj, czy pojemnik na wyroby odrzucone jest zamknięty na klucz (procedura zabezpieczenia wyrobów niezgodnych).
• Skontroluj stan czystości taśmy transportowej i brak ciał obcych w strefie otwartego produktu.`;

            return jsonResponse({
                line: rawLine,
                status: overallStatus,
                total_audits_checked: total,
                nok_count: nokCount,
                ccp_issues: ccpIssues,
                briefing_markdown: briefingMarkdown,
                checkpoints: checkpoints,
                last_audit_date: lastDate
            });
        }

        if (cleanUrl.endsWith('/api/agent/chat') && method === 'POST') {
            const userMsg = (bodyObj.message || '').trim();
            const targetLine = bodyObj.line || 'Cały Zakład';
            const lowerMsg = userMsg.toLowerCase();

            let replyText = "";
            if (lowerMsg.includes('ccp') || lowerMsg.includes('detektor') || lowerMsg.includes('metal')) {
                replyText = `**🔍 Analiza CCP1 dla: ${targetLine}**\n\n` +
                    `- **Częstotliwość testów:** Co 2 godziny lub przy każdej przezbrojeniu/zmianie asortymentu.\n` +
                    `- **Wzorce testowe:** Żelazo (Fe) 1.5 mm, Metale nieżelazne (Non-Fe) 2.0 mm, Stal kwasoodporna (SS 316) 2.5 mm.\n` +
                    `- **Procedura awaryjna:** W przypadku braku detekcji wzorca lub awarii odrzutnika natychmiastowe zatrzymanie linii i blokada magazynowa wyrobów (HOLD LOT) od ostatniego poprawnego testu.`;
            } else if (lowerMsg.includes('szkł') || lowerMsg.includes('plastik') || lowerMsg.includes('ciał')) {
                replyText = `**🛡️ Polityka Ciał Obcych i Szkła (IFS Food v8, p. 4.9):**\n\n` +
                    `- Zakaz wnoszenia przedmiotów szklanych do strefy High Care / otwartego produktu.\n` +
                    `- Wszystkie osłony oświetlenia i wzierniki muszą być wykonane z poliwęglanu lub zabezpieczone folią antyodłamkową.\n` +
                    `- W przypadku pęknięcia szkła lub twardego plastiku obowiązuje natychmiastowe zatrzymanie linii i procedura sprzątania z kwarantanną 5 metrów wokół zdarzenia.`;
            } else if (lowerMsg.includes('higien') || lowerMsg.includes('gmp') || lowerMsg.includes('czysto')) {
                replyText = `**🧼 Standardy GMP & Higieny dla: ${targetLine}**\n\n` +
                    `- Czystość taśm transportowych, form i stref styku z produktem.\n` +
                    `- Prawidłowe stosowanie i oznakowanie chemii myjącej (kolorystyczny podział stref).\n` +
                    `- Stan ubrań roboczych i kompletność środków ochrony indywidualnej operatorów.`;
            } else if (lowerMsg.includes('alergen')) {
                replyText = `**🌾 Zarządzanie Alergenami (IFS Food v8, p. 4.20):**\n\n` +
                    `- Walidacja czyszczenia linii po przejściu z produktu alergennego na bezalergenny (testy wymazowe białkowe/ATP).\n` +
                    `- Dedykowany sprzęt sprzątający oznaczony kodem barwnym.\n` +
                    `- Szczelne zabezpieczenie surowców alergennych w buforze magazynowym.`;
            } else {
                replyText = `**Asystent Jakości AI (IFS Food v8 & SLM):**\n\n` +
                    `Przyjąłem zapytanie dla obszaru **${targetLine}**: *„${userMsg}”*.\n\n` +
                    `Zgodnie z procedurami zakładowymi i standardem IFS Food v8:\n` +
                    `- Wszystkie parametry monitorowania procesu muszą być rejestrowane na bieżąco.\n` +
                    `- W przypadku stwierdzenia jakiejkolwiek niezgodności krytycznej (KO) lub CCP zgłoś natychmiast kierownikowi zmiany i uruchom procedurę blokady partii wyrobu (Hold Lot).\n` +
                    `- W razie potrzeby skorzystaj z szybkiego szablonu odprawy lub skonsultuj się z Kierownikiem Jakości.`;
            }

            return jsonResponse({ reply: replyText });
        }

        if (cleanUrl.endsWith('/api/slm-analyze') && method === 'POST') {
            const hasCcpFail = bodyObj.ccp1_fe_ok === 'NIEZGODNY' || bodyObj.ccp1_reject_ok === 'NIEZGODNY';
            const hasHealthFail = bodyObj.health_ok === 'NIE';
            const isKo = bodyObj.ko_failed || hasCcpFail || hasHealthFail;

            if (isKo) {
                return jsonResponse({
                    status: "NOK",
                    poziom_ryzyka: "KRYTYCZNE",
                    decyzja: "Wstrzymanie linii i blokada magazynowa partii (HOLD LOT)",
                    akcje_korygujace: [
                        "Natychmiastowe zatrzymanie linii produkcyjnej",
                        "Blokada magazynowa wyrobów od ostatniego poprawnego testu wzorców",
                        "Powiadomienie Kierownika Jakości i uruchomienie protokołu odchylenia"
                    ],
                    podpowiedzi_prewencyjne: [
                        "Weryfikacja parametrów czułości detektora",
                        "Audyt procedury PR15.01 personelu"
                    ]
                });
            } else {
                return jsonResponse({
                    status: "OK",
                    poziom_ryzyka: "NISKIE",
                    decyzja: "Zezwolenie na kontynuację operacji produkcyjnych",
                    akcje_korygujace: [],
                    podpowiedzi_prewencyjne: [
                        "Utrzymanie reżimu sanitarnego GMP",
                        "Kontrola czystości taśmy transportowej"
                    ]
                });
            }
        }

        // 12. Szablony checklist audytowych (HACCP, GMP, GHP)
        const chkMatch = cleanUrl.match(/\/api\/checklist(?:-template)?\/([^\/]+)$/);
        if (chkMatch && method === 'GET') {
            const rawType = decodeURIComponent(chkMatch[1] || 'HACCP').toUpperCase().trim();
            const templates = {
                "HACCP": [
                    {"id": 101, "is_ko": false, "clause": "1.1 Analiza", "question": "Aktualność Planu HACCP: Schemat technologiczny na linii (flow diagram) odzwierciedla faktyczny przebieg procesu."},
                    {"id": 102, "is_ko": false, "clause": "1.2 Świadomość", "question": "Operatorzy znają główne zagrożenia (biologiczne, chemiczne, fizyczne, alergeny) dla ich stanowiska."},
                    {"id": 103, "is_ko": false, "clause": "2.1 Limity CCP", "question": "Wartości docelowe i limity krytyczne są jasno zdefiniowane i widoczne przy stanowisku CCP."},
                    {"id": 104, "is_ko": false, "clause": "2.2 Walidacja", "question": "Urządzenia kontrolno-pomiarowe używane w CCP posiadają ważne świadectwa kalibracji/wzorcowania."},
                    {"id": 105, "is_ko": false, "clause": "3.1 Logi", "question": "Rejestracja wyników: Arkusze CCP są wypełniane na bieżąco, w czasie rzeczywistym, a nie wstecz."},
                    {"id": 106, "is_ko": true, "clause": "3.2 Częstotliwość (KO)", "question": "Częstotliwość zapisów jest w 100% zgodna z Planem HACCP (np. test detektora co 1h)."},
                    {"id": 107, "is_ko": false, "clause": "3.3 Autoryzacja", "question": "Podpisy: Dokumenty z CCP są czytelnie podpisane przez wyznaczonego operatora."},
                    {"id": 108, "is_ko": false, "clause": "4.1 Proc. Awaryjne", "question": "Działania korygujące: Operatorzy wiedzą, co zrobić przy przekroczeniu limitu (zatrzymanie linii)."},
                    {"id": 109, "is_ko": true, "clause": "4.2 Hold Lot (KO)", "question": "Status produktu: Wyroby niezgodne z CCP są natychmiast fizycznie i systemowo izolowane (Hold/Zablokowane)."},
                    {"id": 110, "is_ko": false, "clause": "4.3 Raportowanie", "question": "Każde odchylenie na CCP jest w pełni udokumentowane w Raporcie Niezgodności."}
                ],
                "GMP": [
                    {"id": 201, "is_ko": false, "clause": "1.1 Odzież", "question": "Personel: Pracownicy noszą czystą odzież. Włosy osłonięte. Brak biżuterii, zegarków, sztucznych paznokci."},
                    {"id": 202, "is_ko": false, "clause": "1.2 Higiena rąk", "question": "Stacje higieniczne (śluzy) są w pełni sprawne, wyposażone w mydło i środek dezynfekujący."},
                    {"id": 203, "is_ko": true, "clause": "1.3 Zdrowie (KO)", "question": "Stan zdrowia: Przestrzeganie procedur zgłaszania infekcji. Skaleczenia zaklejone niebieskimi plastrami."},
                    {"id": 204, "is_ko": false, "clause": "2.1 Infrastruktura", "question": "Stan techniczny: Posadzki, ściany i sufity nad linią szczelne, nienasiąkliwe, wolne od pęknięć/odprysków."},
                    {"id": 205, "is_ko": true, "clause": "2.2 Zabezpieczenia (KO)", "question": "Oprawy oświetleniowe i elementy szklane nad otwartym procesem są zabezpieczone przed stłuczeniem."},
                    {"id": 206, "is_ko": false, "clause": "2.3 Klimat/Kurz", "question": "Wentylacja: Odpowiednia temperatura/wilgotność zachowane. Kratki wentylacyjne wolne od kurzu."},
                    {"id": 207, "is_ko": false, "clause": "3.1 Wycieki", "question": "Maszyny: Mieszadła, formy i orurowanie wolne od wycieków, korozji, uszkodzeń i taśm (trytytek)."},
                    {"id": 208, "is_ko": false, "clause": "3.2 Czystość/CIP", "question": "Czyszczenie: Instalacja jest czysta, weryfikacja CIP udokumentowana. Brak zalegającej starej masy."},
                    {"id": 209, "is_ko": true, "clause": "3.3 Detekcja (KO)", "question": "Ciała obce: Detektory, X-Ray, magnesy i sita włączone, sprawne i regularnie testowane wzorcami."},
                    {"id": 210, "is_ko": false, "clause": "3.4 Kalibracja", "question": "Nadzór nad parametrami: Czujniki temperatury w tankach i wagi mają świadectwa wzorcowania."}
                ],
                "GHP": [
                    {"id": 301, "is_ko": true, "clause": "1.1 Higiena Rąk (KO)", "question": "Procedura mycia i dezynfekcji rąk: Personel poprawnie realizuje procedurę przed wejściem do strefy High Care (brak biżuterii, zegarków, sztucznych paznokci)."},
                    {"id": 302, "is_ko": false, "clause": "1.2 Odzież Osobista", "question": "Czystość i kompletność odzieży: Fartuchy, czepki, osłony brody i obuwie robocze są czyste, nieuszkodzone i w 100% zakrywają włosy oraz odzież prywatną."},
                    {"id": 303, "is_ko": true, "clause": "1.3 Stan Zdrowia (KO)", "question": "Kontrola stanu zdrowia i zranień (PR15.01): Brak osób z objawami infekcji pokarmowych/kataralnych; wszelkie skaleczenia zabezpieczone wykrywalnymi, niebieskimi plastrami z paskiem metalowym."},
                    {"id": 304, "is_ko": false, "clause": "2.1 Śluzy Higieniczne", "question": "Infrastruktura śluz wejściowych: Dozowniki mydła, środka do dezynfekcji rąk oraz maty dezynfekujące/myjki do obuwia są w pełni zaopatrzone i sprawne."},
                    {"id": 305, "is_ko": false, "clause": "2.2 Higiena Procesu", "question": "Zasady zachowania czystości na stanowisku: Brak spożywania posiłków, napojów, żucia gumy oraz palenia tytoniu w strefie produkcyjnej i magazynowej."},
                    {"id": 306, "is_ko": false, "clause": "3.1 Czystość Środowiska", "question": "Porządek wokół stanowiska: Brak zalegających odpadów produkcyjnych, opakowań i surowców poza wyznaczonymi, oznakowanymi pojemnikami (zamykanymi)."},
                    {"id": 307, "is_ko": false, "clause": "3.2 Sanitariat / Sprzęt", "question": "Narzędzia i sprzęt myjący: Szczotki, węże i ściągaczki są czyste, zidentyfikowane kolorystycznie (kod barwny stref) i przechowywane w sposób uniemożliwiający wtórne zanieczyszczenie."},
                    {"id": 308, "is_ko": false, "clause": "4.1 Szkodniki", "question": "Zabezpieczenie przed szkodnikami: Okna i drzwi zewnętrzne są szczelnie zamknięte lub posiadają sprawne kurtyny powietrzne/moskitiery; stacje deratyzacyjne nienaruszone."},
                    {"id": 309, "is_ko": false, "clause": "4.2 Chemia Myjąca", "question": "Nadzór nad środkami chemicznymi: Środki myjące i dezynfekujące używane na produkcji są zatwierdzone do kontaktu z żywnością, oznakowane i bezpiecznie przechowywane."}
                ]
            };
            return jsonResponse(templates[rawType] || templates["HACCP"]);
        }

        // Domyślny fallback dla pozostałych endpointów
        return jsonResponse({ status: "success" });
    };

    console.log("🚀 [Mock API] Silnik demonstracyjny załadowany (obsługa trybu offline / bez backendu).");
})();
