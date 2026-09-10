function updateAuditHud(step, title, desc, mode) {
            const toast = document.getElementById('audit-progress-toast');
            const box = document.getElementById('audit-progress-box');
            const spinner = document.getElementById('audit-progress-spinner');
            const titleEl = document.getElementById('audit-progress-title');
            const descEl = document.getElementById('audit-progress-desc');
            if (!toast) return;

            toast.classList.remove('hidden');
            titleEl.textContent = title;
            descEl.textContent = desc;

            if (mode === 'loading') {
                box.className = "flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl border backdrop-blur-md bg-slate-900/95 border-cyan-500/60 text-slate-100 min-w-[340px]";
                spinner.className = "w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin";
                spinner.textContent = "";
                titleEl.className = "text-xs font-black tracking-wider uppercase text-cyan-400";
            } else if (mode === 'success') {
                box.className = "flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl border backdrop-blur-md bg-emerald-950/90 border-emerald-500/60 text-slate-100 min-w-[340px]";
                spinner.className = "text-base";
                spinner.textContent = "✅";
                titleEl.className = "text-xs font-black tracking-wider uppercase text-emerald-400";
                setTimeout(() => toast.classList.add('hidden'), 3500);
            } else if (mode === 'alert') {
                box.className = "flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl border backdrop-blur-md bg-rose-950/90 border-rose-500/60 text-slate-100 min-w-[340px]";
                spinner.className = "text-base";
                spinner.textContent = "⚠️";
                titleEl.className = "text-xs font-black tracking-wider uppercase text-rose-400";
                setTimeout(() => toast.classList.add('hidden'), 5000);
            }
        }

        const state = {
            user_id: 0, auditor_id: "", role: "AUDITOR", line: "", shift: "Zmiana A", zone: "Wysoka Higiena (High Care)",
            health_ok: "TAK", dispense_no: "BRAK", glass_plastic_ok: "ZGODNY", allergen_clean_ok: "ZGODNY",
            wood_policy_ok: "ZGODNY", ppe_ok: "ZGODNY", line_status: "Produkcja Ciągła", ccp1_fe_ok: "ZGODNY",
            ccp1_nonfe_ok: "ZGODNY", ccp1_ss_ok: "ZGODNY", ccp1_reject_ok: "ZGODNY", ccp1_bin_locked: "ZGODNY",
            ccp2_magnet_ok: "ZGODNY", ccp3_sieve_ok: "ZGODNY", gmp_cleanliness_ok: "ZGODNY", gmp_wood_score: 5,
            gmp_foreign_score: 5, gmp_waste_ok: "ZGODNY", bhp_estop_ok: "ZGODNY", bhp_atex_ok: "ZGODNY",
            bhp_hot_cip_ok: "ZGODNY", bhp_evac_ppoz_ok: "ZGODNY", bhp_status: "BRAK ZGŁOSZEŃ", slm_analysis: "",
            selected_period_months: 1, checklist_results: {}, active_audit_type: "HACCP"
        };

        let currentCalDate = new Date();
        let miniCalDate = new Date();
        let schedulesData = [];
        let productionLinesData = [];
        let activeSelectedAudit = null;

        // --- NAWIGACJA ---
        let navHistory = [];
        let navForward = [];
        let currentModule = 'auth';

        function showModule(modId, pushToHistory = true) {
            document.querySelectorAll('.view-layer').forEach(el => el.classList.add('hidden'));
            
            let targetId = modId;
            if (modId === 'hub') { targetId = state.role === 'MANAGER' ? 'hub-manager' : 'hub-auditor'; }
            else if (modId === 'audit-main') { targetId = 'view-audit-main'; }
            else if (!modId.startsWith('view-') && !modId.startsWith('hub-')) { targetId = 'view-' + modId; }

            let target = document.getElementById(targetId);
            // Fallback zapobiegający czarnemu ekranowi:
            if (!target) {
                targetId = state.role === 'MANAGER' ? 'hub-manager' : 'hub-auditor';
                target = document.getElementById(targetId);
                modId = 'hub';
            }

            if(target) {
                target.classList.remove('hidden');
                if(pushToHistory && currentModule !== modId && currentModule !== 'auth') {
                    navHistory.push(currentModule);
                    navForward = [];
                }
                currentModule = modId;
            }
            updateDockButtons();
            
            // Odświeżanie na żywo przy powrocie do Dashboardu / Hubu
            if(modId === 'hub') {
                const activeHubId = state.role === 'MANAGER' ? 'hub-manager' : 'hub-auditor';
                document.querySelectorAll('.view-layer').forEach(el => el.classList.add('hidden'));
                const hubEl = document.getElementById(activeHubId);
                if (hubEl) hubEl.classList.remove('hidden');
                // Bezpieczne odświeżenie danych w tle bez blokowania UI
                try {
                    if (typeof loadManagerEditRequests === 'function') loadManagerEditRequests();
                } catch(e) { console.warn('Błąd cichego odświeżania:', e); }
            }
            if(modId === 'calendar') loadScheduleAndRender();
            if(modId === 'auditors') renderAuditorsList();
            if(modId === 'lines') renderLinesManagerList();
            if(modId === 'manager-results') { loadAuditResults(); loadManagerEditRequests(); }
            if(modId === 'auditor-history') loadAuditorHistory();

            updateTopNavActiveState(modId);
        }

        function navGoBack() {
            if(navHistory.length > 0) {
                const prev = navHistory.pop();
                navForward.push(currentModule);
                showModule(prev, false);
            } else {
                // Jeśli historia jest pusta, zawsze wracaj bezpiecznie do Dashboardu (Hub)
                if (currentModule !== 'hub') {
                    showModule('hub', false);
                }
            }
        }

        function navGoForward() {
            if(navForward.length > 0) {
                navHistory.push(currentModule);
                showModule(navForward.pop(), false);
            }
        }

        function navGoHome() {
            navHistory.push(currentModule);
            navForward = [];
            document.querySelectorAll('.view-layer').forEach(el => el.classList.add('hidden'));
            const targetId = state.role === 'MANAGER' ? 'hub-manager' : 'hub-auditor';
            const target = document.getElementById(targetId);
            if (target) target.classList.remove('hidden');
            currentModule = 'hub';
            updateDockButtons();
            updateTopNavActiveState('hub');
        }

        function updateDockButtons() {
            const btnBack = document.getElementById('nav-btn-back');
            const btnFwd = document.getElementById('nav-btn-forward');
            if(btnBack) btnBack.disabled = navHistory.length === 0;
            if(btnFwd) btnFwd.disabled = navForward.length === 0;
        }

        function updateTopNavActiveState(modId) {
            ['tag-hub', 'tag-calendar', 'tag-agent'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.classList.remove('ios-tab-active');
            });
            if (modId === 'hub') document.getElementById('tag-hub')?.classList.add('ios-tab-active');
            if (modId === 'calendar') document.getElementById('tag-calendar')?.classList.add('ios-tab-active');
            if (modId === 'agent') document.getElementById('tag-agent')?.classList.add('ios-tab-active');
        }

        // --- HISTORIA FORMULARZY (Ctrl+Z) ---
        class FormHistoryManager {
            constructor() { this.states = {}; }
            saveState(formId) {
                if(!this.states[formId]) this.states[formId] = { history: [], currentIndex: -1 };
                const obj = this.states[formId];
                const form = document.getElementById(formId);
                if(!form) return;
                
                const formData = new FormData(form);
                const snapshot = Object.fromEntries(formData.entries());
                
                if(obj.currentIndex < obj.history.length - 1) {
                    obj.history = obj.history.slice(0, obj.currentIndex + 1);
                }
                
                const last = obj.history[obj.currentIndex];
                if(JSON.stringify(last) !== JSON.stringify(snapshot)) {
                    obj.history.push(snapshot);
                    obj.currentIndex++;
                }
            }
            restoreState(formId, index) {
                const obj = this.states[formId];
                if(!obj || index < 0 || index >= obj.history.length) return;
                
                const snapshot = obj.history[index];
                const form = document.getElementById(formId);
                for(let key in snapshot) {
                    const el = form.elements[key];
                    if(el) {
                        el.value = snapshot[key];
                        if(el.tagName === 'SELECT') el.dispatchEvent(new Event('change'));
                    }
                }
                if(formId === 'view-audit-form' && snapshot.line) state.line = snapshot.line;
                obj.currentIndex = index;
            }
            undo(formId) {
                const obj = this.states[formId];
                if(obj && obj.currentIndex > 0) this.restoreState(formId, obj.currentIndex - 1);
            }
            redo(formId) {
                const obj = this.states[formId];
                if(obj && obj.currentIndex < obj.history.length - 1) this.restoreState(formId, obj.currentIndex + 1);
            }
        }
        const formHistory = new FormHistoryManager();

        document.addEventListener('input', (e) => {
            const form = e.target.closest('.view-tracked-form');
            if(form && form.id) formHistory.saveState(form.id);
        });
        document.addEventListener('change', (e) => {
            const form = e.target.closest('.view-tracked-form');
            if(form && form.id) formHistory.saveState(form.id);
        });

        document.addEventListener('keydown', function(e) {
            const activeForm = document.querySelector('.view-layer:not(.hidden) .view-tracked-form') || document.querySelector('.view-tracked-form:not(.hidden)');
            const formId = activeForm ? activeForm.id : null;

            if (e.ctrlKey && e.key === 'z') { e.preventDefault(); if(formId) formHistory.undo(formId); }
            if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'Z')) { e.preventDefault(); if(formId) formHistory.redo(formId); }
            if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); navGoBack(); }
            if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); navGoForward(); }
        });

        function getLocalDateString(d = new Date()) {
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }

        function bufferToBase64(buffer) {
            const bytes = new Uint8Array(buffer);
            let binary = '';
            for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
            return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
        }

        function base64ToBuffer(base64) {
            let str = base64.replace(/-/g, '+').replace(/_/g, '/');
            while (str.length % 4) str += '=';
            const binary = atob(str);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            return bytes.buffer;
        }

        function validateWebAuthnEnvironment() {
            if (!window.isSecureContext) { alert("⚠️ WebAuthn wymaga bezpiecznego połączenia (localhost lub HTTPS)."); return false; }
            if (!window.PublicKeyCredential) { alert("⚠️ Twoja przeglądarka nie wspiera logowania biometrycznego."); return false; }
            return true;
        }

        async function registerCurrentDeviceBiometrics() {
            if (!state.user_id) return alert("Zaloguj się najpierw kodem PIN!");
            if (!validateWebAuthnEnvironment()) return;

            try {
                const resChall = await fetch(`/api/auth/biometric/register-challenge?user_id=${state.user_id}`, { method: 'POST' });
                const { challenge } = await resChall.json();
                const enc = new TextEncoder();

                const cred = await navigator.credentials.create({
                    publicKey: {
                        challenge: base64ToBuffer(challenge),
                        rp: { name: "Quality Audit IFS" },
                        user: { id: enc.encode(String(state.user_id)), name: state.auditor_id, displayName: state.auditor_id },
                        pubKeyCredParams: [{ alg: -7, type: "public-key" }, { alg: -257, type: "public-key" }],
                        authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
                        timeout: 60000, attestation: "none"
                    }
                });

                if (!cred) return;
                const credId = bufferToBase64(cred.rawId);
                const resVerify = await fetch('/api/auth/biometric/register-verify', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user_id: state.user_id, credential_id: credId })
                });

                if (resVerify.ok) alert("✅ Zarejestrowano Face ID / Touch ID!");
                else alert("❌ Błąd zapisu poświadczenia.");
            } catch(e) { alert("❌ Anulowano biometrię."); }
        }

        async function loginWithBiometrics() {
            if (!validateWebAuthnEnvironment()) return;
            try {
                const resChallenge = await fetch('/api/auth/biometric/login-challenge');
                const { challenge } = await resChallenge.json();

                const assertion = await navigator.credentials.get({
                    publicKey: { challenge: base64ToBuffer(challenge), timeout: 60000, userVerification: "required" }
                });
                if (!assertion) return;

                const credId = bufferToBase64(assertion.rawId);
                const resVerify = await fetch('/api/auth/biometric/login-verify', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ credential_id: credId })
                });

                if (!resVerify.ok) return alert("❌ Urządzenie nie jest powiązane. Zaloguj się PIN-em i dodaj biometrię.");
                const user = await resVerify.json();
                applyLoginUser(user);
            } catch (err) { alert("ℹ️ Zaloguj się kodem PIN, a następnie powiąż Face ID/Odcisk ikoną w nagłówku."); }
        }

        window.openPinPrompt = function(role) {
            const container = document.getElementById('pin-container');
            const label = document.getElementById('pin-role-label');
            const desc = document.getElementById('pin-role-desc');
            const quickSelect = document.getElementById('auditor-quick-select');

            container.classList.remove('hidden');
            if (role === 'MANAGER') {
                if (label) label.innerText = 'Logowanie Key User (Kierownik Jakości)';
                if (desc) desc.innerText = 'PIN zarządzania (domyślnie: 9999)';
                if (quickSelect) quickSelect.classList.add('hidden');
                document.getElementById('input-pin').value = '9999';
            } else {
                if (label) label.innerText = 'Logowanie Audytora';
                if (desc) desc.innerText = 'Wprowadź swój kod PIN';
                if (quickSelect) quickSelect.classList.add('hidden');
                document.getElementById('input-pin').value = '';
            }
            document.getElementById('input-pin').focus();
        }

        window.setQuickPin = function(v) { document.getElementById('input-pin').value = v; submitLogin(); }
        window.closePinPrompt = function() { document.getElementById('pin-container').classList.add('hidden'); }
        window.switchUserPrompt = function() {
            document.getElementById('main-app').classList.add('hidden');
            document.getElementById('bottom-dock').classList.add('hidden');
            document.getElementById('view-auth').classList.remove('hidden');
            openPinPrompt(state.role === "MANAGER" ? "AUDITOR" : "MANAGER");
        }

        window.submitLogin = async function() {
            const pin = document.getElementById('input-pin').value.trim();
            if (!pin) return alert("Wprowadź PIN!");
            try {
                const res = await fetch('/api/auth/login', {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ pin })
                });
                if (!res.ok) return alert("❌ Nieprawidłowy kod PIN!");
                const user = await res.json();
                applyLoginUser(user);
            } catch(e) { alert("Błąd połączenia."); }
        }

        async function applyLoginUser(user) {
            state.user_id = user.id;
            state.auditor_id = user.full_name.trim();
            state.role = user.role;

            document.getElementById('display-auditor').innerText = state.auditor_id;
            document.getElementById('display-role').innerText = state.role === "MANAGER" ? "👑 KEY USER (MANAGER)" : "👤 AUDYTOR";
            
            if (state.role === "MANAGER") {
                await renderAuditorsList();
            }

            await loadProductionLines();
            document.getElementById('view-auth').classList.add('hidden');
            document.getElementById('main-app').classList.remove('hidden');
            document.getElementById('main-app').classList.add('flex');
            
            navHistory = []; navForward = [];
            document.getElementById('bottom-dock').classList.remove('hidden');
            showModule('hub', false); 
            
            await loadScheduleAndRender();
            // await updateKpiRibbon();
            formHistory.saveState('view-audit-form');
            formHistory.saveState('modal-plan-form');
        }

        window.logout = function() {
            state.user_id = 0;
            document.getElementById('main-app').classList.add('hidden');
            document.getElementById('bottom-dock').classList.add('hidden');
            document.getElementById('view-auth').classList.remove('hidden');
            closePinPrompt();
        }

        async function updateKpiRibbon() {
            try {
                const res = await fetch('/api/reports/kpi');
                if (!res.ok) return;
                const data = await res.json();
                document.getElementById('ribbon-incidents').innerText = data.incidents_count || 0;
                document.getElementById('ribbon-compliance').innerText = `${data.compliance_rate}% ZGODNY`;
            } catch(e) {}
        }

        let cachedAuditorsList = [];

        window.openAuditorProfileById = function(id) {
            const user = cachedAuditorsList.find(u => u.id === id);
            if (user && typeof showAuditorProfileModal === "function") {
                showAuditorProfileModal(user);
            }
        }

        async function renderAuditorsList() {
            const container = document.getElementById("auditors-list-container");
            if (!container) return;
            try {
                const res = await fetch(`/api/users?role=${state.role || "MANAGER"}`);
                if (!res.ok) {
                    console.error("Błąd pobierania listy audytorów:", res.status);
                    return;
                }
                const data = await res.json();
                cachedAuditorsList = Array.isArray(data) ? data : (data.users || []);
                
                if (cachedAuditorsList.length === 0) {
                    container.innerHTML = `<div class="text-slate-500 text-[10px] italic py-2">Brak zarejestrowanych audytorów.</div>`;
                    return;
                }

                container.innerHTML = cachedAuditorsList.map(u => `
                    <div class="bg-slate-900 p-2 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
                        <div>
                            <span class="font-bold text-white block">${u.full_name} <span class="text-[9px] text-slate-400 font-mono">(${u.pin})</span></span>
                            <span class="text-[9px] text-cyan-300 font-extrabold">${(u.qualifications || []).join(", ")}</span>
                        </div>
                        ${u.pin !== "9999" ? `
                            <div class="flex items-center gap-2">
                                <button onclick="openAuditorProfileById(${u.id})" class="px-3 py-1 bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-500/40 text-cyan-300 rounded-full text-[10px] font-bold transition flex items-center gap-1 shadow-sm">👤 Profil</button>
                                <button onclick="deleteAuditor(${u.id})" class="tile-3d bg-rose-950 border border-rose-500/50 text-rose-300 px-2 py-1 text-[9px] font-bold rounded-full">Usuń</button>
                            </div>
                        ` : `<span class="text-[9px] text-amber-400 font-bold">Kierownik</span>`}
                    </div>
                `).join("");
            } catch (err) {
                console.error("Błąd w renderAuditorsList:", err);
            }
        }

        async function addNewAuditor() {
            const nameEl = document.getElementById('new-auditor-name');
            const pinEl = document.getElementById('new-auditor-pin');
            const full_name = nameEl.value.trim();
            const pin = pinEl.value.trim();
            if (!full_name || !pin) return alert("Wprowadź imię i nazwisko oraz kod PIN!");

            const quals = [];
            if (document.getElementById('new-qual-haccp').checked) quals.push('HACCP');
            if (document.getElementById('new-qual-gmp').checked) quals.push('GMP');
            if (document.getElementById('new-qual-ghp').checked) quals.push('GHP');

            const res = await fetch(`/api/users?role=${state.role}`, {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ pin, full_name, role: 'AUDITOR', qualifications: quals })
            });

            if (res.ok) {
                alert("✅ Dodano audytora!");
                nameEl.value = ""; pinEl.value = "";
                await renderAuditorsList();
            } else {
                const err = await res.json();
                alert(`❌ ${err.detail || 'Błąd zapisu'}`);
            }
        }

        window.deleteAuditor = async function(userId) {
            if (!confirm("Czy na pewno chcesz usunąć tego audytora?")) return;
            const res = await fetch(`/api/users/${userId}?role=${state.role}`, { method: 'DELETE' });
            if (res.ok) await renderAuditorsList();
        }

        function getPolishHolidays(year) {
            return {
                [`${year}-01-01`]: "Nowy Rok", [`${year}-01-06`]: "Trzech Króli",
                [`${year}-05-01`]: "Święto Pracy", [`${year}-05-03`]: "Konstytucji 3 Maja",
                [`${year}-08-15`]: "Wniebowzięcie NMP", [`${year}-11-01`]: "Wszystkich Świętych",
                [`${year}-11-11`]: "Niepodległości", [`${year}-12-25`]: "Boże Narodzenie", [`${year}-12-26`]: "II Dzień Świąt"
            };
        }

        async function loadScheduleAndRender() {
            try {
                const res = await fetch(`/api/schedule?auditor=${encodeURIComponent(state.auditor_id)}&role=${state.role}`);
                const allSchedules = await res.json();
                // Audytor widzi tylko zaplanowane (wykonane znikaja do historii), Manager widzi calosc
                if (state.role !== 'MANAGER') {
                    schedulesData = allSchedules.filter(s => s.status !== 'WYKONANY');
                } else {
                    schedulesData = allSchedules;
                }
                renderCalendar();
            } catch(e) { schedulesData = []; }
        }

        function changeMonth(delta) {
            currentCalDate.setDate(1);
            currentCalDate.setMonth(currentCalDate.getMonth() + delta);
            renderCalendar();
        }

                let activeSelectedFilter = null;

        function selectSingleFilter(key) {
            if (activeSelectedFilter === key) {
                activeSelectedFilter = null;
            } else {
                activeSelectedFilter = key;
            }

            const map = {
                'HACCP': 'btn-tag-haccp',
                'GMP': 'btn-tag-gmp',
                'GHP': 'btn-tag-ghp',
                'WYKONANY': 'btn-tag-done',
                'SPOZNIONY': 'btn-tag-overdue'
            };

            Object.entries(map).forEach(([k, id]) => {
                const b = document.getElementById(id);
                if (!b) return;
                if (activeSelectedFilter === k) {
                    b.classList.remove('opacity-40');
                    b.classList.add('ring-2', 'ring-white', 'brightness-125');
                } else {
                    b.classList.add('opacity-40');
                    b.classList.remove('ring-2', 'ring-white', 'brightness-125');
                }
            });

            renderCalendar();
        }

        function renderCalendar() {
            const year = currentCalDate.getFullYear(), month = currentCalDate.getMonth();
            const names = ["Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec", "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień"];
            document.getElementById('cal-month-title').innerText = `${names[month]} ${year}`;
            
            const holidays = getPolishHolidays(year);
            const firstDay = new Date(year, month, 1), lastDay = new Date(year, month + 1, 0);
            let startDay = firstDay.getDay() - 1; if (startDay === -1) startDay = 6;
            
            const grid = document.getElementById('calendar-grid'); 
            grid.innerHTML = "";
            let dateIter = 1;
            const totalDays = lastDay.getDate(), todayStr = getLocalDateString();

            for (let row = 0; row < 6; row++) {
                if (dateIter > totalDays) break;
                for (let col = 0; col < 7; col++) {
                    if ((row === 0 && col < startDay) || dateIter > totalDays) {
                        grid.innerHTML += `<div class="cal-day bg-slate-950/30 rounded-xl border border-slate-900"></div>`;
                    } else {
                        const currentFullDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(dateIter).padStart(2, '0')}`;
                        const holidayName = holidays[currentFullDate], isToday = currentFullDate === todayStr;
                        let dayAudits = schedulesData.filter(s => s.scheduled_date === currentFullDate);
                        if (state.role !== 'MANAGER') {
                            dayAudits = dayAudits.filter(s => s.status !== 'WYKONANY');
                        }

                        // Ścisły filtr wyłączny: jeśli nic nie jest wciśnięte -> brak audytów
                        dayAudits = dayAudits.filter(a => {
                            if (!activeSelectedFilter) return false;
                            const aType = (a.audit_type || "HACCP").toUpperCase().trim();
                            const isCompleted = (a.status === 'WYKONANY');
                            const isOverdue = (!isCompleted && currentFullDate < todayStr);

                            if (activeSelectedFilter === 'HACCP') return aType === 'HACCP';
                            if (activeSelectedFilter === 'GMP') return aType === 'GMP';
                            if (activeSelectedFilter === 'GHP') return aType === 'GHP';
                            if (activeSelectedFilter === 'WYKONANY') return isCompleted;
                            if (activeSelectedFilter === 'SPOZNIONY') return isOverdue;
                            return false;
                        });
                        
                        let badgeHtml = "";
                        dayAudits.forEach(a => {
                            const aType = (a.audit_type || "HACCP").toUpperCase();
                            const isCompleted = (a.status === 'WYKONANY');
                            const isOverdue = (!isCompleted && currentFullDate < todayStr);

                            let badgeColor = aType === "GMP" ? "bg-purple-600 border-purple-400" :
                                             aType === "GHP" ? "bg-cyan-600 border-cyan-400" : "bg-emerald-600 border-emerald-400";
                            
                            let badgeStyle = isCompleted ? `${badgeColor} opacity-75 text-white` :
                                             isOverdue ? "bg-red-600 border-red-400 text-white animate-pulse" : `${badgeColor} text-white`;

                            badgeHtml += `
                                <div draggable="true" ondragstart="event.stopPropagation(); event.dataTransfer.setData('text/plain', ${a.id});"
                                     onclick="event.stopPropagation(); state.role === 'MANAGER' ? openMgrModal(${a.id}) : openAudModal(${a.id});" 
                                     class="${badgeStyle} border text-[7px] font-extrabold px-1.5 py-0.5 rounded truncate shadow flex items-center justify-between gap-1 mb-0.5 cursor-pointer relative z-10 hover:brightness-110">
                                    <span>${isOverdue ? '🔴 ' : ''}${aType}:${a.line.split(' ')[0]} • ${a.lead_auditor.split(' ')[0]}${isCompleted ? ' ✓' : ''}</span>
                                </div>
                            `;
                        });
                        
                        grid.innerHTML += `
                            <div ondragover="event.preventDefault()" ondrop="handleAuditDrop(event, '${currentFullDate}')"
                                 onclick="if(state.role==='MANAGER'){openManualPlanModal('${currentFullDate}')}" 
                                 class="cal-day tile-3d ${holidayName ? 'bg-rose-950/30 border-rose-900/50' : 'bg-slate-900/80'} ${isToday ? 'border-cyan-400 ring-1 ring-cyan-400/40' : 'border-slate-800'} p-1 flex flex-col justify-between cursor-pointer rounded-xl">
                                <div class="flex justify-between items-start">
                                    <span class="text-[10px] font-extrabold ${holidayName ? 'text-rose-400' : 'text-slate-200'}">${dateIter}</span>
                                    ${holidayName ? `<span class="text-[7px] text-rose-300 truncate max-w-[50px] font-extrabold">🏖️ ${holidayName}</span>` : ''}
                                </div>
                                <div class="space-y-0.5 mt-0.5">${badgeHtml}</div>
                            </div>
                        `;
                        dateIter++;
                    }
                }
            }
        }

        async function handleAuditDrop(event, targetDate) {
            event.preventDefault();
            const auditId = event.dataTransfer.getData('text/plain');
            if (!auditId) return;

            const today = getLocalDateString();
            if (targetDate < today) {
                return alert("⚠️ Nie można przenosić audytów na daty wsteczne!");
            }

            try {
                const res = await fetch(`/api/schedule/${auditId}/reschedule`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ new_date: targetDate })
                });

                if (res.ok) {
                    await loadScheduleAndRender();
                } else {
                    const err = await res.json();
                    alert("❌ " + (err.detail || "Błąd zmiany terminu."));
                }
            } catch (e) {
                alert("Błąd połączenia z serwerem.");
            }
        }

        async function openManualPlanModal(dateStr = "") {
            if (state.role !== "MANAGER") return;
            const selectedDate = dateStr || getLocalDateString();
            document.getElementById('plan-date').value = selectedDate; 
            miniCalDate = new Date(selectedDate);
            renderMiniCalendar();
            await loadAuditorsDropdown(document.getElementById('plan-type').value);
            
            formHistory.saveState('modal-plan-form');
            document.getElementById('modal-plan').classList.remove('hidden');
        }

        function closePlanModal() { document.getElementById('modal-plan').classList.add('hidden'); }
        function changeMiniMonth(delta) { miniCalDate.setMonth(miniCalDate.getMonth() + delta); renderMiniCalendar(); }

        function renderMiniCalendar() {
            const year = miniCalDate.getFullYear(), month = miniCalDate.getMonth();
            const names = ["Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec", "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień"];
            document.getElementById('mini-cal-month-title').innerText = `${names[month]} ${year}`;
            
            const firstDay = new Date(year, month, 1), lastDay = new Date(year, month + 1, 0);
            let startDay = firstDay.getDay() - 1; if (startDay === -1) startDay = 6;
            const grid = document.getElementById('mini-calendar-grid'); 
            grid.innerHTML = "";
            const selVal = document.getElementById('plan-date').value;
            
            for (let i = 0; i < startDay; i++) grid.innerHTML += `<div class="p-1"></div>`;
            for (let day = 1; day <= lastDay.getDate(); day++) {
                const fDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                grid.innerHTML += `<div onclick="document.getElementById('plan-date').value='${fDate}'; renderMiniCalendar(); formHistory.saveState('modal-plan-form');" class="p-1 rounded text-[9px] cursor-pointer ${fDate === selVal ? 'bg-cyan-500 text-slate-950 font-black' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'}">${day}</div>`;
            }
        }

        async function saveSchedule() {
            const pDate = document.getElementById('plan-date').value;
            const today = getLocalDateString();
            
            if (pDate < today) {
                return alert("⚠️ Nie można planować audytów z datą wsteczną! Wybierz datę bieżącą lub przyszłą.");
            }

            const leadAuditor = document.getElementById('plan-auditor').value;
            const backupAuditor = document.getElementById('plan-backup').value;

            if (leadAuditor === backupAuditor && backupAuditor !== "Brak") {
                return alert("⚠️ Niezgodność z normą IFS: Audytor Główny i Zastępca nie mogą być tą samą osobą!");
            }

            const payload = {
                scheduled_date: pDate,
                audit_type: document.getElementById('plan-type').value,
                line: document.getElementById('plan-line').value,
                lead_auditor: leadAuditor,
                backup_auditor: backupAuditor,
                notes: document.getElementById('plan-notes').value
            };
            const res = await fetch('/api/schedule', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
            if (res.ok) { alert("✅ Audyt zaplanowany!"); closePlanModal(); await loadScheduleAndRender(); }
        }

        function openAutoPlanModal() { document.getElementById('modal-autoplan').classList.remove('hidden'); }
        function closeAutoPlanModal() { document.getElementById('modal-autoplan').classList.add('hidden'); }
        function setPlanPeriod(m, btn) {
            state.selected_period_months = m;
            document.querySelectorAll('.btn-period').forEach(b => b.classList.remove('tile-selected'));
            btn.classList.add('tile-selected');
        }

        async function runAutoSchedule() {
            const lines = [];
            document.querySelectorAll('.auto-line-chk:checked').forEach(c => lines.push(c.value));
            if (!lines.length) return alert("Wybierz linie produkcyjne!");

            const types = [];
            if (document.getElementById('auto-type-haccp').checked) types.push('HACCP');
            if (document.getElementById('auto-type-gmp').checked) types.push('GMP');
            if (document.getElementById('auto-type-ghp').checked) types.push('GHP');

            const payload = {
                start_year: parseInt(document.getElementById('autoplan-year').value),
                start_month: parseInt(document.getElementById('autoplan-month').value),
                period_months: state.selected_period_months,
                lines: lines, audit_types: types,
                include_weekends: document.getElementById('auto-include-weekends').checked
            };
            const res = await fetch('/api/schedule/auto', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
            if (res.ok) {
                const d = await res.json();
                alert(`✨ Wygenerowano plan: ${d.count} audytów.`);
                closeAutoPlanModal(); showModule('calendar'); await loadScheduleAndRender();
            }
        }

        async function loadAuditResults() {
            const tbody = document.getElementById('manager-results-table');
            tbody.innerHTML = '<tr><td colspan="8" class="py-4 text-center">Ładowanie danych...</td></tr>';
            try {
                const res = await fetch(`/api/audits`);
                const data = await res.json();
                tbody.innerHTML = '';
                if(data.length === 0) tbody.innerHTML = '<tr><td colspan="8" class="py-4 text-center">Brak zapisanych audytów w bazie.</td></tr>';
                data.forEach(a => {
                    const slmColor = a.slm_verdict === 'OK' ? 'text-emerald-400' : 'text-red-400 font-bold';
                    const statusColor = a.record_status === 'ZABLOKOWANY' ? 'text-amber-400' : 'text-emerald-400';
                    const isFinished = (a.record_status === 'ZATWIERDZONY' || a.record_status === 'ODRZUCONY');
                    const actionsHtml = isFinished 
                        ? (a.record_status === 'ZATWIERDZONY' 
                            ? '<span class="text-emerald-400 font-semibold mr-2">Zatwierdzono</span>' 
                            : '<span class="text-rose-500 font-semibold mr-2">Odrzucono</span>')
                        : `
                            <button onclick="handleAuditAction('approve', ${a.id})" class="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[8px] font-semibold">Zatwierdź</button>
                            <button onclick="handleAuditAction('reject', ${a.id})" class="px-2 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded text-[8px] font-semibold">Odrzuć</button>
                          `;

                    tbody.innerHTML += `
                        <tr class="hover:bg-slate-800 transition">
                            <td class="py-2 pr-2 border-b border-white/5 font-mono text-[10px]">#${a.id}</td>
                            <td class="py-2 pr-2 border-b border-white/5 text-[9px]">${a.timestamp ? a.timestamp.substring(0, 16) : 'Brak daty'}</td>
                            <td class="py-2 pr-2 border-b border-white/5 font-bold text-[10px] text-white">${a.line}</td>
                            <td class="py-2 pr-2 border-b border-white/5 text-[10px]">${a.shift}</td>
                            <td class="py-2 pr-2 border-b border-white/5 text-[9px]">${a.auditor_id.split(' ')[0]}</td>
                            <td id="status-${a.id}" class="py-2 pr-2 border-b border-white/5 text-[8px] font-black ${statusColor}">${a.record_status}</td>
                            <td class="py-2 border-b border-white/5 ${slmColor} text-[9px]">${a.slm_verdict} (${a.risk_level})</td>
                            <td class="py-2 pr-2 border-b border-white/5 whitespace-nowrap">
                                <div id="actions-${a.id}" class="flex items-center gap-1">
                                    ${actionsHtml}
                                    <button onclick="handleAuditAction('details', ${a.id})" class="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-[8px] font-semibold">Szczegóły</button>
                                </div>
                            </td>
                        </tr>
                    `;
                });
            } catch(e) { console.error(e); }
        }

        async function loadManagerEditRequests() {
            try {
                const res = await fetch(`/api/audits/edit-requests?role=${state.role}`);
                if (!res.ok) return;
                const requests = await res.json();
                const container = document.getElementById('manager-requests-container');
                if (!container) return;

                if (requests.length === 0) {
                    container.innerHTML = '<p class="text-[10px] text-slate-500 italic">Brak oczekujących wniosków o odblokowanie.</p>';
                    return;
                }

                container.innerHTML = requests.map(r => `
                    <div class="bg-slate-950/90 border border-amber-500/40 p-2.5 rounded-xl space-y-1.5 text-xs">
                        <div class="flex justify-between items-center">
                            <span class="text-cyan-400 font-bold">${r.line} (Audyt #${r.audit_id})</span>
                            <span class="text-[9px] text-slate-400">${r.created_at.substring(0, 16)}</span>
                        </div>
                        <p class="text-[10px] text-slate-300"><b>Wnioskuje:</b> ${r.requested_by}</p>
                        <p class="text-[10px] text-amber-200 bg-amber-950/40 p-1.5 rounded border border-amber-500/20"><b>Powód:</b> ${r.reason}</p>
                        <div class="flex gap-2 pt-1">
                            <button onclick="decideEditRequest(${r.id}, 'ZATWIERDZONY')" class="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[10px] py-1.5 rounded-lg transition">✓ Zatwierdź</button>
                            <button onclick="decideEditRequest(${r.id}, 'ODRZUCONY')" class="flex-1 bg-rose-900 hover:bg-rose-800 text-rose-200 font-black text-[10px] py-1.5 rounded-lg transition">✕ Odrzuć</button>
                        </div>
                    </div>
                `).join('');
            } catch(e) {}
        }

        async function decideEditRequest(requestId, decision) {
            const comment = prompt(`Komentarz do decyzji (${decision}):`) || "";
            const res = await fetch(`/api/audits/decide-edit?role=${state.role}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ request_id: requestId, decision, manager_comment: comment })
            });
            if (res.ok) {
                alert(`Decyzja zapisana: ${decision}`);
                loadManagerEditRequests();
                loadAuditResults();
            } else {
                alert("Błąd podczas zapisywania decyzji.");
            }
        }

        async function loadAuditorHistory() {
            const list = document.getElementById('auditor-history-list');
            if (!list) return;
            list.innerHTML = '<p class="text-xs text-slate-400 animate-pulse">Pobieranie historii z bazy SQLite...</p>';
            try {
                const res = await fetch('/api/audits');
                if (!res.ok) {
                    list.innerHTML = '<p class="text-xs text-amber-400">Brak możliwości pobrania historii (błąd serwera).</p>';
                    return;
                }
                const data = await res.json();
                const auditsList = Array.isArray(data) ? data : [];
                
                const myAudits = auditsList.filter(a => {
                    if (!a) return false;
                    if (state.role === 'MANAGER') return true;
                    if (!state.auditor_id) return true;
                    return String(a.auditor_id).trim() === String(state.auditor_id).trim() || true;
                });

                list.innerHTML = '';
                if (myAudits.length === 0) {
                    list.innerHTML = '<p class="text-xs text-slate-400">Brak zarejestrowanych audytów. Masz czyste konto!</p>';
                    return;
                }

                myAudits.slice(0, 10).forEach(a => {
                    const auditId = a.id || 0;
                    const lineName = a.line || 'Brak nazwy linii';
                    const dateStr = a.timestamp ? String(a.timestamp).substring(0, 16) : 'Brak daty';
                    const statusText = a.record_status || 'ZABLOKOWANY';
                    const isLocked = statusText !== 'ODBLOKOWANY_DO_KOREKTY';
                    const isOk = String(a.slm_verdict).toUpperCase() === 'OK';

                    list.innerHTML += `
                        <div class="glass-card bg-slate-900/90 p-3.5 rounded-xl flex justify-between items-center border-l-4 ${isOk ? 'border-emerald-500' : 'border-rose-500'} mb-2">
                            <div>
                                <h4 class="font-bold text-xs text-white">${lineName}</h4>
                                <p class="text-[9px] text-slate-400 mt-0.5">Data: ${dateStr} | Status: <b class="${isLocked ? 'text-amber-400' : 'text-emerald-400'}">${statusText}</b></p>
                            </div>
                            <div>
                                ${isLocked 
                                    ? `<button onclick="requestAuditCorrection(${auditId})" class="tile-3d bg-amber-950/80 border border-amber-500/50 text-amber-300 px-3 py-1.5 rounded font-bold text-[10px] transition hover:bg-amber-900 cursor-pointer">
                                         🔓 Wnioskuj o korektę
                                       </button>`
                                    : `<span class="text-emerald-400 font-extrabold text-[10px] bg-emerald-950 px-2 py-1 rounded border border-emerald-500/40">
                                         Edycja dozwolona
                                       </span>`
                                }
                            </div>
                        </div>
                    `;
                });
            } catch(e) { 
                console.error("Błąd ładowania historii audytów:", e);
                list.innerHTML = '<p class="text-xs text-rose-400">Błąd podczas przetwarzania historii audytów.</p>';
            }
        }

        async function requestAuditCorrection(auditId) {
            const reason = prompt("IFS Food v8 wymaga uzasadnienia korekty wpisu:\nPodaj szczegółowy powód odblokowania rekordu do edycji:");
            if (!reason || reason.trim().length < 5) {
                return alert("Podanie szczegółowego powodu korekty jest wymagane przez normę IFS Food v8.");
            }

            try {
                const res = await fetch('/api/audits/request-edit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        audit_id: auditId,
                        requested_by: state.auditor_id,
                        reason: reason.trim()
                    })
                });

                const data = await res.json();
                if (res.ok) {
                    alert("✅ " + data.message);
                    loadAuditorHistory();
                } else {
                    alert("❌ " + (data.detail || "Błąd wysyłania wniosku."));
                }
            } catch(e) {
                alert("Błąd połączenia z serwerem.");
            }
        }

        function startDirectInspection() {
            state.active_audit_type = "HACCP";
            document.getElementById('badge-active-standard').innerText = "HACCP";
            document.getElementById('badge-active-standard').className = "text-[9px] font-black bg-emerald-950 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded-full";
            
            document.getElementById('view-audit-form').reset();
            formHistory.saveState('view-audit-form');
            
            loadChecklistForAudit("HACCP");
            showModule('audit-main');
        }

        function setInspectionStandard(std, btn) {
            state.active_audit_type = std;
            document.querySelectorAll('.btn-insp-std').forEach(b => {
                b.className = "btn-insp-std tile-3d bg-slate-800 p-1.5 text-xs font-black text-slate-300";
            });
            const badge = document.getElementById('badge-active-standard');
            badge.innerText = std;
            if (std === 'HACCP') {
                btn.className = "btn-insp-std tile-3d tile-selected bg-emerald-600 p-1.5 text-xs font-black text-white";
                badge.className = "text-[9px] font-black bg-emerald-950 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded-full";
            } else if (std === 'GMP') {
                btn.className = "btn-insp-std tile-3d tile-selected bg-purple-600 p-1.5 text-xs font-black text-white";
                badge.className = "text-[9px] font-black bg-purple-950 text-purple-300 border border-purple-500/40 px-2 py-0.5 rounded-full";
            } else {
                btn.className = "btn-insp-std tile-3d tile-selected bg-cyan-600 p-1.5 text-xs font-black text-white";
                badge.className = "text-[9px] font-black bg-cyan-950 text-cyan-300 border border-cyan-500/40 px-2 py-0.5 rounded-full";
            }
            loadChecklistForAudit(std);
            formHistory.saveState('view-audit-form');
        }

        async function loadChecklistForAudit(auditType) {
            const container = document.getElementById('checklist-items-container');
            container.innerHTML = "<div class='text-center py-4'><i class='fas fa-circle-notch fa-spin text-cyan-500 text-2xl mb-2'></i><p class='text-[10px] text-slate-400'>Pobieranie pytań audytowych z bazy...</p></div>";
            try {
                const res = await fetch(`/api/checklist-template/${encodeURIComponent(auditType)}`);
                const items = await res.json();
                state.checklist_results = {}; 
                container.innerHTML = "";

                items.forEach(item => {
                    state.checklist_results[item.id] = { status: "OK", is_ko: item.is_ko, clause: item.clause, question: item.question, score: 5, notes: "" };
                    const koTag = item.is_ko ? `<span class="bg-rose-950 text-rose-300 border border-rose-600 text-[8px] font-black px-1.5 py-0.5 rounded mr-1 animate-pulse"><i class="fas fa-exclamation-triangle"></i> KNOCK-OUT</span>` : '';
                    
                    container.innerHTML += `
                        <div class="p-3 rounded-xl border ${item.is_ko ? 'bg-rose-950/20 border-rose-500/40 shadow-[0_0_10px_rgba(225,29,72,0.1)]' : 'bg-slate-900/60 border-slate-800'} space-y-2 mb-3">
                            <div>
                                <span class="text-[10px] font-mono text-cyan-400 font-extrabold block mb-1">${koTag}${item.clause}</span>
                                <p class="text-[11px] text-slate-200 leading-snug">${item.question}</p>
                            </div>
                            
                            <div class="flex items-center gap-3 pt-2 border-t border-slate-800/80">
                                <span class="text-[10px] font-bold text-slate-400 w-16">Ocena (1-5):</span>
                                <input type="range" min="1" max="5" value="5" 
                                    oninput="document.getElementById('lbl-chk-${item.id}').innerText=this.value; state.checklist_results[${item.id}].score=parseInt(this.value); if(this.value<5){setChecklistAnswer(${item.id},'NOK')}else{setChecklistAnswer(${item.id},'OK')}" 
                                    class="flex-1 accent-cyan-500 cursor-pointer h-2 bg-slate-700 rounded-lg appearance-none">
                                <span id="lbl-chk-${item.id}" class="text-base font-black text-cyan-400 w-6 text-center">5</span>
                            </div>
                            
                            <div class="pt-1">
                                <input type="text" placeholder="Uwagi / Działania korygujące (opcjonalnie)..." 
                                    oninput="state.checklist_results[${item.id}].notes=this.value" 
                                    class="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-[10px] text-slate-300 focus:border-cyan-500 outline-none transition-colors">
                            </div>
                        </div>
                    `;
                });
                calculateChecklistScore();
            } catch(e) {
                container.innerHTML = "<div class='text-center py-4'><i class='fas fa-exclamation-circle text-rose-500 text-2xl mb-2'></i><p class='text-xs text-rose-400'>Błąd pobierania checklisty z serwera.</p></div>";
            }
        }

        function setChecklistAnswer(id, ans) {
            state.checklist_results[id].status = ans;
            calculateChecklistScore();
        }

        function calculateChecklistScore() {
            const keys = Object.keys(state.checklist_results);
            let total = 0, ok = 0, koFail = false;
            keys.forEach(k => {
                const it = state.checklist_results[k];
                if (it.status !== "NA") {
                    total++;
                    if (it.status === "OK") ok++;
                    if (it.status === "NOK" && it.is_ko) koFail = true;
                }
            });
            const badge = document.getElementById('ko-status-badge');
            if (badge) {
                if (koFail) {
                    badge.className = "text-[9px] font-black bg-rose-950 text-rose-300 border border-rose-500 px-2 py-0.5 rounded-full animate-pulse";
                    badge.innerHTML = "<i class='fas fa-exclamation-triangle'></i> ZŁAMANIE KO!";
                } else {
                    badge.className = "text-[9px] font-black bg-emerald-950 text-emerald-300 border border-emerald-500/50 px-2 py-0.5 rounded-full";
                    badge.innerText = "KO: ZGODNE";
                }
            }
        }

        async function saveAuditToDb() {
            // NATYCHMIASTOWA REAKCJA (0 ms)
            updateAuditHud(1, "KROK 1/2: ANALIZA SLM", "Wnioskowanie lokalnego modelu i weryfikacja IFS Food v8...", "loading");

            let koFailed = false;
            Object.values(state.checklist_results).forEach(it => {
                if (it.status === "NOK" && it.is_ko) koFailed = true;
            });

            let slmText = "Audyt zakończony pomyślnie.";
            try {
                const slmReq = {
                    line: state.line, shift: state.shift, zone: state.zone, health_ok: state.health_ok,
                    ko_failed: koFailed
                };
                const sRes = await fetch('/api/slm-analyze', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(slmReq) });
                const analysis = await sRes.json();
                slmText = `${analysis.decyzja} (Poziom: ${analysis.poziom_ryzyka})`;
            } catch(e) {}

            const formData = new FormData();
            formData.append("auditor_id", state.auditor_id);
            formData.append("line", state.line);
            formData.append("shift", state.shift);
            formData.append("zone", state.zone);
            formData.append("health_ok", state.health_ok);
            formData.append("dispense_no", state.dispense_no || "BRAK");
            formData.append("glass_plastic_ok", state.glass_plastic_ok);
            formData.append("allergen_clean_ok", state.allergen_clean_ok);
            formData.append("wood_policy_ok", state.wood_policy_ok);
            formData.append("ppe_ok", state.ppe_ok);
            formData.append("line_status", state.line_status);
            formData.append("ccp1_fe_ok", state.ccp1_fe_ok);
            formData.append("ccp1_nonfe_ok", state.ccp1_nonfe_ok);
            formData.append("ccp1_ss_ok", state.ccp1_ss_ok);
            formData.append("ccp1_reject_ok", state.ccp1_reject_ok);
            formData.append("ccp1_bin_locked", state.ccp1_bin_locked);
            formData.append("ccp2_magnet_ok", state.ccp2_magnet_ok);
            formData.append("ccp3_sieve_ok", state.ccp3_sieve_ok);
            formData.append("gmp_cleanliness_ok", state.gmp_cleanliness_ok);
            formData.append("gmp_wood_score", state.gmp_wood_score);
            formData.append("gmp_foreign_score", state.gmp_foreign_score);
            formData.append("gmp_waste_ok", state.gmp_waste_ok);
            formData.append("bhp_estop_ok", state.bhp_estop_ok);
            formData.append("bhp_atex_ok", state.bhp_atex_ok);
            formData.append("bhp_hot_cip_ok", state.bhp_hot_cip_ok);
            formData.append("bhp_evac_ppoz_ok", state.bhp_evac_ppoz_ok);
            formData.append("bhp_status", state.bhp_status);
            formData.append("slm_analysis", slmText);
            formData.append("checklist_results", JSON.stringify(state.checklist_results));

            // STAN 1: Natychmiastowa reakcja interfejsu (0 ms)
            updateAuditHud(1, "KROK 1/2: WNIOSKOWANIE SLM", "Analiza parametrów CCP, GMP i normy IFS Food v8...", "loading");

            // STAN 2: Transakcja bazy danych
            setTimeout(() => {
                const toastDesc = document.getElementById('audit-progress-desc');
                if (toastDesc && toastDesc.textContent.includes("CCP")) {
                    updateAuditHud(2, "KROK 2/2: ZAPIS I BLOKADA REKORDU", "Rejestracja w SQLite i wpis do Audit Trail...", "loading");
                }
            }, 900);

            const res = await fetch('/api/audit', { method: 'POST', body: formData });

            if (res.ok) {
                const data = await res.json().catch(() => ({}));
                const verdict = data.slm_verdict || (slmText.includes('NOK') ? 'NOK' : 'OK');
                
                // STAN 3: Werdykt końcowy
                if (verdict.includes('NOK') || verdict.includes('HOLD')) {
                    updateAuditHud(3, "ODCHYLENIE CCP / HOLD LOT", `Werdykt: ${verdict} | Status: ZABLOKOWANY`, "alert");
                } else {
                    updateAuditHud(3, "AUDYT ZAPISANY POMYŚLNIE", `Werdykt SLM: ${verdict} | Status: ZABLOKOWANY`, "success");
                }

                showModule('hub');
                if (typeof loadScheduleAndRender === 'function') await loadScheduleAndRender();
                if (typeof loadAuditorHistory === 'function') await loadAuditorHistory();
                if (typeof updateKpiRibbon === 'function') // await updateKpiRibbon();
                if (typeof loadAuditsAndRender === 'function') await loadAuditsAndRender();
                if (typeof loadAuditorHistory === 'function') await loadAuditorHistory();
            } else {
                updateAuditHud(3, "BŁĄD ZAPISU AUDYTU", `Serwer zwrócił kod błędu ${res.status}`, "alert");
            }
        }

        async function loadProductionLines() {
            const res = await fetch('/api/lines');
            productionLinesData = await res.json();
            const planLine = document.getElementById('plan-line');
            if (planLine) planLine.innerHTML = productionLinesData.map(l => `<option value="${l.name}">${l.name}</option>`).join('');
            
            const autoLines = document.getElementById('autoplan-lines-container');
            if (autoLines) autoLines.innerHTML = productionLinesData.map(l => `<label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" class="auto-line-chk" value="${l.name}" checked> ${l.name}</label>`).join('');

            const preauditTiles = document.getElementById('preaudit-lines-tiles');
            if (preauditTiles && productionLinesData.length > 0) {
                state.line = productionLinesData[0].name;
                document.getElementById('hidden-line-input').value = state.line;
                preauditTiles.innerHTML = productionLinesData.map((l, idx) => `
                    <div onclick="selectTile('line', '${l.name}', this)" class="tile-line tile-3d ${idx === 0 ? 'tile-selected' : ''} bg-slate-800 p-2 text-center cursor-pointer text-xs font-bold">${l.code || l.name}</div>
                `).join('');
            }
        }

        function selectTile(cat, val, btn) {
            document.querySelectorAll(`.tile-${cat}`).forEach(b => b.classList.remove('tile-selected'));
            btn.classList.add('tile-selected');
            state[cat] = val;
            if (cat === 'line') document.getElementById('hidden-line-input').value = val;
            formHistory.saveState('view-audit-form');
        }

        function renderLinesManagerList() {
            const c = document.getElementById('lines-list-container');
            if (!c) return;
            c.innerHTML = productionLinesData.map(l => `
                <div class="bg-slate-900 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
                    <div><span class="font-black text-white block">${l.name}</span><span class="text-[10px] text-slate-400 font-bold">${l.code} • ${l.default_zone}</span></div>
                    <button onclick="deleteProductionLine(${l.id})" class="tile-3d bg-red-950 border border-red-500/50 text-red-300 px-2.5 py-1 rounded font-bold">Usuń</button>
                </div>
            `).join('');
        }

        async function addNewProductionLine() {
            const name = document.getElementById('new-line-name').value.trim();
            const code = document.getElementById('new-line-code').value.trim();
            const default_zone = document.getElementById('new-line-zone').value;
            if (!name) return alert("Wpisz nazwę linii!");
            const res = await fetch('/api/lines', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ name, code, default_zone }) });
            if (res.ok) { alert("✅ Dodano linię!"); await loadProductionLines(); renderLinesManagerList(); }
        }

        async function deleteProductionLine(id) {
            if (!confirm("Usunąć tę linię?")) return;
            await fetch(`/api/lines/${id}`, { method: 'DELETE' });
            await loadProductionLines(); renderLinesManagerList();
        }

        async function loadAuditorsDropdown(type = "HACCP") {
            const res = await fetch(`/api/auth/auditors?type=${encodeURIComponent(type)}`);
            const list = await res.json();
            
            const createOption = (auditor) => {
                const name = (typeof auditor === 'object' && auditor !== null) ? (auditor.name || auditor.full_name || auditor.id) : auditor;
                const val = (typeof auditor === 'object' && auditor !== null) ? (auditor.name || auditor.id) : auditor;
                return `<option value="${val}">${name}</option>`;
            };

            const opts = list.map(createOption).join('');
            document.getElementById('plan-auditor').innerHTML = opts;
            document.getElementById('plan-backup').innerHTML = `<option value="Brak">Brak</option>` + opts;
        }

        function filterPlanAuditorsByType(v) { loadAuditorsDropdown(v); }

        function renderMarkdownToHtml(t) {
            return t.replace(/\*\*(.*?)\*\*/g, '<strong class="text-amber-300">$1</strong>').replace(/\n/g, '<br>');
        }

        async function sendAgentMessage() {
            const inp = document.getElementById('agent-user-input');
            const txt = inp.value.trim();
            if (!txt) return;
            const box = document.getElementById('agent-chat-box');
            box.innerHTML += `<div class="flex justify-end"><div class="bg-cyan-950/60 p-2 rounded-xl border border-cyan-500/40 text-slate-100 max-w-[85%]">${txt}</div></div>`;
            inp.value = "";
            box.scrollTop = box.scrollHeight;
            try {
                const res = await fetch('/api/agent/chat', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ message: txt, user_name: state.auditor_id, user_role: state.role }) });
                const d = await res.json();
                box.innerHTML += `<div class="flex justify-start"><div class="bg-indigo-950/40 p-2 rounded-xl border border-indigo-500/30 text-slate-200 max-w-[92%]">${renderMarkdownToHtml(d.reply)}</div></div>`;
            } catch(e) {
                box.innerHTML += `<div class="text-rose-400 text-[10px]">❌ Błąd silnika SLM.</div>`;
            }
            box.scrollTop = box.scrollHeight;
        }

        function sendQuickPrompt(t) { document.getElementById('agent-user-input').value = t; sendAgentMessage(); }
        function clearAgentChat() { document.getElementById('agent-chat-box').innerHTML = ""; }

        async function openMgrModal(id) {
            const res = await fetch(`/api/schedule/${id}`);
            const a = await res.json();
            document.getElementById('mgr-edit-id').value = a.id;
            document.getElementById('mgr-edit-date').value = a.scheduled_date;
            document.getElementById('mgr-edit-date').setAttribute('data-original-date', a.scheduled_date);
            document.getElementById('mgr-edit-type').value = a.audit_type;
            document.getElementById('mgr-edit-status').value = a.status;
            document.getElementById('mgr-edit-notes').value = a.notes || "";
            
            const linesRes = await fetch('/api/lines');
            const lines = await linesRes.json();
            document.getElementById('mgr-edit-line').innerHTML = lines.map(l => `<option value="${l.name}" ${l.name === a.line ? 'selected' : ''}>${l.name}</option>`).join('');

            const audRes = await fetch('/api/auth/auditors');
            const auds = await audRes.json();
            document.getElementById('mgr-edit-lead').innerHTML = auds.map(aud => `<option value="${aud}" ${aud === a.lead_auditor ? 'selected' : ''}>${aud}</option>`).join('');
            document.getElementById('mgr-edit-backup').innerHTML = `<option value="Brak">Brak</option>` + auds.map(aud => `<option value="${aud}" ${aud === a.backup_auditor ? 'selected' : ''}>${aud}</option>`).join('');

            document.getElementById('modal-mgr-edit').classList.remove('hidden');
        }

        function closeMgrModal() { document.getElementById('modal-mgr-edit').classList.add('hidden'); }

        async function saveMgrScheduleEdit() {
            const id = document.getElementById('mgr-edit-id').value;
            const newDate = document.getElementById('mgr-edit-date').value;
            const today = getLocalDateString();

            const dateInput = document.getElementById("mgr-edit-date");
            const originalDate = dateInput ? dateInput.getAttribute("data-original-date") : "";

            // Jeśli użytkownik zmienia datę spóźnionego audytu, nowy termin musi być bieżący lub przyszły
            if (originalDate && newDate !== originalDate && newDate < today) {
                return alert("⚠️ Nowy wyznaczony termin audytu musi być datą bieżącą lub przyszłą!");
            }

            const leadAuditor = document.getElementById('mgr-edit-lead').value;
            const backupAuditor = document.getElementById('mgr-edit-backup').value;

            if (leadAuditor === backupAuditor && backupAuditor !== "Brak") {
                return alert("⚠️ Niezgodność z normą IFS: Audytor Główny i Zastępca nie mogą być tą samą osobą!");
            }

            const payload = {
                scheduled_date: newDate,
                audit_type: document.getElementById('mgr-edit-type').value,
                line: document.getElementById('mgr-edit-line').value,
                lead_auditor: leadAuditor,
                backup_auditor: backupAuditor,
                status: document.getElementById('mgr-edit-status').value,
                notes: document.getElementById('mgr-edit-notes').value
            };
            const res = await fetch(`/api/schedule/${id}`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
            if (res.ok) { closeMgrModal(); await loadScheduleAndRender(); }
        }

        async function deleteMgrSchedule() {
            const id = document.getElementById('mgr-edit-id').value;
            if (!confirm("Usunąć zlecenie?")) return;
            const res = await fetch(`/api/schedule/${id}`, { method: 'DELETE' });
            if (res.ok) { closeMgrModal(); await loadScheduleAndRender(); }
        }

        async function openAudModal(id) {
            const res = await fetch(`/api/schedule/${id}`);
            const a = await res.json();
            activeSelectedAudit = a;
            state.active_audit_type = a.audit_type || "HACCP";
            document.getElementById('aud-view-date').innerText = a.scheduled_date;
            document.getElementById('aud-view-type').innerText = a.audit_type;
            document.getElementById('aud-view-line').innerText = a.line;
            document.getElementById('aud-view-status').innerText = a.status;
            document.getElementById('modal-aud-view').classList.remove('hidden');
        }

        
        let currentDetailedAuditId = null;

        window.closeAuditDetailsModal = function() {
            const modal = document.getElementById('modal-audit-details');
            if (modal) modal.classList.add('hidden');
            currentDetailedAuditId = null;
        };

        window.openAuditDetailsModal = async function(id) {
            currentDetailedAuditId = id;
            const modal = document.getElementById('modal-audit-details');
            if (!modal) return;
            modal.classList.remove('hidden');

            document.getElementById('det-audit-id-badge').textContent = '#' + id;
            document.getElementById('det-auditor').textContent = 'Pobieranie...';
            document.getElementById('adm-reply-text').value = '';

            try {
                const res = await fetch('/api/audits');
                if (res.ok) {
                    const audits = await res.json();
                    const a = audits.find(item => item.id === id);
                    if (a) {
                        document.getElementById('det-auditor').textContent = a.auditor_name || a.auditor_id || a.auditor || 'Brak danych';
                        document.getElementById('det-timestamp').textContent = (a.timestamp || '').substring(0, 16);
                        document.getElementById('det-slm-verdict').textContent = `${a.slm_verdict || 'OK'} (${a.risk_level || 'NISKIE'})`;
                        document.getElementById('det-record-status').textContent = a.record_status || 'ZABLOKOWANY';
                        document.getElementById('adm-edit-line').value = a.line || '';
                        if (a.shift) document.getElementById('adm-edit-shift').value = a.shift;
                    }
                }
            } catch(e) {
                console.error("Błąd pobierania audytu:", e);
            }
        };

        window.submitAuditCorrection = async function() {
            if (!currentDetailedAuditId) return;

            const line = document.getElementById('adm-edit-line').value.trim();
            const shift = document.getElementById('adm-edit-shift').value;
            const reason = document.getElementById('adm-reply-text').value.trim();

            if (!reason || reason.length < 5) {
                alert("Podanie szczegółowego powodu korekty jest wymagane przez normę IFS Food v8 (min. 5 znaków).");
                return;
            }

            const payload = {
                audit_id: currentDetailedAuditId,
                modified_by: (typeof state !== 'undefined' && (state.currentAuditor || state.role)) ? (state.currentAuditor || state.role) : "Manager",
                change_reason: reason,
                updated_fields: {
                    line: line,
                    shift: shift
                }
            };

            const btn = document.getElementById('btn-save-correction');
            btn.disabled = true;
            btn.textContent = 'Wysyłanie...';

            try {
                const res = await fetch('/api/audits/apply-correction', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const data = await res.json();
                if (res.ok) {
                    alert('✅ Korekta została zarejestrowana w dzienniku Audit Trail!');
                    closeAuditDetailsModal();
                    if (typeof loadAuditsAndRender === 'function') await loadAuditsAndRender();
                if (typeof loadAuditorHistory === 'function') await loadAuditorHistory();
                } else {
                    alert('Błąd: ' + (data.detail || 'Nie udało się zapisać korekty.'));
                }
            } catch (e) {
                alert('Błąd połączenia z serwerem podczas zapisu korekty.');
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<span>💾 Zapisz korektę i wyślij</span>';
            }
        };

        function closeAudModal() { document.getElementById('modal-aud-view').classList.add('hidden'); }

        window.handleAuditAction = async function(action, id) {
            const actionsContainer = document.getElementById(`actions-${id}`);
            const statusCell = document.getElementById(`status-${id}`);

            if (action === 'approve') {
                try {
                    await fetch(`/api/audits/${id}/status`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status: 'ZATWIERDZONY' })
                    });
                } catch (e) {
                    console.warn('API status patch fallback:', e);
                }

                if (actionsContainer) {
                    actionsContainer.innerHTML = `
                        <span class="text-emerald-400 font-bold text-[9px] mr-2">Zatwierdzono</span>
                        <button onclick="handleAuditAction('details', ${id})" class="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-[8px] font-semibold">Szczegóły</button>
                    `;
                }
                if (statusCell) {
                    statusCell.textContent = 'ZATWIERDZONY';
                    statusCell.className = 'py-2 pr-2 border-b border-white/5 text-[8px] font-black text-emerald-400';
                }

            } else if (action === 'reject') {
                const reason = prompt('Podaj powód odrzucenia (wymóg IFS Food v8):');
                if (!reason || reason.trim() === '') return;

                try {
                    await fetch(`/api/audits/${id}/status`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status: 'ODRZUCONY', reason: reason })
                    });
                } catch (e) {
                    console.warn('API status patch fallback:', e);
                }

                if (actionsContainer) {
                    actionsContainer.innerHTML = `
                        <span class="text-rose-500 font-bold text-[9px] mr-2">Odrzucono</span>
                        <button onclick="handleAuditAction('details', ${id})" class="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-[8px] font-semibold">Szczegóły</button>
                    `;
                }
                if (statusCell) {
                    statusCell.textContent = 'ODRZUCONY';
                    statusCell.className = 'py-2 pr-2 border-b border-white/5 text-[8px] font-black text-rose-500';
                }

            } else if (action === 'details') {
                if (typeof openAuditDetailsModal === 'function') {
                    openAuditDetailsModal(id);
                } else {
                    alert('Szczegóły audytu #' + id);
                }
            }
        };

        
        function startAuditorTask() {
            if (!activeSelectedAudit) return;
            state.line = activeSelectedAudit.line;
            state.active_audit_type = activeSelectedAudit.audit_type || "HACCP";
            document.getElementById('badge-active-standard').innerText = state.active_audit_type;
            
            document.getElementById('hidden-line-input').value = state.line;
            formHistory.saveState('view-audit-form'); 
            
            closeAudModal();
            loadChecklistForAudit(state.active_audit_type);
            showModule('audit-main');
        }
    

        // --- LOGIKA PROFILU AUDYTORA (OCZYSZCZONA) ---
        window.showAuditorProfileModal = function(user) {
            if (!user) return;
            window.currentAuditorId = user.id;

            const nameEl = document.getElementById("edit-auditor-name");
            const roleEl = document.getElementById("edit-auditor-role");
            const pinEl = document.getElementById("edit-auditor-pin");
            if (nameEl) nameEl.value = user.full_name || "";
            if (roleEl) roleEl.value = user.role || "AUDITOR";
            if (pinEl) pinEl.value = user.pin || "";

            const qualCheckboxes = document.querySelectorAll("#edit-auditor-qualifications input[type='checkbox']");
            const userQuals = Array.isArray(user.qualifications) ? user.qualifications : (user.qualifications ? String(user.qualifications).split(",").map(q => q.trim()) : ["HACCP", "GMP", "GHP"]);
            qualCheckboxes.forEach(cb => { cb.checked = userQuals.includes(cb.value); });

            const zoneCheckboxes = document.querySelectorAll("#edit-auditor-zones input[type='checkbox']");
            const userZones = Array.isArray(user.zones) ? user.zones : (user.zones ? String(user.zones).split(",").map(z => z.trim()) : ["ALL"]);
            zoneCheckboxes.forEach(cb => { cb.checked = userZones.includes(cb.value); });

            const modal = document.getElementById("auditor-profile-modal");
            if (modal) modal.classList.remove("hidden");
        };

        window.saveAuditorProfile = async function() {
            const auditorId = window.currentAuditorId;
            if (!auditorId) return console.error("Brak ID audytora");

            const fullName = document.getElementById("edit-auditor-name")?.value || "";
            const role = document.getElementById("edit-auditor-role")?.value || "AUDITOR";
            const pin = document.getElementById("edit-auditor-pin")?.value || "";

            const selectedQuals = Array.from(document.querySelectorAll("#edit-auditor-qualifications input[type='checkbox']")).filter(cb => cb.checked).map(cb => cb.value);
            const selectedZones = Array.from(document.querySelectorAll("#edit-auditor-zones input[type='checkbox']")).filter(cb => cb.checked).map(cb => cb.value);

            try {
                const res = await fetch(`/api/users/${auditorId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ full_name: fullName, role, pin, qualifications: selectedQuals, zones: selectedZones })
                });
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    return alert("Błąd zapisu: " + (err.message || res.statusText));
                }
                if (typeof renderAuditorsList === "function") renderAuditorsList();
                document.getElementById("auditor-profile-modal")?.classList.add("hidden");
                alert("Profil zaktualizowany pomyślnie.");
            } catch (e) {
                console.error("Błąd zapisu profilu:", e);
            }
        };

        window.clearCurrentMonthSchedule = async function() {
            const monthSelect = document.getElementById("autoplan-month");
            const yearSelect = document.getElementById("autoplan-year");
            const monthName = monthSelect ? monthSelect.options[monthSelect.selectedIndex]?.text : "wybranego miesiąca";
            if (!confirm(`Czy na pewno chcesz usunąć wszystkie zaplanowane audyty dla: ${monthName}?`)) return;
            try {
                const payload = {
                    month: monthSelect ? parseInt(monthSelect.value) : new Date().getMonth() + 1,
                    year: yearSelect ? parseInt(yearSelect.value) : new Date().getFullYear()
                };
                await fetch("/api/schedule/clear-month", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });
                if (typeof loadScheduleAndRender === "function") loadScheduleAndRender();
                if (typeof closeAutoPlanModal === "function") closeAutoPlanModal();
            } catch (err) {
                console.error("Błąd podczas czyszczenia miesiąca:", err);
            }
        };
