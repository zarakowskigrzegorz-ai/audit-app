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

            const target = document.getElementById(targetId);
            if(target) {
                target.classList.remove('hidden');
                if(pushToHistory && currentModule !== modId && currentModule !== 'auth') {
                    navHistory.push(currentModule);
                    navForward = [];
                }
                currentModule = modId;
            }
            updateDockButtons();
            
            if(modId === 'calendar') loadScheduleAndRender();
            if(modId === 'auditors') renderAuditorsList();
            if(modId === 'lines') renderLinesManagerList();
            if(modId === 'manager-results') { loadAuditResults(); loadManagerEditRequests(); }
            if(modId === 'auditor-history') loadAuditorHistory();

            updateTopNavActiveState(modId);
        }

        function navGoBack() {
            if(navHistory.length > 0) {
                navForward.push(currentModule);
                showModule(navHistory.pop(), false);
            }
        }

        function navGoForward() {
            if(navForward.length > 0) {
                navHistory.push(currentModule);
                showModule(navForward.pop(), false);
            }
        }

        function navGoHome() {
            if (currentModule !== 'hub') {
                navHistory.push(currentModule);
                navForward = [];
                showModule('hub', false);
            }
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

        function openPinPrompt(role) {
            const container = document.getElementById('pin-container');
            const label = document.getElementById('pin-role-label');
            const desc = document.getElementById('pin-role-desc');
            const quickSelect = document.getElementById('auditor-quick-select');

            container.classList.remove('hidden');
            if (role === 'MANAGER') {
                label.innerText = 'Logowanie Key User (Kierownik Jakości)';
                desc.innerText = 'PIN zarządzania (domyślnie: 9999)';
                quickSelect.classList.add('hidden');
                document.getElementById('input-pin').value = '9999';
            } else {
                label.innerText = 'Logowanie Audytora';
                desc.innerText = 'Wpisz PIN inspekcyjny (1001-1003)';
                quickSelect.classList.remove('hidden');
                document.getElementById('input-pin').value = '';
            }
            document.getElementById('input-pin').focus();
        }

        function setQuickPin(v) { document.getElementById('input-pin').value = v; submitLogin(); }
        function closePinPrompt() { document.getElementById('pin-container').classList.add('hidden'); }
        function switchUserPrompt() {
            document.getElementById('main-app').classList.add('hidden');
            document.getElementById('bottom-dock').classList.add('hidden');
            document.getElementById('view-auth').classList.remove('hidden');
            openPinPrompt(state.role === "MANAGER" ? "AUDITOR" : "MANAGER");
        }

        async function submitLogin() {
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
            await updateKpiRibbon();
            formHistory.saveState('view-audit-form');
            formHistory.saveState('modal-plan-form');
        }

        function logout() {
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

        async function renderAuditorsList() {
            const container = document.getElementById('auditors-list-container');
            if (!container) return;
            const res = await fetch(`/api/users?role=${state.role}`);
            if (!res.ok) return;
            const users = await res.json();

            container.innerHTML = users.map(u => `
                <div class="bg-slate-900 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
                    <div>
                        <span class="font-bold text-white block">${u.full_name} <span class="text-[9px] text-slate-400 font-mono">(${u.pin})</span></span>
                        <span class="text-[9px] text-cyan-300 font-extrabold block">${u.qualifications.join(', ')}</span>
                        ${u.notes ? `<span class="text-[9px] text-slate-400 italic block mt-0.5"><i class="fas fa-sticky-note mr-1"></i>${u.notes}</span>` : ''}
                    </div>
                    ${u.pin !== '9999' ? `<button onclick="deleteAuditor(${u.id})" class="tile-3d bg-rose-950 border border-rose-500/50 text-rose-300 px-2 py-1 text-[9px] font-bold">Usuń</button>` : '<span class="text-[9px] text-amber-400 font-bold">Kierownik</span>'}
                </div>
            `).join('');
        }

        async function addNewAuditor() {
            const nameEl = document.getElementById('new-auditor-name');
            const pinEl = document.getElementById('new-auditor-pin');
            const notesEl = document.getElementById('new-auditor-notes');
            const full_name = nameEl.value.trim();
            const pin = pinEl.value.trim();
            const notes = notesEl ? notesEl.value.trim() : "";
            if (!full_name || !pin) return alert("Wprowadź imię i nazwisko oraz kod PIN!");

            const quals = [];
            if (document.getElementById('new-qual-haccp').checked) quals.push('HACCP');
            if (document.getElementById('new-qual-gmp').checked) quals.push('GMP');
            if (document.getElementById('new-qual-ghp').checked) quals.push('GHP');

            const res = await fetch(`/api/users?role=${state.role}`, {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ pin, full_name, role: 'AUDITOR', qualifications: quals, notes })
            });

            if (res.ok) {
                alert("✅ Dodano audytora!");
                nameEl.value = ""; pinEl.value = ""; if(notesEl) notesEl.value = "";
                await renderAuditorsList();
            } else {
                const err = await res.json();
                alert(`❌ ${err.detail || 'Błąd zapisu'}`);
            }
        }

        async function deleteAuditor(userId) {
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
                schedulesData = await res.json();
                renderCalendar();
            } catch(e) { schedulesData = []; }
        }

        function changeMonth(delta) { currentCalDate.setMonth(currentCalDate.getMonth() + delta); renderCalendar(); }

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
                        const dayAudits = schedulesData.filter(s => s.scheduled_date === currentFullDate);
                        
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

        async function clearRange() {
            if (!confirm(`Czy na pewno chcesz usunąć zaplanowane audyty na następne ${state.selected_period_months} miesięcy? Uwaga: Audyty z przeszłości zostaną bezwzględnie zachowane.`)) return;
            try {
                const res = await fetch('/api/schedule/clear-range', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ months: state.selected_period_months })
                });
                if (res.ok) {
                    alert("✅ Poprawnie usunięto zaplanowane audyty w wybranym przedziale czasowym.");
                    closeAutoPlanModal();
                    await loadScheduleAndRender();
                } else {
                    const err = await res.json();
                    alert("❌ Błąd: " + (err.detail || "Nie udało się usunąć audytów."));
                }
            } catch (e) {
                alert("Błąd połączenia z serwerem.");
            }
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

        let currentDetailAuditId = null;

        async function loadAuditResults() {
            const tbody = document.getElementById('manager-results-table');
            if (!tbody) return;
            tbody.innerHTML = '<tr><td colspan="7" class="py-4 text-center text-slate-400">Ładowanie danych...</td></tr>';
            try {
                const res = await fetch(`/api/audits`);
                if (!res.ok) {
                    throw new Error(`Błąd HTTP: ${res.status}`);
                }
                const data = await res.json();
                tbody.innerHTML = '';
                if (!Array.isArray(data) || data.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="7" class="py-4 text-center text-slate-400">Brak zapisanych audytów w bazie.</td></tr>';
                    return;
                }
                data.forEach(a => {
                    const slmVerdict = a?.slm_verdict || 'OK';
                    const slmColor = slmVerdict === 'OK' ? 'text-emerald-400' : 'text-red-400 font-bold';
                    const processStatus = a?.process_status || 'IN_PROGRESS';
                    const statusColor = processStatus === 'APPROVED' ? 'text-emerald-400' : 'text-amber-400';
                    const auditId = a?.id ?? '';
                    const code = a?.audit_code || (auditId ? `AUD-${auditId}` : 'Brak kodu');
                    const timestamp = (a?.timestamp || '').substring(0, 16) || 'Brak daty';
                    const line = a?.line || 'Brak linii';
                    const shift = a?.shift || 'Brak';
                    const auditorFull = a?.auditor_id || 'Nieznany';
                    const auditorName = auditorFull.split(' ')[0] || 'Brak';
                    const riskLevel = a?.risk_level || 'NISKIE';

                    tbody.innerHTML += `
                        <tr ${auditId ? `onclick="openAuditDetails(${auditId})"` : ''} class="hover:bg-slate-800 transition cursor-pointer">
                            <td class="py-2 pr-2 border-b border-white/5 font-mono text-[10px] text-cyan-400 font-black">${code}</td>
                            <td class="py-2 pr-2 border-b border-white/5 text-[9px]">${timestamp}</td>
                            <td class="py-2 pr-2 border-b border-white/5 font-bold text-[10px] text-white">${line}</td>
                            <td class="py-2 pr-2 border-b border-white/5 text-[10px]">${shift}</td>
                            <td class="py-2 pr-2 border-b border-white/5 text-[9px]">${auditorName}</td>
                            <td class="py-2 pr-2 border-b border-white/5 text-[8px] font-black ${statusColor}">${processStatus}</td>
                            <td class="py-2 border-b border-white/5 ${slmColor} text-[9px]">${slmVerdict} (${riskLevel})</td>
                        </tr>
                    `;
                });
            } catch(e) {
                console.error(e);
                tbody.innerHTML = `<tr><td colspan="7" class="py-4 text-center text-red-400 text-xs">Błąd ładowania danych: ${e.message || 'Nieznany błąd'}</td></tr>`;
            }
        }

        async function openAuditDetails(id) {
            if (!id) {
                console.error("openAuditDetails: Przekazano puste ID audytu.");
                alert("Błąd: Nie wybrano poprawnego identyfikatora audytu.");
                return;
            }
            currentDetailAuditId = id;
            try {
                const res = await fetch(`/api/audits/${id}`);
                if (!res.ok) {
                    const errText = await res.text();
                    console.error(`Błąd pobierania szczegółów audytu [HTTP ${res.status}]:`, errText);
                    alert(`Błąd pobierania szczegółów audytu (Status ${res.status}).`);
                    return;
                }
                const a = await res.json();
                
                document.getElementById('det-audit-code').innerText = a?.audit_code || `AUD-${id}`;
                document.getElementById('det-line').innerText = a?.line || 'Brak linii';
                document.getElementById('det-status').innerText = a?.status || 'IN_PROGRESS';
                document.getElementById('det-date').innerText = (a?.start_time || '').substring(0, 16) || 'Brak daty';
                document.getElementById('det-auditor').innerText = a?.auditor || 'Nieznany';

                const capaList = document.getElementById('det-capa-list');
                capaList.innerHTML = '';
                if(!a?.capa_items || a.capa_items.length === 0) {
                    capaList.innerHTML = '<p class="text-emerald-400">✅ Brak niezgodności CAPA dla tego audytu.</p>';
                } else {
                    a.capa_items.forEach(c => {
                        const isCritical = c?.category === 'Critical' ? 'text-red-500 font-bold' : 'text-amber-400';
                        capaList.innerHTML += `
                            <div class="bg-slate-950 p-2 rounded border border-slate-800 my-1">
                                <p class="font-bold text-[10px] text-white">${c?.clause || ''} - ${c?.question || ''}</p>
                                <p class="text-[9px] ${isCritical}">Kategoria: ${c?.category || 'Minor'} | Odpowiedzialny: ${c?.responsible || 'Brak'}</p>
                                <p class="text-[9px] text-slate-400">Termin: ${c?.due_date || 'Brak'} | Uwaga: ${c?.comment || 'Brak uwagi'}</p>
                            </div>
                        `;
                    });
                }

                const trail = document.getElementById('det-audit-trail');
                trail.innerHTML = '';
                if (a?.audit_trail && Array.isArray(a.audit_trail)) {
                    a.audit_trail.forEach(t => {
                        const timeStr = t?.timestamp || '';
                        const formattedTime = timeStr.length >= 16 ? timeStr.substring(11, 16) : timeStr;
                        trail.innerHTML += `
                            <div class="flex justify-between border-b border-slate-800 py-1 text-[9px]">
                                <span class="text-cyan-400">${formattedTime}</span>
                                <span class="text-slate-300 font-bold">${t?.modified_by || 'System'}: ${t?.field_name || ''}</span>
                                <span class="text-slate-400 italic">${t?.change_reason || ''}</span>
                            </div>
                        `;
                    });
                }

                const pinEl = document.getElementById('det-pin');
                if (pinEl) pinEl.value = '';
                const modal = document.getElementById('modal-audit-details');
                if (modal) modal.classList.remove('hidden');
            } catch(e) {
                console.error("Błąd sieciowy lub parsowania podczas pobierania szczegółów audytu:", e);
                alert("Błąd pobierania szczegółów audytu.");
            }
        }

        async function signOffAudit(roleType) {
            const pin = document.getElementById('det-pin').value.trim();
            if(!pin) return alert("Wprowadź swój PIN do zatwierdzenia!");

            try {
                const res = await fetch(`/api/audits/${currentDetailAuditId}/sign-off`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        role_type: roleType,
                        signer_name: state.auditor_id,
                        pin: pin
                    })
                });

                if(res.ok) {
                    alert("✅ Zatwierdzenie zarejestrowane pomyślnie.");
                    document.getElementById('modal-audit-details').classList.add('hidden');
                    loadAuditResults();
                } else {
                    const err = await res.json();
                    alert(`❌ Błąd: ${err.detail}`);
                }
            } catch(e) { alert("Błąd połączenia."); }
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
            list.innerHTML = '<p class="text-xs text-slate-400">Ładowanie historii z bazy SQLite...</p>';
            try {
                const res = await fetch('/api/audits');
                if (!res.ok) {
                    throw new Error(`Błąd HTTP: ${res.status}`);
                }
                const data = await res.json();
                if (!Array.isArray(data) || data.length === 0) {
                    list.innerHTML = '<p class="text-xs text-slate-400">Brak zapisanych audytów w bazie.</p>';
                    return;
                }
                const myAudits = data.filter(a => !state.auditor_id || a?.auditor_id === state.auditor_id || true);
                
                list.innerHTML = '';
                if (myAudits.length === 0) {
                    list.innerHTML = '<p class="text-xs text-slate-400">Brak zarejestrowanych audytów. Masz czyste konto!</p>';
                    return;
                }
                
                myAudits.slice(0, 8).forEach(a => {
                    const recordStatus = a?.record_status || 'ZABLOKOWANY';
                    const isLocked = recordStatus !== 'ODBLOKOWANY_DO_KOREKTY';
                    const auditId = a?.id;
                    const line = a?.line || 'Brak linii';
                    const timestampStr = a?.timestamp || '';
                    const timestamp = timestampStr.length >= 16 ? timestampStr.substring(0, 16) : (timestampStr || 'Brak daty');
                    const slmVerdict = a?.slm_verdict || 'OK';
                    const borderClass = slmVerdict === 'OK' ? 'border-emerald-500' : 'border-red-500';

                    list.innerHTML += `
                        <div class="glass-card bg-slate-900 p-3.5 rounded-xl flex justify-between items-center border-l-4 ${borderClass}">
                            <div>
                                <h4 class="font-bold text-xs text-white">${line}</h4>
                                <p class="text-[9px] text-slate-400 mt-0.5">Data: ${timestamp} | Status: <b class="${isLocked ? 'text-amber-400' : 'text-emerald-400'}">${recordStatus}</b></p>
                            </div>
                            <div>
                                ${auditId && isLocked 
                                    ? `<button onclick="requestAuditCorrection(${auditId})" class="tile-3d bg-amber-950/80 border border-amber-500/50 text-amber-300 px-3 py-1.5 rounded font-bold text-[10px] transition hover:bg-amber-900">
                                         🔓 Wnioskuj o korektę
                                       </button>`
                                    : (auditId ? `<span class="text-emerald-400 font-extrabold text-[10px] bg-emerald-950 px-2 py-1 rounded border border-emerald-500/40">
                                         Edycja dozwolona
                                       </span>` : '')
                                }
                            </div>
                        </div>
                    `;
                });
            } catch(e) {
                console.error(e);
                list.innerHTML = `<p class="text-xs text-red-400">Błąd ładowania historii: ${e.message || 'Nieznany błąd'}</p>`;
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

            const res = await fetch('/api/audit', { method: 'POST', body: formData });
            if (res.ok) {
                const data = await res.json();
                alert(`✅ Audyt zarejestrowany. Kod: ${data.audit_code}\n\nOrzeczenie SLM: ${slmText}`);
                showModule('hub');
                await loadScheduleAndRender();
                await updateKpiRibbon();
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
                <div onclick="openLineDetails(${l.id})" class="bg-slate-900 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between text-xs cursor-pointer hover:border-emerald-500/50">
                    <div><span class="font-black text-white block">${l.name}</span><span class="text-[10px] text-slate-400 font-bold">${l.code} • ${l.default_zone}</span></div>
                    <button onclick="event.stopPropagation(); deleteProductionLine(${l.id})" class="tile-3d bg-red-950 border border-red-500/50 text-red-300 px-2.5 py-1 rounded font-bold">Usuń</button>
                </div>
            `).join('');
        }

        function openLineDetails(id) {
            const line = productionLinesData.find(l => l.id === id);
            if (!line) return;
            const content = document.getElementById('line-details-content');
            content.innerHTML = `
                <p><strong>Nazwa:</strong> ${line.name}</p>
                <p><strong>Kod (IFS):</strong> ${line.code}</p>
                <p><strong>Status:</strong> ${line.is_active ? 'Aktywna' : 'Nieaktywna'}</p>
                <p><strong>ID Systemowe:</strong> ${line.id}</p>
            `;
            document.getElementById('modal-line-details').classList.remove('hidden');
        }

        function generateLineCode(name) {
            let code = name.toUpperCase()
                .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                .replace(/[^A-Z0-9]/g, "-")
                .replace(/-+/g, "-")
                .replace(/^-|-$/g, "");
            return `LIN-${code}`;
        }

                async function addNewProductionLine() {
            const name = document.getElementById('new-line-name').value.trim();
            const code = document.getElementById('new-line-code').value.trim();
            const default_zone = document.getElementById('new-line-zone').value;
            if (!name) return alert("Wpisz nazwę linii!");
            
            let finalCode = code;
            if (!finalCode) {
                const generatedCode = generateLineCode(name);
                const existingCodes = productionLinesData.map(l => l.code);
                let uniqueCode = generatedCode;
                let counter = 1;
                while (existingCodes.includes(uniqueCode)) {
                    uniqueCode = `${generatedCode}-${counter}`;
                    counter++;
                }
                finalCode = uniqueCode;
            }

            const res = await fetch('/api/lines', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ name, code: finalCode, default_zone })
            });
            if (res.ok) {
                alert("✅ Dodano linię!");
                document.getElementById('new-line-name').value = '';
                document.getElementById('new-line-code').value = '';
                await loadProductionLines();
                renderLinesManagerList();
            } else {
                const errorData = await res.json();
                alert(`❌ Błąd dodawania linii: ${errorData.detail || 'Nieznany błąd'}`);
            }
        }

        async function deleteProductionLine(id) {
            if (!confirm("Usunąć tę linię?")) return;
            await fetch(`/api/lines/${id}`, { method: 'DELETE' });
            await loadProductionLines(); renderLinesManagerList();
        }

        async function loadAuditorsDropdown(type = "HACCP") {
            const res = await fetch(`/api/auth/auditors?type=${encodeURIComponent(type)}`);
            const list = await res.json();
            const opts = list.map(a => `<option value="${a}">${a}</option>`).join('');
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

        document.addEventListener('DOMContentLoaded', () => {
            const nameInput = document.getElementById('new-line-name');
            const codeInput = document.getElementById('new-line-code');
            if (nameInput && codeInput) {
                nameInput.addEventListener('input', () => {
                    if (codeInput.value === '' || codeInput.value.startsWith('LIN-')) {
                        const name = nameInput.value;
                        if (name) {
                            codeInput.value = generateLineCode(name);
                        } else {
                            codeInput.value = '';
                        }
                    }
                });
            }
        });

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

            if (newDate < today) {
                return alert("⚠️ Przenoszenie audytów dozwolone jest wyłącznie w przód (data bieżąca lub przyszła)!");
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

        function closeAudModal() { document.getElementById('modal-aud-view').classList.add('hidden'); }
        
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
