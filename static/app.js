
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
        window.state = state;

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
        window.apiFetch = apiFetch;
        window.updateAuditHud = updateAuditHud;

        let currentCalDate = window.currentCalDate || new Date();
        let miniCalDate = window.miniCalDate || new Date();
        let schedulesData = window.schedulesData || [];
        let productionLinesData = window.productionLinesData || [];
        let activeSelectedAudit = window.activeSelectedAudit || null;

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
        window.showModule = showModule;

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
        window.getLocalDateString = getLocalDateString;

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
            if (!confirm("Czy na pewno chcesz usunąć tego audytora?")) return false;
            try {
                const res = await apiFetch(`/api/users/${userId}`, { method: 'DELETE' });
                if (res.ok) {
                    await renderAuditorsList();
                    if (typeof loadAuditorsDropdown === 'function') await loadAuditorsDropdown();
                    if (typeof loadScheduleAndRender === 'function') await loadScheduleAndRender();
                    alert("Audytor został pomyślnie usunięty z rejestru.");
                    return true;
                } else {
                    const err = await res.json().catch(() => ({}));
                    alert(`${err.detail || 'Błąd usuwania użytkownika'}`);
                    return false;
                }
            } catch(e) {
                console.error("Błąd deleteAuditor:", e);
                alert("Wystąpił błąd sieci podczas usuwania audytora.");
                return false;
            }
        }

        window.deleteAuditor = deleteAuditor;
        window.renderAuditorsList = renderAuditorsList;
        window.addNewAuditor = addNewAuditor;

        // --- MODUŁ KALENDARZA I HARMONOGRAMU (WYDZIELONY DO static/js/calendar.js) ---
        // Pełna obsługa kalendarza, widoków, świąt oraz planowania znajduje się w dedykowanym module calendar.js.
        // --- MODUŁ PULPITU MANAGERA I AUDYTÓW (WYDZIELONY DO static/js/manager_dashboard.js) ---
        // Tabela wyników audytów, decyzje zatwierdź/odrzuć, notatki kierownika i wnioski o korektę.

        // --- MODUŁ HISTORII AUDYTÓW (WYDZIELONY DO static/js/audit_history.js) ---
        // Zakładki historii audytora (Oczekujące, Wykonane, Zaakceptowane, Archiwum >5 dni) i akordeon kart.

        // Procedura wnioskowania o korektę audytu przeniesiona do static/js/audit_form.js

        // --- MODUŁ FORMULARZA AUDYTU I CHECKLISTY (WYDZIELONY DO static/js/audit_form.js) ---
        // Obsługa checklisty IFS Food v8, oceny KO, wniosków o korektę i wysyłki audytu (saveAuditToDb) znajduje się w static/js/audit_form.js
        // --- MODUŁ LINII PRODUKCYJNYCH (WYDZIELONY DO static/js/production_lines.js) ---
        // Rejestr linii fabrycznych, paszport techniczny, strefy higieniczne, statusy i akordeon.

        // --- MODUŁ LIVE CHAT I NOTATEK OPERACYJNYCH (WYDZIELONY DO static/js/live_chat.js) ---
        // Komunikator operacyjny Hala <-> Biuro, alerty HOLD CCP / UWAGA CP, szybkie notatki.

        // Obsługa wyboru audytorów i walidacja zastępców przeniesiona do static/js/calendar.js

        // Parser wnioskowania SLM AI oraz graficzne karty audytowe przeniesione do static/js/audit_form.js

        function escapeHtml(str) {
            return String(str || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }
        window.escapeHtml = escapeHtml;

        function renderMarkdownToHtml(t) {
            if (!t) return "";
            
            const parsedObj = parseSlmJson(t);
            if (parsedObj) {
                return renderGraphicAuditCard(parsedObj);
            }

            const cleanText = escapeHtml(t);

            let html = cleanText
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

        // Modale edycji i podglądu zlecenia (openMgrModal, openAudModal) przeniesione do static/js/calendar.js
        // --- SZCZEGÓŁY AUDYTU I DECYZJE MANAGERA (WYDZIELONE DO static/js/manager_dashboard.js) ---
        // Modale szczegółów, zakładki raport/checklista/audit-trail, decyzje o korekcie i HOLD LOT.

        function closeAudModal() { const m = document.getElementById('modal-aud-view'); if (m) m.classList.add('hidden'); }


        
        function startAuditorTask() {
            if (!activeSelectedAudit) return;
            state.schedule_id = activeSelectedAudit.id;
            state.line = activeSelectedAudit.line;
            state.active_audit_type = activeSelectedAudit.audit_type || "HACCP";
            setInspectionStandard(state.active_audit_type);
            
            const hiddenLine = document.getElementById('hidden-line-input');
            if (hiddenLine) hiddenLine.value = state.line;
            const preauditSelect = document.getElementById('preaudit-line-select');
            if (preauditSelect && state.line) preauditSelect.value = state.line;
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
        const delBtn = document.getElementById('btn-delete-auditor-modal');

        if (delBtn) {
            if (user.id === 1 || user.role === 'MANAGER') {
                delBtn.classList.add('hidden');
            } else {
                delBtn.classList.remove('hidden');
            }
        }

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

    window.deleteCurrentAuditorFromModal = async function() {
        const auditorId = window.currentAuditorId;
        if (!auditorId) return;
        if (auditorId === 1) {
            alert("Nie można usunąć głównego konta Administratora Jakości.");
            return;
        }
        const success = await deleteAuditor(auditorId);
        if (success) {
            document.getElementById('auditor-profile-modal')?.classList.add('hidden');
        }
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

    
    // Czyszczenie harmonogramu przeniesione do static/js/calendar.js

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
