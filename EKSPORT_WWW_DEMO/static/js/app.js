
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
                spinner.className = "text-base text-emerald-400";
                spinner.innerHTML = '<i class="fas fa-circle-check"></i>';
                titleEl.className = "text-xs font-black tracking-wider uppercase text-emerald-400";
                setTimeout(() => toast.classList.add('hidden'), 3500);
            } else if (mode === 'alert') {
                box.className = "flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl border backdrop-blur-md bg-rose-950/90 border-rose-500/60 text-slate-100 min-w-[340px]";
                spinner.className = "text-base text-rose-400";
                spinner.innerHTML = '<i class="fas fa-triangle-exclamation"></i>';
                titleEl.className = "text-xs font-black tracking-wider uppercase text-rose-400";
                setTimeout(() => toast.classList.add('hidden'), 5000);
            }
        }

        const state = {
            user_id: 0, auditor_id: "", role: "AUDITOR", token: sessionStorage.getItem('quality_audit_token') || "",
            line: "", shift: "Zmiana A", zone: "Wysoka Higiena (High Care)",
            health_ok: "TAK", dispense_no: "BRAK", glass_plastic_ok: "ZGODNY", allergen_clean_ok: "ZGODNY",
            wood_policy_ok: "ZGODNY", ppe_ok: "ZGODNY", line_status: "Produkcja Ciągła", ccp1_fe_ok: "ZGODNY",
            ccp1_nonfe_ok: "ZGODNY", ccp1_ss_ok: "ZGODNY", ccp1_reject_ok: "ZGODNY", ccp1_bin_locked: "ZGODNY",
            ccp2_magnet_ok: "ZGODNY", ccp3_sieve_ok: "ZGODNY", gmp_cleanliness_ok: "ZGODNY", gmp_wood_score: 5,
            gmp_foreign_score: 5, gmp_waste_ok: "ZGODNY", bhp_estop_ok: "ZGODNY", bhp_atex_ok: "ZGODNY",
            bhp_hot_cip_ok: "ZGODNY", bhp_evac_ppoz_ok: "ZGODNY", bhp_status: "BRAK ZGŁOSZEŃ", slm_analysis: "",
            selected_period_months: 1, checklist_results: {}, active_audit_type: "HACCP"
        };

        // Centralny bezpieczny klient HTTP z tokenem Bearer (ISO 27001 A.5.15 / A.5.18)
        async function apiFetch(url, options = {}) {
            options = Object.assign({}, options);
            options.headers = Object.assign({}, options.headers);
            if (state.token) {
                options.headers['Authorization'] = `Bearer ${state.token}`;
            }
            const res = await fetch(url, options);
            if (res.status === 401 || res.status === 403) {
                const data = await res.clone().json().catch(() => ({}));
                const detail = data.detail || '';
                if (detail.includes("Sesja wygasła") || detail.includes("Wymagana autoryzacja") || detail.includes("Brak tokenu")) {
                    alert("Sesja wygasła lub brak autoryzacji (ISO 27001). Zaloguj się ponownie.");
                    logout();
                }
            }
            return res;
        }

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

            // Zarządzanie widocznością głównego formularza audytu
            const auditForm = document.getElementById('view-audit-form');
            if (auditForm) {
                if (modId === 'audit-main') {
                    auditForm.classList.remove('hidden');
                } else {
                    auditForm.classList.add('hidden');
                }
            }

            updateDockButtons();

            // Odświeżanie na żywo przy powrocie do Dashboardu / Hubu
            if(modId === 'hub') {
                document.querySelectorAll('.view-layer').forEach(el => el.classList.add('hidden'));
                const hubEl = document.getElementById(state.role === 'MANAGER' ? 'hub-manager' : 'hub-auditor');
                if (hubEl) hubEl.classList.remove('hidden');
                if (state.role === 'MANAGER') {
                    try {
                        if (typeof updateKpiRibbon === 'function') updateKpiRibbon();
                        if (typeof loadManagerEditRequests === 'function') loadManagerEditRequests();
                        if (typeof loadManagerAuditorNotes === 'function') loadManagerAuditorNotes();
                    } catch(e) { console.warn('Błąd cichego odświeżania:', e); }
                } else {
                    if (typeof loadProductionLines === 'function') loadProductionLines();
                    if (typeof loadScheduleAndRender === 'function') loadScheduleAndRender();
                }
            }
            if(modId === 'calendar') loadScheduleAndRender();
            if(modId === 'auditors') renderAuditorsList();
            if(modId === 'lines') renderLinesManagerList();
            if(modId === 'manager-results') { loadAuditResults(); loadManagerEditRequests(); }
            if(modId === 'manager-notes') { loadManagerAuditorNotes(); if(typeof renderManagerNotesView === 'function') renderManagerNotesView(); }
            if(modId === 'auditor-history') loadAuditorHistory();
            if(modId === 'agent') syncAgentLineSelector();
            if(modId === 'faq') loadInlineFaq();
            if(modId === 'reports') {
                if (typeof openReportsDashboard === 'function') openReportsDashboard();
            }

            updateTopNavActiveState(modId);
        }

        function updateAuditorSidebarActiveTile(modId) {
            const tiles = {
                'calendar': document.getElementById('aud-tile-calendar'),
                'auditor-history': document.getElementById('aud-tile-history'),
                'faq': document.getElementById('aud-tile-faq'),
                'agent': document.getElementById('aud-tile-agent')
            };

            const frontActiveThemes = {
                'calendar': 'bg-gradient-to-br from-blue-600 via-indigo-700 to-slate-900 border-blue-400/60 shadow-xl shadow-blue-500/25 ring-2 ring-blue-400/50 text-white',
                'auditor-history': 'bg-gradient-to-br from-orange-600 via-amber-700 to-slate-900 border-orange-400/60 shadow-xl shadow-orange-500/25 ring-2 ring-orange-400/50 text-white',
                'faq': 'bg-gradient-to-br from-emerald-600 via-teal-700 to-slate-900 border-emerald-400/60 shadow-xl shadow-emerald-500/25 ring-2 ring-emerald-400/50 text-white',
                'agent': 'bg-gradient-to-br from-purple-600 via-indigo-700 to-slate-900 border-indigo-400/60 shadow-xl shadow-indigo-500/25 ring-2 ring-indigo-400/50 text-white'
            };

            const frontInactiveTheme = 'bg-slate-900/90 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-300 shadow-md';

            for (const [key, el] of Object.entries(tiles)) {
                if (!el) continue;
                const front = el.querySelector('.bws-cap-front');
                const ind = el.querySelector('.aud-tile-indicator');
                if (key === modId) {
                    if (front) {
                        front.className = `bws-cap-front flex flex-col justify-between p-3 border transition-all ${frontActiveThemes[key]}`;
                    }
                    if (ind) ind.classList.remove('opacity-0');
                } else {
                    if (front) {
                        front.className = `bws-cap-front flex flex-col justify-between p-3 border transition-all ${frontInactiveTheme}`;
                    }
                    if (ind) ind.classList.add('opacity-0');
                }
            }
        }

        let currentInlineFaqCat = 'ALL';
        let activeInlineGuidelineId = null;
        let inlineFilteredList = [];

        async function loadInlineFaq() {
            if (typeof CHECKLIST_GUIDELINES === 'undefined' || !Array.isArray(CHECKLIST_GUIDELINES) || CHECKLIST_GUIDELINES.length === 0) {
                try {
                    const res = await fetch('/api/checklist/guidelines');
                    if (res.ok) {
                        const data = await res.json();
                        window.CHECKLIST_GUIDELINES = data;
                        if (typeof CHECKLIST_GUIDELINES !== 'undefined') CHECKLIST_GUIDELINES = data;
                    }
                } catch(e) { console.error('Błąd pobierania bazy wiedzy:', e); }
            }

            const items = window.CHECKLIST_GUIDELINES || (typeof CHECKLIST_GUIDELINES !== 'undefined' ? CHECKLIST_GUIDELINES : []);
            if (!activeInlineGuidelineId && items.length > 0) {
                activeInlineGuidelineId = items[0].id;
            }

            updateInlineFaqCounts();
            filterInlineFaq(false);
        }

        function updateInlineFaqCounts() {
            const items = window.CHECKLIST_GUIDELINES || (typeof CHECKLIST_GUIDELINES !== 'undefined' ? CHECKLIST_GUIDELINES : []);
            const counts = { ALL: items.length, KO_ONLY: 0, CCP: 0, GMP: 0, GHP: 0, FOREIGN_MATTER: 0 };
            items.forEach(item => {
                if (item.risk_level === 'KO') counts.KO_ONLY++;
                if (counts[item.category] !== undefined) counts[item.category]++;
            });
            for (let k in counts) {
                const el = document.getElementById(`inline-count-${k}`);
                if (el) el.innerText = counts[k];
            }
        }

        function setInlineFaqCategory(cat, btn) {
            currentInlineFaqCat = cat;
            document.querySelectorAll('.inline-faq-cat-btn').forEach(b => {
                b.className = 'inline-faq-cat-btn w-full text-left px-3 py-2 rounded-xl text-[11px] font-bold text-slate-400 hover:text-white hover:bg-slate-800/60 flex items-center justify-between transition cursor-pointer';
            });
            if (btn) {
                btn.className = 'inline-faq-cat-btn w-full text-left px-3 py-2 rounded-xl text-[11px] font-black bg-emerald-500 text-slate-950 flex items-center justify-between transition cursor-pointer shadow-md shadow-emerald-500/20';
            }
            filterInlineFaq(true);
        }

        function filterInlineFaq(autoSelectFirst = false) {
            const search = (document.getElementById('inlineFaqSearchInput')?.value || '').toLowerCase();
            const allItems = window.CHECKLIST_GUIDELINES || (typeof CHECKLIST_GUIDELINES !== 'undefined' ? CHECKLIST_GUIDELINES : []);
            inlineFilteredList = allItems.filter(item => {
                const matchCat = (currentInlineFaqCat === 'ALL') || 
                                 (currentInlineFaqCat === 'KO_ONLY' ? item.risk_level === 'KO' : item.category === currentInlineFaqCat);
                const matchSearch = (item.title || '').toLowerCase().includes(search) || 
                                    (item.question || '').toLowerCase().includes(search) || 
                                    (item.criteria || '').toLowerCase().includes(search) ||
                                    (item.ifs_clause || '').toLowerCase().includes(search);
                return matchCat && matchSearch;
            });

            if (autoSelectFirst && inlineFilteredList.length > 0) {
                activeInlineGuidelineId = inlineFilteredList[0].id;
            } else if (inlineFilteredList.length > 0 && !inlineFilteredList.some(i => i.id === activeInlineGuidelineId)) {
                activeInlineGuidelineId = inlineFilteredList[0].id;
            }

            renderInlineFaqList();
            renderInlineFaqDetail();
        }

        function selectInlineGuideline(id) {
            activeInlineGuidelineId = id;
            renderInlineFaqList();
            renderInlineFaqDetail();
        }

        function renderInlineFaqList() {
            const container = document.getElementById('inlineFaqItemListContainer');
            if (!container) return;

            if (inlineFilteredList.length === 0) {
                container.innerHTML = '<p class="text-center py-6 text-slate-500 text-xs font-bold">Brak wyników</p>';
                return;
            }

            container.innerHTML = inlineFilteredList.map(item => {
                const isActive = item.id === activeInlineGuidelineId;
                const activeClass = isActive 
                    ? 'bg-slate-800 border-emerald-500/60 shadow-lg ring-1 ring-emerald-500/40 text-white' 
                    : 'bg-slate-900/50 border-slate-800/80 hover:bg-slate-850 hover:border-slate-700 text-slate-300';

                const riskBadge = item.risk_level === 'KO' 
                    ? '<span class="px-2 py-0.5 text-[8.5px] font-black rounded bg-rose-500/20 text-rose-400 border border-rose-500/30 uppercase">KO</span>' 
                    : item.risk_level === 'MAJOR' 
                    ? '<span class="px-2 py-0.5 text-[8.5px] font-black rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 uppercase">Major</span>' 
                    : '<span class="px-2 py-0.5 text-[8.5px] font-black rounded bg-slate-800 text-slate-400 border border-slate-700 uppercase">Minor</span>';

                return `
                    <div onclick="selectInlineGuideline('${item.id}')" 
                         class="p-2.5 rounded-xl border cursor-pointer transition-all flex flex-col gap-1 ${activeClass}">
                        <div class="flex items-center justify-between gap-1">
                            <span class="text-[10px] font-black text-slate-400 font-mono">${item.id}</span>
                            ${riskBadge}
                        </div>
                        <p class="text-xs font-black line-clamp-2 leading-snug">${item.title}</p>
                        <span class="text-[9.5px] text-slate-400 font-mono mt-0.5 truncate">${item.ifs_clause || ''}</span>
                    </div>
                `;
            }).join('');
        }

        function renderInlineFaqDetail() {
            const panel = document.getElementById('inlineFaqDetailPanel');
            if (!panel) return;

            const items = window.CHECKLIST_GUIDELINES || (typeof CHECKLIST_GUIDELINES !== 'undefined' ? CHECKLIST_GUIDELINES : []);
            const item = items.find(g => g.id === activeInlineGuidelineId);
            if (!item) {
                panel.innerHTML = '<div class="h-full flex items-center justify-center text-slate-500 text-xs">Wybierz punkt z listy po lewej stronie</div>';
                return;
            }

            const riskBadge = item.risk_level === 'KO' 
                ? '<span class="px-2.5 py-0.5 text-[9px] font-black rounded bg-rose-500/20 text-rose-400 border border-rose-500/30 uppercase">KO (Knock-Out)</span>' 
                : item.risk_level === 'MAJOR' 
                ? '<span class="px-2.5 py-0.5 text-[9px] font-black rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 uppercase">Major</span>' 
                : '<span class="px-2.5 py-0.5 text-[9px] font-black rounded bg-slate-800 text-slate-400 border border-slate-700 uppercase">Minor</span>';

            panel.innerHTML = `
                <div class="space-y-4">
                    <!-- Nagłówek punktu -->
                    <div class="border-b border-slate-800 pb-3">
                        <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
                            <div class="flex items-center gap-2">
                                <span class="px-2.5 py-1 text-[10px] font-black rounded-lg bg-emerald-950/60 text-emerald-300 border border-emerald-500/30">${item.category_label || item.category}</span>
                                ${riskBadge}
                                <span class="text-xs font-mono text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">${item.id}</span>
                            </div>
                            <span class="text-xs font-mono text-cyan-400/90 bg-cyan-950/30 px-2.5 py-1 rounded-lg border border-cyan-500/30">${item.ifs_clause || 'IFS Food v8'}</span>
                        </div>
                        <h1 class="text-lg sm:text-xl font-black text-white">${item.title}</h1>
                    </div>

                    <!-- Pytanie audytowe -->
                    <div class="bg-slate-950/80 p-4 rounded-2xl border border-slate-800 flex items-start space-x-3">
                        <span class="text-emerald-400 font-black text-xl leading-none">„</span>
                        <div class="flex-1">
                            <p class="text-[10px] text-slate-400 uppercase font-black tracking-wider mb-1">Pytanie z formularza audytowego</p>
                            <p class="text-xs sm:text-sm text-slate-100 font-semibold leading-relaxed">${item.question}</p>
                        </div>
                    </div>

                    <!-- Wyjaśnienie 1: Kryterium Zgodności -->
                    <div class="bg-emerald-950/20 p-4 sm:p-5 rounded-2xl border border-emerald-500/25 space-y-2.5">
                        <div class="flex items-center justify-between">
                            <h3 class="text-xs font-black text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                                <span class="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]"></span>
                                Kryterium Zgodności (Standard Zakładowy)
                            </h3>
                            <span class="text-[10px] font-mono text-emerald-300 bg-emerald-900/40 px-2 py-0.5 rounded border border-emerald-500/30">WYMÓG AUDYTOWY</span>
                        </div>
                        <p class="text-xs sm:text-sm text-slate-200 leading-relaxed font-medium">${item.criteria}</p>
                        ${item.correct_action ? `
                            <div class="pt-2.5 border-t border-emerald-500/15 text-xs text-emerald-300 flex items-center gap-2">
                                <strong class="text-white font-bold">Stan pożądany na linii:</strong> <span>${item.correct_action}</span>
                            </div>
                        ` : ''}
                    </div>

                    <!-- Wyjaśnienie 2: Postępowanie Awaryjne & CAPA -->
                    <div class="bg-rose-950/20 p-4 sm:p-5 rounded-2xl border border-rose-500/25 space-y-2.5">
                        <div class="flex items-center justify-between">
                            <h3 class="text-xs font-black text-rose-400 uppercase tracking-wider flex items-center gap-2">
                                <span class="w-2.5 h-2.5 rounded-full bg-rose-400 shadow-[0_0_10px_rgba(251,113,133,0.8)]"></span>
                                Odchylenie, Kwarantanna & Postępowanie Korekcyjne
                            </h3>
                            <span class="text-[10px] font-mono text-rose-300 bg-rose-900/40 px-2 py-0.5 rounded border border-rose-500/30">PROCEDURA AWARYJNA</span>
                        </div>
                        <p class="text-xs sm:text-sm text-slate-200 leading-relaxed font-medium">${item.deviation_action || 'Brak zdefiniowanego odchylenia'}</p>
                        <div class="pt-2.5 border-t border-rose-500/15 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
                            <div class="text-rose-300">
                                <strong class="text-white font-bold">Klauzula normy:</strong> ${item.ifs_clause || 'IFS Food v8'}
                            </div>
                            ${item.deviation_action ? `
                                <button type="button" onclick="navigator.clipboard.writeText('${item.deviation_action.replace(/'/g, "\\'")}'); alert('Skopiowano działanie CAPA do schowka!');" 
                                        class="px-3 py-1.5 bg-rose-900/50 hover:bg-rose-800 text-rose-200 rounded-xl text-xs font-bold border border-rose-500/30 transition flex items-center gap-1.5 cursor-pointer self-start sm:self-auto">
                                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                    Kopiuj do CAPA
                                </button>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;
        }

        async function openFaqForGuideline(searchClauseOrTitle) {
            showModule('faq');
            if (typeof loadInlineFaq === 'function') {
                await loadInlineFaq();
            }
            const searchInput = document.getElementById('inlineFaqSearchInput');
            if (searchInput && searchClauseOrTitle) {
                // Szukamy pasującego punktu w CHECKLIST_GUIDELINES
                const items = window.CHECKLIST_GUIDELINES || (typeof CHECKLIST_GUIDELINES !== 'undefined' ? CHECKLIST_GUIDELINES : []);
                const term = searchClauseOrTitle.toLowerCase();
                const matched = items.find(i => 
                    (i.ifs_clause && i.ifs_clause.toLowerCase().includes(term)) ||
                    (i.title && i.title.toLowerCase().includes(term)) ||
                    (i.id && i.id.toLowerCase() === term)
                );

                if (matched) {
                    currentInlineFaqCat = 'ALL';
                    searchInput.value = matched.id;
                    activeInlineGuidelineId = matched.id;
                } else {
                    searchInput.value = searchClauseOrTitle;
                }
                filterInlineFaq(true);
            }
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

        function handleLogoClick() {
            if (currentModule === 'hub') {
                // Gdy jesteśmy w menu głównym (audytora lub key usera), cofnięcie wychodzi do ekranu logowania (strona startowa)
                logout();
            } else {
                // Gdy jesteśmy w dowolnym podmenu/module, wracamy krok w tył do menu głównego
                navGoHome();
            }
        }

        function updateDockButtons() {
            const btnBack = document.getElementById('nav-btn-back');
            const btnFwd = document.getElementById('nav-btn-forward');
            if(btnBack) btnBack.disabled = navHistory.length === 0;
            if(btnFwd) btnFwd.disabled = navForward.length === 0;
        }

        function updateTopNavActiveState(modId) {
            const quickNoteTag = document.getElementById('tag-quick-note');
            if (quickNoteTag) {
                if (state.role === 'MANAGER') {
                    quickNoteTag.classList.add('hidden');
                } else {
                    quickNoteTag.classList.remove('hidden');
                }
            }
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
            // Wsparcie Undo/Redo w generatorze audytów (modal-autoplan)
            const autoPlanModal = document.getElementById('modal-autoplan');
            if (autoPlanModal && !autoPlanModal.classList.contains('hidden')) {
                if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                    e.preventDefault();
                    if (typeof autoPlanHistoryUndo === 'function') autoPlanHistoryUndo();
                    return;
                }
                if (((e.ctrlKey || e.metaKey) && e.key === 'y') || ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'z' || e.key === 'Z'))) {
                    e.preventDefault();
                    if (typeof autoPlanHistoryRedo === 'function') autoPlanHistoryRedo();
                    return;
                }
            }

            const activeForm = document.querySelector('.view-layer:not(.hidden) .view-tracked-form') || document.querySelector('.view-tracked-form:not(.hidden)');
            const formId = activeForm ? activeForm.id : null;

            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); if(formId) formHistory.undo(formId); }
            if (((e.ctrlKey || e.metaKey) && e.key === 'y') || ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'z' || e.key === 'Z'))) { e.preventDefault(); if(formId) formHistory.redo(formId); }
            if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); navGoBack(); }
            if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); navGoForward(); }
        });

        function getLocalDateString(d = new Date()) {
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }

        // Bezpieczny parser dat z bazy SQLite (odporny na specyfikę silników WebKit / Safari iOS)
        function parseAuditDate(timestamp) {
            if (!timestamp) return null;
            if (timestamp instanceof Date) return isNaN(timestamp.getTime()) ? null : timestamp;
            try {
                const str = String(timestamp).trim();
                const datePartMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
                if (datePartMatch) {
                    const year = parseInt(datePartMatch[1], 10);
                    const month = parseInt(datePartMatch[2], 10) - 1;
                    const day = parseInt(datePartMatch[3], 10);
                    
                    let hours = 0, minutes = 0, seconds = 0;
                    const timePartMatch = str.match(/(?:T|\s+)(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
                    if (timePartMatch) {
                        hours = parseInt(timePartMatch[1], 10) || 0;
                        minutes = parseInt(timePartMatch[2], 10) || 0;
                        seconds = parseInt(timePartMatch[3], 10) || 0;
                    }
                    const d = new Date(year, month, day, hours, minutes, seconds);
                    if (!isNaN(d.getTime())) return d;
                }
                const fallbackDate = new Date(str.replace(' ', 'T'));
                if (!isNaN(fallbackDate.getTime())) return fallbackDate;
            } catch(e) {
                console.warn("Błąd parsowania daty:", timestamp, e);
            }
            return null;
        }
        window.parseAuditDate = parseAuditDate;

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
            // WebAuthn wymaga domeny — IP (127.0.0.1) jest niedozwolone jako rpId
            // Przekieruj automatycznie na localhost jeśli użytkownik otworzył przez IP
            if (location.hostname === '127.0.0.1' || location.hostname === '::1') {
                const newUrl = location.href.replace(location.hostname, 'localhost');
                alert("ℹ️ Biometria wymaga adresu 'localhost' zamiast IP.\n\nPrzeglądarka zostanie przekierowana automatycznie na:\n" + newUrl);
                location.href = newUrl;
                return false;
            }
            if (!window.isSecureContext && location.hostname !== 'localhost') {
                alert("Logowanie biometryczne wymaga bezpiecznego połączenia (HTTPS) lub uruchamiania z localhost.");
                return false;
            }
            if (!window.PublicKeyCredential) {
                alert("Twoja przeglądarka nie wspiera logowania biometrycznego.\nSpróbuj Chrome, Safari lub Edge na urządzeniu z systemem iOS/macOS/Windows.");
                return false;
            }
            return true;
        }

        async function registerCurrentDeviceBiometrics() {
            if (!state.user_id) return alert("Zaloguj się najpierw kodem PIN, a następnie kliknij ikonę biometrii w nagłówku!");
            if (!validateWebAuthnEnvironment()) return;

            try {
                const resChall = await fetch(`/api/auth/biometric/register-challenge?user_id=${state.user_id}`, { method: 'POST' });
                if (!resChall.ok) { alert("Błąd pobierania wyzwania rejestracji."); return; }
                const { challenge } = await resChall.json();
                const enc = new TextEncoder();

                const cred = await navigator.credentials.create({
                    publicKey: {
                        challenge: base64ToBuffer(challenge),
                        rp: { name: "Quality Audit IFS" },
                        user: { id: enc.encode(String(state.user_id)), name: state.auditor_id || 'auditor', displayName: state.auditor_id || 'Audytor' },
                        pubKeyCredParams: [
                            { alg: -7, type: "public-key" },
                            { alg: -257, type: "public-key" }
                        ],
                        authenticatorSelection: {
                            authenticatorAttachment: "platform",
                            userVerification: "required",
                            residentKey: "preferred"
                        },
                        timeout: 60000,
                        attestation: "none",
                        excludeCredentials: []
                    }
                });

                if (!cred) { alert("ℹ️ Rejestracja biometryczna anulowana."); return; }
                const credId = bufferToBase64(cred.rawId);
                
                if (!credId || credId.length < 8) {
                    alert("Nie udało się uzyskać prawidłowego identyfikatora biometrycznego.");
                    return;
                }

                const resVerify = await fetch('/api/auth/biometric/register-verify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user_id: state.user_id, credential_id: credId })
                });

                if (resVerify.ok) {
                    alert("Pomyślnie zarejestrowano biometrię (Face ID / Touch ID / Windows Hello)!\n\nOd tej chwili możesz logować się przyciskiem biometrycznym na ekranie logowania.");
                } else {
                    const err = await resVerify.json().catch(() => ({}));
                    alert("Błąd zapisu poświadczenia: " + (err.detail || "Nieznany błąd"));
                }
            } catch(e) {
                if (e.name === 'NotAllowedError') {
                    alert("ℹ️ Logowanie biometryczne anulowane przez użytkownika lub urządzenie odrzuciło żądanie.");
                } else if (e.name === 'InvalidStateError') {
                    alert("ℹ️ To urządzenie jest już zarejestrowane dla tego konta.");
                } else {
                    alert("Błąd biometrii: " + e.message);
                }
            }
        }

        async function loginWithBiometrics() {
            if (!validateWebAuthnEnvironment()) return;
            
            // Sprawdź wsparcie platformy przed próbą
            try {
                const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
                if (!available) {
                    alert("ℹ️ To urządzenie nie posiada platformowego czytnika biometrycznego (Face ID / Touch ID / Windows Hello).\n\nZaloguj się kodem PIN.");
                    return;
                }
            } catch(e) { /* kontynuuj — starsze przeglądarki nie mają tej metody */ }

            try {
                const resChallenge = await fetch('/api/auth/biometric/login-challenge');
                if (!resChallenge.ok) { alert("Błąd serwera podczas pobierania wyzwania."); return; }
                const { challenge } = await resChallenge.json();

                const assertion = await navigator.credentials.get({
                    publicKey: {
                        challenge: base64ToBuffer(challenge),
                        timeout: 60000,
                        userVerification: "required",
                        allowCredentials: []
                    }
                });
                if (!assertion) { alert("ℹ️ Logowanie biometryczne anulowane."); return; }

                const credId = bufferToBase64(assertion.rawId);
                if (!credId || credId.length < 8) {
                    alert("Nieprawidłowy identyfikator biometryczny. Spróbuj zarejestrować urządzenie ponownie.");
                    return;
                }

                const resVerify = await fetch('/api/auth/biometric/login-verify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ credential_id: credId })
                });

                if (!resVerify.ok) {
                    const err = await resVerify.json().catch(() => ({}));
                    if (resVerify.status === 401) {
                        alert("To urządzenie nie jest powiązane z żadnym kontem.\n\nZaloguj się PIN-em i kliknij ikonę biometrii w nagłówku, aby zarejestrować urządzenie.");
                    } else {
                        alert("Błąd logowania: " + (err.detail || "Nieznany błąd"));
                    }
                    return;
                }
                const user = await resVerify.json();
                applyLoginUser(user);
            } catch (err) {
                console.error("WebAuthn Login Error:", err);
                if (err.name === 'NotAllowedError') {
                    alert("ℹ️ Logowanie biometryczne anulowane lub brak zarejestrowanego klucza dla tej witryny.\n\nZaloguj się najpierw kodem PIN, a następnie powiąż urządzenie ikoną odcisku/twarzy w nagłówku.");
                } else if (err.name === 'SecurityError') {
                    alert(`Błąd bezpieczeństwa WebAuthn (${err.message}).\n\nUpewnij się, że adres w przeglądarce to http://localhost:8000 (a nie adres IP np. 192.168.x.x lub 127.0.0.1).`);
                } else {
                    alert("ℹ️ Zaloguj się kodem PIN, a następnie powiąż Face ID/Odcisk ikoną w nagłówku aplikacji.\n\n(" + (err.message || err.name) + ")");
                }
            }
        }

        let currentPromptRole = null;

        function openPinPrompt(role) {
            if (typeof window.toggleAuthCap === 'function') {
                window.toggleAuthCap(role);
            }
        }

        function closePinPrompt() { 
            if (typeof window.closePinPrompt === 'function') {
                window.closePinPrompt();
            }
        }

        function switchUserPrompt() {
            document.getElementById('main-app').classList.add('hidden');
            document.getElementById('bottom-dock').classList.add('hidden');
            document.getElementById('view-auth').classList.remove('hidden');
            const nextRole = state.role === "MANAGER" ? "AUDITOR" : "MANAGER";
            if (typeof window.toggleAuthCap === 'function') {
                window.toggleAuthCap(nextRole);
            }
        }


        async function applyLoginUser(user) {
            try {
                const userData = (user && user.user) ? user.user : (user || {});
                state.user_id = userData.id || user.id || 1;
                state.userId = state.user_id;
                state.auditor_id = String(userData.full_name || user.full_name || (state.role === 'MANAGER' ? "Administrator Jakości" : "Grzegorz Zarakowski")).trim();
                state.auditor = state.auditor_id;
                state.auditor_name = state.auditor_id;
                state.user_name = state.auditor_id;
                state.role = String(userData.role || user.role || "MANAGER").toUpperCase();
                const token = user.access_token || (user.user && user.user.access_token);
                if (token) {
                    state.token = token;
                    sessionStorage.setItem('quality_audit_token', token);
                }

                const auditorEl = document.getElementById('display-auditor');
                if (auditorEl) auditorEl.innerText = state.auditor_id;
                const roleEl = document.getElementById('display-role');
                if (roleEl) {
                    if (state.role === "MANAGER") {
                        roleEl.innerHTML = '<i class="fas fa-crown text-amber-400 mr-1"></i>KEY USER (MANAGER)';
                        roleEl.className = "text-[8.5px] font-black text-blue-400 uppercase block tracking-wider";
                    } else {
                        roleEl.innerHTML = '<i class="fas fa-user-shield text-emerald-400 mr-1"></i>AUDYTOR';
                        roleEl.className = "text-[8.5px] font-black text-emerald-400 uppercase block tracking-wider";
                    }
                }

                // U Key Usera skrzynka odbiorcza pozostaje w Kaflu 8; tag w górnym doku jest ukrywany
                const quickNoteTag = document.getElementById('tag-quick-note');
                if (quickNoteTag) {
                    if (state.role === "MANAGER") {
                        quickNoteTag.classList.add('hidden');
                    } else {
                        quickNoteTag.classList.remove('hidden');
                    }
                }

                // Natychmiastowe ukrycie ekranu logowania i otwarcie aplikacji
                const viewAuth = document.getElementById('view-auth');
                if (viewAuth) viewAuth.classList.add('hidden');
                const mainApp = document.getElementById('main-app');
                if (mainApp) {
                    mainApp.classList.remove('hidden');
                    mainApp.classList.add('flex');
                }
                const dock = document.getElementById('bottom-dock');
                if (dock) dock.classList.remove('hidden');

                navHistory = []; navForward = [];
                if (typeof window.enforceBiometricHeaderIcon === 'function') {
                    window.enforceBiometricHeaderIcon();
                }
                showModule('hub', false); 

                // Pobranie danych w tle
                if (state.role === "MANAGER" && typeof renderAuditorsList === 'function') {
                    await renderAuditorsList().catch(e => console.warn(e));
                }
                if (typeof loadProductionLines === 'function') {
                    await loadProductionLines().catch(e => console.warn(e));
                }
                if (typeof updateKpiRibbon === 'function') {
                    await updateKpiRibbon().catch(e => console.warn(e));
                }
                if (window.formHistory && typeof formHistory.saveState === 'function') {
                    formHistory.saveState('view-audit-form');
                    formHistory.saveState('modal-plan-form');
                }
            } catch(e) {
                console.error("Błąd w applyLoginUser:", e);
                const viewAuth = document.getElementById('view-auth');
                if (viewAuth) viewAuth.classList.add('hidden');
                const mainApp = document.getElementById('main-app');
                if (mainApp) {
                    mainApp.classList.remove('hidden');
                    mainApp.classList.add('flex');
                }
                showModule('hub', false);
            }
        }
        window.applyLoginUser = applyLoginUser;

        function logout() {
            state.user_id = 0;
            state.token = "";
            sessionStorage.removeItem('quality_audit_token');
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
                const incEl = document.getElementById('ribbon-incidents');
                const compEl = document.getElementById('ribbon-compliance');
                const totEl = document.getElementById('ribbon-total-audits');
                if (incEl) incEl.innerText = data.incidents_count || 0;
                if (compEl) compEl.innerText = `${data.compliance_rate}% ZGODNY`;
                if (totEl) totEl.innerText = data.total_audits || 0;
            } catch(e) {}
        }

        let activeAuditorMatrixFilter = 'ALL';
        let cachedAuditorsData = [];

        function parseQualifications(raw) {
            if (!raw) return [];
            if (Array.isArray(raw)) return raw;
            if (typeof raw === 'string') {
                try {
                    const parsed = JSON.parse(raw);
                    if (Array.isArray(parsed)) return parsed;
                } catch(e) {}
                return raw.split(',').map(s => s.trim()).filter(Boolean);
            }
            return [];
        }

        window.filterAuditorsMatrix = function(type) {
            activeAuditorMatrixFilter = type ? type.toUpperCase() : 'ALL';
            renderAuditorsListCards();
        };

        function renderAuditorsListCards() {
            const container = document.getElementById('auditors-list-container');
            if (!container) return;

            // Stylizacja przycisków filtrujących
            const filterTypes = ['ALL', 'HACCP', 'GMP', 'GHP'];
            filterTypes.forEach(t => {
                const btn = document.getElementById(`btn-matrix-${t.toLowerCase()}`);
                if (!btn) return;
                if (activeAuditorMatrixFilter === t) {
                    btn.className = "btn-matrix-filter px-2.5 py-1 rounded-lg text-[10px] font-black bg-emerald-500 text-slate-950 shadow-md transition active:scale-95 cursor-pointer";
                } else {
                    let borderCls = t === 'HACCP' ? 'border-emerald-500/40 text-emerald-300 hover:bg-emerald-950/80' :
                                    t === 'GMP' ? 'border-purple-500/40 text-purple-300 hover:bg-purple-950/80' :
                                    t === 'GHP' ? 'border-cyan-500/40 text-cyan-300 hover:bg-cyan-950/80' :
                                    'border-slate-700 text-slate-300 hover:bg-slate-800';
                    btn.className = `btn-matrix-filter px-2.5 py-1 rounded-lg text-[10px] font-black bg-slate-900 border ${borderCls} transition active:scale-95 cursor-pointer`;
                }
            });

            // Pasek stanu aktywnego filtra
            const banner = document.getElementById('matrix-filter-banner');
            const bannerTxt = document.getElementById('matrix-filter-current');
            if (banner && bannerTxt) {
                if (activeAuditorMatrixFilter !== 'ALL') {
                    banner.classList.remove('hidden');
                    bannerTxt.textContent = activeAuditorMatrixFilter;
                } else {
                    banner.classList.add('hidden');
                }
            }

            // Filtrowanie audytorów według wybranego rodzaju audytu
            let filteredUsers = cachedAuditorsData;
            if (activeAuditorMatrixFilter !== 'ALL') {
                filteredUsers = cachedAuditorsData.filter(u => {
                    const quals = parseQualifications(u.qualifications);
                    return quals.some(q => String(q).toUpperCase().includes(activeAuditorMatrixFilter));
                });
            }

            const countBadge = document.getElementById('auditor-matrix-count');
            if (countBadge) {
                countBadge.textContent = `${filteredUsers.length} / ${cachedAuditorsData.length} audytorów`;
            }

            if (filteredUsers.length === 0) {
                container.innerHTML = `
                    <div class="p-5 text-center bg-slate-950/60 rounded-xl border border-dashed border-slate-800 text-slate-400">
                        <i class="fas fa-user-slash text-xl mb-1 text-slate-600 block"></i>
                        <span class="text-xs font-bold block">Brak audytorów z uprawnieniami do: ${activeAuditorMatrixFilter}</span>
                        <button type="button" onclick="filterAuditorsMatrix('ALL')" class="mt-2 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-300 text-[10px] font-bold rounded-lg transition cursor-pointer">Pokaż wszystkich</button>
                    </div>
                `;
                return;
            }

            container.innerHTML = filteredUsers.map(u => {
                const quals = parseQualifications(u.qualifications);
                const hasHaccp = quals.some(q => String(q).toUpperCase().includes('HACCP'));
                const hasGmp = quals.some(q => String(q).toUpperCase().includes('GMP'));
                const hasGhp = quals.some(q => String(q).toUpperCase().includes('GHP'));

                // Kliknięcie w plakietkę audytu filtruje widok do tylko tego standardu
                const haccpBadge = hasHaccp ? `
                    <button type="button" onclick="event.stopPropagation(); filterAuditorsMatrix('HACCP')" title="Kliknij, aby pokazać tylko audytorów HACCP" class="px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-950 border ${activeAuditorMatrixFilter === 'HACCP' ? 'border-emerald-400 ring-2 ring-emerald-400/50 shadow-md' : 'border-emerald-500/60'} text-emerald-300 hover:brightness-125 transition cursor-pointer flex items-center gap-1.5">
                        <i class="fas fa-shield-halved text-emerald-400"></i>
                        <span>HACCP</span>
                    </button>` : '';

                const gmpBadge = hasGmp ? `
                    <button type="button" onclick="event.stopPropagation(); filterAuditorsMatrix('GMP')" title="Kliknij, aby pokazać tylko audytorów GMP" class="px-2 py-0.5 rounded-full text-[9px] font-black bg-purple-950 border ${activeAuditorMatrixFilter === 'GMP' ? 'border-purple-400 ring-2 ring-purple-400/50 shadow-md' : 'border-purple-500/60'} text-purple-300 hover:brightness-125 transition cursor-pointer flex items-center gap-1.5">
                        <i class="fas fa-industry text-purple-400"></i>
                        <span>GMP</span>
                    </button>` : '';

                const ghpBadge = hasGhp ? `
                    <button type="button" onclick="event.stopPropagation(); filterAuditorsMatrix('GHP')" title="Kliknij, aby pokazać tylko audytorów GHP" class="px-2 py-0.5 rounded-full text-[9px] font-black bg-cyan-950 border ${activeAuditorMatrixFilter === 'GHP' ? 'border-cyan-400 ring-2 ring-cyan-400/50 shadow-md' : 'border-cyan-500/60'} text-cyan-300 hover:brightness-125 transition cursor-pointer flex items-center gap-1.5">
                        <i class="fas fa-pump-medical text-cyan-400"></i>
                        <span>GHP</span>
                    </button>` : '';

                const otherQuals = quals.filter(q => !['HACCP', 'GMP', 'GHP'].some(std => String(q).toUpperCase().includes(std)));
                const otherBadge = otherQuals.length > 0 ? `<span class="text-[8.5px] text-slate-400 font-bold bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700 truncate max-w-[120px]" title="${otherQuals.join(', ')}">+ ${otherQuals.join(', ')}</span>` : '';

                const isManager = (u.role === 'MANAGER');

                return `
                    <div class="bg-slate-900/90 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between text-xs hover:border-slate-700 transition shadow-sm">
                        <div class="min-w-0 pr-2">
                            <div class="flex items-center gap-1.5">
                                <span class="font-black text-white truncate block text-[11px]">${u.full_name}</span>
                                ${isManager ? '<span class="text-[8px] bg-amber-950 text-amber-300 border border-amber-500/40 px-1.5 py-0.2 rounded font-bold uppercase tracking-wider">Kierownik</span>' : '<span class="text-[8px] bg-slate-800 text-slate-400 px-1.5 py-0.2 rounded font-bold uppercase">Audytor</span>'}
                            </div>
                            <div class="flex flex-wrap items-center gap-1 mt-1">
                                ${haccpBadge}
                                ${gmpBadge}
                                ${ghpBadge}
                                ${otherBadge}
                                ${(!hasHaccp && !hasGmp && !hasGhp && otherQuals.length === 0) ? '<span class="text-[8.5px] text-rose-400 italic">Brak uprawnień</span>' : ''}
                            </div>
                        </div>
                        <div class="flex items-center gap-1.5 shrink-0">
                            <button type="button" onclick="showAuditorProfileModal(${JSON.stringify(u).replace(/"/g, '&quot;')})" class="px-2.5 py-1 bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-500/40 text-cyan-300 rounded-full text-[10px] font-bold transition flex items-center gap-1.5 shadow-sm cursor-pointer">
                                <i class="fas fa-user-gear text-cyan-400 text-xs"></i>
                                <span>Profil</span>
                            </button>
                            ${!isManager ? `<button type="button" onclick="deleteAuditor(${u.id})" class="tile-3d bg-rose-950 hover:bg-rose-900 border border-rose-500/50 text-rose-300 px-2 py-1 text-[9px] font-bold rounded-full cursor-pointer">Usuń</button>` : ''}
                        </div>
                    </div>
                `;
            }).join('');
        }

        async function renderAuditorsList() {
            const container = document.getElementById('auditors-list-container');
            if (!container) return;
            try {
                const res = await apiFetch(`/api/users`);
                if (!res.ok) return;
                const data = await res.json();
                cachedAuditorsData = Array.isArray(data) ? data : (data.users || []);
                renderAuditorsListCards();
            } catch(e) {
                console.warn("Błąd renderAuditorsList:", e);
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

            const res = await apiFetch(`/api/users`, {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ pin, full_name, role: 'AUDITOR', qualifications: quals })
            });

            if (res.ok) {
                alert("Dodano audytora!");
                nameEl.value = ""; pinEl.value = "";
                await renderAuditorsList();
            } else {
                const err = await res.json();
                alert(`${err.detail || 'Błąd zapisu'}`);
            }
        }

        async function deleteAuditor(userId) {
            if (!confirm("Czy na pewno chcesz usunąć tego audytora?")) return;
            const res = await apiFetch(`/api/users/${userId}`, { method: 'DELETE' });
            if (res.ok) {
                await renderAuditorsList();
            } else {
                const err = await res.json().catch(() => ({}));
                alert(`${err.detail || 'Błąd usuwania użytkownika'}`);
            }
        }

        function getPolishHolidays(year) {
            return {
                [`${year}-01-01`]: "Nowy Rok", [`${year}-01-06`]: "Trzech Króli",
                [`${year}-05-01`]: "Święto Pracy", [`${year}-05-03`]: "Konstytucji 3 Maja",
                [`${year}-08-15`]: "Wniebowzięcie NMP", [`${year}-11-01`]: "Wszystkich Świętych",
                [`${year}-11-11`]: "Niepodległości", [`${year}-12-25`]: "Boże Narodzenie", [`${year}-12-26`]: "II Dzień Świąt"
            };
        }

        function updateAuditorScheduleBadges(schedules) {
            if (!Array.isArray(schedules)) return;
            // Zaplanowane audyty ze statusem PLANOWANY w aktywnym/oglądanym miesiącu
            const curYear = (currentCalDate instanceof Date && !isNaN(currentCalDate.getTime())) ? currentCalDate.getFullYear() : new Date().getFullYear();
            const curMonth = (currentCalDate instanceof Date && !isNaN(currentCalDate.getTime())) ? (currentCalDate.getMonth() + 1) : (new Date().getMonth() + 1);
            const prefix = `${curYear}-${String(curMonth).padStart(2, '0')}`;
            const monthPlannedAudits = schedules.filter(s => s.scheduled_date && s.scheduled_date.startsWith(prefix) && s.status === 'PLANOWANY');
            const count = monthPlannedAudits.length;

            // 1. Mała plakietka w stylu iPhone na tagu "Harmonogram" w górnym doku (#tag-calendar):
            const dockBadge = document.getElementById('badge-dock-schedule');
            if (dockBadge) {
                if (count > 0) {
                    dockBadge.textContent = count > 99 ? '99+' : count;
                    dockBadge.classList.remove('hidden');
                } else {
                    dockBadge.classList.add('hidden');
                }
            }

            // 2. Mała plakietka w stylu iPhone na ikonie kafla 1 u audytora (#aud-tile-calendar):
            const tileBadge = document.getElementById('badge-tile-auditor-schedule');
            const tilePill = document.getElementById('pill-tile-auditor-schedule');
            if (tileBadge) {
                if (count > 0) {
                    tileBadge.textContent = count > 99 ? '99+' : count;
                    tileBadge.classList.remove('hidden');
                } else {
                    tileBadge.classList.add('hidden');
                }
            }
            if (tilePill) {
                if (count > 0) {
                    tilePill.textContent = `${count} ZAPLANOWANYCH`;
                    tilePill.classList.remove('hidden');
                } else {
                    tilePill.classList.add('hidden');
                }
            }
        }

        let isScheduleLoading = false;
        async function loadScheduleAndRender() {
            if (isScheduleLoading) return;
            isScheduleLoading = true;
            try {
                const url = `/api/schedule?auditor=${encodeURIComponent(state.auditor_id)}&role=${state.role}&_t=${Date.now()}`;
                const res = await apiFetch(url, { cache: 'no-store' });
                if (res.ok) {
                    const allSchedules = await res.json();
                    schedulesData = Array.isArray(allSchedules) ? allSchedules : [];
                    updateAuditorScheduleBadges(schedulesData);
                    renderCalendar();
                }
            } catch(e) { 
                console.error("loadScheduleAndRender error:", e);
                schedulesData = []; 
                updateAuditorScheduleBadges([]);
                renderCalendar();
            } finally {
                isScheduleLoading = false;
            }
        }

        function changeMonth(delta) {
            currentCalDate.setDate(1);
            currentCalDate.setMonth(currentCalDate.getMonth() + delta);
            updateAuditorScheduleBadges(schedulesData);
            renderCalendar();
        }

                let activeSelectedFilter = null;

        function updateFilterTagButtons() {
            const map = {
                'HACCP': { id: 'btn-tag-haccp', ring: 'ring-emerald-400', label: 'HACCP' },
                'GMP': { id: 'btn-tag-gmp', ring: 'ring-purple-400', label: 'GMP' },
                'GHP': { id: 'btn-tag-ghp', ring: 'ring-cyan-400', label: 'GHP' },
                'WYKONANY': { id: 'btn-tag-done', ring: 'ring-emerald-400', label: 'Wykonany' },
                'SPOZNIONY': { id: 'btn-tag-overdue', ring: 'ring-rose-400', label: 'Spóźniony' },
                'SWIETO': { id: 'btn-tag-holiday', ring: 'ring-amber-400', label: 'Święto' }
            };

            const btnAll = document.getElementById('btn-tag-all');
            if (btnAll) {
                btnAll.classList.remove('ring-2', 'ring-cyan-400', 'brightness-125', 'scale-105', 'opacity-40', 'opacity-75', 'opacity-100', 'bg-cyan-950/80', 'border-cyan-500/80', 'text-cyan-200');
                if (!activeSelectedFilter) {
                    btnAll.classList.add('opacity-100', 'ring-2', 'ring-cyan-400', 'brightness-125', 'scale-105', 'bg-cyan-950/80', 'border-cyan-500/80', 'text-cyan-200');
                } else {
                    btnAll.classList.add('opacity-40', 'text-slate-400');
                }
            }

            const banner = document.getElementById('cal-filter-status-banner');
            const bannerText = document.getElementById('cal-filter-status-text');

            Object.entries(map).forEach(([k, cfg]) => {
                const b = document.getElementById(cfg.id);
                if (!b) return;
                b.classList.remove('ring-2', 'ring-cyan-300', 'ring-purple-400', 'ring-emerald-400', 'ring-rose-400', 'ring-amber-400', 'brightness-125', 'scale-105', 'opacity-40', 'opacity-50', 'opacity-75', 'opacity-100');
                if (activeSelectedFilter === k) {
                    b.classList.add('opacity-100', 'ring-2', cfg.ring, 'brightness-125', 'scale-105', 'shadow-lg');
                } else if (activeSelectedFilter) {
                    b.classList.add('opacity-40');
                } else {
                    b.classList.add('opacity-75');
                }
            });

            if (banner && bannerText) {
                if (activeSelectedFilter && map[activeSelectedFilter]) {
                    banner.classList.remove('hidden');
                    bannerText.innerHTML = `Aktywny filtr: <strong class="text-white px-2 py-0.5 rounded bg-slate-800 border border-slate-700">${map[activeSelectedFilter].label}</strong> — pokazuję <span class="text-cyan-300 font-bold">tylko</span> te audyty.`;
                } else {
                    banner.classList.add('hidden');
                }
            }
        }

        function selectSingleFilter(key) {
            // key === null oznacza powrót do wszystkich audytów
            // Wybranie danego audytu (np. HACCP, GMP) ZAWSZE zachowuje ten filtr i nie resetuje go przy ponownym kliknięciu!
            activeSelectedFilter = key;

            updateFilterTagButtons();
            renderCalendar();
        }
        window.selectSingleFilter = selectSingleFilter;
        window.updateFilterTagButtons = updateFilterTagButtons;

        window.openAuditActionModal = async function(id) {
            try {
                let a = schedulesData ? schedulesData.find(s => String(s.id) === String(id)) : null;
                if (!a) {
                    const res = await fetch(`/api/schedule/${id}`);
                    if (res.ok) a = await res.json();
                }
                if (a && a.status === 'WYKONANY') {
                    if (typeof openAuditDetailsModal === 'function') {
                        return openAuditDetailsModal(id);
                    }
                }
                if (state.role === 'MANAGER') {
                    if (typeof openMgrModal === 'function') return openMgrModal(id);
                } else {
                    if (typeof openAudModal === 'function') return openAudModal(id);
                }
            } catch (e) {
                console.warn("Błąd openAuditActionModal:", e);
                if (state.role === 'MANAGER' && typeof openMgrModal === 'function') openMgrModal(id);
                else if (typeof openAudModal === 'function') openAudModal(id);
            }
        };

        window.handleAuditCardClick = function(event, auditId, auditType) {
            if (event) event.stopPropagation();
            if (activeSelectedFilter !== auditType) {
                // Jeśli filtr nie był jeszcze ustawiony na ten typ, kliknięcie audytu izoluje widok do TYLKO tego audytu/typu
                selectSingleFilter(auditType);
                if (typeof showToast === 'function') {
                    showToast(`Widok przefiltrowany: tylko audyty ${auditType}`, 'info');
                }
            } else {
                // Gdy filtr jest już aktywny, kolejne kliknięcie otwiera szczegóły danego audytu
                openAuditActionModal(auditId);
            }
        };

        window.handleCalendarTileClick = function(dateStr) {
            const dayAudits = Array.isArray(schedulesData) ? schedulesData.filter(s => s.scheduled_date === dateStr) : [];
            const matchingAudits = activeSelectedFilter ? dayAudits.filter(a => {
                const aType = String(a.audit_type || "HACCP").toUpperCase().trim();
                if (activeSelectedFilter === 'HACCP') return aType.includes('HACCP');
                if (activeSelectedFilter === 'GMP') return aType.includes('GMP');
                if (activeSelectedFilter === 'GHP') return aType.includes('GHP');
                if (activeSelectedFilter === 'WYKONANY') return a.status === 'WYKONANY';
                if (activeSelectedFilter === 'SPOZNIONY') return a.status !== 'WYKONANY' && a.scheduled_date < getLocalDateString();
                return true;
            }) : dayAudits;

            if (matchingAudits.length > 0) {
                const targetAudit = matchingAudits[0];
                const aType = String(targetAudit.audit_type || "HACCP").toUpperCase();
                const targetType = aType.includes("GMP") ? "GMP" : aType.includes("GHP") ? "GHP" : "HACCP";
                if (activeSelectedFilter !== targetType) {
                    selectSingleFilter(targetType);
                } else {
                    openAuditActionModal(targetAudit.id);
                }
            } else {
                if (typeof openManualPlanModal === 'function') openManualPlanModal(dateStr);
            }
        };

        function formatAuditorBadge(auditor) {
            if (!auditor) return "Audytor";
            const clean = auditor.replace(/\s*\(.*?\)/g, "").trim();
            if (!clean) return "Audytor";
            if (clean.toLowerCase().includes("administrator")) return "Admin";
            
            const parts = clean.split(/\s+/);
            if (parts.length === 1) return parts[0];
            
            // Jeśli pierwszy człon to inicjał z kropką: np. "G. Zarakowski"
            if (parts[0].length <= 2 && parts[0].includes('.')) {
                return `${parts[0]} ${parts[1]}`;
            }
            // Jeśli ostatni człon to już inicjał: np. "Stefaw W." lub "Stefan W"
            const lastPart = parts[parts.length - 1];
            if (lastPart.length <= 2) {
                const init = lastPart.endsWith('.') ? lastPart : `${lastPart}.`;
                return `${parts[0]} ${init}`;
            }
            // Imię + pierwsza litera nazwiska: "Grzegorz Zarakowski" -> "Grzegorz Z."
            return `${parts[0]} ${lastPart.charAt(0)}.`;
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
            let totalMatchingAuditsInMonth = 0;

            for (let row = 0; row < 6; row++) {
                if (dateIter > totalDays) break;
                for (let col = 0; col < 7; col++) {
                    if ((row === 0 && col < startDay) || dateIter > totalDays) {
                        grid.innerHTML += `<div class="cal-day bg-slate-950/30 rounded-xl border border-slate-900"></div>`;
                    } else {
                        const currentFullDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(dateIter).padStart(2, '0')}`;
                        const holidayName = holidays[currentFullDate], isToday = currentFullDate === todayStr;
                        let dayAudits = schedulesData.filter(s => s.scheduled_date === currentFullDate);
                        if (state.role !== 'MANAGER' && activeSelectedFilter !== 'WYKONANY') {
                            dayAudits = dayAudits.filter(s => s.status !== 'WYKONANY');
                        }

                        // Filtr tagów: jeśli żaden nie jest wybrany -> pokazujemy wszystkie zaplanowane/aktywne audyty
                        // Gdy wciśnięty jest tag -> pokazuje się TYLKO audyt spełniający ten filtr
                        dayAudits = dayAudits.filter(a => {
                            if (!activeSelectedFilter) return true;
                            const aType = String(a.audit_type || "HACCP").toUpperCase().trim();
                            const isCompleted = (a.status === 'WYKONANY');
                            const isOverdue = (!isCompleted && currentFullDate < todayStr);

                            if (activeSelectedFilter === 'HACCP') return aType.includes('HACCP');
                            if (activeSelectedFilter === 'GMP') return aType.includes('GMP');
                            if (activeSelectedFilter === 'GHP') return aType.includes('GHP');
                            if (activeSelectedFilter === 'WYKONANY') return isCompleted;
                            if (activeSelectedFilter === 'SPOZNIONY') return isOverdue;
                            if (activeSelectedFilter === 'SWIETO') return !!holidayName;
                            return false;
                        });

                        totalMatchingAuditsInMonth += dayAudits.length;

                        let tileHighlight = '';
                        if (activeSelectedFilter) {
                            if (dayAudits.length > 0) {
                                if (activeSelectedFilter === 'GMP') tileHighlight = 'ring-2 ring-purple-500/80 bg-purple-950/20 border-purple-500/60 shadow-lg shadow-purple-950/30';
                                else if (activeSelectedFilter === 'GHP') tileHighlight = 'ring-2 ring-cyan-500/80 bg-cyan-950/20 border-cyan-500/60 shadow-lg shadow-cyan-950/30';
                                else if (activeSelectedFilter === 'HACCP') tileHighlight = 'ring-2 ring-emerald-500/80 bg-emerald-950/20 border-emerald-500/60 shadow-lg shadow-emerald-950/30';
                                else if (activeSelectedFilter === 'WYKONANY') tileHighlight = 'ring-2 ring-emerald-500/80 bg-emerald-950/20 border-emerald-500/60 shadow-lg shadow-emerald-950/30';
                                else if (activeSelectedFilter === 'SPOZNIONY') tileHighlight = 'ring-2 ring-rose-500/80 bg-rose-950/20 border-rose-500/60 shadow-lg shadow-rose-950/30';
                                else if (activeSelectedFilter === 'SWIETO') tileHighlight = holidayName ? 'ring-2 ring-amber-500/80 bg-amber-950/20 border-amber-500/60 shadow-lg shadow-amber-950/30' : 'opacity-25';
                            } else {
                                tileHighlight = (activeSelectedFilter === 'SWIETO' && holidayName) ? 'ring-2 ring-amber-500/80 bg-amber-950/20 border-amber-500/60' : 'opacity-25 grayscale-[30%] hover:opacity-100 transition-opacity';
                            }
                        }
                        
                        let badgeHtml = "";
                        dayAudits.forEach(a => {
                            const aType = String(a.audit_type || "HACCP").toUpperCase().trim();
                            const isCompleted = (a.status === 'WYKONANY');
                            const isOverdue = (!isCompleted && currentFullDate < todayStr);

                            // Formatowanie: rodzaj audytu oraz imię audytora bądź inicjały
                            const cleanAud = (a.lead_auditor || "Audytor").replace(/\s*\(.*?\)/g, "").trim();
                            const auditorDisplay = formatAuditorBadge(cleanAud);

                            let badgeColor = aType.includes("GMP") ? "bg-purple-950/90 border-purple-500/60 text-purple-200 shadow-purple-950/40" :
                                             aType.includes("GHP") ? "bg-blue-950/90 border-cyan-500/60 text-cyan-200 shadow-cyan-950/40" : 
                                             "bg-emerald-950/90 border-emerald-500/60 text-emerald-200 shadow-emerald-950/40";
                            
                            let badgeStyle = isCompleted ? `${badgeColor} opacity-80` :
                                             isOverdue ? "bg-rose-950/90 border-rose-500/80 text-rose-200 animate-pulse shadow-rose-950/50" : `${badgeColor}`;

                            let typeIcon = '';
                            if (aType.includes('GMP')) {
                                typeIcon = `<svg class="w-3 h-3 text-purple-400 shrink-0 inline-block" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`;
                            } else if (aType.includes('GHP')) {
                                typeIcon = `<svg class="w-3 h-3 text-cyan-400 shrink-0 inline-block" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>`;
                            } else {
                                typeIcon = `<svg class="w-3 h-3 text-emerald-400 shrink-0 inline-block" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;
                            }

                            let statusIcon = '';
                            if (isCompleted) {
                                statusIcon = `<svg class="w-3 h-3 text-emerald-400 shrink-0 inline-block" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>`;
                            } else if (isOverdue) {
                                statusIcon = `<svg class="w-3 h-3 text-rose-400 shrink-0 inline-block" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 15 13.5"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
                            }

                            const tagFilterKey = aType.includes("GMP") ? "GMP" : aType.includes("GHP") ? "GHP" : "HACCP";

                            badgeHtml += `
                                <div draggable="true" ondragstart="event.stopPropagation(); event.dataTransfer.setData('text/plain', ${a.id});"
                                     onclick="handleAuditCardClick(event, ${a.id}, '${tagFilterKey}')"
                                     ondblclick="event.stopPropagation(); openAuditActionModal(${a.id})"
                                     title="${aType} • ${cleanAud} (${a.line || ''}) — Kliknij, aby pokazać tylko audyty ${tagFilterKey} w kalendarzu"
                                     class="${badgeStyle} border rounded-lg py-1 px-1.5 shadow-md flex flex-col justify-center mb-1 cursor-pointer relative z-10 hover:scale-[1.02] transition-transform hover:brightness-110 leading-tight overflow-hidden max-w-full box-border group">
                                    <div class="flex items-center justify-between gap-1 w-full min-w-0 font-black text-[9.5px] sm:text-[10px] uppercase">
                                        <div class="flex items-center gap-1 min-w-0 truncate">
                                            ${typeIcon}
                                            <span class="truncate hover:underline hover:text-white cursor-pointer font-black">${aType}</span>
                                        </div>
                                        <div class="flex items-center gap-1 shrink-0">
                                            ${statusIcon ? `<div class="shrink-0 flex items-center justify-center">${statusIcon}</div>` : ''}
                                            <button type="button" 
                                                    onclick="event.stopPropagation(); openAuditActionModal(${a.id})" 
                                                    title="Otwórz szczegóły tego audytu #${a.id}" 
                                                    class="p-0.5 rounded bg-black/30 hover:bg-white/20 text-white/70 hover:text-white transition-colors">
                                                <svg class="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg>
                                            </button>
                                        </div>
                                    </div>
                                    <div class="text-[9px] sm:text-[9.5px] font-bold text-white/90 truncate mt-0.5" title="${cleanAud}">
                                        ${auditorDisplay}
                                    </div>
                                </div>
                            `;
                        });
                        
                        grid.innerHTML += `
                            <div ondragover="event.preventDefault()" ondrop="handleAuditDrop(event, '${currentFullDate}')"
                                 onclick="handleCalendarTileClick('${currentFullDate}')" 
                                 class="cal-day tile-3d ${tileHighlight || (holidayName ? 'bg-amber-950/20 border-amber-900/40' : 'bg-slate-900/80')} ${isToday ? 'border-cyan-400 ring-1 ring-cyan-400/40' : 'border-slate-800'} p-1.5 flex flex-col justify-between cursor-pointer rounded-xl overflow-hidden box-border transition-all">
                                <div class="flex justify-between items-start gap-1">
                                    <span class="text-[10px] font-extrabold ${holidayName ? 'text-amber-400' : 'text-slate-200'}">${dateIter}</span>
                                    ${holidayName ? `<span class="text-[7.5px] text-amber-300 truncate max-w-[65px] font-extrabold flex items-center gap-0.5" title="${holidayName}"><svg class="w-2.5 h-2.5 text-amber-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="2" y1="2" x2="22" y2="22"/></svg> ${holidayName}</span>` : ''}
                                </div>
                                <div class="space-y-0.5 mt-0.5 w-full min-w-0 overflow-hidden">${badgeHtml}</div>
                            </div>
                        `;
                        dateIter++;
                    }
                }
            }

            if (activeSelectedFilter) {
                const bannerText = document.getElementById('cal-filter-status-text');
                if (bannerText) {
                    const filterLabels = { 'HACCP': 'HACCP', 'GMP': 'GMP', 'GHP': 'GHP', 'WYKONANY': 'Wykonany', 'SPOZNIONY': 'Spóźniony', 'SWIETO': 'Święto' };
                    const lbl = filterLabels[activeSelectedFilter] || activeSelectedFilter;
                    bannerText.innerHTML = `Aktywny filtr: <strong class="text-white px-2 py-0.5 rounded bg-slate-800 border border-slate-700">${lbl}</strong> — w tym miesiącu znaleziono: <strong class="text-cyan-300">${totalMatchingAuditsInMonth}</strong> audytów`;
                }
            }
        }

        async function handleAuditDrop(event, targetDate) {
            event.preventDefault();
            const auditId = event.dataTransfer.getData('text/plain');
            if (!auditId) return;

            const today = getLocalDateString();
            if (targetDate < today) {
                return alert("Nie można przenosić audytów na daty wsteczne!");
            }

            try {
                const res = await apiFetch(`/api/schedule/${auditId}/reschedule`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ new_date: targetDate })
                });

                if (res.ok) {
                    await loadScheduleAndRender();
                } else {
                    const err = await res.json();
                    alert("" + (err.detail || "Błąd zmiany terminu."));
                }
            } catch (e) {
                alert("Błąd połączenia z serwerem.");
            }
        }

        async function openManualPlanModal(dateStr = "") {
            if (state.role !== "MANAGER" && state.role !== "AUDITOR") return;
            const dock = document.getElementById('bottom-dock');
            if (dock) dock.classList.add('hidden');

            const selectedDate = dateStr || getLocalDateString();
            const dateInput = document.getElementById('plan-date');
            if (dateInput) dateInput.value = selectedDate; 
            miniCalDate = new Date(selectedDate);
            renderMiniCalendar();

            if (!productionLinesData || productionLinesData.length === 0) {
                await loadProductionLines();
            }

            const planTypeEl = document.getElementById('plan-type');
            const currentType = planTypeEl ? planTypeEl.value : "HACCP";
            await loadAuditorsDropdown(currentType);

            // Jeśli zalogowany jest audytor, ustaw go jako domyślnego audytora głównego
            if (state.role === "AUDITOR" && state.user && state.user.full_name) {
                const audSelect = document.getElementById('plan-auditor');
                if (audSelect) {
                    for (let i = 0; i < audSelect.options.length; i++) {
                        if (audSelect.options[i].value.includes(state.user.full_name) || state.user.full_name.includes(audSelect.options[i].value)) {
                            audSelect.selectedIndex = i;
                            break;
                        }
                    }
                }
            }
            
            if (typeof syncPlanAuditorBackupOptions === 'function') {
                syncPlanAuditorBackupOptions();
            }

            if (window.formHistory && typeof window.formHistory.saveState === 'function') {
                formHistory.saveState('modal-plan-form');
            }
            const modalEl = document.getElementById('modal-plan');
            if (modalEl) modalEl.classList.remove('hidden');
        }
        window.openManualPlanModal = openManualPlanModal;

        function closePlanModal() { 
            const modalEl = document.getElementById('modal-plan');
            if (modalEl) modalEl.classList.add('hidden');
            const dock = document.getElementById('bottom-dock');
            if (dock && state.role) dock.classList.remove('hidden');
        }
        window.closePlanModal = closePlanModal;
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
                return alert("Nie można planować audytów z datą wsteczną! Wybierz datę bieżącą lub przyszłą.");
            }

            const leadAuditor = document.getElementById('plan-auditor').value;
            const backupAuditor = document.getElementById('plan-backup').value;

            if (leadAuditor === backupAuditor && backupAuditor !== "Brak") {
                return alert("Niezgodność z normą IFS: Audytor Główny i Zastępca nie mogą być tą samą osobą!");
            }

            const payload = {
                scheduled_date: pDate,
                audit_type: document.getElementById('plan-type').value,
                line: document.getElementById('plan-line').value,
                lead_auditor: leadAuditor,
                backup_auditor: backupAuditor,
                notes: document.getElementById('plan-notes').value
            };
            const res = await apiFetch('/api/schedule', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
            if (res.ok) { alert("Audyt zaplanowany!"); closePlanModal(); await loadScheduleAndRender(); }
            else {
                const err = await res.json().catch(() => ({}));
                alert("Błąd planowania: " + (err.detail || "Nie udało się zapisać audytu."));
            }
        }

        let autoPlanCalDate = new Date();
        let autoPlanHistory = [];
        let autoPlanHistoryIndex = -1;

        function recordAutoPlanState() {
            const mEl = document.getElementById('autoplan-month');
            const yEl = document.getElementById('autoplan-year');
            const haccpEl = document.getElementById('auto-type-haccp');
            const gmpEl = document.getElementById('auto-type-gmp');
            const ghpEl = document.getElementById('auto-type-ghp');
            const weekendsEl = document.getElementById('auto-include-weekends');
            if (!mEl || !yEl) return;

            const snapshot = {
                period: state.selected_period_months || 1,
                month: parseInt(mEl.value) || (new Date().getMonth() + 1),
                year: parseInt(yEl.value) || new Date().getFullYear(),
                haccp: Boolean(haccpEl && haccpEl.checked),
                gmp: Boolean(gmpEl && gmpEl.checked),
                ghp: Boolean(ghpEl && ghpEl.checked),
                weekends: Boolean(weekendsEl && weekendsEl.checked),
                lines: Array.from(document.querySelectorAll('.auto-line-chk:checked')).map(c => c.value)
            };

            // Nie duplikuj identycznych stanów pod rząd
            if (autoPlanHistoryIndex >= 0) {
                const prev = autoPlanHistory[autoPlanHistoryIndex];
                if (JSON.stringify(prev) === JSON.stringify(snapshot)) return;
            }

            autoPlanHistory = autoPlanHistory.slice(0, autoPlanHistoryIndex + 1);
            autoPlanHistory.push(snapshot);
            autoPlanHistoryIndex = autoPlanHistory.length - 1;
            updateAutoPlanUndoRedoButtons();
        }

        function updateAutoPlanUndoRedoButtons() {
            const undoBtn = document.getElementById('btn-autoplan-undo');
            const redoBtn = document.getElementById('btn-autoplan-redo');
            if (undoBtn) undoBtn.disabled = (autoPlanHistoryIndex <= 0);
            if (redoBtn) redoBtn.disabled = (autoPlanHistoryIndex >= autoPlanHistory.length - 1);
        }

        window.autoPlanHistoryUndo = function() {
            if (autoPlanHistoryIndex > 0) {
                autoPlanHistoryIndex--;
                applyAutoPlanState(autoPlanHistory[autoPlanHistoryIndex]);
            }
        };

        window.autoPlanHistoryRedo = function() {
            if (autoPlanHistoryIndex < autoPlanHistory.length - 1) {
                autoPlanHistoryIndex++;
                applyAutoPlanState(autoPlanHistory[autoPlanHistoryIndex]);
            }
        };

        function applyAutoPlanState(snap) {
            if (!snap) return;
            state.selected_period_months = snap.period;
            document.querySelectorAll('.btn-period').forEach(b => {
                const isMatch = (parseInt(b.textContent) === snap.period);
                if (isMatch) {
                    b.classList.remove('bg-slate-800', 'text-slate-300');
                    b.classList.add('tile-selected', 'bg-purple-600', 'text-white', 'border-purple-400');
                } else {
                    b.classList.remove('tile-selected', 'bg-purple-600', 'text-white', 'border-purple-400');
                    b.classList.add('bg-slate-800', 'text-slate-300');
                }
            });
            const mEl = document.getElementById('autoplan-month');
            const yEl = document.getElementById('autoplan-year');
            const haccpEl = document.getElementById('auto-type-haccp');
            const gmpEl = document.getElementById('auto-type-gmp');
            const ghpEl = document.getElementById('auto-type-ghp');
            const weekendsEl = document.getElementById('auto-include-weekends');

            if (mEl) mEl.value = snap.month;
            if (yEl) yEl.value = snap.year;
            if (haccpEl) haccpEl.checked = snap.haccp;
            if (gmpEl) gmpEl.checked = snap.gmp;
            if (ghpEl) ghpEl.checked = snap.ghp;
            if (weekendsEl) weekendsEl.checked = snap.weekends;

            if (Array.isArray(snap.lines)) {
                document.querySelectorAll('.auto-line-chk').forEach(c => {
                    c.checked = snap.lines.includes(c.value);
                });
            }

            autoPlanCalDate = new Date(snap.year, snap.month - 1, 1);
            updateAutoPlanPreview(false);
            updateAutoPlanUndoRedoButtons();
        }

        window.changeAutoPlanMiniMonth = function(delta) {
            autoPlanCalDate.setMonth(autoPlanCalDate.getMonth() + delta);
            const mEl = document.getElementById('autoplan-month');
            const yEl = document.getElementById('autoplan-year');
            if (mEl) mEl.value = autoPlanCalDate.getMonth() + 1;
            if (yEl) yEl.value = autoPlanCalDate.getFullYear();
            updateAutoPlanPreview(true);
        };

        window.onAutoPlanParamChange = function() {
            const mEl = document.getElementById('autoplan-month');
            const yEl = document.getElementById('autoplan-year');
            if (mEl && yEl) {
                autoPlanCalDate = new Date(parseInt(yEl.value) || 2026, (parseInt(mEl.value) || 1) - 1, 1);
            }
            updateAutoPlanPreview(true);
        };

        function updateAutoPlanPreview(shouldRecord = true) {
            const mEl = document.getElementById('autoplan-month');
            const yEl = document.getElementById('autoplan-year');
            const txtEl = document.getElementById('autoplan-range-text');
            const badgeEl = document.getElementById('autoplan-days-count-badge');
            if (!mEl || !yEl) return;

            const m = parseInt(mEl.value) || (new Date().getMonth() + 1);
            const y = parseInt(yEl.value) || new Date().getFullYear();
            const period = state.selected_period_months || 1;

            const startDay = 1;
            const startM = m;
            const startY = y;

            const startDateObj = new Date(startY, startM - 1, startDay);
            const endTotalM = startM + period - 1;
            const endY = startY + Math.floor((endTotalM - 1) / 12);
            const endM = ((endTotalM - 1) % 12) + 1;
            const lastDay = new Date(endY, endM, 0).getDate();
            const endDateObj = new Date(endY, endM - 1, lastDay);

            const pad = (n) => String(n).padStart(2, '0');
            if (txtEl) {
                txtEl.textContent = `${pad(startDay)}.${pad(startM)}.${startY} – ${pad(lastDay)}.${pad(endM)}.${endY}`;
            }

            // Obliczenie aktywnych dni roboczych
            const weekendsEl = document.getElementById('auto-include-weekends');
            const includeWeekends = Boolean(weekendsEl && weekendsEl.checked);
            let activeDaysCount = 0;
            let cur = new Date(startDateObj);
            while (cur <= endDateObj) {
                const dayOfWeek = cur.getDay(); // 0 is Sun, 6 is Sat
                const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
                if (!isWeekend || includeWeekends) {
                    activeDaysCount++;
                }
                cur.setDate(cur.getDate() + 1);
            }
            if (badgeEl) {
                badgeEl.textContent = `${activeDaysCount} dni ${includeWeekends ? 'planowanych' : 'roboczych'}`;
            }

            // Renderowanie mini kalendarza
            renderAutoPlanMiniCalendar(startDateObj, endDateObj, includeWeekends);

            if (shouldRecord) {
                recordAutoPlanState();
            }
        }

        function renderAutoPlanMiniCalendar(rangeStart, rangeEnd, includeWeekends) {
            const grid = document.getElementById('autoplan-mini-calendar-grid');
            const titleEl = document.getElementById('autoplan-cal-month-title');
            if (!grid) return;

            const year = autoPlanCalDate.getFullYear();
            const month = autoPlanCalDate.getMonth();
            const monthNames = ["Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec", "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień"];
            if (titleEl) {
                titleEl.textContent = `${monthNames[month]} ${year}`;
            }

            const firstDay = new Date(year, month, 1);
            const lastDay = new Date(year, month + 1, 0);
            let startDayIdx = firstDay.getDay() - 1;
            if (startDayIdx === -1) startDayIdx = 6; // Pn = 0, Nd = 6

            grid.innerHTML = "";
            for (let i = 0; i < startDayIdx; i++) {
                grid.innerHTML += `<div class="p-1"></div>`;
            }

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            for (let day = 1; day <= lastDay.getDate(); day++) {
                const thisDate = new Date(year, month, day);
                thisDate.setHours(0, 0, 0, 0);
                const dayOfWeek = thisDate.getDay();
                const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
                const isPast = (thisDate < today);

                const inRange = (rangeStart && rangeEnd && thisDate >= rangeStart && thisDate <= rangeEnd);

                let cellClass = "p-1 rounded text-[9.5px] font-bold transition-all ";
                let titleAttr = `${day} ${monthNames[month]} ${year}`;

                if (inRange) {
                    if (isWeekend && !includeWeekends) {
                        cellClass += "bg-slate-900 text-amber-500/60 border border-dashed border-amber-500/30 opacity-60 ";
                        titleAttr += " (Weekend – pomijany)";
                    } else {
                        cellClass += "bg-gradient-to-br from-purple-600 to-indigo-600 text-white font-black shadow-md ring-1 ring-purple-400 scale-[1.03] ";
                        titleAttr += " (Planowany audyt)";
                    }
                } else if (isPast) {
                    cellClass += "bg-slate-950/40 text-slate-600 opacity-40 ";
                    titleAttr += " (Data miniona)";
                } else {
                    cellClass += isWeekend ? "bg-slate-950 text-slate-500 " : "bg-slate-900 text-slate-300 hover:bg-slate-800 ";
                }

                grid.innerHTML += `<div class="${cellClass}" title="${titleAttr}">${day}</div>`;
            }
        }

        async function openAutoPlanModal() { 
            const dock = document.getElementById('bottom-dock');
            if (dock) dock.classList.add('hidden');
            document.getElementById('modal-autoplan').classList.remove('hidden'); 
            const targetDate = (currentCalDate instanceof Date && !isNaN(currentCalDate.getTime())) ? currentCalDate : new Date();
            const targetMonth = targetDate.getMonth() + 1;
            const targetYear = targetDate.getFullYear();
            const mEl = document.getElementById('autoplan-month');
            const yEl = document.getElementById('autoplan-year');
            if (mEl) mEl.value = targetMonth;
            if (yEl) yEl.value = targetYear;
            autoPlanCalDate = new Date(targetYear, targetMonth - 1, 1);

            const autoLines = document.getElementById('autoplan-lines-container');
            if (!autoLines || autoLines.children.length === 0) {
                await loadProductionLines();
            }

            const btn1 = document.querySelector('.btn-period');
            setPlanPeriod(1, btn1);

            autoPlanHistory = [];
            autoPlanHistoryIndex = -1;
            updateAutoPlanPreview(true);
        }

        function closeAutoPlanModal() { 
            document.getElementById('modal-autoplan').classList.add('hidden'); 
            const dock = document.getElementById('bottom-dock');
            if (dock && state.role) dock.classList.remove('hidden');
        }

        function setPlanPeriod(m, btn) {
            state.selected_period_months = m;
            document.querySelectorAll('.btn-period').forEach(b => {
                b.classList.remove('tile-selected', 'bg-purple-600', 'text-white', 'border-purple-400');
                b.classList.add('bg-slate-800', 'text-slate-300');
            });
            if (btn) {
                btn.classList.remove('bg-slate-800', 'text-slate-300');
                btn.classList.add('tile-selected', 'bg-purple-600', 'text-white', 'border-purple-400');
            }
            const label = m === 1 ? '1 miesiąc' : (m < 5 ? `${m} miesiące` : `${m} miesięcy`);
            const runBtn = document.getElementById('btn-run-auto-schedule');
            if (runBtn) {
                runBtn.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles text-amber-300 mr-1.5"></i><span>Generuj audyty na ${label}</span>`;
            }
            const clearBtnText = document.getElementById('btn-clear-auto-schedule-text');
            if (clearBtnText) {
                clearBtnText.textContent = m === 1 ? 'Wyczyść 1 miesiąc' : `Wyczyść ${label}`;
            }
            updateAutoPlanPreview(true);
        }

        async function runAutoSchedule() {
            const btn = document.getElementById('btn-run-auto-schedule');
            const origHtml = btn ? btn.innerHTML : '';

            const lines = [];
            document.querySelectorAll('.auto-line-chk:checked').forEach(c => lines.push(c.value));
            if (!lines.length) return alert("Wybierz przynajmniej jedną linię produkcyjną!");

            const types = [];
            if (document.getElementById('auto-type-haccp').checked) types.push('HACCP');
            if (document.getElementById('auto-type-gmp').checked) types.push('GMP');
            if (document.getElementById('auto-type-ghp').checked) types.push('GHP');
            if (!types.length) return alert("Wybierz przynajmniej jeden typ audytu (HACCP, GMP, GHP)!");

            const payload = {
                start_year: parseInt(document.getElementById('autoplan-year').value) || new Date().getFullYear(),
                start_month: parseInt(document.getElementById('autoplan-month').value) || (new Date().getMonth() + 1),
                start_day: 1,
                period_months: state.selected_period_months || 1,
                lines: lines,
                audit_types: types,
                include_weekends: document.getElementById('auto-include-weekends').checked
            };

            try {
                if (btn) {
                    btn.disabled = true;
                    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generowanie audytów...';
                }

                const res = await apiFetch('/api/schedule/auto', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (res.ok) {
                    const d = await res.json();
                    alert(`Pomyślnie wygenerowano plan audytów: ${d.count} audytów w zakresie ${d.start_date} – ${d.end_date}.`);
                    closeAutoPlanModal();
                    currentCalDate = new Date(payload.start_year, payload.start_month - 1, 1);
                    showModule('calendar');
                    await loadScheduleAndRender();
                } else {
                    const errData = await res.json().catch(() => ({}));
                    alert(`Błąd generowania harmonogramu: ${errData.detail || 'Wystąpił błąd podczas generowania audytów.'}`);
                }
            } catch (err) {
                console.error("Auto plan error:", err);
                alert("Błąd połączenia z serwerem podczas generowania harmonogramu.");
            } finally {
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = origHtml;
                }
            }
        }

        let activeManagerResultsTab = 'pending'; // 'pending' (oczekujące), 'approved' (zatwierdzone <5 dni), 'rejected' (odrzucone), 'history' (starsze >5 dni)
        let cachedManagerAudits = [];
        let cachedManagerNotes = [];
        let activeNotesFilter = 'all';

        window.setManagerResultsTab = function(tab) {
            activeManagerResultsTab = tab;
            const btnPending = document.getElementById('tab-btn-manager-pending');
            const btnApproved = document.getElementById('tab-btn-manager-approved');
            const btnRejected = document.getElementById('tab-btn-manager-rejected');
            const btnHistory = document.getElementById('tab-btn-manager-history');

            const inactiveClass = 'px-3 py-1.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-800/80 flex items-center gap-1.5 transition cursor-pointer';
            if (btnPending) btnPending.className = inactiveClass;
            if (btnApproved) btnApproved.className = inactiveClass;
            if (btnRejected) btnRejected.className = inactiveClass;
            if (btnHistory) btnHistory.className = inactiveClass;

            if (tab === 'pending') {
                if (btnPending) {
                    btnPending.className = 'px-3 py-1.5 rounded-xl text-xs font-black bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 flex items-center gap-1.5 transition cursor-pointer';
                }
            } else if (tab === 'approved') {
                if (btnApproved) {
                    btnApproved.className = 'px-3 py-1.5 rounded-xl text-xs font-black bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20 flex items-center gap-1.5 transition cursor-pointer';
                }
            } else if (tab === 'rejected') {
                if (btnRejected) {
                    btnRejected.className = 'px-3 py-1.5 rounded-xl text-xs font-black bg-rose-500 text-white shadow-md shadow-rose-500/20 flex items-center gap-1.5 transition cursor-pointer';
                }
            } else if (tab === 'history') {
                if (btnHistory) {
                    btnHistory.className = 'px-3 py-1.5 rounded-xl text-xs font-black bg-sky-500 text-slate-950 shadow-md shadow-sky-500/20 flex items-center gap-1.5 transition cursor-pointer';
                }
            }

            renderManagerAuditsTable();
        };
        window.showManagerTab = window.setManagerResultsTab;

        function formatAuditorInitials(auditor) {
            if (!auditor) return "—";
            const clean = String(auditor).replace(/\s*\(.*?\)/g, "").trim();
            if (!clean) return "—";
            if (clean.toLowerCase().includes("administrator") || clean.toLowerCase() === "admin") return "Admin";
            
            const parts = clean.split(/\s+/).filter(Boolean);
            if (parts.length === 0) return "—";
            if (parts.length === 1) {
                return parts[0].length > 3 ? `${parts[0].substring(0, 3)}...` : parts[0];
            }
            
            const firstInitial = parts[0].charAt(0).toUpperCase() + '.';
            const lastName = parts[parts.length - 1];
            const surLetters = lastName.substring(0, 3);
            return `${firstInitial} ${surLetters}...`;
        }

        window.openAuditorNotesInbox = function(filter = 'all') {
            showModule('manager-notes');
            window.filterAuditorNotesInbox(filter);
        };

        window.filterAuditorNotesInbox = function(filter = 'all') {
            activeNotesFilter = filter;
            const btnAll = document.getElementById('filter-inbox-all');
            const btnUnread = document.getElementById('filter-inbox-unread');
            const btnHold = document.getElementById('filter-inbox-hold');
            const btnWarn = document.getElementById('filter-inbox-warning');
            const btnInfo = document.getElementById('filter-inbox-info');
            const btnAnon = document.getElementById('filter-inbox-anon');

            const inactive = 'px-2.5 py-1 rounded-lg text-[10px] font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer';
            if (btnAll) btnAll.className = inactive;
            if (btnUnread) btnUnread.className = inactive;
            if (btnHold) btnHold.className = inactive;
            if (btnWarn) btnWarn.className = inactive;
            if (btnInfo) btnInfo.className = inactive;
            if (btnAnon) btnAnon.className = inactive + ' ml-auto';

            const activeClass = (color) => `px-2.5 py-1 rounded-lg text-[10px] font-black ${color} shadow-sm transition cursor-pointer`;
            if (filter === 'all' && btnAll) btnAll.className = activeClass('bg-slate-800 text-white border border-slate-700');
            if (filter === 'unread' && btnUnread) btnUnread.className = activeClass('bg-amber-500 text-slate-950 border border-amber-300');
            if (filter === 'HOLD' && btnHold) btnHold.className = activeClass('bg-rose-500 text-white border border-rose-400');
            if (filter === 'WARNING' && btnWarn) btnWarn.className = activeClass('bg-amber-500/30 text-amber-300 border border-amber-400/50');
            if (filter === 'INFO' && btnInfo) btnInfo.className = activeClass('bg-cyan-500/30 text-cyan-300 border border-cyan-400/50');
            if (filter === 'ANON' && btnAnon) btnAnon.className = activeClass('bg-purple-900/60 text-purple-300 border border-purple-400/50 ml-auto');

            renderManagerNotesView();
        };

        window.markAllAuditorNotesAsRead = async function() {
            if (!confirm('Czy na pewno chcesz oznaczyć wszystkie notatki jako przeczytane?')) return;
            try {
                const res = await fetch('/api/auditor-notes/mark-all-read', { method: 'POST' });
                if (res.ok) {
                    await loadManagerAuditorNotes();
                }
            } catch(e) {
                console.error("Błąd oznaczania wszystkich notatek:", e);
            }
        };

        function renderManagerNotesView() {
            const tbody = document.getElementById('inbox-notes-table');
            if (!tbody) return;

            const notes = Array.isArray(cachedManagerNotes) ? cachedManagerNotes : [];
            const unreadCount = notes.filter(n => !n.is_read).length;
            const holdCount = notes.filter(n => n.priority === 'HOLD').length;
            const warnCount = notes.filter(n => n.priority === 'WARNING').length;
            const infoCount = notes.filter(n => n.priority === 'INFO').length;
            const anonCount = notes.filter(n => n.auditor_name && (n.auditor_name.includes('Anonimow') || n.auditor_name.includes('Poufne'))).length;

            const cAll = document.getElementById('inbox-count-all');
            const cUnread = document.getElementById('inbox-count-unread');
            const cHold = document.getElementById('inbox-count-hold');
            const cWarn = document.getElementById('inbox-count-warning');
            const cInfo = document.getElementById('inbox-count-info');
            const cAnon = document.getElementById('inbox-count-anon');
            const headerBadge = document.getElementById('inbox-header-badge');

            if (cAll) cAll.textContent = notes.length;
            if (cUnread) cUnread.textContent = unreadCount;
            if (cHold) cHold.textContent = holdCount;
            if (cWarn) cWarn.textContent = warnCount;
            if (cInfo) cInfo.textContent = infoCount;
            if (cAnon) cAnon.textContent = anonCount;

            if (headerBadge) {
                headerBadge.textContent = unreadCount > 0 ? `${unreadCount} NOWYCH` : '0 NOWYCH';
                headerBadge.className = unreadCount > 0 
                    ? 'text-[8px] font-black bg-amber-500 text-slate-950 px-2 py-0.5 rounded-full border border-amber-300 animate-pulse'
                    : 'text-[8px] font-black bg-slate-900 text-slate-400 px-2 py-0.5 rounded-full border border-slate-700';
            }

            let filtered = notes;
            if (activeNotesFilter === 'unread') filtered = notes.filter(n => !n.is_read);
            else if (activeNotesFilter === 'HOLD') filtered = notes.filter(n => n.priority === 'HOLD');
            else if (activeNotesFilter === 'WARNING') filtered = notes.filter(n => n.priority === 'WARNING');
            else if (activeNotesFilter === 'INFO') filtered = notes.filter(n => n.priority === 'INFO');
            else if (activeNotesFilter === 'ANON') filtered = notes.filter(n => n.auditor_name && (n.auditor_name.includes('Anonimow') || n.auditor_name.includes('Poufne')));

            tbody.innerHTML = '';
            if (filtered.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="py-8 text-center text-xs text-slate-400 italic">Brak wiadomości spełniających kryteria wybranego filtra.</td></tr>';
                return;
            }

            filtered.forEach(n => {
                const isUnread = !n.is_read;
                const prioBadge = n.priority === 'HOLD' 
                    ? `<span class="bg-rose-500/20 text-rose-400 border border-rose-500/40 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider inline-flex items-center gap-1.5 shadow-sm">
                         <svg class="w-3 h-3 text-rose-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                         <span>Wstrzymanie (HOLD)</span>
                       </span>`
                    : n.priority === 'WARNING'
                    ? `<span class="bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider inline-flex items-center gap-1.5 shadow-sm">
                         <svg class="w-3 h-3 text-amber-300 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m13 7-3 5h4l-2 5"/></svg>
                         <span>Odchylenie (Uwaga)</span>
                       </span>`
                    : `<span class="bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider inline-flex items-center gap-1.5 shadow-sm">
                         <svg class="w-3 h-3 text-cyan-300 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1.5" ry="1.5"/><path d="m9 14 2 2 4-4"/></svg>
                         <span>Rutynowa (Info)</span>
                       </span>`;

                const readBtn = isUnread 
                    ? `<button onclick="markAuditorNoteAsRead(${n.id})" class="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-[9px] rounded-lg transition active:scale-95 shadow cursor-pointer whitespace-nowrap inline-flex items-center gap-1"><i class="fas fa-check"></i><span>Oznacz przeczytane</span></button>`
                    : `<span class="text-[9px] text-slate-500 italic">Przeczytano (${n.read_at ? n.read_at.substring(11, 16) : '—'})</span>`;

                const replyBtn = `<button onclick="openManagerReplyModal(${n.id})" class="px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-[9px] rounded-lg transition active:scale-95 shadow cursor-pointer whitespace-nowrap ml-1.5"><i class="fas fa-reply mr-1"></i>Odpowiedz</button>`;

                const rowBg = isUnread ? 'bg-amber-950/25 border-l-2 border-l-amber-400 font-semibold' : 'hover:bg-slate-900/50';

                const isAnon = (n.auditor_name && (n.auditor_name.includes('Anonimow') || n.auditor_name.includes('Poufne')));
                const auditorDisplay = isAnon 
                    ? '<span class="inline-flex items-center gap-1 text-amber-300 bg-amber-950/70 px-2 py-0.5 rounded-lg border border-amber-500/40 text-[9.5px] font-black"><i class="fas fa-user-secret text-amber-400"></i> Poufne (IFS Culture)</span>'
                    : `<span class="text-white font-bold">${n.auditor_name || 'Audytor'}</span>`;

                const responseBox = n.manager_response ? `
                    <div class="mt-1.5 p-2 rounded-lg bg-cyan-950/40 border border-cyan-500/30 text-[11px] text-cyan-200">
                        <div class="flex items-center gap-1.5 text-[9.5px] font-black text-cyan-400 mb-0.5">
                            <i class="fas fa-reply"></i>
                            <span>Odpowiedź Key Usera (${n.manager_response_at ? n.manager_response_at.substring(0, 16) : ''}):</span>
                        </div>
                        <div class="italic">${n.manager_response}</div>
                    </div>` : '';

                tbody.innerHTML += `
                <tr class="border-b border-slate-800/80 text-xs ${rowBg} transition">
                    <td class="p-2.5 text-slate-400 font-mono text-[10px] whitespace-nowrap">${n.timestamp ? n.timestamp.substring(0, 16) : '—'}</td>
                    <td class="p-2.5 whitespace-nowrap">${auditorDisplay}</td>
                    <td class="p-2.5 text-cyan-300 font-bold whitespace-nowrap">${n.line_name || 'Ogólna / Cała Hala'}</td>
                    <td class="p-2.5 whitespace-nowrap">${prioBadge}</td>
                    <td class="p-2.5 text-slate-200 font-medium break-words max-w-md">
                        <div>${n.content}</div>
                        ${responseBox}
                    </td>
                    <td class="p-2.5 text-right whitespace-nowrap">${readBtn}${replyBtn}</td>
                </tr>`;
            });
        }

        async function loadManagerAuditorNotes() {
            try {
                const res = await fetch('/api/auditor-notes?limit=100');
                if (!res.ok) return;
                cachedManagerNotes = await res.json();
                
                const unread = Array.isArray(cachedManagerNotes) ? cachedManagerNotes.filter(n => !n.is_read).length : 0;
                
                // Kafel 8 na pulpicie Key Usera:
                const hubBadge = document.getElementById('badge-hub-notes-unread');
                const hubPing = document.getElementById('hub-notes-ping');
                const hubCounterPill = document.getElementById('hub-notes-counter-pill');

                if (hubBadge) {
                    hubBadge.textContent = unread > 0 ? `${unread} NOWE` : '0 NOWYCH';
                    if (unread > 0) {
                        hubBadge.className = 'text-[8px] font-black bg-amber-500 text-slate-950 px-2 py-0.5 rounded-full border border-amber-300 animate-pulse';
                    } else {
                        hubBadge.className = 'text-[8px] font-black bg-slate-900 text-slate-400 px-2 py-0.5 rounded-full border border-slate-700';
                    }
                }
                if (hubPing) {
                    hubPing.style.display = unread > 0 ? 'inline-flex' : 'none';
                }
                if (hubCounterPill) {
                    hubCounterPill.textContent = `${cachedManagerNotes.length} notatek (${unread} nowych)`;
                }

                renderManagerNotesView();
            } catch(e) {
                console.warn("Błąd ładowania notatek audytorów:", e);
            }
        }

        window.markAuditorNoteAsRead = async function(noteId) {
            try {
                const res = await fetch(`/api/auditor-notes/${noteId}/read`, { method: 'PATCH' });
                if (res.ok) {
                    await loadManagerAuditorNotes();
                }
            } catch(e) {
                console.error("Błąd oznaczania notatki jako przeczytana:", e);
            }
        };

        let activeReplyNoteId = null;

        window.openManagerReplyModal = function(noteId) {
            activeReplyNoteId = noteId;
            const note = Array.isArray(cachedManagerNotes) ? cachedManagerNotes.find(n => n.id === noteId) : null;
            const modal = document.getElementById('modal-manager-reply-note');
            if (!modal) return;

            const audEl = document.getElementById('mgr-reply-auditor');
            const tsEl = document.getElementById('mgr-reply-timestamp');
            const lineEl = document.getElementById('mgr-reply-line');
            const origEl = document.getElementById('mgr-reply-original');
            const textEl = document.getElementById('mgr-reply-text');

            if (note) {
                if (audEl) audEl.textContent = note.auditor_name || 'Audytor';
                if (tsEl) tsEl.textContent = note.timestamp ? note.timestamp.substring(0, 16) : '';
                if (lineEl) lineEl.textContent = `Linia: ${note.line_name || 'Ogólna / Cała Hala'}`;
                if (origEl) origEl.textContent = note.content || '';
                if (textEl) {
                    textEl.value = note.manager_response || '';
                    setTimeout(() => textEl.focus(), 100);
                }
            }
            modal.classList.remove('hidden');
        };

        window.closeManagerReplyModal = function() {
            const modal = document.getElementById('modal-manager-reply-note');
            if (modal) modal.classList.add('hidden');
            activeReplyNoteId = null;
        };

        window.submitManagerReply = async function() {
            if (!activeReplyNoteId) return;
            const textEl = document.getElementById('mgr-reply-text');
            const btn = document.getElementById('btn-submit-mgr-reply');
            if (!textEl || !textEl.value.trim()) {
                alert("Wpisz treść odpowiedzi dla audytora.");
                return;
            }

            if (btn) {
                btn.disabled = true;
                btn.textContent = "Wysyłanie...";
            }

            try {
                const res = await fetch(`/api/auditor-notes/${activeReplyNoteId}/reply`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        manager_response: textEl.value.trim(),
                        manager_name: state.auditor_id || state.auditor || 'Key User (Manager)'
                    })
                });
                if (res.ok) {
                    closeManagerReplyModal();
                    await loadManagerAuditorNotes();
                } else {
                    const err = await res.json();
                    alert(err.detail || "Błąd wysyłania odpowiedzi.");
                }
            } catch(e) {
                console.error("Błąd wysyłania odpowiedzi menedżera:", e);
                alert("Błąd połączenia z serwerem.");
            } finally {
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = "Wyślij odpowiedź";
                }
            }
        };

        function renderManagerAuditsTable() {
            const tbody = document.getElementById('manager-results-table');
            const heading = document.getElementById('manager-audits-heading');
            const badgeCount = document.getElementById('manager-audits-counter-badge');
            if (!tbody) return;

            const now = new Date();
            const fiveDaysAgo = new Date(now.getTime() - (5 * 24 * 60 * 60 * 1000));

            const pendingAudits = [];
            const approvedAudits = [];
            const rejectedAudits = [];
            const historyAudits = [];

            cachedManagerAudits.forEach(a => {
                const cv = String(a.compliance_verdict || '').trim().toUpperCase();
                const ps = String(a.process_status || '').trim().toUpperCase();
                const isApproved = (cv === 'ZATWIERDZONY' || ps === 'ZATWIERDZONY');
                const isRejected = (cv === 'ODRZUCONY' || ps === 'ODRZUCONY');

                const auditDate = parseAuditDate(a.timestamp);
                const isOlderThan5Days = Boolean(auditDate && !isNaN(auditDate.getTime()) && (auditDate < fiveDaysAgo));

                if (isApproved) {
                    if (isOlderThan5Days) {
                        historyAudits.push(a);
                    } else {
                        approvedAudits.push(a);
                    }
                } else if (isRejected) {
                    rejectedAudits.push(a);
                } else {
                    pendingAudits.push(a);
                }
            });

            // Aktualizacja łącznych liczników zakładek
            const badgePending = document.getElementById('badge-count-manager-pending');
            const badgeApproved = document.getElementById('badge-count-manager-approved');
            const badgeRejected = document.getElementById('badge-count-manager-rejected');
            const badgeHistory = document.getElementById('badge-count-manager-history');
            if (badgePending) badgePending.textContent = pendingAudits.length;
            if (badgeApproved) badgeApproved.textContent = approvedAudits.length;
            if (badgeRejected) badgeRejected.textContent = rejectedAudits.length;
            if (badgeHistory) badgeHistory.textContent = historyAudits.length;

            let displayAudits = pendingAudits;
            if (activeManagerResultsTab === 'approved') {
                displayAudits = approvedAudits;
            } else if (activeManagerResultsTab === 'rejected') {
                displayAudits = rejectedAudits;
            } else if (activeManagerResultsTab === 'history') {
                displayAudits = historyAudits;
            }

            if (heading) {
                if (activeManagerResultsTab === 'approved') {
                    heading.textContent = 'Zatwierdzone audyty jakości (bieżące, ostatnie 5 dni):';
                    heading.className = 'text-[10px] font-black text-emerald-400 uppercase tracking-wider';
                } else if (activeManagerResultsTab === 'rejected') {
                    heading.textContent = 'Odrzucone audyty jakości:';
                    heading.className = 'text-[10px] font-black text-rose-400 uppercase tracking-wider';
                } else if (activeManagerResultsTab === 'history') {
                    heading.textContent = 'Archiwum i historia zatwierdzonych audytów (>5 dni):';
                    heading.className = 'text-[10px] font-black text-sky-400 uppercase tracking-wider';
                } else {
                    heading.textContent = 'Oczekujące audyty (wymagające decyzji):';
                    heading.className = 'text-[10px] font-black text-amber-400 uppercase tracking-wider';
                }
            }

            if (badgeCount) {
                badgeCount.textContent = `${displayAudits.length} audytów`;
            }

            tbody.innerHTML = '';
            if (displayAudits.length === 0) {
                if (activeManagerResultsTab === 'history') {
                    tbody.innerHTML = '<tr><td colspan="8" class="py-6 text-center text-xs text-slate-500 italic">Brak starszych audytów w historii (>5 dni). Wszystkie zatwierdzone audyty starsze niż 5 dni pojawią się tutaj automatycznie.</td></tr>';
                } else if (activeManagerResultsTab === 'approved') {
                    tbody.innerHTML = '<tr><td colspan="8" class="py-6 text-center text-xs text-slate-500 italic">Brak bieżących zatwierdzonych audytów z ostatnich 5 dni. Starsze zatwierdzone audyty znajdziesz w zakładce „Historia audytów (>5 dni)”.</td></tr>';
                } else if (activeManagerResultsTab === 'rejected') {
                    tbody.innerHTML = '<tr><td colspan="8" class="py-6 text-center text-xs text-slate-500 italic">Brak odrzuconych audytów. Wszystkie niezaakceptowane audyty pojawią się tutaj.</td></tr>';
                } else {
                    tbody.innerHTML = '<tr><td colspan="8" class="py-6 text-center text-xs text-emerald-400 font-bold flex items-center justify-center gap-1.5"><i class="fas fa-circle-check text-emerald-400"></i><span>Brak oczekujących audytów! Wszystkie bieżące wpisy zostały sprawdzone.</span></td></tr>';
                }
                return;
            }

            displayAudits.forEach(a => {
                const slmColor = a.slm_verdict === 'OK' ? 'text-emerald-400' : 'text-red-400 font-bold';
                const statusColor = a.record_status === 'ZABLOKOWANY' ? 'text-amber-400' : 'text-emerald-400';
                const cv = String(a.compliance_verdict || '').trim().toUpperCase();
                const ps = String(a.process_status || '').trim().toUpperCase();
                const isApproved = (cv === 'ZATWIERDZONY' || ps === 'ZATWIERDZONY');
                const isRejected = (cv === 'ODRZUCONY' || ps === 'ODRZUCONY');
                const isFinished = (isApproved || isRejected);

                const actionsHtml = isFinished 
                    ? (isApproved 
                        ? `<span class="text-emerald-400 font-bold mr-1.5 text-[9px] bg-emerald-950/80 border border-emerald-500/50 px-2 py-0.5 rounded inline-flex items-center gap-1">
                             <i class="fas fa-check-circle text-[8px]"></i> Zatwierdzony
                           </span>` 
                        : `<span class="text-rose-400 font-bold mr-1.5 text-[9px] bg-rose-950/80 border border-rose-500/50 px-2 py-0.5 rounded inline-flex items-center gap-1">
                             <i class="fas fa-times-circle text-[8px]"></i> Odrzucony
                           </span>`)
                    : `
                        <button onclick="handleAuditAction('approve', ${a.id})" class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[9px] font-black cursor-pointer shadow-sm transition active:scale-95">Zatwierdź</button>
                        <button onclick="handleAuditAction('reject', ${a.id})" class="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-[9px] font-black cursor-pointer shadow-sm transition active:scale-95">Odrzuć</button>
                      `;

                const audName = formatAuditorInitials(a.auditor_id);
                const dateShort = a.timestamp ? a.timestamp.substring(5, 16) : 'Brak daty';

                tbody.innerHTML += `
                    <tr class="hover:bg-slate-800/60 transition">
                        <td class="py-2.5 px-3 border-b border-white/5 font-mono text-[10px] text-slate-300">#${a.id}</td>
                        <td class="py-2.5 px-3 border-b border-white/5 text-[9px] text-slate-400 whitespace-nowrap">${dateShort}</td>
                        <td class="py-2.5 px-3 border-b border-white/5 font-bold text-[10px] text-white truncate max-w-[200px]" title="${a.line}">${a.line}</td>
                        <td class="py-2.5 px-3 border-b border-white/5 text-[10px] text-slate-300 whitespace-nowrap font-medium">${a.shift || '—'}</td>
                        <td class="py-2.5 px-3 border-b border-white/5 text-[9px] text-slate-400 whitespace-nowrap font-semibold" title="${a.auditor_id || 'Audytor'}">${audName}</td>
                        <td id="status-${a.id}" class="py-2.5 px-3 border-b border-white/5 text-[8px] font-black whitespace-nowrap ${statusColor}">
                            ${a.record_status}${isApproved ? ' <span class="text-emerald-400"><i class="fas fa-check text-[9px]"></i></span>' : isRejected ? ' <span class="text-rose-500"><i class="fas fa-xmark text-[9px]"></i></span>' : ''}
                        </td>
                        <td class="py-2.5 px-3 border-b border-white/5 ${slmColor} text-[9px] whitespace-nowrap">${a.slm_verdict} <span class="text-[8px] text-slate-400">(${a.risk_level})</span></td>
                        <td class="py-2.5 px-3 border-b border-white/5 text-right whitespace-nowrap">
                            <div id="actions-${a.id}" class="flex items-center justify-end gap-1">
                                ${actionsHtml}
                                <button onclick="handleAuditAction('details', ${a.id})" class="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-[8px] font-semibold cursor-pointer">Szczegóły</button>
                            </div>
                        </td>
                    </tr>
                `;
            });
        }

        async function loadAuditResults() {
            const tbody = document.getElementById('manager-results-table');
            if (tbody && cachedManagerAudits.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" class="py-4 text-center text-xs text-slate-400 animate-pulse">Ładowanie audytów...</td></tr>';
            }
            try {
                const res = await apiFetch(`/api/audits?limit=300`);
                if (!res.ok) return;
                const data = await res.json();
                cachedManagerAudits = Array.isArray(data) ? data : [];
                renderManagerAuditsTable();
                await loadManagerAuditorNotes();
            } catch(e) { 
                console.error(e); 
                if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="py-4 text-center text-xs text-rose-400">Błąd ładowania danych audytów.</td></tr>';
            }
        }

        async function loadManagerEditRequests() {
            // Wycofano kontener wniosków zgodnie z prośbą użytkownika
        }

        async function decideEditRequest(requestId, decision) {
            const comment = prompt(`Komentarz do decyzji (${decision}):`) || "";
            const res = await apiFetch(`/api/audits/decide-edit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ request_id: requestId, decision, manager_comment: comment })
            });
            if (res.ok) {
                alert(`Decyzja zapisana: ${decision}`);
                await loadManagerEditRequests();
                await loadAuditResults();
            } else {
                alert("Błąd podczas zapisywania decyzji.");
            }
        }

        let activeAuditorHistoryTab = 'pending'; // 'pending' (oczekujące <5 dni), 'completed' (wykonane <5 dni), 'approved' (zaakceptowane <5 dni), 'history' (starsze >5 dni)

        window.setAuditorHistoryTab = function(tab) {
            if (tab === 'recent') tab = 'pending';
            if (tab === 'archive') tab = 'history';
            activeAuditorHistoryTab = tab;

            const btnPending = document.getElementById('tab-btn-auditor-pending') || document.getElementById('tab-btn-auditor-recent');
            const btnCompleted = document.getElementById('tab-btn-auditor-completed');
            const btnApproved = document.getElementById('tab-btn-auditor-approved');
            const btnHistory = document.getElementById('tab-btn-auditor-history') || document.getElementById('tab-btn-auditor-archive');

            const inactiveClass = 'px-3.5 py-1.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-800/80 flex items-center gap-1.5 transition cursor-pointer';

            if (btnPending) btnPending.className = inactiveClass;
            if (btnCompleted) btnCompleted.className = inactiveClass;
            if (btnApproved) btnApproved.className = inactiveClass;
            if (btnHistory) btnHistory.className = inactiveClass;

            if (tab === 'pending') {
                if (btnPending) {
                    btnPending.className = 'px-3.5 py-1.5 rounded-xl text-xs font-black bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 flex items-center gap-1.5 transition cursor-pointer';
                }
            } else if (tab === 'completed') {
                if (btnCompleted) {
                    btnCompleted.className = 'px-3.5 py-1.5 rounded-xl text-xs font-black bg-blue-500 text-slate-950 shadow-md shadow-blue-500/20 flex items-center gap-1.5 transition cursor-pointer';
                }
            } else if (tab === 'approved') {
                if (btnApproved) {
                    btnApproved.className = 'px-3.5 py-1.5 rounded-xl text-xs font-black bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20 flex items-center gap-1.5 transition cursor-pointer';
                }
            } else if (tab === 'history') {
                if (btnHistory) {
                    btnHistory.className = 'px-3.5 py-1.5 rounded-xl text-xs font-black bg-sky-500 text-slate-950 shadow-md shadow-sky-500/20 flex items-center gap-1.5 transition cursor-pointer';
                }
            }
            loadAuditorHistory();
        };

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
                    return String(a.auditor_id || '').trim().toLowerCase() === String(state.auditor_id || '').trim().toLowerCase();
                });

                // REGUŁA PODZIAŁU AUDYTÓW (IFS FOOD V8):
                // 1. Audyty starsze niż 5 dni automatycznie wpadają do zakładki „Historia audytów (>5 dni)”.
                // 2. Wszystkie wykonane audyty z bieżącego tygodnia trafiają do „Audyty wykonane”.
                // 3. Audyty zaakceptowane przez Key Usera (ZATWIERDZONY) trafiają do „Zaakceptowane”.
                // 4. W widoku głównym („Oczekujące na akceptację”) pozostają tylko bieżące wpisy oczekujące na decyzję!
                const now = new Date();
                const fiveDaysAgo = new Date(now.getTime() - (5 * 24 * 60 * 60 * 1000));

                const pendingAudits = [];
                const completedAudits = [];
                const approvedAudits = [];
                const historyAudits = [];

                myAudits.forEach(a => {
                    const cv = String(a.compliance_verdict || '').trim().toUpperCase();
                    const ps = String(a.process_status || '').trim().toUpperCase();
                    const isApproved = (cv === 'ZATWIERDZONY' || ps === 'ZATWIERDZONY');

                    const auditDate = parseAuditDate(a.timestamp);
                    const isOlderThan5Days = Boolean(auditDate && !isNaN(auditDate.getTime()) && (auditDate < fiveDaysAgo));

                    if (isOlderThan5Days) {
                        historyAudits.push(a);
                    } else {
                        // Bieżący tydzień (<5 dni):
                        completedAudits.push(a); // Każdy zrealizowany bieżący audyt jest w wykonanych
                        if (isApproved) {
                            approvedAudits.push(a); // Po zatwierdzeniu przez Key Usera automatycznie wpada do Zaakceptowane
                        } else {
                            pendingAudits.push(a); // Dopóki nie zaakceptowany, oczekuje na decyzję
                        }
                    }
                });

                // Aktualizacja liczników na 4 zakładkach
                const badgePending = document.getElementById('badge-count-auditor-pending') || document.getElementById('badge-count-auditor-recent');
                const badgeCompleted = document.getElementById('badge-count-auditor-completed');
                const badgeApproved = document.getElementById('badge-count-auditor-approved');
                const badgeHistory = document.getElementById('badge-count-auditor-history') || document.getElementById('badge-count-auditor-archive');

                if (badgePending) badgePending.textContent = pendingAudits.length;
                if (badgeCompleted) badgeCompleted.textContent = completedAudits.length;
                if (badgeApproved) badgeApproved.textContent = approvedAudits.length;
                if (badgeHistory) badgeHistory.textContent = historyAudits.length;

                let displayAudits = pendingAudits;
                if (activeAuditorHistoryTab === 'completed') {
                    displayAudits = completedAudits;
                } else if (activeAuditorHistoryTab === 'approved') {
                    displayAudits = approvedAudits;
                } else if (activeAuditorHistoryTab === 'history') {
                    displayAudits = historyAudits;
                }

                list.innerHTML = '';
                if (displayAudits.length === 0) {
                    if (activeAuditorHistoryTab === 'history') {
                        list.innerHTML = '<div class="bg-slate-950/60 p-5 rounded-2xl border border-slate-800 text-center space-y-1"><p class="text-xs text-slate-400">Brak starszych audytów w Historii (>5 dni).</p></div>';
                    } else if (activeAuditorHistoryTab === 'approved') {
                        list.innerHTML = '<div class="bg-slate-950/60 p-5 rounded-2xl border border-slate-800 text-center space-y-1"><p class="text-xs text-slate-400">Brak jeszcze zaakceptowanych audytów przez Key Usera w bieżącym tygodniu.</p></div>';
                    } else if (activeAuditorHistoryTab === 'completed') {
                        list.innerHTML = '<div class="bg-slate-950/60 p-5 rounded-2xl border border-slate-800 text-center space-y-1"><p class="text-xs text-slate-400">Brak zrealizowanych audytów w bieżącym tygodniu.</p></div>';
                    } else {
                        list.innerHTML = '<div class="bg-slate-950/60 p-5 rounded-2xl border border-emerald-500/30 text-center space-y-1"><p class="text-xs font-black text-emerald-400 flex items-center justify-center gap-1.5"><svg class="w-4 h-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg><span>Wszystkie bieżące audyty zostały zaakceptowane przez Key Usera!</span></p><p class="text-[11px] text-slate-400">Brak wpisów oczekujących na decyzję. Wszystkie zatwierdzone wpisy znajdziesz w karcie „Zaakceptowane”, a starsze w „Historii audytów”.</p></div>';
                    }
                    return;
                }

                displayAudits.slice(0, 30).forEach((a, idx) => {
                    const auditId = a.id || 0;
                    const lineName = a.line || 'Brak nazwy linii';
                    const dateStr = a.timestamp ? String(a.timestamp).substring(0, 16).replace('T', ' ') : 'Brak daty';
                    const statusText = a.record_status || 'ZABLOKOWANY';
                    const isLocked = statusText !== 'ODBLOKOWANY_DO_KOREKTY';
                    const isOk = String(a.slm_verdict).toUpperCase() === 'OK';
                    const isApproved = (a.compliance_verdict === 'ZATWIERDZONY' || a.process_status === 'ZATWIERDZONY');
                    const scoreRaw = a.total_score_pct != null ? `${parseFloat(a.total_score_pct).toFixed(1)}%` : (a.audit_score != null ? `${a.audit_score} pkt` : '---');
                    const auditNotes = a.notes ? a.notes : null;
                    const riskLevel = a.risk_level || 'NISKIE';
                    const complianceVerdict = a.compliance_verdict || a.slm_verdict || '---';
                    const shiftStr = a.shift || '---';

                    // Parsuj checklist_results jeśli jest stringiem JSON
                    let chSummary = '';
                    if (a.checklist_results) {
                        try {
                            const ch = typeof a.checklist_results === 'string' ? JSON.parse(a.checklist_results) : a.checklist_results;
                            const items = Object.values(ch);
                            const nokItems = items.filter(q => q.status === 'NOK' || (q.score !== undefined && q.score < 5));
                            const notesItems = items.filter(q => q.notes && q.notes.trim());
                            chSummary = `
                                <div class="mt-2 space-y-1">
                                    <div class="text-[10px] font-black text-slate-400 uppercase tracking-wider">Skrót Checklisty (${items.length} pkt)</div>
                                    <div class="flex flex-wrap gap-1.5">
                                        ${items.slice(0, 8).map(q => {
                                            const qNok = q.status === 'NOK' || (q.score !== undefined && q.score < 5);
                                            const score = q.score !== undefined ? `${q.score}/5` : (q.status || '?');
                                            return `<span class="text-[9px] font-bold px-1.5 py-0.5 rounded border ${qNok ? 'bg-rose-950/80 text-rose-300 border-rose-500/30' : 'bg-slate-800/80 text-slate-400 border-slate-700/50'}" title="${q.question || q.clause || ''}">${q.clause || '?'}: ${score}</span>`;
                                        }).join('')}
                                        ${items.length > 8 ? `<span class="text-[9px] text-slate-500 font-medium">+${items.length - 8} więcej</span>` : ''}
                                    </div>
                                    ${nokItems.length > 0 ? `<div class="text-[9px] text-rose-300 font-bold mt-0.5 flex items-center gap-1"><i class="fas fa-triangle-exclamation text-rose-400"></i><span>${nokItems.length} niezgodności</span></div>` : '<div class="text-[9px] text-emerald-400 font-bold mt-0.5 flex items-center gap-1"><i class="fas fa-circle-check text-emerald-400"></i><span>Wszystkie zgodne</span></div>'}
                                    ${notesItems.length > 0 ? `<div class="mt-1 space-y-0.5">${notesItems.slice(0, 3).map(q => `<div class="text-[9px] text-amber-200/80 bg-amber-950/30 rounded px-1.5 py-0.5 border border-amber-700/30 flex items-center gap-1"><i class="fas fa-comment-dots text-amber-400"></i><b>${q.clause || ''}</b>: ${q.notes}</div>`).join('')}</div>` : ''}
                                </div>`;
                        } catch(e) {
                            chSummary = '';
                        }
                    }

                    // Powód blokady
                    let lockReason = '';
                    if (isLocked) {
                        if (isApproved) {
                            lockReason = 'Raport ZATWIERDZONY przez Key Usera (Manager Jakości) — oficjalny rekord IFS Food v8.';
                        } else if (riskLevel.includes('HOLD') || riskLevel.includes('KRYTYCZNE')) {
                            lockReason = 'Zablokowany — wymagana procedura HOLD LOT (poziom ryzyka KRYTYCZNE). Oczekuje interwencji managera.';
                        } else if (complianceVerdict === 'ODRZUCONY') {
                            lockReason = 'Odrzucony przez Kierownika Jakości — wymaga złożenia wniosku o ponowne otwarcie.';
                        } else {
                            lockReason = 'Zablokowany automatycznie po zapisie — zgodnie z normą IFS Food v8 każdy zatwierdzony zapis jest chroniony przed nieautoryzowaną edycją. Złóż wniosek o korektę do managera.';
                        }
                    }

                    // Klasyfikacja: Zgodny / Certyfikacyjny vs Odchylenie Krytyczne (Wariant A: Certyfikacyjny)
                    // LOGIKA BIZNESOWA IFS:
                    // Jeśli audyt został zaakceptowany (isApproved), NIE WYMAGA korekty ani działań korygujących!
                    // Jest gotowy, zatwierdzony i autoryzowany przez Key Usera (kolor szmaragdowy / zielony).
                    // Na czerwono (Odchylenie krytyczne / Działanie korygujące) są tylko audyty niezaakceptowane z incydentem / odrzuceniem!
                    const isCritical = !isApproved && (
                        !isOk || 
                        String(riskLevel).toUpperCase().includes('KRYTYCZNE') || 
                        String(riskLevel).toUpperCase().includes('HOLD') || 
                        String(complianceVerdict).toUpperCase() === 'ODRZUCONY'
                    );

                    // Formatowanie zmiany
                    let shiftDisplay = 'I (06:00 - 14:00)';
                    const sNorm = String(shiftStr || '').trim().toUpperCase();
                    if (sNorm === '1' || sNorm === 'I' || sNorm.includes('A')) shiftDisplay = 'I (06:00 - 14:00)';
                    else if (sNorm === '2' || sNorm === 'II' || sNorm.includes('B')) shiftDisplay = 'II (14:00 - 22:00)';
                    else if (sNorm === '3' || sNorm === 'III' || sNorm.includes('C')) shiftDisplay = 'III (22:00 - 06:00)';

                    // Zgodność IFS %
                    let scorePctVal = 100;
                    if (a.total_score_pct != null) scorePctVal = Math.round(parseFloat(a.total_score_pct));
                    else if (a.audit_score != null) scorePctVal = Math.round(parseFloat(a.audit_score));
                    const scorePassText = isCritical ? `${scorePctVal}% FAIL` : `${scorePctVal}% PASS`;

                    // Status partii przy odchyleniu krytycznym
                    let statusPartiiText = 'BLOKADA JAKOŚCIOWA (CCP-2)';
                    if (riskLevel && (riskLevel.includes('CCP') || riskLevel.includes('KRYTYCZNE') || riskLevel.includes('HOLD'))) {
                        const cleanR = riskLevel.replace(/[^A-Za-z0-9\-]/g, '');
                        statusPartiiText = `BLOKADA JAKOŚCIOWA (${cleanR || 'CCP-2'})`;
                    } else if (complianceVerdict === 'ODRZUCONY') {
                        statusPartiiText = 'BLOKADA JAKOŚCIOWA (ODRZUCENIE)';
                    }

                    const panelId = `audit-detail-panel-${auditId}`;

                    list.innerHTML += `
                        <div class="rounded-2xl ${isCritical ? 'border border-rose-500/70 hover:border-rose-400/90 bg-gradient-to-r from-rose-950/40 via-slate-900/90 to-slate-900/95 hover:shadow-rose-950/40' : 'border border-emerald-500/70 hover:border-emerald-400/90 bg-gradient-to-r from-emerald-950/40 via-slate-900/90 to-slate-900/95 hover:shadow-emerald-950/40'} overflow-hidden transition-all shadow-lg">
                            <!-- Nagłówek wiersza WARIANT A (Certyfikacyjny / Stempel IFS / Rygor Jakościowy) -->
                            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 sm:p-4 cursor-pointer ${isCritical ? 'hover:bg-rose-950/20' : 'hover:bg-emerald-950/20'} transition-all"
                                 onclick="toggleAuditHistoryPanel('${panelId}', this)">
                                <div class="flex items-center gap-3 min-w-0">
                                    <!-- Ikona: Rozeta Certyfikacyjna lub Kłódka Rygoru -->
                                    <div class="w-11 h-11 rounded-2xl ${isCritical ? 'bg-rose-950/80 border border-rose-500/50 text-rose-400' : 'bg-emerald-950/80 border border-emerald-500/50 text-emerald-400'} flex items-center justify-center shrink-0 shadow-sm">
                                        ${isCritical 
                                            ? `<svg class="w-5 h-5 text-rose-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                                 <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                                                 <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                                               </svg>`
                                            : `<svg class="w-6 h-6 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                                 <circle cx="12" cy="8" r="6"/>
                                                 <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>
                                               </svg>`
                                        }
                                    </div>
                                    <div class="min-w-0">
                                        <!-- Wiersz 1: Nazwa linii + Pigułka statusu certyfikacji / rygoru -->
                                        <div class="flex items-center gap-2.5 flex-wrap">
                                            <h4 class="font-black text-sm sm:text-base text-white tracking-wide truncate">${lineName}</h4>
                                            ${isCritical 
                                                ? `<span class="bg-rose-950/90 border border-rose-500/60 px-2.5 py-0.5 rounded-full text-[9.5px] sm:text-[10px] font-black text-rose-300 flex items-center gap-1.5 shadow-sm">
                                                     <span class="w-1.5 h-1.5 rounded-full bg-rose-400 inline-block shadow-[0_0_6px_#f43f5e] animate-pulse"></span>
                                                     <span>ODCHYLENIE KRYTYCZNE</span>
                                                   </span>`
                                                : `<span class="bg-emerald-950/90 border border-emerald-500/60 px-2.5 py-0.5 rounded-full text-[9.5px] sm:text-[10px] font-black text-emerald-300 flex items-center gap-1.5 shadow-sm">
                                                     <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block shadow-[0_0_6px_#34d399]"></span>
                                                     <span>${isApproved ? 'AUTORYZACJA KIEROWNIKA' : 'AUTORYZACJA JAKOŚCI'}</span>
                                                   </span>`
                                            }
                                        </div>
                                        <!-- Wiersz 2: Zegarek, data, zmiana, zgodność IFS / status partii -->
                                        <div class="flex flex-wrap items-center gap-2 text-[10.5px] sm:text-[11px] text-slate-400 mt-1">
                                            <span class="flex items-center gap-1 font-medium">
                                                <svg class="w-3.5 h-3.5 text-slate-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                                    <circle cx="12" cy="12" r="10"/>
                                                    <polyline points="12 6 12 12 15 14"/>
                                                </svg>
                                                <span>${dateStr}</span>
                                            </span>
                                            <span class="text-slate-600">•</span>
                                            <span>Zmiana: <b class="text-slate-200 font-semibold">${shiftDisplay}</b></span>
                                            <span class="text-slate-600">•</span>
                                            ${isCritical 
                                                ? `<span>Status partii: <b class="text-rose-400 font-black tracking-wide">${statusPartiiText}</b></span>`
                                                : `<span>Zgodność IFS: <b class="text-cyan-300 font-bold">${scorePassText}</b></span>`
                                            }
                                        </div>
                                    </div>
                                </div>
                                <!-- Prawa strona: Przycisk funkcyjny z chevronem (Raport IFS / Działanie korygujące) -->
                                <div class="flex items-center shrink-0 self-end sm:self-center">
                                    ${isCritical 
                                        ? `<div class="px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-full bg-rose-950/80 hover:bg-rose-900 border border-rose-500/60 text-rose-300 font-bold text-xs flex items-center gap-2 shadow-sm transition-all hover:scale-105 active:scale-95 select-none">
                                             <svg class="w-4 h-4 text-rose-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                                 <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
                                             </svg>
                                             <span>Działanie korygujące</span>
                                             <svg class="w-3.5 h-3.5 text-rose-400 audit-chevron transition-transform duration-200 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                                 <polyline points="6 9 12 15 18 9"/>
                                             </svg>
                                           </div>`
                                        : `<div class="px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-full bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500/60 text-emerald-300 font-bold text-xs flex items-center gap-2 shadow-sm transition-all hover:scale-105 active:scale-95 select-none">
                                             <svg class="w-4 h-4 text-emerald-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                                 <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                                 <polyline points="14 2 14 8 20 8"/>
                                                 <line x1="16" y1="13" x2="8" y2="13"/>
                                                 <line x1="16" y1="17" x2="8" y2="17"/>
                                             </svg>
                                             <span>Raport IFS</span>
                                             <svg class="w-3.5 h-3.5 text-emerald-400 audit-chevron transition-transform duration-200 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                                 <polyline points="6 9 12 15 18 9"/>
                                             </svg>
                                           </div>`
                                    }
                                </div>
                            </div>

                            <!-- Panel szczegółów (rozwijany) -->
                            <div id="${panelId}" class="hidden border-t ${isCritical ? 'border-rose-500/30 bg-rose-950/20' : 'border-emerald-500/30 bg-emerald-950/10'}">
                                <div class="p-4 space-y-3 opacity-95 bg-slate-950/70">
                                    <!-- Blokada / Alert CAPA -->
                                    ${isCritical 
                                        ? `<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-rose-950/50 border border-rose-500/50">
                                             <div class="flex items-start gap-2.5">
                                                 <svg class="w-5 h-5 text-rose-400 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                     <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
                                                     <line x1="12" y1="9" x2="12" y2="13"/>
                                                     <line x1="12" y1="17" x2="12.01" y2="17"/>
                                                 </svg>
                                                 <div>
                                                     <p class="text-xs font-black text-rose-300">Wymagane działanie korygujące (CAPA) i wniosek do Managera</p>
                                                     <p class="text-[10.5px] text-rose-200/80 mt-0.5">${lockReason || 'Audyt objęty rygorem jakościowym IFS Food v8. Aby wznowić linię/partię, złóż wniosek o korektę.'}</p>
                                                 </div>
                                             </div>
                                             <button type="button" onclick="event.stopPropagation(); requestAuditCorrection(${auditId})" class="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow-md flex items-center gap-1.5 shrink-0 transition active:scale-95 cursor-pointer">
                                                 <svg class="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                     <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                                                     <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                                                 </svg>
                                                 <span>Złóż wniosek o korektę</span>
                                             </button>
                                           </div>`
                                        : (isApproved 
                                            ? `<div class="flex items-center gap-2.5 p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/50">
                                                 <svg class="w-5 h-5 text-emerald-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                     <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                                                     <polyline points="22 4 12 14.01 9 11.01"/>
                                                 </svg>
                                                 <p class="text-xs font-bold text-emerald-200">${lockReason || 'Oficjalny rekord IFS Food v8 autoryzowany przez Key Usera (Manager Jakości).'}</p>
                                               </div>`
                                            : '')
                                    }

                                    <!-- Główne parametry -->
                                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                        <div class="bg-slate-900/60 rounded-xl p-2.5 border ${isCritical ? 'border-rose-500/30' : 'border-emerald-500/30'}">
                                            <div class="text-[9px] font-black text-slate-500 uppercase tracking-wider mb-0.5">Zgodność IFS</div>
                                            <div class="text-sm font-black ${isCritical ? 'text-rose-400' : 'text-cyan-300'}">${scoreRaw}</div>
                                        </div>
                                        <div class="bg-slate-900/60 rounded-xl p-2.5 border ${isCritical ? 'border-rose-500/30' : 'border-emerald-500/30'}">
                                            <div class="text-[9px] font-black text-slate-500 uppercase tracking-wider mb-0.5">Werdykt / Status</div>
                                            <div class="text-sm font-black ${isCritical ? 'text-rose-400' : 'text-emerald-400'}">${isApproved ? 'AUTORYZOWANY' : (complianceVerdict || a.slm_verdict || 'ZGODNY')}</div>
                                        </div>
                                        <div class="bg-slate-900/60 rounded-xl p-2.5 border border-slate-800">
                                            <div class="text-[9px] font-black text-slate-500 uppercase tracking-wider mb-0.5">Poziom ryzyka</div>
                                            <div class="text-xs font-black ${isCritical ? 'text-rose-400' : 'text-slate-300'}">${riskLevel}</div>
                                        </div>
                                        <div class="bg-slate-900/60 rounded-xl p-2.5 border border-slate-800">
                                            <div class="text-[9px] font-black text-slate-500 uppercase tracking-wider mb-0.5">Data / Godzina</div>
                                            <div class="text-xs font-bold text-slate-300">${dateStr}</div>
                                        </div>
                                    </div>

                                    <!-- Uwagi audytora -->
                                    ${auditNotes ? `
                                    <div class="bg-slate-900/60 rounded-xl p-3 border border-amber-700/30">
                                        <div class="text-[9px] font-black text-amber-400 uppercase tracking-wider mb-1 flex items-center gap-1.5"><i class="fas fa-comment-dots text-amber-400"></i><span>Uwagi Audytora</span></div>
                                        <p class="text-[11px] text-amber-200/90 leading-snug whitespace-pre-line">${auditNotes}</p>
                                    </div>` : `
                                    <div class="bg-slate-900/40 rounded-xl p-2.5 border border-slate-800">
                                        <p class="text-[10px] text-slate-500 italic">Brak uwag do tego audytu.</p>
                                    </div>`}

                                    <!-- Skrót punktów checklisty -->
                                    ${chSummary || '<div class="text-[10px] text-slate-500 italic">Szczegółowe dane pytań niedostępne w tym widoku.</div>'}
                                </div>
                            </div>
                        </div>
                    `;
                });
            } catch(e) { 
                console.error("Błąd ładowania historii audytów:", e);
                list.innerHTML = '<p class="text-xs text-rose-400">Błąd podczas przetwarzania historii audytów.</p>';
            }
        }

        function toggleAuditHistoryPanel(panelId, header) {
            const panel = document.getElementById(panelId);
            if (!panel) return;
            const isHidden = panel.classList.contains('hidden');
            panel.classList.toggle('hidden', !isHidden);
            const chevron = header.querySelector('.audit-chevron');
            if (chevron) chevron.style.transform = isHidden ? 'rotate(180deg)' : '';
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
                    alert("" + data.message);
                    loadAuditorHistory();
                } else {
                    alert("" + (data.detail || "Błąd wysyłania wniosku."));
                }
            } catch(e) {
                alert("Błąd połączenia z serwerem.");
            }
        }

        function startDirectInspection() {
            setInspectionStandard("HACCP");
            document.getElementById('view-audit-form').reset();
            formHistory.saveState('view-audit-form');
            showModule('audit-main');
        }

        function setInspectionStandard(std, btn) {
            state.active_audit_type = std;
            if (!btn) {
                btn = document.querySelector(`.btn-insp-std[data-std="${std}"]`);
            }
            
            const inactiveClasses = {
                'HACCP': "btn-insp-std w-16 h-16 rounded-2xl bg-slate-900/90 border border-slate-700/80 text-slate-400 flex flex-col items-center justify-center gap-1 shadow-md hover:border-emerald-500/60 hover:text-emerald-300 hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer select-none font-bold",
                'GMP': "btn-insp-std w-16 h-16 rounded-2xl bg-slate-900/90 border border-slate-700/80 text-slate-400 flex flex-col items-center justify-center gap-1 shadow-md hover:border-purple-500/60 hover:text-purple-300 hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer select-none font-bold",
                'GHP': "btn-insp-std w-16 h-16 rounded-2xl bg-slate-900/90 border border-slate-700/80 text-slate-400 flex flex-col items-center justify-center gap-1 shadow-md hover:border-cyan-500/60 hover:text-cyan-300 hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer select-none font-bold"
            };

            const activeClasses = {
                'HACCP': "btn-insp-std w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-600 via-teal-600 to-emerald-700 border-2 border-emerald-300 text-white flex flex-col items-center justify-center gap-1 shadow-lg shadow-emerald-500/30 ring-2 ring-emerald-400/40 scale-105 transition-all duration-200 cursor-pointer select-none font-black",
                'GMP': "btn-insp-std w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-600 via-fuchsia-700 to-indigo-700 border-2 border-purple-300 text-white flex flex-col items-center justify-center gap-1 shadow-lg shadow-purple-500/30 ring-2 ring-purple-400/40 scale-105 transition-all duration-200 cursor-pointer select-none font-black",
                'GHP': "btn-insp-std w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-600 via-blue-600 to-cyan-700 border-2 border-cyan-300 text-white flex flex-col items-center justify-center gap-1 shadow-lg shadow-cyan-500/30 ring-2 ring-cyan-400/40 scale-105 transition-all duration-200 cursor-pointer select-none font-black"
            };

            document.querySelectorAll('.btn-insp-std').forEach(b => {
                const bStd = b.getAttribute('data-std') || (b.innerText.includes('HACCP') ? 'HACCP' : b.innerText.includes('GMP') ? 'GMP' : 'GHP');
                b.className = inactiveClasses[bStd] || inactiveClasses['HACCP'];
            });

            const badge = document.getElementById('badge-active-standard');
            if (badge) badge.innerText = std;

            if (btn) {
                btn.className = activeClasses[std] || activeClasses['HACCP'];
            }

            if (badge) {
                if (std === 'HACCP') {
                    badge.className = "text-[9px] font-black bg-emerald-950 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded-full";
                } else if (std === 'GMP') {
                    badge.className = "text-[9px] font-black bg-purple-950 text-purple-300 border border-purple-500/40 px-2 py-0.5 rounded-full";
                } else {
                    badge.className = "text-[9px] font-black bg-cyan-950 text-cyan-300 border border-cyan-500/40 px-2 py-0.5 rounded-full";
                }
            }

            loadChecklistForAudit(std);
            formHistory.saveState('view-audit-form');
        }

        function handleChecklistSliderInput(id, val) {
            if (state.checklist_results && state.checklist_results[id] && state.checklist_results[id].locked) return;
            const scoreVal = parseInt(val);
            
            const slider = document.getElementById(`slider-chk-${id}`);
            if (slider) slider.value = scoreVal;

            const lbl = document.getElementById(`lbl-chk-${id}`);
            if (lbl) lbl.innerText = scoreVal;

            for (let s = 1; s <= 5; s++) {
                const b = document.getElementById(`btn-score-${id}-${s}`);
                if (b) {
                    if (s === scoreVal) {
                        if (s === 5) {
                            b.className = "w-6 h-6 rounded-md text-xs font-black transition-all flex items-center justify-center bg-emerald-500 text-slate-950 font-black shadow-md border-0";
                        } else if (s === 4) {
                            b.className = "w-6 h-6 rounded-md text-xs font-black transition-all flex items-center justify-center bg-teal-500 text-slate-950 font-black shadow-md border-0";
                        } else if (s === 3) {
                            b.className = "w-6 h-6 rounded-md text-xs font-black transition-all flex items-center justify-center bg-amber-500 text-slate-950 font-black shadow-md border-0";
                        } else if (s === 2) {
                            b.className = "w-6 h-6 rounded-md text-xs font-black transition-all flex items-center justify-center bg-orange-500 text-white font-black shadow-md border-0";
                        } else {
                            b.className = "w-6 h-6 rounded-md text-xs font-black transition-all flex items-center justify-center bg-rose-600 text-white font-black shadow-md border-0";
                        }
                    } else {
                        b.className = "w-6 h-6 rounded-md text-xs font-black transition-all flex items-center justify-center bg-slate-900 text-slate-400 hover:text-white border border-slate-800 cursor-pointer";
                    }
                }
            }

            if (state.checklist_results && state.checklist_results[id]) {
                const it = state.checklist_results[id];
                it.score = scoreVal;
                // Zgodnie z normą IFS Food v8: oceny 4 (B - drobne odchylenie) i 3 (C - częściowa niezgodność)
                // nie stanowią krytycznego złamania Knock-Out (KO).
                // Status NOK dla pytań KO oraz krytycznych niezgodności ustawiany jest wyłącznie przy scoreVal <= 2.
                it.status = (scoreVal <= 2 ? 'NOK' : 'OK');
            }
        }

        function acceptChecklistScore(id) {
            if (!state.checklist_results || !state.checklist_results[id]) return;
            state.checklist_results[id].locked = true;
            state.checklist_results[id].accepted = true;

            // 1. WYSZARZENIE SUWAKA I PRZYCISKÓW PUNKTACJI (ZAAKCEPTOWANE)
            const slider = document.getElementById(`slider-chk-${id}`);
            if (slider) {
                slider.disabled = true;
                slider.classList.remove('cursor-pointer', 'accent-cyan-500');
                slider.classList.add('opacity-30', 'cursor-not-allowed', 'pointer-events-none', 'grayscale');
            }

            const scoreBtns = document.getElementById(`score-btns-${id}`);
            if (scoreBtns) {
                scoreBtns.classList.add('opacity-30', 'cursor-not-allowed', 'pointer-events-none', 'grayscale');
            }

            const lbl = document.getElementById(`lbl-chk-${id}`);
            if (lbl) {
                lbl.classList.remove('text-cyan-400');
                lbl.classList.add('text-slate-400');
            }

            // 2. KONTENER: ZAMIANA PRZYCISKU ZATWIERDŹ NA PLAKIETKĘ ZAAKCEPTOWANO
            const container = document.getElementById(`accept-container-${id}`);
            if (container) {
                container.innerHTML = `
                    <button type="button" onclick="unlockChecklistScore(${id})" title="Punkt zaakceptowany. Kliknij, aby odblokować i zmienić ocenę"
                        class="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-emerald-500/30 rounded-lg text-[9px] font-extrabold flex items-center gap-1 shadow-sm transition-all cursor-pointer">
                        <i class="fas fa-lock text-[8px] text-emerald-400"></i> Zaakceptowano
                    </button>
                `;
            }

            const it = state.checklist_results[id];
            const card = document.getElementById(`chk-card-${id}`);
            if (card) {
                card.classList.remove('border-rose-500', 'border-amber-500', 'border-emerald-500/50', 'border-slate-800');
                if (it.is_ko && it.score <= 2) {
                    card.classList.add('border-rose-500');
                } else if (it.score < 5) {
                    card.classList.add('border-amber-500');
                } else {
                    card.classList.add('border-emerald-500/50');
                }
            }

            calculateChecklistScore();
        }

        function unlockChecklistScore(id) {
            if (!state.checklist_results || !state.checklist_results[id]) return;
            state.checklist_results[id].locked = false;
            state.checklist_results[id].accepted = false;

            // Odblokowanie i przywrócenie kolorów
            const slider = document.getElementById(`slider-chk-${id}`);
            if (slider) {
                slider.disabled = false;
                slider.classList.remove('opacity-30', 'cursor-not-allowed', 'pointer-events-none', 'grayscale');
                slider.classList.add('cursor-pointer', 'accent-cyan-500');
            }

            const scoreBtns = document.getElementById(`score-btns-${id}`);
            if (scoreBtns) {
                scoreBtns.classList.remove('opacity-30', 'cursor-not-allowed', 'pointer-events-none', 'grayscale');
            }

            const lbl = document.getElementById(`lbl-chk-${id}`);
            if (lbl) {
                lbl.classList.remove('text-slate-400');
                lbl.classList.add('text-cyan-400');
            }

            // Przywrócenie przycisku Zatwierdź
            const container = document.getElementById(`accept-container-${id}`);
            if (container) {
                container.innerHTML = `
                    <button type="button" id="btn-accept-${id}" onclick="acceptChecklistScore(${id})" 
                        class="px-2.5 py-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-[9.5px] font-black rounded-lg shadow-md transition-all flex items-center gap-1 active:scale-95 cursor-pointer animate-pulse">
                        <i class="fas fa-check text-[9px]"></i> Zatwierdź
                    </button>
                `;
            }

            calculateChecklistScore();
        }

        // Kompatybilność
        function setChecklistScore(id, score) {
            handleChecklistSliderInput(id, score);
        }
        function setChecklistAnswer(id, ans) {
            handleChecklistSliderInput(id, ans === 'OK' ? 5 : 3);
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
                    // Początkowy stan każdego pytania
                    state.checklist_results[item.id] = { 
                        id: item.id,
                        status: "OK", 
                        is_ko: item.is_ko, 
                        clause: item.clause, 
                        question: item.question, 
                        score: 5, 
                        notes: "", 
                        locked: false,
                        accepted: false 
                    };
                    const koTag = item.is_ko ? `<span class="bg-rose-950 text-rose-300 border border-rose-600 text-[8px] font-black px-1.5 py-0.5 rounded mr-1 animate-pulse"><i class="fas fa-exclamation-triangle"></i> KNOCK-OUT</span>` : '';
                    const safeClause = (item.clause || '').replace(/'/g, "\\'");
                    
                    container.innerHTML += `
                        <div id="chk-card-${item.id}" class="p-3 rounded-xl border ${item.is_ko ? 'bg-rose-950/20 border-rose-500/40 shadow-[0_0_10px_rgba(225,29,72,0.1)]' : 'bg-slate-900/60 border-slate-800'} space-y-2 mb-3 transition-all duration-200">
                            <div>
                                <div class="flex items-center justify-between mb-1">
                                    <span class="text-[10px] font-mono text-cyan-400 font-extrabold flex items-center">${koTag}${item.clause}</span>
                                    <button type="button" onclick="openFaqForGuideline('${safeClause}')" title="Zobacz kryterium IFS Food / procedurę w Bazie Wiedzy" class="text-[9px] font-bold text-emerald-400 hover:text-emerald-300 bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-500/30 px-2 py-0.5 rounded flex items-center gap-1 transition cursor-pointer">
                                        <i class="fas fa-book-open text-[8px]"></i> Wymóg IFS / CAPA
                                    </button>
                                </div>
                                <p class="text-[11px] text-slate-200 leading-snug">${item.question}</p>
                            </div>
                            
                            <div class="flex items-center gap-2 pt-2 border-t border-slate-800/80">
                                <span class="text-[10px] font-bold text-slate-400 w-16 shrink-0">Ocena (1-5):</span>
                                
                                <div class="inline-flex rounded-xl bg-slate-950/90 p-0.5 border border-slate-800 gap-1 shrink-0" id="score-btns-${item.id}">
                                    <button type="button" onclick="handleChecklistSliderInput(${item.id}, 1)" id="btn-score-${item.id}-1" class="w-6 h-6 rounded-md text-xs font-black transition-all flex items-center justify-center bg-slate-900 text-slate-400 hover:text-white border border-slate-800 cursor-pointer">1</button>
                                    <button type="button" onclick="handleChecklistSliderInput(${item.id}, 2)" id="btn-score-${item.id}-2" class="w-6 h-6 rounded-md text-xs font-black transition-all flex items-center justify-center bg-slate-900 text-slate-400 hover:text-white border border-slate-800 cursor-pointer">2</button>
                                    <button type="button" onclick="handleChecklistSliderInput(${item.id}, 3)" id="btn-score-${item.id}-3" class="w-6 h-6 rounded-md text-xs font-black transition-all flex items-center justify-center bg-slate-900 text-slate-400 hover:text-white border border-slate-800 cursor-pointer">3</button>
                                    <button type="button" onclick="handleChecklistSliderInput(${item.id}, 4)" id="btn-score-${item.id}-4" class="w-6 h-6 rounded-md text-xs font-black transition-all flex items-center justify-center bg-slate-900 text-slate-400 hover:text-white border border-slate-800 cursor-pointer">4</button>
                                    <button type="button" onclick="handleChecklistSliderInput(${item.id}, 5)" id="btn-score-${item.id}-5" class="w-6 h-6 rounded-md text-xs font-black transition-all flex items-center justify-center bg-emerald-500 text-slate-950 font-black shadow-md border-0 cursor-pointer">5</button>
                                </div>

                                <input type="range" min="1" max="5" value="5" id="slider-chk-${item.id}"
                                    oninput="handleChecklistSliderInput(${item.id}, this.value)"
                                    class="flex-1 accent-cyan-500 cursor-pointer h-2 bg-slate-700 rounded-lg appearance-none transition-all">

                                <span id="lbl-chk-${item.id}" class="text-sm font-black text-cyan-400 w-5 text-center shrink-0">5</span>

                                <div id="accept-container-${item.id}" class="shrink-0 min-w-[85px] flex justify-end">
                                    <button type="button" id="btn-accept-${item.id}" onclick="acceptChecklistScore(${item.id})" 
                                        class="px-2.5 py-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-[9.5px] font-black rounded-lg shadow-md transition-all flex items-center gap-1 active:scale-95 cursor-pointer">
                                        <i class="fas fa-check text-[9px]"></i> Zatwierdź
                                    </button>
                                </div>
                            </div>
                            
                            <div class="pt-1">
                                <div class="flex items-center justify-between mb-1">
                                    <span class="text-[9px] font-bold text-slate-400">Uwagi / Działania korygujące:</span>
                                    <span class="text-[8px] text-slate-500 italic">Mów do mikrofonu w ramce</span>
                                </div>
                                <div class="relative w-full">
                                    <textarea id="chk-notes-${item.id}" placeholder="Wpisz uwagę lub kliknij mikrofon w ramce i powiedz..." 
                                        rows="1"
                                        oninput="state.checklist_results[${item.id}].notes=this.value; this.style.height='auto'; this.style.height=(this.scrollHeight)+'px';" 
                                        class="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 pr-9 text-[10.5px] text-slate-200 focus:border-cyan-500 outline-none transition-all resize-none overflow-hidden leading-relaxed block">${state.checklist_results[item.id]?.notes || ''}</textarea>
                                    <button type="button" onclick="toggleSpeechToText('chk-notes-${item.id}', this)" 
                                        title="Podyktuj uwagę bezpośrednio do ramki (np. 'jest uszkodzenie w tym miejscu')"
                                        class="absolute right-1.5 top-1.5 w-6 h-6 rounded-md bg-slate-900 border border-slate-700 hover:border-cyan-500 text-cyan-400 hover:text-white flex items-center justify-center text-xs transition-all cursor-pointer shadow-sm">
                                        <i class="fas fa-microphone"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                    `;
                });
                calculateChecklistScore();
            } catch(e) {
                container.innerHTML = "<div class='text-center py-4'><i class='fas fa-exclamation-circle text-rose-500 text-2xl mb-2'></i><p class='text-xs text-rose-400'>Błąd pobierania checklisty z serwera.</p></div>";
            }
        }

        function calculateChecklistScore() {
            const keys = Object.keys(state.checklist_results);
            const totalCount = keys.length;
            let acceptedCount = 0;
            let nokCount = 0;
            let koFail = false;

            keys.forEach(k => {
                const it = state.checklist_results[k];
                if (it.locked || it.accepted) {
                    acceptedCount++;
                    const isCritNok = (it.score !== undefined ? parseInt(it.score) <= 2 : it.status === "NOK");
                    if (isCritNok) {
                        nokCount++;
                        if (it.is_ko) koFail = true;
                    }
                }
            });

            const unacceptedCount = totalCount - acceptedCount;
            const allAccepted = (totalCount > 0 && unacceptedCount === 0);

            // 1. Badge KO w nagłówku checklisty
            const badge = document.getElementById('ko-status-badge');
            if (badge) {
                if (koFail) {
                    badge.className = "text-[9px] font-black bg-rose-950 text-rose-300 border border-rose-500 px-2 py-0.5 rounded-full animate-pulse";
                    badge.innerHTML = "<i class='fas fa-exclamation-triangle'></i> ZŁAMANIE KO!";
                } else if (allAccepted) {
                    badge.className = "text-[9px] font-black bg-emerald-950 text-emerald-300 border border-emerald-500/50 px-2 py-0.5 rounded-full";
                    badge.innerText = "KO: ZGODNE";
                } else {
                    badge.className = "text-[9px] font-black bg-slate-900 text-slate-400 border border-slate-700 px-2 py-0.5 rounded-full";
                    badge.innerHTML = `<i class="fas fa-clock text-amber-400 mr-0.5"></i> Zaakceptowano: ${acceptedCount}/${totalCount}`;
                }
            }

            // 2. Aktualizacja paska postępu
            const counterEl = document.getElementById('checklist-progress-counter');
            const statusEl = document.getElementById('checklist-progress-status');
            const fillEl = document.getElementById('checklist-progress-fill');
            const pct = totalCount > 0 ? Math.round((acceptedCount / totalCount) * 100) : 0;

            if (counterEl) counterEl.innerText = `${acceptedCount} / ${totalCount} (${pct}%)`;
            if (fillEl) {
                fillEl.style.width = `${pct}%`;
                fillEl.className = allAccepted ? "h-full bg-emerald-500 transition-all duration-300 rounded-full" : "h-full bg-amber-500 transition-all duration-300 rounded-full";
            }

            if (statusEl) {
                if (allAccepted) {
                    statusEl.innerHTML = `<span class="text-emerald-400 font-extrabold flex items-center gap-1"><i class="fas fa-check-circle"></i> Wszystkie punkty zaakceptowane (${totalCount}/${totalCount})</span>`;
                } else {
                    statusEl.innerHTML = `<span class="text-amber-400 font-bold flex items-center gap-1"><i class="fas fa-exclamation-circle text-rose-400"></i> Pozostało do zatwierdzenia: <strong class="text-rose-400 font-black ml-0.5">${unacceptedCount}</strong></span>`;
                }
            }

            // 3. WYSZARZENIE PRZYCISKU ZAPISU (WYMÓG: WYŁĄCZONY DOPÓKI NIE ZAAKCEPTOWANO 100% PYTAŃ)
            const saveBtn = document.getElementById('btn-save-audit');
            const saveText = document.getElementById('btn-save-audit-text');
            if (saveBtn) {
                if (allAccepted) {
                    saveBtn.disabled = false;
                    saveBtn.className = "w-full tile-3d h-14 bg-gradient-to-br from-emerald-600 to-teal-600 font-black text-xs uppercase text-white shadow-xl flex items-center justify-center gap-2 rounded-2xl cursor-pointer hover:from-emerald-500 hover:to-teal-500 active:scale-[0.98] transition-all duration-200 ring-2 ring-emerald-400/40";
                    if (saveText) {
                        saveText.innerHTML = `<span class="flex items-center gap-2"><i class="fas fa-floppy-disk text-sm"></i><span>Zapisz Audyt i Wykonaj Analizę SLM AI</span></span>`;
                    }
                } else {
                    saveBtn.disabled = true;
                    saveBtn.className = "w-full h-14 font-bold text-xs uppercase shadow-none flex items-center justify-center gap-2 rounded-2xl transition-all duration-300 opacity-40 bg-slate-900 text-slate-500 border border-slate-800 cursor-not-allowed pointer-events-none select-none";
                    if (saveText) {
                        saveText.innerHTML = `<span class="flex items-center gap-2"><i class="fas fa-lock text-xs"></i><span>Zaakceptuj wszystkie pytania (pozostało ${unacceptedCount}/${totalCount})</span></span>`;
                    }
                }
            }
        }

        async function saveAuditToDb() {
            // Walidacja: 100% pytań checklisty musi być zaakceptowanych przed zapisem
            const keys = Object.keys(state.checklist_results);
            const unaccepted = keys.filter(k => !state.checklist_results[k].locked && !state.checklist_results[k].accepted);
            
            if (keys.length === 0) {
                showToast("Błąd: Brak pytań w checkliście do zapisu.", "warning");
                return;
            }

            if (unaccepted.length > 0) {
                showToast(`Wymagane zatwierdzenie wszystkich punktów! Pozostało do zaakceptowania: ${unaccepted.length}.`, "warning");
                const firstMissing = document.getElementById(`chk-card-${unaccepted[0]}`);
                if (firstMissing) {
                    firstMissing.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    firstMissing.classList.add('ring-2', 'ring-rose-500', 'animate-pulse');
                    setTimeout(() => firstMissing.classList.remove('ring-2', 'ring-rose-500', 'animate-pulse'), 3000);
                }
                return;
            }

            // NATYCHMIASTOWA REAKCJA (0 ms)
            updateAuditHud(1, "KROK 1/2: ANALIZA SLM", "Wnioskowanie lokalnego modelu i weryfikacja IFS Food v8...", "loading");

            // Dynamiczne mapowanie odpowiedzi z checklisty na dedykowane pola Audit Trail
            const chkItems = Object.values(state.checklist_results || {});
            
            function getLowestScore(items, defaultScore = 5) {
                if (!items || items.length === 0) return defaultScore;
                let minScore = 5;
                items.forEach(it => {
                    const sc = it.score !== undefined ? parseInt(it.score) : (it.status === 'NOK' ? 1 : 5);
                    if (!isNaN(sc) && sc < minScore) minScore = sc;
                });
                return minScore;
            }

            function filterItems(predicate) {
                return chkItems.filter(predicate);
            }

            // Mapowanie szkła i twardego plastiku
            const glassItems = filterItems(it => it.id === 205 || /szk[łl]|plastik|glass/i.test((it.clause || '') + ' ' + (it.question || '')));
            const glassPlasticOk = glassItems.length > 0 ? (getLowestScore(glassItems) <= 2 ? "NOK" : "ZGODNY") : (state.glass_plastic_ok || "ZGODNY");

            // Mapowanie czystości alergenowej i CIP
            const allergenItems = filterItems(it => it.id === 102 || it.id === 208 || it.id === 307 || /alergen|allergen|cip|czyszcz/i.test((it.clause || '') + ' ' + (it.question || '')));
            const allergenCleanOk = allergenItems.length > 0 ? (getLowestScore(allergenItems) <= 2 ? "NOK" : "ZGODNY") : (state.allergen_clean_ok || "ZGODNY");

            // Mapowanie polityki drewna i ciał obcych
            const woodItems = filterItems(it => it.id === 207 || /drewn|wood|ta[śs]m|trytyt/i.test((it.clause || '') + ' ' + (it.question || '')));
            const woodPolicyOk = woodItems.length > 0 ? (getLowestScore(woodItems) <= 2 ? "NOK" : "ZGODNY") : (state.wood_policy_ok || "ZGODNY");

            // Mapowanie odzieży ochronnej i PPE
            const ppeItems = filterItems(it => it.id === 201 || it.id === 301 || it.id === 302 || /odzie[żz]|ppe|fartuch|czepk|bi[żz]uter/i.test((it.clause || '') + ' ' + (it.question || '')));
            const ppeOk = ppeItems.length > 0 ? (getLowestScore(ppeItems) <= 2 ? "NOK" : "ZGODNY") : (state.ppe_ok || "ZGODNY");

            // Mapowanie stanu zdrowia (PR15.01)
            const healthItems = filterItems(it => it.id === 203 || it.id === 303 || /zdrow|infekcj|zranie|plastr|pr15/i.test((it.clause || '') + ' ' + (it.question || '')));
            const healthOk = healthItems.length > 0 ? (getLowestScore(healthItems) <= 2 ? "NIE" : "TAK") : (state.health_ok || "TAK");

            // Mapowanie CCP1 (Detektor metali / X-Ray / Częstotliwość testów)
            const ccp1Items = filterItems(it => it.id === 106 || it.id === 209 || /detektor|ccp1|wzorc|x-ray/i.test((it.clause || '') + ' ' + (it.question || '')));
            const ccp1Val = ccp1Items.length > 0 ? (getLowestScore(ccp1Items) <= 2 ? "NOK" : "ZGODNY") : (state.ccp1_fe_ok || "ZGODNY");
            const ccp1FeOk = ccp1Val;
            const ccp1NonfeOk = ccp1Val;
            const ccp1SsOk = ccp1Val;
            const ccp1RejectOk = ccp1Val;
            const ccp1BinLocked = ccp1Val;

            // Mapowanie Magnesów (CCP2) i Sit (CCP3)
            const magnetItems = filterItems(it => /magnes/i.test((it.clause || '') + ' ' + (it.question || '')));
            const ccp2MagnetOk = magnetItems.length > 0 ? (getLowestScore(magnetItems) <= 2 ? "NOK" : "ZGODNY") : (state.ccp2_magnet_ok || "ZGODNY");

            const sieveItems = filterItems(it => /sit[aoeó]/i.test((it.clause || '') + ' ' + (it.question || '')));
            const ccp3SieveOk = sieveItems.length > 0 ? (getLowestScore(sieveItems) <= 2 ? "NOK" : "ZGODNY") : (state.ccp3_sieve_ok || "ZGODNY");

            // Mapowanie ogólnej czystości GMP
            const cleanItems = filterItems(it => it.id === 204 || it.id === 208 || it.id === 304 || it.id === 305 || it.id === 306 || /czysto[śs][ćc]|higien|posadzk/i.test((it.clause || '') + ' ' + (it.question || '')));
            const gmpCleanlinessOk = cleanItems.length > 0 ? (getLowestScore(cleanItems) <= 2 ? "NOK" : "ZGODNY") : (state.gmp_cleanliness_ok || "ZGODNY");

            // Oceny punktowe GMP (drewno i ciała obce)
            const gmpWoodScore = woodItems.length > 0 ? getLowestScore(woodItems) : (state.gmp_wood_score || 5);
            const foreignItems = filterItems(it => it.id === 205 || it.id === 207 || it.id === 209 || /cia[łl]a obce|szk[łl]|plastik|detekcj/i.test((it.clause || '') + ' ' + (it.question || '')));
            const gmpForeignScore = foreignItems.length > 0 ? getLowestScore(foreignItems) : (state.gmp_foreign_score || 5);

            // Odpady produkcyjne
            const wasteItems = filterItems(it => it.id === 306 || /odpad/i.test((it.clause || '') + ' ' + (it.question || '')));
            const gmpWasteOk = wasteItems.length > 0 ? (getLowestScore(wasteItems) <= 2 ? "NOK" : "ZGODNY") : (state.gmp_waste_ok || "ZGODNY");

            // Zapis do obiektu state w celu utrzymania spójności aplikacji
            state.glass_plastic_ok = glassPlasticOk;
            state.allergen_clean_ok = allergenCleanOk;
            state.wood_policy_ok = woodPolicyOk;
            state.ppe_ok = ppeOk;
            state.health_ok = healthOk;
            state.ccp1_fe_ok = ccp1FeOk;
            state.ccp1_nonfe_ok = ccp1NonfeOk;
            state.ccp1_ss_ok = ccp1SsOk;
            state.ccp1_reject_ok = ccp1RejectOk;
            state.ccp1_bin_locked = ccp1BinLocked;
            state.ccp2_magnet_ok = ccp2MagnetOk;
            state.ccp3_sieve_ok = ccp3SieveOk;
            state.gmp_cleanliness_ok = gmpCleanlinessOk;
            state.gmp_wood_score = gmpWoodScore;
            state.gmp_foreign_score = gmpForeignScore;
            state.gmp_waste_ok = gmpWasteOk;

            let koFailed = false;
            chkItems.forEach(it => {
                const isCritNok = (it.score !== undefined ? parseInt(it.score) <= 2 : it.status === "NOK");
                if (it.is_ko && isCritNok) koFailed = true;
            });

            let slmText = "Audyt zakończony pomyślnie.";
            try {
                const slmReq = {
                    line: state.line, shift: state.shift, zone: state.zone, health_ok: healthOk,
                    ko_failed: koFailed,
                    ccp1_fe_ok: ccp1FeOk,
                    ccp1_reject_ok: ccp1RejectOk,
                    allergen_clean_ok: allergenCleanOk,
                    glass_plastic_ok: glassPlasticOk,
                    wood_policy_ok: woodPolicyOk
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
            formData.append("health_ok", healthOk);
            formData.append("dispense_no", state.dispense_no || "BRAK");
            formData.append("glass_plastic_ok", glassPlasticOk);
            formData.append("allergen_clean_ok", allergenCleanOk);
            formData.append("wood_policy_ok", woodPolicyOk);
            formData.append("ppe_ok", ppeOk);
            formData.append("line_status", state.line_status);
            formData.append("ccp1_fe_ok", ccp1FeOk);
            formData.append("ccp1_nonfe_ok", ccp1NonfeOk);
            formData.append("ccp1_ss_ok", ccp1SsOk);
            formData.append("ccp1_reject_ok", ccp1RejectOk);
            formData.append("ccp1_bin_locked", ccp1BinLocked);
            formData.append("ccp2_magnet_ok", ccp2MagnetOk);
            formData.append("ccp3_sieve_ok", ccp3SieveOk);
            formData.append("gmp_cleanliness_ok", gmpCleanlinessOk);
            formData.append("gmp_wood_score", gmpWoodScore);
            formData.append("gmp_foreign_score", gmpForeignScore);
            formData.append("gmp_waste_ok", gmpWasteOk);
            formData.append("bhp_estop_ok", state.bhp_estop_ok);
            formData.append("bhp_atex_ok", state.bhp_atex_ok);
            formData.append("bhp_hot_cip_ok", state.bhp_hot_cip_ok);
            formData.append("bhp_evac_ppoz_ok", state.bhp_evac_ppoz_ok);
            formData.append("bhp_status", state.bhp_status);
            formData.append("slm_analysis", slmText);
            formData.append("checklist_results", JSON.stringify(state.checklist_results));
            formData.append("audit_type", state.active_audit_type || "HACCP");
            if (state.schedule_id) {
                formData.append("schedule_id", state.schedule_id);
            }

            // Załączenie zdjęcia fotograficznego (jeśli wykonano aparatem lub wybrano plik)
            if (window.currentAuditPhotoFile) {
                formData.append("photo", window.currentAuditPhotoFile);
            }

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
                state.schedule_id = null;
                activeSelectedAudit = null;
                const data = await res.json().catch(() => ({}));
                const verdict = data.slm_verdict || (slmText.includes('NOK') ? 'NOK' : 'OK');
                
                // STAN 3: Werdykt końcowy
                if (verdict.includes('NOK') || verdict.includes('HOLD')) {
                    updateAuditHud(3, "ODCHYLENIE CCP / HOLD LOT", `Werdykt: ${verdict} | Status: ZABLOKOWANY`, "alert");
                } else {
                    updateAuditHud(3, "AUDYT ZAPISANY POMYŚLNIE", `Werdykt SLM: ${verdict} | Status: ZABLOKOWANY`, "success");
                }

                showModule('hub');
                removeAuditPhoto(); // wyczyść załączone zdjęcie po udanym zapisie
                if (typeof loadScheduleAndRender === 'function') await loadScheduleAndRender();
                if (typeof loadAuditorHistory === 'function') await loadAuditorHistory();
                if (typeof updateKpiRibbon === 'function') await updateKpiRibbon();
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
                if (!state.line || !productionLinesData.some(l => l.name === state.line)) {
                    state.line = productionLinesData[0].name;
                }
                const hiddenLine = document.getElementById('hidden-line-input');
                if (hiddenLine) hiddenLine.value = state.line;
                preauditTiles.innerHTML = productionLinesData.map((l, idx) => {
                    const isSel = (l.name === state.line) || (!state.line && idx === 0);
                    const safeName = (l.name || '').replace(/'/g, "\\'");
                    return `
                    <div onclick="selectTile('line', '${safeName}', this)" data-line="${l.name}" title="${l.name}${l.code ? ' (' + l.code + ')' : ''}" class="tile-line tile-3d ${isSel ? 'tile-selected' : ''} bg-slate-800/90 hover:bg-slate-700/80 border border-slate-700/80 px-2.5 py-1.5 rounded-xl text-center cursor-pointer text-xs font-bold transition-all truncate flex items-center justify-center min-h-[34px] min-w-[75px] max-w-[170px] flex-1 shadow-sm">
                        <span class="truncate">${l.code || l.name}</span>
                    </div>`;
                }).join('');
            }
            syncAgentLineSelector();

            // Zasilenie listy linii w formularzu Szybkiej Notatki Audytora
            const qnLine = document.getElementById('quick-note-line');
            if (qnLine && Array.isArray(productionLinesData)) {
                const curVal = qnLine.value;
                qnLine.innerHTML = `<option value="">— Ogólna / Cała Hala —</option>` + 
                    productionLinesData.map(l => `<option value="${l.name}">${l.name}${l.code ? ' (' + l.code + ')' : ''}</option>`).join('');
                if (curVal) qnLine.value = curVal;
            }
        }

        // --- OBSŁUGA SZYBKIEJ NOTATKI AUDYTORA DO KEY USERA ---
        window.updateQuickNoteCounter = function(el) {
            const counter = document.getElementById('quick-note-counter');
            if (counter) {
                const len = (el.value || '').length;
                counter.innerText = `${len} / 500`;
                if (len > 500) {
                    counter.classList.add('text-rose-400');
                    counter.classList.remove('text-slate-500');
                } else {
                    counter.classList.remove('text-rose-400');
                    counter.classList.add('text-slate-500');
                }
            }
        };

        window.setQuickNotePriority = function(prio) {
            const hiddenInput = document.getElementById('quick-note-priority');
            if (hiddenInput) hiddenInput.value = prio;

            const label = document.getElementById('prio-selected-label');
            if (label) {
                if (prio === 'HOLD') {
                    label.textContent = 'Wstrzymanie CCP';
                    label.className = 'text-[9px] font-black text-rose-400 animate-pulse';
                } else if (prio === 'WARNING') {
                    label.textContent = 'Odchylenie CP';
                    label.className = 'text-[9px] font-black text-amber-400';
                } else {
                    label.textContent = 'Rutynowy';
                    label.className = 'text-[9px] font-bold text-cyan-300';
                }
            }

            const configs = {
                'INFO': {
                    id: 'prio-btn-INFO',
                    active: 'bg-cyan-950/90 text-cyan-300 border-cyan-500/50 shadow-sm shadow-cyan-950/50',
                    inactive: 'bg-slate-900/60 text-slate-400 border-transparent hover:text-cyan-300 hover:bg-cyan-950/30'
                },
                'WARNING': {
                    id: 'prio-btn-WARNING',
                    active: 'bg-amber-950/90 text-amber-300 border-amber-500/50 shadow-sm shadow-amber-950/50',
                    inactive: 'bg-slate-900/60 text-slate-400 border-transparent hover:text-amber-300 hover:bg-amber-950/30'
                },
                'HOLD': {
                    id: 'prio-btn-HOLD',
                    active: 'bg-rose-950/90 text-rose-300 border-rose-500/50 shadow-sm shadow-rose-950/50 animate-pulse-subtle',
                    inactive: 'bg-slate-900/60 text-slate-400 border-transparent hover:text-rose-400 hover:bg-rose-950/30'
                }
            };

            Object.keys(configs).forEach(k => {
                const item = configs[k];
                const el = document.getElementById(item.id);
                if (!el) return;
                if (k === prio) {
                    el.className = `prio-pill py-1.5 px-1.5 rounded-lg flex items-center justify-center gap-1.5 text-[10px] font-black transition border cursor-pointer ${item.active}`;
                } else {
                    el.className = `prio-pill py-1.5 px-1.5 rounded-lg flex items-center justify-center gap-1.5 text-[10px] font-black transition border cursor-pointer ${item.inactive}`;
                }
            });
        };

        window.toggleAnonymousNote = function(isAnon) {
            const feedback = document.getElementById('quick-note-feedback');
            const destBadge = document.getElementById('quick-note-dest-badge');
            if (isAnon) {
                if (destBadge) {
                    destBadge.innerHTML = `<i class="fas fa-user-secret text-amber-400 mr-1 animate-pulse"></i> TRYB POUFNY / ANONIMOWY`;
                }
                if (feedback) {
                    feedback.innerText = "Tryb anonimowy (IFS Culture) — Twoje nazwisko NIE będzie widoczne.";
                    feedback.className = "text-amber-300 font-bold";
                }
            } else {
                if (destBadge) {
                    destBadge.innerHTML = `DO: KEY USER (MANAGER)`;
                }
                if (feedback && feedback.innerText.includes("Tryb anonimowy")) {
                    feedback.innerText = "";
                }
            }
        };

        window.sendQuickAuditorNote = async function() {
            const textarea = document.getElementById('quick-note-text');
            const feedback = document.getElementById('quick-note-feedback');
            const lineSel = document.getElementById('quick-note-line');
            const prioSel = document.getElementById('quick-note-priority');
            const anonCheck = document.getElementById('quick-note-anonymous');
            const btn = document.getElementById('btn-send-quick-note');
            if (!textarea) return;

            const content = textarea.value.trim();
            if (!content) {
                if (feedback) {
                    feedback.innerText = "Wpisz treść notatki przed wysłaniem.";
                    feedback.className = "text-rose-400 font-bold";
                }
                textarea.focus();
                return;
            }

            const isAnonymous = Boolean(anonCheck && anonCheck.checked);
            const auditorName = isAnonymous 
                ? "Anonimowy Audytor (Poufne IFS Culture)" 
                : (state.auditor_id || state.auditor || "Audytor Operacyjny");
            const auditorId = isAnonymous ? null : (state.user_id || state.userId || null);

            const payload = {
                auditor_id: auditorId,
                auditor_name: auditorName,
                line_id: lineSel ? lineSel.value : "",
                line_name: lineSel && lineSel.options[lineSel.selectedIndex] ? lineSel.options[lineSel.selectedIndex].text : "",
                priority: prioSel ? prioSel.value : "INFO",
                content: content
            };

            if (btn) {
                btn.disabled = true;
                btn.classList.add('opacity-70');
                btn.innerHTML = `<svg class="w-3.5 h-3.5 animate-spin mr-1 text-slate-950" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10" stroke-width="4" stroke-dasharray="32" stroke-linecap="round"/></svg><span>Wysyłanie...</span>`;
            }

            try {
                const res = await fetch('/api/auditor-notes', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();

                if (res.ok) {
                    textarea.value = "";
                    window.updateQuickNoteCounter(textarea);
                    if (window.setQuickNotePriority) window.setQuickNotePriority('INFO');
                    if (feedback) {
                        feedback.innerHTML = isAnonymous 
                            ? '<span class="flex items-center gap-1.5"><i class="fas fa-circle-check text-emerald-400"></i><span>Wysłano anonimowo (IFS Culture) do Key Usera!</span></span>' 
                            : '<span class="flex items-center gap-1.5"><i class="fas fa-circle-check text-emerald-400"></i><span>Wysłano do Key Usera!</span></span>';
                        feedback.className = "text-emerald-400 font-bold";
                        setTimeout(() => { 
                            if (feedback && feedback.innerText.includes("Wysłano")) {
                                feedback.innerText = ""; 
                            }
                        }, 4000);
                    }

                    // Pokaż ostatnią wysłaną notatkę
                    const recentBox = document.getElementById('quick-note-recent-box');
                    const recentTime = document.getElementById('quick-note-recent-time');
                    const recentContent = document.getElementById('quick-note-recent-content');
                    if (recentBox && recentTime && recentContent) {
                        const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        recentTime.innerText = now;
                        const prefixLine = payload.line_id ? `[${payload.line_name}] ` : '';
                        const prefixAnon = isAnonymous ? `[Poufne IFS] ` : '';
                        recentContent.innerText = `${prefixAnon}${prefixLine}${content}`;
                        recentBox.classList.remove('hidden');
                    }

                    if (window.updateAuditorNotesBadge) window.updateAuditorNotesBadge();
                    setTimeout(() => {
                        if (typeof window.switchQuickNoteTab === 'function') {
                            window.switchQuickNoteTab('sent');
                        }
                    }, 1200);
                } else {
                    if (feedback) {
                        feedback.innerText = data.detail || "Błąd wysyłki notatki.";
                        feedback.className = "text-rose-400 font-bold";
                    }
                }
            } catch (e) {
                console.error("Błąd wysyłania notatki:", e);
                if (feedback) {
                    feedback.innerText = "Błąd sieci przy wysyłce notatki.";
                    feedback.className = "text-rose-400 font-bold";
                }
            } finally {
                if (btn) {
                    btn.disabled = false;
                    btn.classList.remove('opacity-70');
                    btn.innerHTML = `<svg class="w-3.5 h-3.5 shrink-0 text-slate-950" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg><span>Wyślij do Key Usera</span>`;
                }
            }
        };

        let currentQuickNoteTab = 'inbox';

        window.switchQuickNoteTab = function(tab) {
            currentQuickNoteTab = tab;
            const btnInbox = document.getElementById('qn-tab-btn-inbox');
            const btnSend = document.getElementById('qn-tab-btn-send');
            const btnSent = document.getElementById('qn-tab-btn-sent');

            const viewInbox = document.getElementById('qn-view-inbox');
            const viewSend = document.getElementById('qn-view-send');
            const viewSent = document.getElementById('qn-view-sent');

            const activeClass = "flex-1 py-2 px-2.5 rounded-lg text-xs sm:text-sm font-black flex items-center justify-center gap-2 transition bg-amber-500 text-slate-950 shadow cursor-pointer";
            const inactiveClass = "flex-1 py-2 px-2.5 rounded-lg text-xs sm:text-sm font-bold text-slate-400 hover:text-slate-200 flex items-center justify-center gap-2 transition cursor-pointer";

            if (btnInbox) btnInbox.className = (tab === 'inbox') ? activeClass : inactiveClass;
            if (btnSend) btnSend.className = (tab === 'send') ? activeClass : inactiveClass;
            if (btnSent) btnSent.className = (tab === 'sent') ? activeClass : inactiveClass;

            if (viewInbox) viewInbox.classList.toggle('hidden', tab !== 'inbox');
            if (viewSend) viewSend.classList.toggle('hidden', tab !== 'send');
            if (viewSent) viewSent.classList.toggle('hidden', tab !== 'sent');

            if (tab === 'inbox') {
                window.loadAuditorInboxMessages();
            } else if (tab === 'sent') {
                window.loadAuditorSentMessages();
            } else if (tab === 'send') {
                setTimeout(() => {
                    const txt = document.getElementById('quick-note-text');
                    if (txt) txt.focus();
                }, 100);
            }
        };

        // =====================================================================
        // MODUŁ: LIVE CHAT OPERACYJNY (HALA ↔ BIURO / AUDYTORZY ↔ KIEROWNIK)
        // =====================================================================
        let liveChatPollingTimer = null;
        let cachedChatMessages = [];

        window.openLiveChatModal = function(initialText = '', initialPrio = '') {
            const modal = document.getElementById('modal-live-chat') || document.getElementById('modal-quick-note');
            if (modal) {
                modal.classList.remove('hidden');

                // Zasilenie listy linii w formularzu Chatu
                const chatLine = document.getElementById('live-chat-line');
                if (chatLine && Array.isArray(productionLinesData) && productionLinesData.length > 0) {
                    const curVal = chatLine.value;
                    chatLine.innerHTML = `<option value="Hala Główna">— Cała Hala / Ogólna —</option>` + 
                        productionLinesData.map(l => `<option value="${l.name}">${l.name}${l.code ? ' (' + l.code + ')' : ''}</option>`).join('');
                    if (curVal) chatLine.value = curVal;
                }

                if (initialPrio) {
                    const prioSel = document.getElementById('live-chat-prio');
                    if (prioSel) prioSel.value = initialPrio;
                }

                if (initialText) {
                    const inp = document.getElementById('live-chat-input');
                    if (inp) {
                        inp.value = initialText;
                        inp.focus();
                    }
                }

                loadLiveChatMessages(true);

                if (liveChatPollingTimer) clearInterval(liveChatPollingTimer);
                liveChatPollingTimer = setInterval(() => {
                    const m = document.getElementById('modal-live-chat') || document.getElementById('modal-quick-note');
                    if (m && !m.classList.contains('hidden')) {
                        loadLiveChatMessages(false);
                    }
                }, 3000);
            }
        };

        window.closeLiveChatModal = function() {
            const modal = document.getElementById('modal-live-chat') || document.getElementById('modal-quick-note');
            if (modal) modal.classList.add('hidden');
            if (liveChatPollingTimer) {
                clearInterval(liveChatPollingTimer);
                liveChatPollingTimer = null;
            }
        };

        window.loadLiveChatMessages = async function(shouldScrollToBottom = true) {
            const container = document.getElementById('live-chat-messages-container');
            if (!container) return;

            try {
                const res = await fetch('/api/auditor-notes/chat-messages?limit=100');
                if (!res.ok) throw new Error("Błąd pobierania wiadomości chatu");
                const messages = await res.json();
                cachedChatMessages = messages;

                if (!messages || messages.length === 0) {
                    container.innerHTML = `
                        <div class="text-center py-12 px-4 bg-slate-950/40 rounded-xl border border-slate-800/80">
                            <div class="w-12 h-12 mx-auto rounded-2xl bg-cyan-950/50 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mb-3 shadow-inner">
                                <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                                </svg>
                            </div>
                            <h4 class="text-sm font-black text-slate-200">Live Chat jest gotowy</h4>
                            <p class="text-xs text-slate-400 mt-1 max-w-sm mx-auto">Napisz wiadomość poniżej, zadaj pytanie lub zgłoś natychmiastowy alert z hali produkcyjnej.</p>
                        </div>
                    `;
                    return;
                }

                const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 80;
                const currentRole = state.role || 'AUDITOR';
                const currentUserName = (state.auditor_name || state.auditor || state.user_name || '').toLowerCase();

                container.innerHTML = messages.map(msg => {
                    const isMgr = (msg.sender_role === 'MANAGER');
                    const isMe = (currentRole === 'MANAGER' && isMgr) || 
                                 (currentRole !== 'MANAGER' && !isMgr && msg.sender_name && msg.sender_name.toLowerCase().includes(currentUserName));

                    let prioBadge = '';
                    if (msg.priority === 'HOLD') {
                        prioBadge = `<span class="px-2 py-0.5 rounded text-[9px] font-black bg-rose-600 text-white border border-rose-400 animate-pulse inline-flex items-center gap-1"><i class="fas fa-triangle-exclamation"></i><span>HOLD CCP</span></span>`;
                    } else if (msg.priority === 'WARNING') {
                        prioBadge = `<span class="px-2 py-0.5 rounded text-[9px] font-black bg-amber-500/30 text-amber-300 border border-amber-400/50 inline-flex items-center gap-1"><i class="fas fa-circle-exclamation"></i><span>UWAGA CP</span></span>`;
                    } else if (msg.priority === 'INFO') {
                        prioBadge = `<span class="px-2 py-0.5 rounded text-[9px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 inline-flex items-center gap-1"><i class="fas fa-circle-info"></i><span>INFO</span></span>`;
                    }

                    const lineTag = msg.line_name ? `<span class="px-2 py-0.5 rounded text-[9px] font-bold bg-slate-900 border border-slate-700 text-slate-300 inline-flex items-center gap-1"><i class="fas fa-industry text-amber-400"></i><span>${msg.line_name}</span></span>` : '';

                    const senderLabel = isMgr 
                        ? `<span class="text-amber-300 font-black flex items-center gap-1"><i class="fas fa-user-shield text-[10px]"></i> ${msg.sender_name || 'Kierownik Jakości'}</span>`
                        : `<span class="text-cyan-300 font-bold flex items-center gap-1"><i class="fas fa-hard-hat text-[10px]"></i> ${msg.sender_name || 'Audytor Operacyjny'}</span>`;

                    const bubbleAlign = isMe ? 'items-end' : 'items-start';
                    const bubbleBg = isMe 
                        ? (isMgr ? 'bg-gradient-to-br from-amber-600 to-amber-700 text-white rounded-br-none border border-amber-400/40 shadow-lg' : 'bg-gradient-to-br from-cyan-600 to-blue-600 text-white rounded-br-none border border-cyan-400/40 shadow-lg')
                        : (isMgr ? 'bg-amber-950/40 text-slate-100 rounded-bl-none border border-amber-500/40 shadow-md' : 'bg-slate-900 text-slate-100 rounded-bl-none border border-slate-700 shadow-md');

                    return `
                        <div class="flex flex-col ${bubbleAlign} space-y-1">
                            <div class="flex items-center gap-2 text-[10px] px-1">
                                ${senderLabel}
                                ${prioBadge}
                                ${lineTag}
                                <span class="text-slate-500 font-mono text-[9px]">${msg.timestamp ? (msg.timestamp.split(' ')[1] || msg.timestamp) : ''}</span>
                            </div>
                            <div class="max-w-[85%] sm:max-w-[75%] p-3 rounded-2xl text-xs sm:text-[13px] leading-relaxed break-words ${bubbleBg}">
                                ${msg.message}
                            </div>
                        </div>
                    `;
                }).join('');

                if (shouldScrollToBottom || isNearBottom) {
                    container.scrollTop = container.scrollHeight;
                }
            } catch(e) {
                console.warn("Błąd ładowania wiadomości czatu:", e);
            }
        };

        window.sendLiveChatMessage = async function() {
            const inputEl = document.getElementById('live-chat-input');
            const lineEl = document.getElementById('live-chat-line');
            const prioEl = document.getElementById('live-chat-prio');
            const sendBtn = document.getElementById('btn-live-chat-send');
            if (!inputEl) return;

            const text = (inputEl.value || '').trim();
            if (!text) return;

            const senderName = state.role === 'MANAGER' 
                ? (state.user_name || state.auditor_id || 'Kierownik Jakości (Key User)')
                : (state.auditor_id || state.auditor_name || state.auditor || 'Audytor Operacyjny');

            const payload = {
                sender_name: senderName,
                sender_role: state.role || 'AUDITOR',
                line_name: lineEl ? lineEl.value : 'Hala Główna',
                priority: prioEl ? prioEl.value : 'CHAT',
                message: text
            };

            try {
                if (sendBtn) {
                    sendBtn.disabled = true;
                    sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                }

                const res = await fetch('/api/auditor-notes/chat-send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (res.ok) {
                    inputEl.value = '';
                    if (prioEl) prioEl.value = 'CHAT';
                    await loadLiveChatMessages(true);
                } else {
                    const err = await res.json();
                    alert("Błąd wysyłania wiadomości: " + (err.detail || 'Nieznany błąd'));
                }
            } catch(e) {
                console.error("Błąd sieci czatu:", e);
                alert("Błąd połączenia z serwerem czatu.");
            } finally {
                if (sendBtn) {
                    sendBtn.disabled = false;
                    sendBtn.innerHTML = '<i class="fas fa-paper-plane text-xs"></i><span>Wyślij</span>';
                }
                inputEl.focus();
            }
        };

        window.handleLiveChatKeyDown = function(event) {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                sendLiveChatMessage();
            }
        };

        window.insertLiveChatQuickAction = function(actionType) {
            const prioEl = document.getElementById('live-chat-prio');
            const inputEl = document.getElementById('live-chat-input');
            if (!inputEl) return;

            if (actionType === 'HOLD') {
                if (prioEl) prioEl.value = 'HOLD';
                inputEl.value = '[PILNE CCP] Natychmiastowe wstrzymanie procesu produkcyjnego na linii! Przyczyna: ';
            } else if (actionType === 'WARNING') {
                if (prioEl) prioEl.value = 'WARNING';
                inputEl.value = '[UWAGA CP] Odchylenie od standardu dobrych praktyk higienicznych (GMP/GHP): ';
            } else if (actionType === 'RESUME') {
                if (prioEl) prioEl.value = 'INFO';
                inputEl.value = '[WZNOWIENIE] Niezgodność usunięta, linia produkcyjna dopuszczona do wznowienia pracy.';
            } else if (actionType === 'QUESTION') {
                if (prioEl) prioEl.value = 'CHAT';
                inputEl.value = '[ZAPYTANIE] Pytanie do Kierownika Jakości: ';
            }
            inputEl.focus();
        };

        window.clearLiveChatHistory = async function() {
            if (!confirm("Czy na pewno chcesz wyczyścić całą historię Live Chatu?")) return;
            try {
                const res = await fetch('/api/auditor-notes/chat-clear', { method: 'POST' });
                if (res.ok) {
                    await loadLiveChatMessages(true);
                }
            } catch(e) {
                console.error("Błąd czyszczenia czatu:", e);
            }
        };

        window.updateAuditorNotesBadge = async function() {
            try {
                const quickNoteTag = document.getElementById('tag-quick-note');
                if (quickNoteTag) {
                    quickNoteTag.classList.remove('hidden');
                }
            } catch(e) {}
        };

        // Aliases dla pełnej wstecznej kompatybilności
        window.openQuickNoteModal = window.openLiveChatModal;
        window.closeQuickNoteModal = window.closeLiveChatModal;
        window.openAuditorNotesInbox = window.openLiveChatModal;
        window.loadManagerAuditorNotes = window.loadLiveChatMessages;
        window.loadAuditorInboxMessages = window.loadLiveChatMessages;
        window.loadAuditorSentMessages = window.loadLiveChatMessages;

        function selectTile(cat, val, btn) {
            document.querySelectorAll(`.tile-${cat}`).forEach(b => b.classList.remove('tile-selected'));
            btn.classList.add('tile-selected');
            state[cat] = val;
            if (cat === 'line') document.getElementById('hidden-line-input').value = val;
            formHistory.saveState('view-audit-form');
        }

        let currentPassportLineId = null;

        // --- OBSŁUGA DOKUMENTACJI FOTOGRAFICZNEJ AUDYTU (APARAT / PLIK) ---
        window.currentAuditPhotoFile = null;

        window.handleAuditPhotoSelected = function(event) {
            const file = event.target.files && event.target.files[0];
            if (!file) {
                // Jeśli użytkownik anulował okno systemowe aparatu/galerii (np. na iOS Safari / Android),
                // input czyści event.target.files. Wywołujemy removeAuditPhoto(), aby stan i podgląd
                // nie były rozsynchronizowane z wysyłanymi danymi w FormData.
                if (typeof window.removeAuditPhoto === 'function') {
                    window.removeAuditPhoto();
                }
                return;
            }

            // Sprawdź format pliku (zdjęcia: jpg, png, webp, heic)
            if (!file.type.startsWith('image/')) {
                alert('Proszę wybrać plik graficzny (zdjęcie aparatu lub plik graficzny).');
                if (typeof window.removeAuditPhoto === 'function') {
                    window.removeAuditPhoto();
                } else {
                    event.target.value = '';
                }
                return;
            }

            // Sprawdź limit rozmiaru (maksymalnie 15MB)
            if (file.size > 15 * 1024 * 1024) {
                alert('Rozmiar zdjęcia przekracza dopuszczalny limit 15 MB.');
                if (typeof window.removeAuditPhoto === 'function') {
                    window.removeAuditPhoto();
                } else {
                    event.target.value = '';
                }
                return;
            }

            // Wyczyść drugi input aparatu/pliku, aby zachować spójność
            const otherInputId = event.target.id === 'audit-photo-camera' ? 'audit-photo-file' : 'audit-photo-camera';
            const otherInput = document.getElementById(otherInputId);
            if (otherInput) otherInput.value = '';

            window.currentAuditPhotoFile = file;

            const reader = new FileReader();
            reader.onload = function(e) {
                const previewBox = document.getElementById('audit-photo-preview-box');
                const previewImg = document.getElementById('audit-photo-preview-img');
                const previewName = document.getElementById('audit-photo-preview-name');
                const removeBtn = document.getElementById('btn-remove-audit-photo');

                if (previewImg) previewImg.src = e.target.result;
                if (previewName) previewName.textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
                if (previewBox) previewBox.classList.remove('hidden');
                if (removeBtn) removeBtn.classList.remove('hidden');
            };
            reader.readAsDataURL(file);
        };

        window.removeAuditPhoto = function() {
            window.currentAuditPhotoFile = null;
            const camInput = document.getElementById('audit-photo-camera');
            const fileInput = document.getElementById('audit-photo-file');
            const previewBox = document.getElementById('audit-photo-preview-box');
            const previewImg = document.getElementById('audit-photo-preview-img');
            const previewName = document.getElementById('audit-photo-preview-name');
            const removeBtn = document.getElementById('btn-remove-audit-photo');

            if (camInput) camInput.value = '';
            if (fileInput) fileInput.value = '';
            if (previewImg) previewImg.src = '';
            if (previewName) previewName.textContent = '---';
            if (previewBox) previewBox.classList.add('hidden');
            if (removeBtn) removeBtn.classList.add('hidden');
        };

        function generateLineCodeFromName(name) {
            if (!name || !name.trim()) return '';

            // Usuń polskie znaki diakrytyczne
            const clean = name.trim()
                .replace(/ą/gi, 'a').replace(/ć/gi, 'c').replace(/ę/gi, 'e')
                .replace(/ł/gi, 'l').replace(/ń/gi, 'n').replace(/ó/gi, 'o')
                .replace(/ś/gi, 's').replace(/ź/gi, 'z').replace(/ż/gi, 'z');

            // 1. Sprawdź czy nazwa zawiera numer linii, np. "Linia 4454", "Linia 2", "L3"
            const numMatch = clean.match(/(?:linia\s*|l\s*|#\s*)(\d+)/i) || clean.match(/(\d+)/);
            const lineNum = numMatch ? numMatch[1] : null;

            // Wyciągnij słowa kluczowe (pomijając słowa typu "Linia", "i", "w", "oraz", "na", "&")
            const stopWords = new Set(['linia', 'line', 'i', 'w', 'na', 'oraz', 'z', 'do', 'dla', 'nr', 'the', 'and', '&', '-']);
            const words = clean.replace(/[^a-zA-Z0-9\s]/g, ' ')
                .split(/\s+/)
                .filter(w => w.length > 0 && !stopWords.has(w.toLowerCase()));

            // Znajdź słowo opisujące proces (np. Konszowanie, Pakowanie, Formowanie, Praliny)
            const processWords = words.filter(w => !/^\d+$/.test(w) && !(lineNum && w.toLowerCase() === `l${lineNum}`.toLowerCase()));
            let keyword = '';
            if (processWords.length > 0) {
                // Weź do 5 znaków pierwszego słowa procesowego
                keyword = processWords[0].substring(0, 5).toUpperCase();
            }

            if (lineNum && keyword) {
                return `L${lineNum}-${keyword}`;
            } else if (lineNum) {
                return `LIN-${lineNum}`;
            } else if (words.length > 0) {
                // Jeśli nie ma cyfry, stwórz kod z pierwszych 2-3 słów
                const codeParts = words.slice(0, 3).map(w => w.substring(0, 4).toUpperCase());
                return `LIN-${codeParts.join('-')}`;
            }

            return 'LIN-01';
        }

        let isCodeManuallyEdited = false;

        function handleNewLineNameInput(nameVal) {
            const codeInput = document.getElementById('new-line-code');
            if (!codeInput) return;

            // Jeśli użytkownik ręcznie nie nadpisał kodu lub pole kodu było puste
            if (!isCodeManuallyEdited || !codeInput.value.trim()) {
                const autoCode = generateLineCodeFromName(nameVal);
                codeInput.value = autoCode;
                const badge = document.getElementById('badge-code-auto');
                if (badge) {
                    badge.innerHTML = '<i class="fas fa-bolt text-amber-400 mr-1"></i>Auto-kod';
                    badge.className = 'text-[9px] text-amber-400 font-black tracking-wider uppercase flex items-center';
                }
            }
        }

        let editingLineId = null;

        function resetLineFormToNew() {
            editingLineId = null;
            const titleEl = document.getElementById('form-line-title');
            if (titleEl) {
                titleEl.innerHTML = '<i class="fas fa-plus-circle mr-1"></i> Formularz Nowej Linii Produkcyjnej';
            }
            const btnSave = document.getElementById('btn-save-line');
            if (btnSave) {
                btnSave.innerHTML = '<i class="fas fa-floppy-disk mr-1.5"></i>Zapisz Linię w Rejestrze Fabrycznym';
            }
            const nameEl = document.getElementById('new-line-name');
            const codeEl = document.getElementById('new-line-code');
            const notesEl = document.getElementById('new-line-notes');
            if (nameEl) nameEl.value = '';
            if (codeEl) codeEl.value = '';
            if (notesEl) notesEl.value = '';
            isCodeManuallyEdited = false;
            const badge = document.getElementById('badge-code-auto');
            if (badge) {
                badge.innerHTML = '<i class="fas fa-bolt text-amber-400 mr-1"></i>Auto-kod';
                badge.className = 'text-[9px] text-amber-400 font-black tracking-wider uppercase flex items-center';
            }
        }

        function toggleLineAddForm() {
            const form = document.getElementById('form-add-line-container');
            const btn = document.getElementById('btn-toggle-add-line');
            if (!form) return;

            const isCurrentlyHidden = form.classList.contains('hidden');

            if (editingLineId && !isCurrentlyHidden) {
                resetLineFormToNew();
                form.classList.add('hidden');
                if (btn) btn.innerHTML = '<i class="fas fa-plus"></i> Nowa Linia';
                return;
            }

            form.classList.toggle('hidden', !isCurrentlyHidden);
            if (btn) {
                btn.innerHTML = isCurrentlyHidden ? '<i class="fas fa-times"></i> Zwiń Formularz' : '<i class="fas fa-plus"></i> Nowa Linia';
            }

            if (isCurrentlyHidden) {
                resetLineFormToNew();
                isCodeManuallyEdited = false;
                const codeInput = document.getElementById('new-line-code');
                if (codeInput) {
                    codeInput.oninput = function() {
                        isCodeManuallyEdited = true;
                        const badge = document.getElementById('badge-code-auto');
                        if (badge) {
                            badge.innerHTML = '<i class="fas fa-pen mr-1"></i>Ręczny';
                            badge.className = 'text-[9px] text-cyan-400 font-black tracking-wider uppercase flex items-center';
                        }
                    };
                }
            }
        }

        window.startEditLineFromPassport = function() {
            if (!currentPassportLineId) return;
            const targetId = Number(currentPassportLineId);
            const line = productionLinesData.find(l => Number(l.id) === targetId);
            if (!line) {
                alert("Nie odnaleziono danych wybranej linii.");
                return;
            }

            editingLineId = targetId;

            // 1. Zamykamy modal profilu linii
            closeLinePassportModal();

            // 2. Otwieramy formularz linii
            const form = document.getElementById('form-add-line-container');
            const btnToggle = document.getElementById('btn-toggle-add-line');
            if (form) form.classList.remove('hidden');
            if (btnToggle) btnToggle.innerHTML = '<i class="fas fa-times"></i> Zwiń Edycję';

            // 3. Zmieniamy nagłówek formularza i przycisk zapisu
            const titleEl = document.getElementById('form-line-title');
            if (titleEl) {
                titleEl.innerHTML = `<i class="fas fa-edit mr-1 text-amber-400"></i> Edycja linii: <span class="text-white">${line.name}</span>`;
            }
            const btnSave = document.getElementById('btn-save-line');
            if (btnSave) {
                btnSave.innerHTML = `<i class="fas fa-floppy-disk mr-1.5"></i>Zapisz Zmiany w Linii #${targetId}`;
            }

            // 4. Wypełniamy pola danymi wybranej linii
            const nameEl = document.getElementById('new-line-name');
            const codeEl = document.getElementById('new-line-code');
            const zoneEl = document.getElementById('new-line-zone');
            const allergenEl = document.getElementById('new-line-allergen');
            const ccpEl = document.getElementById('new-line-ccp');
            const statusEl = document.getElementById('new-line-status');
            const notesEl = document.getElementById('new-line-notes');

            if (nameEl) nameEl.value = line.name || '';
            if (codeEl) codeEl.value = line.code || '';
            if (zoneEl && line.default_zone) zoneEl.value = line.default_zone;
            if (allergenEl && line.allergen_profile) allergenEl.value = line.allergen_profile;
            if (ccpEl) ccpEl.value = line.ccp_equipment || '';
            if (statusEl && line.line_status) statusEl.value = line.line_status;
            if (notesEl) notesEl.value = line.notes || '';

            isCodeManuallyEdited = true;
            const badge = document.getElementById('badge-code-auto');
            if (badge) {
                badge.innerHTML = '<i class="fas fa-pen-to-square mr-1"></i>Edycja';
                badge.className = 'text-[9px] text-cyan-400 font-black tracking-wider uppercase flex items-center';
            }

            // 5. Płynne przewinięcie do formularza
            if (form) form.scrollIntoView({ behavior: 'smooth', block: 'center' });
            if (nameEl) nameEl.focus();
        };

        function getStatusBadgeClass(status) {
            const s = (status || '').toUpperCase();
            if (s.includes('HOLD') || s.includes('KWARANTANNA') || s.includes('BLOKAD')) {
                return 'bg-rose-950 text-rose-300 border border-rose-500 animate-pulse';
            } else if (s.includes('WARUNKOW')) {
                return 'bg-amber-950 text-amber-300 border border-amber-500/50';
            } else if (s.includes('CIP') || s.includes('MYCIE') || s.includes('SANITYZ')) {
                return 'bg-blue-950 text-blue-300 border border-blue-500/50';
            } else {
                return 'bg-emerald-950 text-emerald-300 border border-emerald-500/40';
            }
        }

        function getStatusBadge(status) {
            const s = (status || '').toUpperCase();
            if (s.includes('HOLD') || s.includes('KWARANTANNA') || s.includes('BLOKAD')) {
                return `<span class="text-[9px] font-black px-2 py-0.5 rounded-full bg-rose-950 text-rose-300 border border-rose-500 animate-pulse inline-flex items-center gap-1"><i class="fas fa-triangle-exclamation text-[10px]"></i><span>HOLD LOT</span></span>`;
            } else if (s.includes('WARUNKOW')) {
                return `<span class="text-[9px] font-black px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-500/50 inline-flex items-center gap-1"><i class="fas fa-circle-exclamation text-[10px]"></i><span>Warunkowo</span></span>`;
            } else if (s.includes('CIP') || s.includes('MYCIE') || s.includes('SANITYZ')) {
                return `<span class="text-[9px] font-black px-2 py-0.5 rounded-full bg-blue-950 text-blue-300 border border-blue-500/50 inline-flex items-center gap-1"><i class="fas fa-pump-medical text-[10px]"></i><span>Mycie CIP</span></span>`;
            } else {
                return `<span class="text-[9px] font-black px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-500/40 inline-flex items-center gap-1"><i class="fas fa-circle-check text-[10px]"></i><span>Zwolniona</span></span>`;
            }
        }

        function getZoneBadge(zone) {
            const z = (zone || '').toLowerCase();
            if (z.includes('wysok') || z.includes('high')) {
                return `<span class="text-[9px] font-black px-2 py-0.5 rounded-full bg-rose-950 text-rose-300 border border-rose-500/40 inline-flex items-center gap-1"><i class="fas fa-shield-virus text-[10px]"></i><span>High Care</span></span>`;
            } else if (z.includes('średni') || z.includes('medium')) {
                return `<span class="text-[9px] font-black px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-500/40 inline-flex items-center gap-1"><i class="fas fa-shield-halved text-[10px]"></i><span>Medium Care</span></span>`;
            } else if (z.includes('nisk') || z.includes('low')) {
                return `<span class="text-[9px] font-black px-2 py-0.5 rounded-full bg-yellow-950 text-yellow-300 border border-yellow-500/40 inline-flex items-center gap-1"><i class="fas fa-box text-[10px]"></i><span>Low Care</span></span>`;
            } else if (z.includes('pakow') || z.includes('pack')) {
                return `<span class="text-[9px] font-black px-2 py-0.5 rounded-full bg-purple-950 text-purple-300 border border-purple-500/40 inline-flex items-center gap-1"><i class="fas fa-boxes-packing text-[10px]"></i><span>Packaging</span></span>`;
            } else if (z.includes('magazyn') || z.includes('warehous')) {
                return `<span class="text-[9px] font-black px-2 py-0.5 rounded-full bg-blue-950 text-blue-300 border border-blue-500/40 inline-flex items-center gap-1"><i class="fas fa-warehouse text-[10px]"></i><span>Magazyn</span></span>`;
            } else {
                return `<span class="text-[9px] font-black px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 inline-flex items-center gap-1"><i class="fas fa-gears text-[10px]"></i><span>Pomocnicza</span></span>`;
            }
        }

        function renderLinesManagerList() {
            const c = document.getElementById('lines-list-container');
            if (!c) return;

            // Zliczanie statystyk
            let total = productionLinesData.length;
            let active = 0;
            let hold = 0;
            let clean = 0;

            productionLinesData.forEach(l => {
                const st = (l.line_status || '').toUpperCase();
                if (st.includes('HOLD') || st.includes('KWARANTANNA') || st.includes('BLOKAD')) hold++;
                else if (st.includes('CIP') || st.includes('SANITYZACJA') || st.includes('MYCIE')) clean++;
                else active++;
            });

            if (document.getElementById('stat-lines-total')) document.getElementById('stat-lines-total').innerText = total;
            if (document.getElementById('stat-lines-active')) document.getElementById('stat-lines-active').innerText = active;
            if (document.getElementById('stat-lines-hold')) document.getElementById('stat-lines-hold').innerText = hold;
            if (document.getElementById('stat-lines-clean')) document.getElementById('stat-lines-clean').innerText = clean;

            if (productionLinesData.length === 0) {
                c.innerHTML = '<p class="text-xs text-slate-500 italic p-3 text-center">Brak zdefiniowanych linii produkcyjnych.</p>';
                return;
            }

            c.innerHTML = productionLinesData.map(l => `
                <div class="bg-slate-900/90 p-3 rounded-2xl border border-slate-800 hover:border-amber-500/40 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md group">
                    <div class="flex-1 cursor-pointer" onclick="openLinePassportModal(${l.id})">
                        <div class="flex items-center gap-2 flex-wrap">
                            <span class="font-black text-white text-sm group-hover:text-amber-300 transition-colors">${l.name}</span>
                            ${getStatusBadge(l.line_status)}
                            ${getZoneBadge(l.default_zone)}
                        </div>
                        <div class="flex flex-wrap items-center gap-2 text-[10.5px] text-slate-400 mt-1">
                            <span>Kod: <b class="font-mono text-slate-300">${l.code || 'Brak'}</b></span>
                            <span class="text-slate-600">•</span>
                            <span>Alergeny: <b class="text-amber-200">${l.allergen_profile || 'Brak profilu'}</b></span>
                            <span class="text-slate-600">•</span>
                            <span>CCP: <b class="text-slate-300 truncate max-w-[200px] inline-block align-bottom">${l.ccp_equipment || 'Brak'}</b></span>
                        </div>
                    </div>
                    <div class="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        <button onclick="openLinePassportModal(${l.id})" class="tile-3d bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 cursor-pointer">
                            <i class="fas fa-sliders-h"></i> Profil Linii
                        </button>
                        <button onclick="deleteProductionLine(${l.id})" class="tile-3d bg-rose-950/80 hover:bg-rose-900 border border-rose-500/40 text-rose-300 px-2.5 py-1.5 rounded-xl font-bold text-xs cursor-pointer">
                            Usuń
                        </button>
                    </div>
                </div>
            `).join('');
        }

        async function saveProductionLine() {
            const name = document.getElementById('new-line-name').value.trim();
            const code = document.getElementById('new-line-code').value.trim();
            const default_zone = document.getElementById('new-line-zone').value;
            const allergen_profile = document.getElementById('new-line-allergen').value;
            const ccp_equipment = document.getElementById('new-line-ccp').value.trim();
            const line_status = document.getElementById('new-line-status').value;
            const notes = document.getElementById('new-line-notes').value.trim();

            if (!name) return alert("Wpisz nazwę linii!");

            const payload = {
                name, code, default_zone, allergen_profile, ccp_equipment, line_status, notes
            };

            try {
                let res;
                if (editingLineId) {
                    res = await apiFetch(`/api/lines/${editingLineId}`, {
                        method: 'PUT',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify(payload)
                    });
                } else {
                    res = await apiFetch('/api/lines', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify(payload)
                    });
                }

                if (res && res.ok) {
                    const msg = editingLineId 
                        ? `Pomyślnie zaktualizowano dane linii "${name}"!` 
                        : "Zarejestrowano nową linię produkcyjną z profilem sanitarnym!";
                    alert(msg);
                    resetLineFormToNew();
                    const form = document.getElementById('form-add-line-container');
                    if (form) form.classList.add('hidden');
                    const btn = document.getElementById('btn-toggle-add-line');
                    if (btn) btn.innerHTML = '<i class="fas fa-plus"></i> Nowa Linia';
                    await loadProductionLines();
                    renderLinesManagerList();
                } else {
                    const err = await res.json().catch(() => ({}));
                    alert(`Błąd podczas zapisu linii: ${err.detail || 'Brak uprawnień lub błąd serwera'}`);
                }
            } catch (e) {
                console.error("Błąd zapisu linii:", e);
                alert("Błąd połączenia podczas zapisywania linii.");
            }
        }
        window.saveProductionLine = saveProductionLine;
        window.addNewProductionLine = saveProductionLine;

        async function openLinePassportModal(lineId) {
            currentPassportLineId = lineId;
            const modal = document.getElementById('modal-line-passport');
            if (!modal) return;

            try {
                const res = await apiFetch(`/api/lines/${lineId}`);
                if (!res.ok) throw new Error("Nie udało się pobrać danych linii");
                const data = await res.json();
                const l = data.line || data;
                const audits = data.recent_audits || [];

                document.getElementById('pass-line-name').textContent = `Profil: ${l.name || '---'}`;
                document.getElementById('pass-line-code').textContent = `Kod identyfikacyjny: ${l.code || 'Brak'}`;
                
                const badge = document.getElementById('pass-status-badge');
                badge.textContent = l.line_status || 'PRODUKCJA (Zwolniona)';
                badge.className = `text-[10px] font-black px-2.5 py-0.5 rounded-full ${getStatusBadgeClass(l.line_status)}`;

                const sel = document.getElementById('pass-new-status-select');
                if (sel) sel.value = l.line_status || 'PRODUKCJA (Zwolniona)';

                document.getElementById('pass-zone').textContent = l.default_zone || 'Standardowa';
                document.getElementById('pass-allergen').textContent = l.allergen_profile || 'Brak alergenów';
                document.getElementById('pass-ccp').textContent = l.ccp_equipment || 'Brak aparatury krytycznej';

                const auditsContainer = document.getElementById('pass-recent-audits');
                if (audits.length > 0) {
                    auditsContainer.innerHTML = audits.map(a => {
                        const verdictClass = a.slm_verdict === 'OK' ? 'text-emerald-400' : 'text-rose-400 font-bold';
                        return `
                            <div class="flex items-center justify-between text-[10px] bg-slate-900/60 p-1.5 rounded-lg border border-slate-800/80">
                                <span class="text-slate-300 font-mono">${a.audit_date || a.timestamp} (${a.audit_type})</span>
                                <span class="${verdictClass}">
                                    ${a.slm_verdict || 'OK'} (${a.total_score_pct != null ? a.total_score_pct + '%' : '---'})
                                </span>
                            </div>
                        `;
                    }).join('');
                } else {
                    auditsContainer.innerHTML = '<p class="text-[10px] text-slate-500 italic">Brak zarejestrowanych audytów dla tej linii.</p>';
                }

                modal.classList.remove('hidden');
            } catch(e) {
                alert("Błąd otwierania profilu linii: " + e.message);
            }
        }

        function closeLinePassportModal() {
            const modal = document.getElementById('modal-line-passport');
            if (modal) modal.classList.add('hidden');
            currentPassportLineId = null;
        }

        async function applyLineStatusChange() {
            if (!currentPassportLineId) return;
            const newStatus = document.getElementById('pass-new-status-select').value;
            const notes = prompt(`Zmiana statusu linii na: "${newStatus}".\nPodaj uzasadnienie zmiany (wymóg IFS Food v8):`, "Weryfikacja jakościowa / Zmiana dyspozycji produkcyjnej");
            
            if (notes === null) return; // anulowano

            try {
                const res = await apiFetch(`/api/lines/${currentPassportLineId}/status`, {
                    method: 'PATCH',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ line_status: newStatus, notes: notes })
                });

                if (res && res.ok) {
                    alert(`Status linii został zaktualizowany na: ${newStatus}`);
                    await loadProductionLines();
                    renderLinesManagerList();
                    openLinePassportModal(currentPassportLineId); // odśwież widok profilu
                } else {
                    const err = await res.json().catch(() => ({}));
                    alert(`Błąd podczas zmiany statusu linii: ${err.detail || 'Brak uprawnień'}`);
                }
            } catch(e) {
                alert("Błąd połączenia: " + e.message);
            }
        }

        async function deleteProductionLine(id) {
            if (!confirm("Czy na pewno chcesz usunąć tę linię z rejestru fabrycznego?")) return;
            const res = await apiFetch(`/api/lines/${id}`, { method: 'DELETE' });
            if (res && res.ok) {
                await loadProductionLines();
                renderLinesManagerList();
            } else {
                const err = await res.json().catch(() => ({}));
                alert(`Błąd usuwania linii: ${err.detail || 'Brak uprawnień'}`);
            }
        }

        async function loadAuditorsDropdown(type = "HACCP") {
            try {
                const res = await apiFetch(`/api/auth/auditors?type=${encodeURIComponent(type)}`);
                const list = await res.json();
                
                const createOption = (auditor) => {
                    const name = (typeof auditor === 'object' && auditor !== null) ? (auditor.full_name || auditor.name || auditor.id) : auditor;
                    const val = (typeof auditor === 'object' && auditor !== null) ? (auditor.full_name || auditor.name || auditor.id) : auditor;
                    return `<option value="${val}">${name}</option>`;
                };

                const opts = Array.isArray(list) ? list.map(createOption).join('') : '';
                const audSelect = document.getElementById('plan-auditor');
                const backupSelect = document.getElementById('plan-backup');
                if (audSelect) audSelect.innerHTML = opts;
                if (backupSelect) backupSelect.innerHTML = `<option value="Brak" selected>Brak</option>` + opts;
                syncPlanAuditorBackupOptions();
            } catch (err) {
                console.warn("[loadAuditorsDropdown] Błąd pobierania audytorów:", err);
            }
        }

        function syncPlanAuditorBackupOptions() {
            const lead = document.getElementById('plan-auditor');
            const backup = document.getElementById('plan-backup');
            if (!lead || !backup) return;
            const leadVal = (lead.value || '').trim();
            Array.from(backup.options).forEach(opt => {
                if (opt.value !== "Brak" && opt.value.trim() === leadVal) {
                    opt.disabled = true;
                    if (backup.value.trim() === leadVal) {
                        backup.value = "Brak";
                    }
                } else {
                    opt.disabled = false;
                }
            });
        }
        window.syncPlanAuditorBackupOptions = syncPlanAuditorBackupOptions;

        function syncMgrAuditorBackupOptions() {
            const lead = document.getElementById('mgr-edit-lead');
            const backup = document.getElementById('mgr-edit-backup');
            if (!lead || !backup) return;
            const leadVal = (lead.value || '').trim();
            Array.from(backup.options).forEach(opt => {
                if (opt.value !== "Brak" && opt.value.trim() === leadVal) {
                    opt.disabled = true;
                    if (backup.value.trim() === leadVal) {
                        backup.value = "Brak";
                    }
                } else {
                    opt.disabled = false;
                }
            });
        }
        window.syncMgrAuditorBackupOptions = syncMgrAuditorBackupOptions;

        function filterPlanAuditorsByType(v) { loadAuditorsDropdown(v); }

        function sanitizeBadTerms(str) {
            if (!str) return '';
            const bad = ['odzieżow', 'na całe tempo', 'clothing', 'sita odzieżowego', 'ccp02', 'clo1_check', 'sitom sita', 'sprawy sita', 'ciałko sita', 'sensor check', 'sita roboczego'];
            for (let b of bad) {
                if (str.toLowerCase().includes(b)) {
                    return 'Awaria CCP (Detektor Metali / Sita kontrolne). Natychmiastowe zatrzymanie linii oraz blokada magazynowa partii wyrobu (Hold Lot) od ostatniego poprawnego testu wzorców.';
                }
            }
            return str;
        }

        function parseSlmJson(raw) {
            if (!raw || typeof raw !== 'string') return null;
            let trimmed = raw.trim();
            if (trimmed.includes('```json')) {
                trimmed = trimmed.split('```json')[1].split('```')[0].trim();
            } else if (trimmed.includes('```')) {
                trimmed = trimmed.split('```')[1].split('```')[0].trim();
            }

            let startIdx = trimmed.indexOf('{');
            let endIdx = trimmed.lastIndexOf('}');
            if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) return null;
            let jsonStr = trimmed.substring(startIdx, endIdx + 1);

            // 1. Próba czystego JSON.parse
            try {
                const parsed = JSON.parse(jsonStr);
                if (parsed && typeof parsed === 'object' && (parsed.status || parsed.poziom_ryzyka || parsed.decyzja)) {
                    return parsed;
                }
            } catch(e) {}

            // 2. Naprawa nieliteralnych nowych linii w stringach JSON
            try {
                let cleaned = jsonStr.replace(/:\s*"([^"]*)"/gs, function(m, p1) {
                    return ': "' + p1.replace(/\n/g, '\\n').replace(/\r/g, '').replace(/"/g, '\\"') + '"';
                });
                const parsed = JSON.parse(cleaned);
                if (parsed && typeof parsed === 'object' && (parsed.status || parsed.poziom_ryzyka || parsed.decyzja)) {
                    return parsed;
                }
            } catch(e) {}

            // 3. Fallback: Ekstrakcja wyrażeniami regularnymi
            try {
                const statusMatch = jsonStr.match(/"status"\s*:\s*"([^"]+)"/i);
                const riskMatch = jsonStr.match(/"poziom_ryzyka"\s*:\s*"([^"]+)"/i);
                const decMatch = jsonStr.match(/"decyzja"\s*:\s*"((?:[^"\\]|\\.)*)"/s);
                if (statusMatch || riskMatch || decMatch) {
                    const akcje = [];
                    const akcjeMatch = jsonStr.match(/"akcje_korygujace"\s*:\s*\[(.*?)\]/s);
                    if (akcjeMatch) {
                        const itemMatches = akcjeMatch[1].match(/"((?:[^"\\]|\\.)*)"/g);
                        if (itemMatches) itemMatches.forEach(m => akcje.push(m.slice(1, -1)));
                    }
                    const podpowiedzi = [];
                    const podpMatch = jsonStr.match(/"podpowiedzi_prewencyjne"\s*:\s*\[(.*?)\]/s);
                    if (podpMatch) {
                        const itemMatches = podpMatch[1].match(/"((?:[^"\\]|\\.)*)"/g);
                        if (itemMatches) itemMatches.forEach(m => podpowiedzi.push(m.slice(1, -1)));
                    }
                    return {
                        status: statusMatch ? statusMatch[1] : "NOK",
                        poziom_ryzyka: riskMatch ? riskMatch[1] : "KRYTYCZNE (HOLD LOT)",
                        decyzja: decMatch ? decMatch[1].replace(/\\n/g, '\n') : "Awaria CCP / Odchylenie jakościowe.",
                        akcje_korygujace: akcje,
                        podpowiedzi_prewencyjne: podpowiedzi
                    };
                }
            } catch(e) {}

            return null;
        }

        function renderGraphicAuditCard(obj) {
            const isNok = String(obj.status || '').toUpperCase().includes('NOK');
            const risk = obj.poziom_ryzyka || (isNok ? 'KRYTYCZNE (HOLD LOT)' : 'NISKIE');
            let decyzja = sanitizeBadTerms(obj.decyzja || 'Zezwolenie na kontynuację operacji.');
            
            let akcje = Array.isArray(obj.akcje_korygujace) ? obj.akcje_korygujace : [];
            akcje = akcje.map(a => sanitizeBadTerms(a)).filter(a => !a.toLowerCase().includes('sita odzież'));
            if (akcje.length === 0 && isNok) {
                akcje = [
                    "Natychmiastowe zatrzymanie linii produkcyjnej i fizyczne odizolowanie wyrobów od ostatniego zaliczonego testu",
                    "Założenie blokady systemowej w ERP (status HOLD) na całą podejrzaną partię wyrobów",
                    "Przegląd mechaniczny i walidacja pętli detektora metali wzorcami Fe/Non-Fe/SS"
                ];
            }

            let podpowiedzi = Array.isArray(obj.podpowiedzi_prewencyjne) ? obj.podpowiedzi_prewencyjne : [];
            podpowiedzi = podpowiedzi.map(p => sanitizeBadTerms(p)).filter(p => !p.toLowerCase().includes('sita odzież'));
            if (podpowiedzi.length === 0 && isNok) {
                podpowiedzi = [
                    "Skrócenie interwału weryfikacji wzorców Fe/Non-Fe/SS do 1 godziny do czasu zakończenia przeglądu technicznego",
                    "Wdrożenie procedury kontroli czujnika ciśnienia układu pneumatycznego odrzutnika przed każdą zmianą"
                ];
            }

            const isCritical = risk.includes('KRYTYCZ') || risk.includes('HOLD') || isNok;
            const bannerBg = isCritical 
                ? 'bg-gradient-to-br from-rose-950/95 via-slate-900 to-black border-rose-500/60 shadow-rose-950/40' 
                : 'bg-gradient-to-br from-emerald-950/95 via-slate-900 to-black border-emerald-500/60 shadow-emerald-950/40';
            
            const badgeBg = isCritical
                ? 'bg-rose-500/20 text-rose-300 border-rose-500/50 animate-pulse'
                : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50';

            const icon = isCritical ? '<i class="fas fa-triangle-exclamation text-rose-400 text-xl"></i>' : '<i class="fas fa-circle-check text-emerald-400 text-xl"></i>';
            const statusLabel = isCritical ? 'NOK (NIEZGODNY - HOLD LOT)' : 'OK (ZGODNY)';

            let akcjeHtml = '';
            if (akcje.length > 0) {
                akcjeHtml = `
                    <div class="mt-2.5 pt-2.5 border-t border-white/10 space-y-1.5">
                        <div class="flex items-center justify-between">
                            <span class="text-[9.5px] font-black text-rose-300 uppercase tracking-wider flex items-center gap-1.5">
                                <i class="fas fa-screwdriver-wrench text-rose-400"></i> <span>Wymagane Działania Korygujące (CAPA):</span>
                            </span>
                            <span class="text-[8px] font-bold bg-rose-900/40 text-rose-300 px-1.5 py-0.5 rounded border border-rose-700/50">IFS KO 6</span>
                        </div>
                        <div class="space-y-1">
                            ${akcje.map(a => `
                                <div class="p-2 rounded-xl bg-black/50 border border-rose-500/30 text-[11px] text-slate-100 flex items-start gap-2 shadow-inner">
                                    <i class="fas fa-circle-exclamation text-rose-400 mt-0.5 shrink-0 text-xs"></i>
                                    <span class="leading-snug">${a}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            }

            let podpowiedziHtml = '';
            if (podpowiedzi.length > 0) {
                podpowiedziHtml = `
                    <div class="mt-2.5 pt-2 border-t border-white/10 space-y-1.5">
                        <div class="flex items-center justify-between">
                            <span class="text-[9.5px] font-black text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                                <i class="fas fa-shield-halved text-amber-400"></i> <span>Wytyczne Prewencyjne & SOP:</span>
                            </span>
                            <span class="text-[8px] font-bold bg-amber-900/40 text-amber-300 px-1.5 py-0.5 rounded border border-amber-700/50">Dobre Praktyki</span>
                        </div>
                        <div class="space-y-1">
                            ${podpowiedzi.map(p => `
                                <div class="p-2 rounded-xl bg-black/50 border border-amber-500/30 text-[11px] text-slate-300 flex items-start gap-2 shadow-inner">
                                    <i class="fas fa-chevron-right text-amber-400 mt-0.5 shrink-0 text-[10px]"></i>
                                    <span class="leading-snug">${p}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            }

            // Odnośniki graficzne i szybkie akcje
            const quickLinksHtml = `
                <div class="mt-3 pt-2.5 border-t border-white/10 flex items-center gap-1.5 flex-wrap">
                    <span class="text-[8.5px] font-black text-slate-400 uppercase tracking-wider mr-1 flex items-center gap-1"><i class="fas fa-link text-slate-400"></i> Odnośniki:</span>
                    <button onclick="showModule('audit-main')" class="tile-3d bg-indigo-600 hover:bg-indigo-500 text-white px-2.5 py-1 rounded-lg text-[9px] font-black flex items-center gap-1 shadow-md">
                        <i class="fas fa-clipboard-check"></i> Przejdź do formularza audytu
                    </button>
                    <button onclick="sendQuickPrompt('HACCP: Jakie są kluczowe punkty krytyczne (CCP1-CCP3) i limity na tej linii?')" class="tile-3d bg-slate-800 hover:bg-slate-700 text-cyan-300 px-2 py-1 rounded-lg text-[9px] font-bold flex items-center gap-1 border border-cyan-500/30">
                        <i class="fas fa-shield-alt"></i> Standard HACCP
                    </button>
                    <button onclick="sendQuickPrompt('Wymień 10 kryteriów Knock-Out (KO) w normie IFS Food v8 i konsekwencje ich naruszenia.')" class="tile-3d bg-slate-800 hover:bg-slate-700 text-amber-300 px-2 py-1 rounded-lg text-[9px] font-bold flex items-center gap-1 border border-amber-500/30">
                        <i class="fas fa-exclamation-triangle"></i> Klauzule KO
                    </button>
                </div>
            `;

            return `
                <div class="rounded-2xl border p-4 shadow-2xl ${bannerBg} space-y-3 max-w-[95%]">
                    <div class="flex items-center justify-between pb-2 border-b border-white/10 gap-2">
                        <div class="flex items-center gap-2.5">
                            <span class="text-xl">${icon}</span>
                            <div>
                                <span class="text-[9px] text-slate-400 font-bold block uppercase tracking-wider">Ocena Zgodności IFS Food v8:</span>
                                <span class="text-xs font-black ${isCritical ? 'text-rose-400' : 'text-emerald-400'} uppercase">${statusLabel}</span>
                            </div>
                        </div>
                        <span class="px-2.5 py-1 rounded-full border text-[9px] font-black ${badgeBg}">${risk}</span>
                    </div>

                    <div class="bg-black/50 p-3 rounded-xl border border-white/10 shadow-inner">
                        <span class="text-[9px] font-black text-amber-400 uppercase tracking-wider block mb-1.5 flex items-center gap-1.5">
                            <i class="fas fa-circle-stop text-amber-400"></i> <span>Decyzja Operacyjna:</span>
                        </span>
                        <p class="text-xs font-bold text-slate-100 leading-relaxed">${decyzja}</p>
                    </div>

                    ${akcjeHtml}
                    ${podpowiedziHtml}
                    ${quickLinksHtml}
                </div>
            `;
        }

        function renderMarkdownToHtml(t) {
            if (!t) return "";
            
            const parsedObj = parseSlmJson(t);
            if (parsedObj) {
                return renderGraphicAuditCard(parsedObj);
            }

            let html = t
                .replace(/### (.*?)\n/g, '<h3 class="text-xs font-black text-amber-300 mt-2 mb-1 flex items-center gap-1">$1</h3>')
                .replace(/## (.*?)\n/g, '<h2 class="text-xs font-black text-cyan-300 mt-2 mb-1">$1</h2>')
                .replace(/\*\*(.*?)\*\*/g, '<strong class="text-amber-300 font-bold">$1</strong>')
                .replace(/\*(.*?)\*/g, '<em class="text-slate-300">$1</em>')
                .replace(/^> (.*?)$/gm, '<blockquote class="border-l-2 border-amber-500/60 pl-2.5 my-1.5 text-slate-200 text-xs italic bg-slate-900/60 py-1 rounded-r-lg">$1</blockquote>')
                .replace(/`([^`]+)`/g, '<code class="bg-slate-800 text-cyan-200 px-1 py-0.5 rounded text-[10px]">$1</code>')
                .replace(/^[•\-\*] (.*?)$/gm, '<li class="ml-3 text-slate-200 list-disc">$1</li>')
                .replace(/\n/g, '<br>');
            return html;
        }

        function syncAgentLineSelector() {
            const sel = document.getElementById('agent-line-select');
            if (!sel) return;
            const currVal = sel.value;
            let opts = `<option value="Cały Zakład">— Cały Zakład (Widok Ogólny) —</option>`;
            if (Array.isArray(productionLinesData) && productionLinesData.length > 0) {
                opts += productionLinesData.map(l => `<option value="${l.name}">${l.name}</option>`).join('');
            }
            sel.innerHTML = opts;
            if (currVal && Array.from(sel.options).some(o => o.value === currVal)) {
                sel.value = currVal;
            } else if (state && state.line && Array.from(sel.options).some(o => o.value === state.line)) {
                sel.value = state.line;
            }
        }

        function onAgentLineChange() {
            const sel = document.getElementById('agent-line-select');
            if (sel && sel.value !== "Cały Zakład") {
                state.line = sel.value;
            }
        }

        async function runAgentBriefing() {
            const sel = document.getElementById('agent-line-select');
            const line = sel ? sel.value : (state.line || "Cały Zakład");
            const box = document.getElementById('agent-chat-box');
            const typing = document.getElementById('agent-typing');
            const btn = document.getElementById('btn-agent-briefing');

            box.innerHTML += `
                <div class="flex justify-end">
                    <div class="bg-cyan-950/70 p-2.5 rounded-xl border border-cyan-500/40 text-slate-100 max-w-[85%] text-xs font-bold flex items-center gap-1.5 shadow-md">
                        <i class="fas fa-bolt-lightning text-cyan-400"></i>
                        <span>Żądanie odprawy dla: <u>${line}</u></span>
                    </div>
                </div>
            `;
            box.scrollTop = box.scrollHeight;
            if (typing) typing.classList.remove('hidden');
            if (btn) btn.disabled = true;

            try {
                const res = await fetch(`/api/agent/briefing/${encodeURIComponent(line)}`);
                const data = await res.json();
                
                let statusBadge = '<span class="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded text-[9px] font-black">STATUS: ZGODNY (OK)</span>';
                if (data.status === 'KRYTYCZNE') {
                    statusBadge = '<span class="bg-rose-500/20 text-rose-300 border border-rose-500/40 px-2 py-0.5 rounded text-[9px] font-black animate-pulse">STATUS: KRYTYCZNY (HOLD LOT)</span>';
                } else if (data.status === 'UWAGA') {
                    statusBadge = '<span class="bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded text-[9px] font-black">STATUS: WYMAGA UWAGI (CAPA)</span>';
                }

                let checkpointsHtml = '';
                if (data.checkpoints && data.checkpoints.length > 0) {
                    checkpointsHtml = `
                        <div class="mt-2.5 pt-2 border-t border-slate-700/60">
                            <span class="text-[9px] font-black text-cyan-300 uppercase tracking-wider block mb-1.5 flex items-center gap-1.5"><i class="fas fa-bullseye text-cyan-400"></i><span>Punkty wzmożonej uwagi podczas inspekcji:</span></span>
                            <ul class="space-y-1 text-[11px] text-slate-300 list-none pl-0">
                                ${data.checkpoints.map(cp => `<li class="p-1.5 rounded-lg bg-slate-900/80 border border-slate-800 flex items-start gap-1.5"><span class="text-indigo-400">▪</span> <span>${renderMarkdownToHtml(cp)}</span></li>`).join('')}
                            </ul>
                        </div>
                    `;
                }

                box.innerHTML += `
                    <div class="flex justify-start">
                        <div class="bg-slate-900/95 p-3.5 rounded-2xl border border-indigo-500/40 text-slate-200 max-w-[95%] shadow-xl space-y-2">
                            <div class="flex items-center justify-between pb-1.5 border-b border-slate-800 gap-2">
                                <span class="text-[10.5px] font-black text-amber-400 flex items-center gap-1.5">
                                    <i class="fas fa-clipboard-check text-cyan-400"></i> ODPRAWA: ${data.line}
                                </span>
                                ${statusBadge}
                            </div>
                            <div class="text-[11.5px] leading-relaxed text-slate-200">
                                ${renderMarkdownToHtml(data.briefing_markdown)}
                            </div>
                            ${checkpointsHtml}
                            <div class="text-[9px] text-slate-500 pt-1 flex justify-between border-t border-slate-800/80 mt-1">
                                <span>Przeanalizowano audytów: <b>${data.total_audits_checked}</b> | Niezgodności NOK: <b>${data.nok_count}</b></span>
                                <span>Ostatni audyt: <b>${data.last_audit_date || 'N/A'}</b></span>
                            </div>
                        </div>
                    </div>
                `;
            } catch(e) {
                box.innerHTML += `<div class="text-rose-400 text-xs p-2.5 bg-rose-950/40 rounded-xl border border-rose-800/40">Nie udało się pobrać odprawy. Sprawdź połączenie z serwerem.</div>`;
            } finally {
                if (typing) typing.classList.add('hidden');
                if (btn) btn.disabled = false;
                box.scrollTop = box.scrollHeight;
            }
        }

        async function sendAgentMessage() {
            const inp = document.getElementById('agent-user-input');
            const txt = inp.value.trim();
            if (!txt) return;
            const box = document.getElementById('agent-chat-box');
            const typing = document.getElementById('agent-typing');
            const sel = document.getElementById('agent-line-select');
            const activeLine = sel ? sel.value : (state.line || "Cały Zakład");

            if (!Array.isArray(state.agent_chat_history)) {
                state.agent_chat_history = [];
            }

            box.innerHTML += `<div class="flex justify-end"><div class="bg-cyan-950/60 p-2.5 rounded-xl border border-cyan-500/40 text-slate-100 max-w-[85%] text-xs font-semibold shadow-md">${txt}</div></div>`;
            inp.value = "";
            box.scrollTop = box.scrollHeight;
            if (typing) typing.classList.remove('hidden');

            state.agent_chat_history.push({ role: 'user', content: txt });

            try {
                const res = await fetch('/api/agent/chat', { 
                    method: 'POST', 
                    headers: {'Content-Type': 'application/json'}, 
                    body: JSON.stringify({ 
                        message: txt, 
                        user_name: state.auditor_id || "Audytor", 
                        user_role: state.role || "AUDITOR",
                        line: activeLine,
                        history: state.agent_chat_history
                    }) 
                });
                const d = await res.json();
                if (d && d.reply) {
                    state.agent_chat_history.push({ role: 'assistant', content: d.reply });
                }
                box.innerHTML += `
                    <div class="flex justify-start">
                        <div class="bg-indigo-950/50 p-3 rounded-2xl border border-indigo-500/30 text-slate-200 max-w-[92%] text-xs leading-relaxed shadow-lg">
                            <span class="text-[9.5px] font-black text-amber-400 block mb-1 flex items-center gap-1.5"><i class="fas fa-microchip text-amber-400"></i><span>Ai Support [${activeLine}]:</span></span>
                            ${renderMarkdownToHtml(d.reply)}
                        </div>
                    </div>
                `;
            } catch(e) {
                box.innerHTML += `<div class="text-rose-400 text-[10px] p-2 bg-rose-950/30 rounded-lg">Błąd komunikacji z silnikiem SLM.</div>`;
            } finally {
                if (typing) typing.classList.add('hidden');
                box.scrollTop = box.scrollHeight;
            }
        }

        function sendQuickPrompt(t) { 
            const inp = document.getElementById('agent-user-input');
            if (inp) {
                inp.value = t;
                sendAgentMessage();
            }
        }

        function clearAgentChat() { 
            state.agent_chat_history = [];
            const box = document.getElementById('agent-chat-box');
            if (box) {
                box.innerHTML = `
                    <div class="bg-indigo-950/40 p-3 rounded-2xl border border-indigo-500/30 text-slate-200">
                        <span class="text-[10px] font-black text-amber-400 block mb-1 flex items-center gap-1.5"><i class="fas fa-microchip text-amber-400"></i><span>Ai Support:</span></span>
                        Czat został wyczyszczony. Wybierz linię i kliknij <b>„Odprawa Terenowa (AI)”</b> lub skorzystaj z szybkich kafelków standardów.
                    </div>
                `;
            }
        }

        async function openMgrModal(id) {
            const dock = document.getElementById('bottom-dock');
            if (dock) dock.classList.add('hidden');

            const res = await fetch(`/api/schedule/${id}`);
            const a = await res.json();
            document.getElementById('mgr-edit-id').value = (a && a.id !== undefined) ? a.id : id;
            document.getElementById('mgr-edit-date').value = a.scheduled_date || "";
            document.getElementById('mgr-edit-date').setAttribute('data-original-date', a.scheduled_date || "");
            document.getElementById('mgr-edit-type').value = a.audit_type || "HACCP";
            document.getElementById('mgr-edit-status').value = a.status || "PLANOWANY";
            document.getElementById('mgr-edit-notes').value = a.notes || "";
            
            const linesRes = await fetch('/api/lines');
            const lines = await linesRes.json();
            document.getElementById('mgr-edit-line').innerHTML = lines.map(l => `<option value="${l.name}" ${l.name === a.line ? 'selected' : ''}>${l.name}</option>`).join('');

            const audRes = await fetch('/api/auth/auditors');
            const auds = await audRes.json();
            const getAudName = (aud) => (typeof aud === 'string' ? aud : (aud.full_name || aud.name || 'Audytor'));
            document.getElementById('mgr-edit-lead').innerHTML = auds.map(aud => {
                const name = getAudName(aud);
                return `<option value="${name}" ${name === a.lead_auditor ? 'selected' : ''}>${name}</option>`;
            }).join('');
            document.getElementById('mgr-edit-backup').innerHTML = `<option value="Brak">Brak</option>` + auds.map(aud => {
                const name = getAudName(aud);
                return `<option value="${name}" ${name === a.backup_auditor ? 'selected' : ''}>${name}</option>`;
            }).join('');

            if (typeof syncMgrAuditorBackupOptions === 'function') {
                syncMgrAuditorBackupOptions();
            }

            document.getElementById('modal-mgr-edit').classList.remove('hidden');
        }
        window.openMgrModal = openMgrModal;

        function closeMgrModal() { 
            const modalEl = document.getElementById('modal-mgr-edit');
            if (modalEl) modalEl.classList.add('hidden');
            const dock = document.getElementById('bottom-dock');
            if (dock && state.role) dock.classList.remove('hidden');
        }
        window.closeMgrModal = closeMgrModal;

        async function saveMgrScheduleEdit() {
            const id = document.getElementById('mgr-edit-id').value;
            const newDate = document.getElementById('mgr-edit-date').value;
            const today = getLocalDateString();

            const dateInput = document.getElementById("mgr-edit-date");
            const originalDate = dateInput ? dateInput.getAttribute("data-original-date") : "";

            // Jeśli użytkownik zmienia datę spóźnionego audytu, nowy termin musi być bieżący lub przyszły
            if (originalDate && newDate !== originalDate && newDate < today) {
                return alert("Nowy wyznaczony termin audytu musi być datą bieżącą lub przyszłą!");
            }

            const leadAuditor = document.getElementById('mgr-edit-lead').value;
            const backupAuditor = document.getElementById('mgr-edit-backup').value;

            if (leadAuditor === backupAuditor && backupAuditor !== "Brak") {
                return alert("Niezgodność z normą IFS: Audytor Główny i Zastępca nie mogą być tą samą osobą!");
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
            const res = await apiFetch(`/api/schedule/${id}`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
            if (res.ok) { closeMgrModal(); await loadScheduleAndRender(); }
            else {
                const err = await res.json().catch(() => ({}));
                alert("Błąd zapisu zmian: " + (err.detail || "Nie udało się zaktualizować audytu."));
            }
        }

        async function deleteMgrSchedule() {
            const id = document.getElementById('mgr-edit-id').value;
            if (!id || id === 'undefined') {
                return alert("Błąd: Nie wybrano poprawnego identyfikatora zlecenia do usunięcia.");
            }
            if (!confirm("Usunąć zlecenie?")) return;
            const res = await apiFetch(`/api/schedule/${id}`, { method: 'DELETE' });
            if (res.ok) { 
                closeMgrModal(); 
                if (Array.isArray(schedulesData)) {
                    schedulesData = schedulesData.filter(s => String(s.id) !== String(id));
                    if (typeof renderCalendar === 'function') renderCalendar();
                    if (typeof updateAuditorScheduleBadges === 'function') updateAuditorScheduleBadges(schedulesData);
                }
                await loadScheduleAndRender(); 
            }
            else {
                const err = await res.json().catch(() => ({}));
                alert("Błąd usuwania: " + (err.detail || "Nie udało się usunąć audytu."));
            }
        }
        window.deleteMgrSchedule = deleteMgrSchedule;

        async function openAudModal(id) {
            const dock = document.getElementById('bottom-dock');
            if (dock) dock.classList.add('hidden');

            const res = await fetch(`/api/schedule/${id}`);
            const a = await res.json();
            activeSelectedAudit = a;
            state.active_audit_type = a.audit_type || "HACCP";
            document.getElementById('aud-view-date').innerText = a.scheduled_date || "";
            document.getElementById('aud-view-type').innerText = a.audit_type || "HACCP";
            document.getElementById('aud-view-line').innerText = a.line || "";
            document.getElementById('aud-view-status').innerText = a.status || "";
            document.getElementById('modal-aud-view').classList.remove('hidden');
        }
        window.openAudModal = openAudModal;

        function closeAudModal() {
            const modalEl = document.getElementById('modal-aud-view');
            if (modalEl) modalEl.classList.add('hidden');
            const dock = document.getElementById('bottom-dock');
            if (dock && state.role) dock.classList.remove('hidden');
        }
        window.closeAudModal = closeAudModal;

        
        let currentDetailedAuditId = null;
        let currentDetailedAuditData = null;

        window.closeAuditDetailsModal = function() {
            const modal = document.getElementById('modal-audit-details');
            if (modal) modal.classList.add('hidden');
            currentDetailedAuditId = null;
            currentDetailedAuditData = null;
        };

        window.switchAuditDetailTab = function(tab) {
            const tabs = ['report', 'checklist', 'audit-trail'];
            tabs.forEach(t => {
                const btn = document.getElementById(`tab-btn-${t}`);
                const pane = document.getElementById(`tab-pane-${t}`);
                if (btn && pane) {
                    if (t === tab) {
                        btn.className = "py-2.5 px-3.5 border-b-2 border-cyan-400 text-cyan-400 flex items-center gap-1.5 transition";
                        pane.classList.remove('hidden');
                    } else {
                        btn.className = "py-2.5 px-3.5 border-b-2 border-transparent text-slate-400 hover:text-slate-200 flex items-center gap-1.5 transition";
                        pane.classList.add('hidden');
                    }
                }
            });
        };

        window.openAuditDetailsModal = async function(id) {
            currentDetailedAuditId = id;
            currentDetailedAuditData = null;
            const modal = document.getElementById('modal-audit-details');
            if (!modal) return;
            modal.classList.remove('hidden');

            switchAuditDetailTab('report');

            document.getElementById('det-audit-id-badge').textContent = '#' + id;
            document.getElementById('det-head-line-shift').textContent = 'Pobieranie...';
            document.getElementById('det-head-auditor-date').textContent = 'Pobieranie danych audytu...';
            document.getElementById('det-slm-full-analysis').textContent = 'Trwa pobieranie danych i analizy SLM...';
            document.getElementById('adm-reply-text').value = '';

            try {
                const res = await fetch(`/api/audits/${id}`);
                if (!res.ok) {
                    alert('Błąd podczas pobierania szczegółów audytu.');
                    return;
                }
                const a = await res.json();
                currentDetailedAuditData = a;

                // Nagłówek
                document.getElementById('det-audit-id-badge').textContent = '#' + a.id;
                const sVal = String(a.shift || '1').trim().toUpperCase();
                const shiftRoman = (sVal === '2' || sVal === 'II' || sVal.includes('B')) ? 'II' : ((sVal === '3' || sVal === 'III' || sVal.includes('C')) ? 'III' : 'I');
                document.getElementById('det-head-line-shift').textContent = `Linia: ${a.line || '---'} • Zmiana: ${shiftRoman}`;
                document.getElementById('det-head-auditor-date').textContent = `Audytor: ${a.auditor_id || '---'} • Czas: ${(a.timestamp || '').substring(0, 16)}`;

                // Badges
                const verdictBadge = document.getElementById('det-badge-slm-verdict');
                if (a.slm_verdict === 'OK') {
                    verdictBadge.textContent = 'WERDYKT: OK';
                    verdictBadge.className = 'text-[10px] px-2.5 py-1 rounded-full font-black border uppercase tracking-wider bg-emerald-950 text-emerald-400 border-emerald-500/40';
                } else {
                    verdictBadge.textContent = 'WERDYKT: NOK';
                    verdictBadge.className = 'text-[10px] px-2.5 py-1 rounded-full font-black border uppercase tracking-wider bg-rose-950 text-rose-400 border-rose-500/40';
                }

                const riskBadge = document.getElementById('det-badge-risk-level');
                riskBadge.textContent = a.risk_level || 'NISKIE';
                if ((a.risk_level || '').includes('HOLD') || (a.risk_level || '').includes('KRYTYCZNE')) {
                    riskBadge.className = 'text-[10px] px-2.5 py-1 rounded-full font-black border uppercase tracking-wider bg-red-950 text-red-300 border-red-500/50 animate-pulse';
                } else if ((a.risk_level || '').includes('ŚREDNIE')) {
                    riskBadge.className = 'text-[10px] px-2.5 py-1 rounded-full font-black border uppercase tracking-wider bg-amber-950 text-amber-300 border-amber-500/40';
                } else {
                    riskBadge.className = 'text-[10px] px-2.5 py-1 rounded-full font-black border uppercase tracking-wider bg-emerald-950 text-emerald-300 border-emerald-500/30';
                }

                const statusBadge = document.getElementById('det-badge-record-status');
                if (a.record_status === 'ODBLOKOWANY_DO_KOREKTY') {
                    statusBadge.innerHTML = '<i class="fas fa-lock-open mr-1"></i>ODBLOKOWANY';
                    statusBadge.className = 'text-[10px] px-2.5 py-1 rounded-full font-black border uppercase tracking-wider bg-emerald-950 text-emerald-300 border-emerald-500/30 flex items-center';
                } else {
                    statusBadge.innerHTML = '<i class="fas fa-lock mr-1"></i>ZABLOKOWANY';
                    statusBadge.className = 'text-[10px] px-2.5 py-1 rounded-full font-black border uppercase tracking-wider bg-amber-950 text-amber-300 border-amber-500/30 flex items-center';
                }

                // TAB 1: SLM Analysis
                const slmTag = document.getElementById('det-slm-verdict-tag');
                const slmContainer = document.getElementById('det-slm-container');
                if (a.slm_verdict === 'OK') {
                    slmTag.textContent = 'ZGODNY (RYZYKO NISKIE)';
                    slmTag.className = 'text-[10px] font-black px-2.5 py-0.5 rounded-full border bg-emerald-950 text-emerald-400 border-emerald-500/40';
                    slmContainer.className = 'rounded-xl border border-emerald-500/30 p-4 bg-emerald-950/10 space-y-3';
                } else {
                    slmTag.textContent = a.risk_level || 'NOK (KRYTYCZNE)';
                    slmTag.className = 'text-[10px] font-black px-2.5 py-0.5 rounded-full border bg-rose-950 text-rose-300 border-rose-500/50 animate-pulse';
                    slmContainer.className = 'rounded-xl border border-rose-500/40 p-4 bg-rose-950/15 space-y-3';
                }

                const analysisEl = document.getElementById('det-slm-full-analysis');
                if (a.slm_analysis_parsed) {
                    const p = a.slm_analysis_parsed;
                    let out = '';
                    if (p.decyzja) out += `[DECYZJA OPERACYJNA]:\n${p.decyzja}\n\n`;
                    if (p.akcje_korygujace && p.akcje_korygujace.length) {
                        out += `[WYMAGANE AKCJE KORYGUJĄCE (CAPA)]:\n`;
                        p.akcje_korygujace.forEach((act, idx) => out += `  ${idx + 1}. ${act}\n`);
                        out += `\n`;
                    }
                    if (p.podpowiedzi_prewencyjne && p.podpowiedzi_prewencyjne.length) {
                        out += `[ZALECENIA PREWENCYJNE]:\n`;
                        p.podpowiedzi_prewencyjne.forEach((prv, idx) => out += `  • ${prv}\n`);
                    }
                    analysisEl.textContent = out || a.slm_analysis || 'Brak danych analizy.';
                } else {
                    analysisEl.textContent = a.slm_analysis || 'Analiza wygenerowana automatycznie przez moduł asystenta IFS Food v8.';
                }

                // Helper do formatowania statusu
                const fmtOk = (val) => {
                    const isOk = (val === 'ZGODNY' || val === 'TAK' || val === 'OK');
                    return `<span class="${isOk ? 'text-emerald-400 font-bold' : 'text-rose-400 font-black'}">${val || '---'}</span>`;
                };

                // CCP 1
                document.getElementById('det-ccp1-fe').innerHTML = fmtOk(a.ccp1_fe_ok);
                document.getElementById('det-ccp1-nonfe').innerHTML = fmtOk(a.ccp1_nonfe_ok);
                document.getElementById('det-ccp1-ss').innerHTML = fmtOk(a.ccp1_ss_ok);
                document.getElementById('det-ccp1-reject').innerHTML = fmtOk(a.ccp1_reject_ok);
                document.getElementById('det-ccp1-bin').innerHTML = fmtOk(a.ccp1_bin_locked);

                // CCP 2 & 3
                document.getElementById('det-ccp2-magnet').innerHTML = fmtOk(a.ccp2_magnet_ok);
                document.getElementById('det-ccp3-sieve').innerHTML = fmtOk(a.ccp3_sieve_ok);

                // KO Indicator
                const koFailed = (a.ko_failed == 1 || (a.checklist_parsed && Object.values(a.checklist_parsed).some(q => q.is_ko && (q.score !== undefined ? parseInt(q.score) <= 2 : q.status === 'NOK'))));
                const koEl = document.getElementById('det-ko-status');
                if (koFailed) {
                    koEl.textContent = 'KO: NARUSZONE (KRYTYCZNE)';
                    koEl.className = 'text-[9px] font-black px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-500/50 animate-pulse';
                } else {
                    koEl.textContent = 'KO: ZGODNE';
                    koEl.className = 'text-[9px] font-black px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-500/30';
                }

                // PRP / GMP
                document.getElementById('det-health-ok').innerHTML = fmtOk(a.health_ok);
                document.getElementById('det-glass-ok').innerHTML = fmtOk(a.glass_plastic_ok);
                document.getElementById('det-allergen-ok').innerHTML = fmtOk(a.allergen_clean_ok);
                document.getElementById('det-wood-ok').innerHTML = fmtOk(a.wood_policy_ok);
                document.getElementById('det-cleanliness-ok').innerHTML = fmtOk(a.gmp_cleanliness_ok);
                document.getElementById('det-bhp-estop-ok').innerHTML = fmtOk(a.bhp_estop_ok);

                // Zdjęcie
                const photoBox = document.getElementById('det-photo-container');
                if (a.photo_path) {
                    photoBox.innerHTML = `
                        <div class="flex items-center gap-3 bg-slate-900/90 p-2.5 rounded-lg border border-slate-800">
                            <a href="${a.photo_path}" target="_blank" title="Kliknij, aby powiększyć zdjęcie">
                                <img src="${a.photo_path}" alt="Zdjęcie z audytu" class="w-24 h-24 object-cover rounded-lg border border-cyan-500/40 hover:opacity-90 hover:scale-105 transition" />
                            </a>
                            <div class="space-y-1 text-xs">
                                <div class="text-white font-bold">Fotografia dowodowa niezgodności</div>
                                <div class="text-[10px] text-slate-400">Plik: ${a.photo_path}</div>
                                <a href="${a.photo_path}" target="_blank" class="inline-flex items-center gap-1.5 text-[10px] text-cyan-400 hover:underline">
                                    <i class="fas fa-magnifying-glass-plus"></i>
                                    <span>Otwórz zdjęcie w pełnym rozmiarze</span>
                                </a>
                            </div>
                        </div>
                    `;
                } else {
                    photoBox.innerHTML = `<p class="text-xs text-slate-500 italic">Brak załączonych fotografii dla tego wpisu audytu.</p>`;
                }

                // TAB 2: Checklista
                const chBody = document.getElementById('det-checklist-table-body');
                chBody.innerHTML = '';
                const chItems = a.checklist_parsed ? Object.values(a.checklist_parsed) : [];
                document.getElementById('det-badge-checklist-count').textContent = chItems.length;
                document.getElementById('det-ch-total').textContent = chItems.length;

                let nokCount = 0;
                let koCount = 0;

                if (chItems.length === 0) {
                    chBody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-slate-500">Brak zarejestrowanych pytań checklisty dla tego audytu.</td></tr>`;
                } else {
                    chItems.forEach(item => {
                        const isNok = (item.score !== undefined ? parseInt(item.score) <= 2 : item.status === 'NOK');
                        const isDev = (item.score !== undefined && (parseInt(item.score) === 3 || parseInt(item.score) === 4));
                        if (isNok) nokCount++;
                        if (item.is_ko && isNok) koCount++;

                        const koBadge = item.is_ko ? `<span class="ml-1 text-[8px] ${isNok ? 'bg-red-950 text-red-400 border border-red-500/40 font-black animate-pulse' : 'bg-slate-800 text-slate-400 border border-slate-700/50 font-bold'} px-1 py-0.2 rounded">KO</span>` : '';
                        const statusColor = isNok ? 'bg-rose-950 text-rose-300 border-rose-500/40' : (isDev ? 'bg-amber-950 text-amber-300 border-amber-500/40' : 'bg-emerald-950 text-emerald-300 border-emerald-500/40');
                        const scoreDisplay = item.score !== undefined ? `${item.score}/5` : (item.status || 'OK');
                        const notesDisplay = item.notes ? `<span class="text-amber-300 font-medium inline-flex items-center gap-1"><i class="fas fa-comment-dots text-amber-400"></i><span>${item.notes}</span></span>` : `<span class="text-slate-500 italic">Brak uwag</span>`;

                        chBody.innerHTML += `
                            <tr class="hover:bg-slate-800/60 transition">
                                <td class="p-2.5 font-mono text-[10px] font-bold text-cyan-300 whitespace-nowrap">
                                    ${item.clause || '---'}${koBadge}
                                </td>
                                <td class="p-2.5 text-slate-200 text-xs leading-snug">
                                    ${item.question || '---'}
                                </td>
                                <td class="p-2.5 text-center whitespace-nowrap">
                                    <span class="text-[9px] font-black px-2 py-0.5 rounded border ${statusColor}">
                                        ${scoreDisplay}
                                    </span>
                                </td>
                                <td class="p-2.5 text-xs">
                                    ${notesDisplay}
                                </td>
                            </tr>
                        `;
                    });
                }
                document.getElementById('det-ch-nok').textContent = nokCount;
                document.getElementById('det-ch-ko').textContent = koCount;

                // TAB 3: Audit Trail logs
                const trailBody = document.getElementById('det-audit-trail-logs-body');
                trailBody.innerHTML = '';
                const logs = a.change_logs || [];
                document.getElementById('det-badge-trail-count').textContent = logs.length;

                if (logs.length === 0) {
                    trailBody.innerHTML = `<tr><td colspan="5" class="p-3 text-center text-slate-500">Brak zarejestrowanych modyfikacji w Audit Trail dla tego audytu.</td></tr>`;
                } else {
                    logs.forEach(l => {
                        trailBody.innerHTML += `
                            <tr class="hover:bg-slate-800/50 transition">
                                <td class="p-2 text-slate-400 whitespace-nowrap">${(l.timestamp || '').substring(0, 19)}</td>
                                <td class="p-2 font-bold text-white whitespace-nowrap">${l.modified_by || 'System'}</td>
                                <td class="p-2 font-mono text-cyan-300">${l.field_name}</td>
                                <td class="p-2"><span class="text-slate-400 line-through mr-1">${l.old_value || '—'}</span> ➔ <span class="text-emerald-300 font-bold ml-1">${l.new_value}</span></td>
                                <td class="p-2 text-slate-300 italic">${l.change_reason || 'Brak uzasadnienia'}</td>
                            </tr>
                        `;
                    });
                }

                // TAB 3: Formularz korekty
                document.getElementById('adm-edit-line').value = a.line || '';
                if (a.shift) {
                    const s = String(a.shift).trim().toUpperCase();
                    let normShift = "1";
                    if (s === "2" || s === "II" || s.includes("B")) normShift = "2";
                    else if (s === "3" || s === "III" || s.includes("C")) normShift = "3";
                    document.getElementById('adm-edit-shift').value = normShift;
                }

                const lineInput = document.getElementById('adm-edit-line');
                const shiftInput = document.getElementById('adm-edit-shift');
                const replyText = document.getElementById('adm-reply-text');
                const btnSave = document.getElementById('btn-save-correction');
                const modeBadge = document.getElementById('det-correction-mode-badge');
                const noticeEl = document.getElementById('det-lock-notice');

                if (a.record_status === 'ODBLOKOWANY_DO_KOREKTY') {
                    lineInput.disabled = false;
                    shiftInput.disabled = false;
                    replyText.disabled = false;
                    btnSave.disabled = false;
                    modeBadge.textContent = 'Tryb: Odblokowany do korekty';
                    modeBadge.className = 'text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/30';
                    noticeEl.className = 'p-2.5 rounded-lg border text-xs flex items-center gap-2 bg-emerald-950/40 border-emerald-500/40 text-emerald-300';
                    noticeEl.innerHTML = `<i class="fas fa-lock-open text-emerald-400 text-base shrink-0"></i> <div><b>Audyt został formalnie odblokowany do edycji przez Managera Jakości.</b> Możesz wprowadzić poprawki i zatwierdzić wpis w Audit Trail.</div>`;
                } else {
                    lineInput.disabled = true;
                    shiftInput.disabled = true;
                    replyText.disabled = true;
                    btnSave.disabled = true;
                    modeBadge.textContent = 'Tryb: Zablokowany (Tylko do odczytu)';
                    modeBadge.className = 'text-[10px] font-bold px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-500/30';
                    noticeEl.className = 'p-2.5 rounded-lg border text-xs flex items-center gap-2 bg-amber-950/40 border-amber-500/40 text-amber-300';
                    noticeEl.innerHTML = `<i class="fas fa-lock text-amber-400 text-base shrink-0"></i> <div><b>Wpis jest zablokowany zgodnie z wymogami IFS Food v8.</b> Bezpośrednia modyfikacja jest niedozwolona dopóki wniosek o korektę nie zostanie zatwierdzony w panelu wniosków.</div>`;
                }

                // Pasek akcji Managera
                const btnHold = document.getElementById('btn-modal-hold-lot');
                if (a.slm_verdict === 'NOK' || (a.risk_level || '').includes('HOLD') || (a.risk_level || '').includes('KRYTYCZNE')) {
                    btnHold.classList.remove('hidden');
                } else {
                    btnHold.classList.add('hidden');
                }

                const btnApprove = document.getElementById('btn-modal-approve');
                const btnReject = document.getElementById('btn-modal-reject');
                const footerInfo = document.getElementById('det-footer-status-info');

                if (a.compliance_verdict === 'ZATWIERDZONY') {
                    btnApprove.disabled = true;
                    btnApprove.className = 'px-3 py-1.5 bg-slate-800 text-slate-500 rounded-lg text-xs font-bold cursor-not-allowed';
                    btnApprove.innerHTML = `<span class="flex items-center gap-1.5"><i class="fas fa-check-double text-emerald-400"></i><span>Raport Zatwierdzony</span></span>`;
                    btnReject.disabled = false;
                    btnReject.className = 'px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold transition';
                    footerInfo.innerHTML = `<span class="text-emerald-400 font-bold flex items-center gap-1.5"><i class="fas fa-circle-check"></i><span>Formalnie zatwierdzony przez Managera Jakości</span></span>`;
                } else if (a.compliance_verdict === 'ODRZUCONY') {
                    btnReject.disabled = true;
                    btnReject.className = 'px-3 py-1.5 bg-slate-800 text-slate-500 rounded-lg text-xs font-bold cursor-not-allowed';
                    btnReject.innerHTML = `<span class="flex items-center gap-1.5"><i class="fas fa-circle-xmark text-rose-400"></i><span>Raport Odrzucony</span></span>`;
                    btnApprove.disabled = false;
                    btnApprove.className = 'px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition';
                    footerInfo.innerHTML = `<span class="text-rose-400 font-bold flex items-center gap-1.5"><i class="fas fa-circle-xmark"></i><span>Raport odrzucony przez Managera</span></span>`;
                } else {
                    btnApprove.disabled = false;
                    btnApprove.className = 'px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5';
                    btnApprove.innerHTML = `<span class="flex items-center gap-1.5"><i class="fas fa-check"></i><span>Zatwierdź Raport Audytu</span></span>`;
                    btnReject.disabled = false;
                    btnReject.className = 'px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5';
                    btnReject.innerHTML = `<span class="flex items-center gap-1.5"><i class="fas fa-xmark"></i><span>Odrzuć Raport</span></span>`;
                    footerInfo.innerHTML = `<span class="text-slate-400">Oczekuje na weryfikację i decyzję Managera Jakości</span>`;
                }

            } catch(e) {
                console.error("Błąd pobierania danych audytu:", e);
                alert("Wystąpił błąd podczas ładowania szczegółów audytu.");
            }
        };

        window.handleAuditApproveFromModal = async function() {
            if (!currentDetailedAuditId) return;
            const targetId = Number(currentDetailedAuditId);
            try {
                const item = cachedManagerAudits.find(a => Number(a.id) === targetId || String(a.id) === String(targetId));
                if (item) {
                    item.compliance_verdict = 'ZATWIERDZONY';
                    item.process_status = 'ZATWIERDZONY';
                    item.record_status = 'ZABLOKOWANY';
                }

                const res = await apiFetch(`/api/audits/${targetId}/status`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: 'ZATWIERDZONY', manager_name: 'Manager Jakości' })
                });
                if (res && res.ok) {
                    if (typeof showToast === 'function') {
                        showToast(`Raport audytu #${targetId} został zatwierdzony i przeniesiony do Zatwierdzonych!`, 'success');
                    } else {
                        alert(`Raport audytu #${targetId} został formalnie zatwierdzony!`);
                    }
                    await openAuditDetailsModal(targetId);
                    renderManagerAuditsTable();
                    if (typeof loadAuditResults === 'function') await loadAuditResults();
                    if (typeof loadAuditorHistory === 'function') loadAuditorHistory();
                } else {
                    const err = await res.json().catch(() => ({}));
                    alert('Błąd zatwierdzania audytu: ' + (err.detail || 'Błąd serwera.'));
                }
            } catch (e) {
                console.error(e);
                alert('Błąd połączenia podczas zatwierdzania audytu.');
            }
        };

        window.handleAuditRejectFromModal = async function() {
            if (!currentDetailedAuditId) return;
            const targetId = Number(currentDetailedAuditId);
            const reason = prompt('Podaj powód odrzucenia raportu z audytu (wymóg IFS Food v8):');
            if (!reason || reason.trim() === '') return;

            try {
                const item = cachedManagerAudits.find(a => Number(a.id) === targetId || String(a.id) === String(targetId));
                if (item) {
                    item.compliance_verdict = 'ODRZUCONY';
                    item.process_status = 'ODRZUCONY';
                    item.record_status = 'ZABLOKOWANY';
                }

                const res = await apiFetch(`/api/audits/${targetId}/status`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: 'ODRZUCONY', reason: reason, manager_name: 'Manager Jakości' })
                });
                if (res && res.ok) {
                    alert(`✕ Raport audytu #${targetId} został odrzucony.`);
                    await openAuditDetailsModal(targetId);
                    renderManagerAuditsTable();
                    if (typeof loadAuditResults === 'function') await loadAuditResults();
                    if (typeof loadAuditorHistory === 'function') loadAuditorHistory();
                } else {
                    const err = await res.json().catch(() => ({}));
                    alert('Błąd odrzucania audytu: ' + (err.detail || 'Błąd serwera.'));
                }
            } catch (e) {
                console.error(e);
                alert('Błąd połączenia podczas odrzucania audytu.');
            }
        };

        window.handleHoldLotFromModal = async function() {
            if (!currentDetailedAuditId) return;
            const confirmAction = confirm(`UWAGA: Czy na pewno chcesz natychmiast zarządzić procedurę wstrzymania partii (HOLD LOT) dla audytu #${currentDetailedAuditId}? Ta operacja zostanie trwale odnotowana w Audit Trail.`);
            if (!confirmAction) return;

            try {
                const res = await apiFetch(`/api/audits/${currentDetailedAuditId}/hold-lot`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ reason: 'Zarządzenie wstrzymania partii (HOLD LOT) na skutek werdyktu NOK', manager_name: 'Manager Jakości' })
                });
                if (res.ok) {
                    alert(`Procedura HOLD LOT została zarejestrowana i oznaczona w systemie!`);
                    await openAuditDetailsModal(currentDetailedAuditId);
                    if (typeof loadAuditResults === 'function') await loadAuditResults();
                } else {
                    alert('Błąd podczas rejestracji procedury HOLD LOT.');
                }
            } catch (e) {
                console.error(e);
                alert('Błąd połączenia.');
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
                const res = await apiFetch('/api/audits/apply-correction', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const data = await res.json();
                if (res.ok) {
                    alert('Korekta została zarejestrowana w dzienniku Audit Trail!');
                    await openAuditDetailsModal(currentDetailedAuditId);
                    if (typeof loadAuditResults === 'function') await loadAuditResults();
                    if (typeof loadAuditorHistory === 'function') await loadAuditorHistory();
                } else {
                    alert('Błąd: ' + (data.detail || 'Nie udało się zapisać korekty.'));
                }
            } catch (e) {
                alert('Błąd połączenia z serwerem podczas zapisu korekty.');
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<span class="flex items-center gap-1.5"><i class="fas fa-floppy-disk"></i><span>Zapisz korektę w Audit Trail</span></span>';
            }
        };

        // --- OBSŁUGA NAGRYWANIA GŁOSOWEGO (SPEECH-TO-TEXT / CIĄGŁE DYKTOWANIE W RAMCE) ---
        window.toggleSpeechToText = function(targetElementId, btnElement) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!SpeechRecognition) {
                alert("Twoja przeglądarka nie obsługuje wbudowanego rozpoznawania mowy (Web Speech API).\nAby dyktować uwagi głosem w języku polskim, skorzystaj z przeglądarki Google Chrome, Microsoft Edge lub Safari.");
                return;
            }

            const targetInput = document.getElementById(targetElementId);
            if (!targetInput) return;

            // Jeśli aktualnie nagrywamy to pole -> zatrzymaj
            if (window.currentActiveRecognition && window.currentRecognitionTargetId === targetElementId) {
                window.currentActiveRecognition.stop();
                return;
            }

            // Jeśli nagrywaliśmy inne pole -> zatrzymaj tamto
            if (window.currentActiveRecognition) {
                try { window.currentActiveRecognition.stop(); } catch(e) {}
            }

            const recognition = new SpeechRecognition();
            recognition.lang = 'pl-PL';
            recognition.interimResults = true;
            recognition.continuous = true; // CIĄGŁE DYKTOWANIE: pozwala mówić dowolną liczbę sekund (10s, 30s, 60s...)

            window.currentActiveRecognition = recognition;
            window.currentRecognitionTargetId = targetElementId;

            const existingVal = targetInput.value.trim();
            const baseText = existingVal ? existingVal + ' ' : '';
            let finalTranscript = '';

            // Automatyczny timer bezpieczeństwa na 90 sekund ciągłego mówienia
            const maxDurationTimer = setTimeout(() => {
                if (window.currentActiveRecognition === recognition) {
                    recognition.stop();
                }
            }, 90000);

            recognition.onstart = function() {
                if (btnElement) {
                    btnElement.className = "absolute right-1.5 top-1.5 w-6 h-6 rounded-md border border-rose-500 bg-rose-950 text-rose-400 flex items-center justify-center text-xs animate-pulse cursor-pointer shadow-md shadow-rose-500/40";
                    btnElement.innerHTML = '<i class="fas fa-microphone text-rose-400"></i>';
                    btnElement.title = "Trwa ciągłe nagrywanie... Mów uwagę (np. 'jest uszkodzenie w tym miejscu'). Kliknij mikrofon, aby zakończyć.";
                }
                targetInput.classList.add('ring-2', 'ring-rose-500/50', 'border-rose-500');
            };

            recognition.onresult = function(event) {
                let interimTranscript = '';
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        finalTranscript += event.results[i][0].transcript + ' ';
                    } else {
                        interimTranscript += event.results[i][0].transcript;
                    }
                }
                const spoken = (finalTranscript + interimTranscript).trim();
                targetInput.value = (baseText + spoken).trim();
                targetInput.dispatchEvent(new Event('input'));
            };

            recognition.onerror = function(event) {
                console.warn('Błąd rozpoznawania mowy:', event.error);
                if (event.error === 'not-allowed') {
                    alert('Dostęp do mikrofonu został zablokowany. Włącz uprawnienia mikrofonu w przeglądarce.');
                }
            };

            recognition.onend = function() {
                clearTimeout(maxDurationTimer);
                window.currentActiveRecognition = null;
                window.currentRecognitionTargetId = null;
                targetInput.classList.remove('ring-2', 'ring-rose-500/50', 'border-rose-500');
                if (btnElement) {
                    btnElement.className = "absolute right-1.5 top-1.5 w-6 h-6 rounded-md bg-slate-900 border border-slate-700 hover:border-cyan-500 text-cyan-400 hover:text-white flex items-center justify-center text-xs transition-all cursor-pointer shadow-sm";
                    btnElement.innerHTML = '<i class="fas fa-microphone"></i>';
                    btnElement.title = "Podyktuj uwagę bezpośrednio do ramki (zamiana głosu na tekst)";
                }
            };

            try {
                recognition.start();
            } catch(e) {
                console.error("Nie udało się uruchomić rozpoznawania mowy:", e);
            }
        };

        function closeAudModal() { document.getElementById('modal-aud-view').classList.add('hidden'); }

        window.handleAuditAction = async function(action, id) {
            const numId = Number(id);

            if (action === 'approve') {
                // 1. Natychmiastowa aktualizacja optymistyczna w pamięci podręcznej UI
                const item = cachedManagerAudits.find(a => Number(a.id) === numId || String(a.id) === String(id));
                if (item) {
                    item.compliance_verdict = 'ZATWIERDZONY';
                    item.process_status = 'ZATWIERDZONY';
                    item.record_status = 'ZABLOKOWANY';
                }

                // 2. Key User pozostaje w bieżącym oknie głównym — audyt natychmiast znika z oczekujących
                renderManagerAuditsTable();

                if (typeof showToast === 'function') {
                    showToast(`Audyt #${id} zatwierdzony! Przeniesiono do zakładki "Zatwierdzone".`, 'success');
                }

                try {
                    const res = await apiFetch(`/api/audits/${id}/status`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status: 'ZATWIERDZONY' })
                    });
                    if (res && res.ok) {
                        await loadAuditResults();
                        if (typeof loadAuditorHistory === 'function') loadAuditorHistory();
                    } else {
                        const err = await res.json().catch(() => ({}));
                        alert('Błąd podczas zatwierdzania audytu: ' + (err.detail || 'Brak uprawnień lub błąd serwera.'));
                        await loadAuditResults();
                    }
                } catch (e) {
                    console.warn('API status patch error:', e);
                    alert('Nie udało się zapisać zmiany w bazie danych. Sprawdź połączenie.');
                    await loadAuditResults();
                }

            } else if (action === 'reject') {
                const reason = prompt('Podaj powód odrzucenia audytu (wymóg IFS Food v8):');
                if (!reason || reason.trim() === '') return;

                // Natychmiastowa aktualizacja optymistyczna w UI
                const item = cachedManagerAudits.find(a => Number(a.id) === numId || String(a.id) === String(id));
                if (item) {
                    item.compliance_verdict = 'ODRZUCONY';
                    item.process_status = 'ODRZUCONY';
                    item.record_status = 'ZABLOKOWANY';
                }

                // Audyt natychmiast znika z okna głównego i wpada do zakładki "Odrzucone audyty"
                renderManagerAuditsTable();

                if (typeof showToast === 'function') {
                    showToast(`✕ Audyt #${id} został odrzucony i przeniesiony do zakładki "Odrzucone audyty".`, 'warning');
                }

                try {
                    const res = await apiFetch(`/api/audits/${id}/status`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status: 'ODRZUCONY', reason: reason })
                    });
                    if (res && res.ok) {
                        await loadAuditResults();
                        if (typeof loadAuditorHistory === 'function') loadAuditorHistory();
                    } else {
                        const err = await res.json().catch(() => ({}));
                        alert('Błąd podczas odrzucania audytu: ' + (err.detail || 'Błąd serwera.'));
                        await loadAuditResults();
                    }
                } catch (e) {
                    console.warn('API status patch fallback:', e);
                    await loadAuditResults();
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
            state.schedule_id = activeSelectedAudit.id;
            state.line = activeSelectedAudit.line;
            state.active_audit_type = activeSelectedAudit.audit_type || "HACCP";
            setInspectionStandard(state.active_audit_type);
            
            const hiddenLine = document.getElementById('hidden-line-input');
            if (hiddenLine) hiddenLine.value = state.line;
            document.querySelectorAll('.tile-line').forEach(b => {
                if (b.getAttribute('data-line') === state.line || b.textContent.trim() === state.line) {
                    b.classList.add('tile-selected');
                } else {
                    b.classList.remove('tile-selected');
                }
            });
            if (window.formHistory && typeof formHistory.saveState === 'function') {
                formHistory.saveState('view-audit-form'); 
            }
            
            closeAudModal();
            showModule('audit-main');
        }

        window.startAuditorTaskById = async function(id) {
            try {
                const res = await fetch(`/api/schedule/${id}`);
                if (!res.ok) return;
                const a = await res.json();
                activeSelectedAudit = a;
                startAuditorTask();
            } catch(e) { console.warn("Błąd startAuditorTaskById:", e); }
        };


    window.toggleAuditorPinVisibility = function(show) {
        const pinInput = document.getElementById('edit-auditor-pin');
        if (pinInput) {
            pinInput.type = show ? 'text' : 'password';
        }
    };

    window.showAuditorProfileModal = function(user) {
        if (!user) return;
        window.currentAuditorId = user.id;

        const nameEl = document.getElementById('edit-auditor-name');
        const roleEl = document.getElementById('edit-auditor-role');
        const pinInput = document.getElementById('edit-auditor-pin');
        const showPinCb = document.getElementById('edit-auditor-show-pin');

        if (nameEl) nameEl.value = user.full_name || '';
        if (roleEl) roleEl.value = user.role || 'AUDITOR';
        
        if (pinInput) {
            pinInput.value = '';
            pinInput.placeholder = 'Zostaw puste aby zachować obecny PIN';
            pinInput.type = 'text';
        }
        if (showPinCb) {
            showPinCb.checked = true;
        }

        const qualCheckboxes = document.querySelectorAll('#edit-auditor-qualifications input[type="checkbox"]');
        const userQuals = Array.isArray(user.qualifications) ? user.qualifications : (user.qualifications ? String(user.qualifications).split(',').map(q => q.trim()) : ['HACCP', 'GMP', 'GHP']);
        qualCheckboxes.forEach(checkbox => {
            checkbox.checked = userQuals.includes(checkbox.value);
        });

        const zoneCheckboxes = document.querySelectorAll('#edit-auditor-zones input[type="checkbox"]');
        const userZones = Array.isArray(user.zones) ? user.zones : (user.zones ? String(user.zones).split(',').map(z => z.trim()) : ['ALL']);
        zoneCheckboxes.forEach(checkbox => {
            checkbox.checked = userZones.includes(checkbox.value);
        });

        document.getElementById('auditor-profile-modal').classList.remove('hidden');
    };

    window.saveAuditorProfile = async function() {
        const auditorId = window.currentAuditorId;
        if (!auditorId) {
            alert('Błąd: brak ID audytora do zapisu.');
            return;
        }

        const fullName = (document.getElementById('edit-auditor-name')?.value || '').trim();
        const role = document.getElementById('edit-auditor-role')?.value || 'AUDITOR';
        const pin = (document.getElementById('edit-auditor-pin')?.value || '').trim();

        if (!fullName) return alert('Wprowadź imię i nazwisko!');
        // PIN jest opcjonalny przy edycji - jeśli podany, musi mieć co najmniej 3 znaki
        if (pin && pin.length < 3) {
            return alert('Nowy kod PIN musi zawierać co najmniej 3 znaki!');
        }

        const selectedQuals = Array.from(document.querySelectorAll('#edit-auditor-qualifications input[type="checkbox"]')).filter(cb => cb.checked).map(cb => cb.value);
        const selectedZones = Array.from(document.querySelectorAll('#edit-auditor-zones input[type="checkbox"]')).filter(cb => cb.checked).map(cb => cb.value);

        const updatedAuditor = {
            full_name: fullName,
            role: role,
            qualifications: selectedQuals,
            zones: selectedZones
        };
        // Dołącz nowy PIN tylko jeśli został jawnie wpisany przez użytkownika
        if (pin) {
            updatedAuditor.pin = pin;
        }

        try {
            const res = await apiFetch(`/api/users/${auditorId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(updatedAuditor)
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                alert('Błąd podczas zapisu: ' + (errorData.detail || errorData.message || res.statusText));
                return;
            }

            if (typeof renderAuditorsList === 'function') await renderAuditorsList();
            if (typeof loadAuditorsDropdown === 'function') await loadAuditorsDropdown();
            if (typeof loadScheduleAndRender === 'function') await loadScheduleAndRender();

            document.getElementById('auditor-profile-modal').classList.add('hidden');
            const successMsg = pin 
                ? 'Profil audytora oraz nowy kod PIN zostały pomyślnie zaktualizowane!' 
                : 'Profil audytora został pomyślnie zaktualizowany (dotychczasowy PIN zachowany)!';
            alert(successMsg);

        } catch (error) {
            console.error('Wystąpił błąd sieci lub serwera:', error);
            alert('Wystąpił błąd sieci lub serwera podczas zapisu profilu.');
        }
    };

    
    window.clearAllSchedules = async function() {
        if (!confirm('Czy na pewno chcesz usunąć WSZYSTKIE audyty ze wszystkich miesięcy w całym harmonogramie?')) {
            return;
        }

        try {
            const res = await apiFetch('/api/schedule/clear-all', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                alert(`Błąd podczas usuwania: ${errData.detail || 'Błąd serwera'}`);
                return;
            }

            schedulesData = [];
            updateAuditorScheduleBadges([]);
            if (typeof renderCalendar === 'function') {
                renderCalendar();
            }
            if (typeof updateAutoPlanPreview === 'function') {
                updateAutoPlanPreview(false);
            }
            closeAutoPlanModal();
            alert('Pomyślnie wyczyszczono cały harmonogram!');
        } catch (err) {
            console.error('Błąd podczas czyszczenia całego harmonogramu:', err);
            alert('Błąd połączenia z serwerem.');
        }
    };

    window.clearCurrentMonthSchedule = async function() {
        const monthSelect = document.getElementById('autoplan-month');
        const yearSelect = document.getElementById('autoplan-year');
        const monthNum = monthSelect ? parseInt(monthSelect.value) : (new Date().getMonth() + 1);
        const yearNum = yearSelect ? parseInt(yearSelect.value) : new Date().getFullYear();
        const monthName = monthSelect ? monthSelect.options[monthSelect.selectedIndex]?.text : `Miesiąc ${monthNum}`;
        const period = state.selected_period_months || 1;
        const periodLabel = period === 1 ? '1 miesiąc' : (period < 5 ? `${period} miesiące` : `${period} miesięcy`);

        const startDateStr = `${yearNum}-${String(monthNum).padStart(2, '0')}-01`;
        const endTotalMonths = monthNum + period - 1;
        const endYear = yearNum + Math.floor((endTotalMonths - 1) / 12);
        const endMonth = ((endTotalMonths - 1) % 12) + 1;
        const lastDay = new Date(endYear, endMonth, 0).getDate();
        const endDateStr = `${endYear}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        
        const confirmMsg = period === 1
            ? `Czy na pewno chcesz usunąć wszystkie zaplanowane audyty dla miesiąca: ${monthName} ${yearNum}?`
            : `Czy na pewno chcesz usunąć zaplanowane audyty na okres: ${periodLabel} (${startDateStr} do ${endDateStr})?`;

        if (!confirm(confirmMsg)) {
            return;
        }

        try {
            const payload = {
                month: monthNum,
                year: yearNum,
                period_months: period
            };
            const res = await apiFetch('/api/schedule/clear-month', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                alert(`Błąd podczas usuwania audytów: ${errData.detail || 'Wystąpił błąd serwera.'}`);
                return;
            }

            const data = await res.json().catch(() => ({}));

            // Natychmiastowe czyszczenie lokalne w pamięci podręcznej przeglądarki
            if (Array.isArray(schedulesData)) {
                schedulesData = schedulesData.filter(s => {
                    if (!s.scheduled_date) return true;
                    const sDate = String(s.scheduled_date).slice(0, 10);
                    return !(sDate >= startDateStr && sDate <= endDateStr);
                });
            }

            // Natychmiastowe odświeżenie widoku kalendarza i plakietek ilości bez opóźnienia
            if (typeof renderCalendar === 'function') {
                renderCalendar();
            }
            if (typeof updateAuditorScheduleBadges === 'function') {
                updateAuditorScheduleBadges(schedulesData);
            }

            // Odświeżenie danych z serwera (z anty-cache)
            if (typeof loadScheduleAndRender === 'function') {
                await loadScheduleAndRender();
            }

            if (typeof updateAutoPlanPreview === 'function') {
                updateAutoPlanPreview(false);
            }

            alert(data.message || `Usunięto audyty na okres: ${periodLabel} (${startDateStr} – ${endDateStr})`);
            closeAutoPlanModal();
        } catch (err) {
            console.error('Błąd podczas czyszczenia harmonogramu:', err);
            alert('Wystąpił błąd podczas usuwania audytów.');
        }
    };

    // Obsługa efektu obracającego się kapsla 3D (Browar Wielka Sowa style)
    window.toggleCapFlip = function(el, ev) {
        if (ev && ev.target && ev.target.closest('button')) return;
        if (el) {
            el.classList.toggle('bws-active');
        }
    };

    // Automatyczne odwrócenie kapsla z powrotem przy dotknięciu poza nim (np. na tablecie)
    document.addEventListener('pointerdown', (e) => {
        if (!e.target.closest('.bws-cap-viewport')) {
            document.querySelectorAll('.bws-cap-viewport.bws-active').forEach(el => {
                el.classList.remove('bws-active');
            });
        }
    });

    window.quickRunSchedule = async function(months) {
        if (typeof openAutoPlanModal === 'function') {
            await openAutoPlanModal();
        }
        const btns = document.querySelectorAll('.btn-period');
        let targetBtn = null;
        btns.forEach(b => {
            const txt = b.textContent.trim();
            if (parseInt(txt) === months || txt.startsWith(String(months))) {
                targetBtn = b;
            }
        });
        if (typeof setPlanPeriod === 'function') {
            setPlanPeriod(months, targetBtn || btns[0]);
        }
    };

    window.enforceBiometricHeaderIcon = function() {
        const btn = document.getElementById('btn-bind-biometrics') || document.querySelector('button[onclick*="registerCurrentDeviceBiometrics"]');
        if (btn) {
            btn.innerHTML = `<svg class="w-7 h-4 group-hover:scale-105 transition-transform drop-shadow-[0_0_6px_rgba(52,211,153,0.5)]" viewBox="0 0 32 18" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
                <!-- LEWA CZĘŚĆ: Narożniki Face ID + oczy/uśmiech -->
                <g stroke-width="1.8">
                    <!-- Narożniki Face ID -->
                    <path d="M4 2H2v2"/>
                    <path d="M12 2h2v2"/>
                    <path d="M4 16H2v-2"/>
                    <path d="M12 16h2v-2"/>
                    <!-- Twarz: oczy, nos, uśmiech -->
                    <circle cx="5.5" cy="6.5" r="0.8" fill="currentColor"/>
                    <circle cx="10.5" cy="6.5" r="0.8" fill="currentColor"/>
                    <path d="M8 8.5v2"/>
                    <path d="M5.5 12.5a3.2 3.2 0 0 0 5 0" stroke-width="1.4"/>
                </g>
                <!-- SEPARATOR / ŁĄCZNIK SUBTELNY -->
                <line x1="16" y1="4" x2="16" y2="14" stroke="currentColor" stroke-width="1" stroke-opacity="0.3" stroke-dasharray="1.5 1.5"/>
                <!-- PRAWA CZĘŚĆ: Linie Papilarne / Odcisk Palca (Fingerprint) -->
                <g stroke-width="1.6">
                    <!-- Łuki linii papilarnych -->
                    <path d="M20 15a4.5 4.5 0 0 1-1-3.2 5 5 0 0 1 9-2.5"/>
                    <path d="M21.5 13.5a2.8 2.8 0 0 1-.5-1.7 3 3 0 0 1 5.5-1.5"/>
                    <path d="M23.5 12a1 1 0 0 1 1-1 1 1 0 0 1 1 1v2"/>
                    <path d="M27.5 14.5a6 6 0 0 0 .5-2.5 7 7 0 0 0-9.8-6.2"/>
                </g>
            </svg>`;
            btn.className = "tile-3d px-1.5 py-1.5 bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 hover:text-white rounded-xl border border-emerald-700 flex items-center justify-center transition-all group";
        }
    };

    // Wymuszenie natychmiastowe oraz po załadowaniu drzewa DOM
    try { window.enforceBiometricHeaderIcon(); } catch(e) {}
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            try { window.enforceBiometricHeaderIcon(); } catch(e) {}
        });
    }

    // Okresowe ciche odświeżanie zaplanowanych audytów i plakietek powiadomień iPhone (co 15 sekund)
    setInterval(() => {
        if (state && state.token && state.auditor_id && typeof loadScheduleAndRender === 'function') {
            loadScheduleAndRender().catch(() => {});
        }
        if (typeof updateAuditorNotesBadge === 'function') {
            updateAuditorNotesBadge().catch(() => {});
        }
    }, 15000);

    // Wywołanie startowe dla plakietek wiadomości
    if (typeof updateAuditorNotesBadge === 'function') {
        setTimeout(() => updateAuditorNotesBadge().catch(() => {}), 1000);
    }
