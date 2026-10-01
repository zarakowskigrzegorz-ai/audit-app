/**
 * System Audytowy IFS Food v8 / HACCP - Moduł Formularza Audytu i Checklisty
 * Plik: static/js/audit_form.js
 * 
 * Odpowiedzialność:
 * - Dynamiczne renderowanie checklisty (HACCP, GMP, GHP) z normami IFS Food v8
 * - Obsługa ocen suwakowych, punktów krytycznych Knock-Out (KO) i odpowiedzi pytań
 * - Obliczanie wyniku audytu (wynik procentowy, weryfikacja 100% zatwierdzenia pytań)
 * - Obsługa fotografii dowodowej (aparat fotograficzny na hali lub plik z dysku)
 * - Wybór parametrów i kafelków (linie, strefy, statusy, CCP)
 * - Parser odpowiedzi lokalnego modelu SLM AI i filtrowanie terminologii
 * - Natychmiastowa ocena regułowa oraz wysyłka audytu (POST /api/audit)
 * - Składanie wniosków o odblokowanie rekordu do korekty (IFS Food v8)
 */

(function(window) {
    "use strict";

    window.currentAuditPhotoFile = null;

    function getAppState() {
        return window.state || {};
    }

    function getHttpFetch() {
        return window.apiFetch || window.fetch;
    }

    function notifyToast(msg, type = "info") {
        if (typeof window.showToast === 'function') {
            window.showToast(msg, type);
        } else {
            console.log(`[Toast ${type}] ${msg}`);
        }
    }

    function recordFormHistory(formId = 'view-audit-form') {
        if (window.formHistory && typeof window.formHistory.saveState === 'function') {
            window.formHistory.saveState(formId);
        }
    }

    // --- FILTROWANIE NIEPOŻĄDANEJ TERMINOLOGII I PARSER SLM AI ---

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
    window.sanitizeBadTerms = sanitizeBadTerms;

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
    window.parseSlmJson = parseSlmJson;

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

        return `
            <div class="rounded-2xl border p-4 shadow-xl ${bannerBg} text-left transition-all">
                <div class="flex items-start justify-between gap-3">
                    <div class="flex items-center gap-3">
                        <div class="p-2 rounded-xl bg-black/40 border border-white/10 shadow-inner">
                            ${icon}
                        </div>
                        <div>
                            <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Autonomiczna Ocena Jakości SLM</div>
                            <div class="text-sm font-black text-white tracking-wide">${statusLabel}</div>
                        </div>
                    </div>
                    <span class="text-[9px] font-black px-2 py-0.5 rounded-full border ${badgeBg}">${risk}</span>
                </div>
                <div class="mt-3 text-xs text-slate-200 leading-relaxed bg-black/30 p-2.5 rounded-xl border border-white/5">
                    ${decyzja}
                </div>
                ${akcjeHtml}
                ${podpowiedziHtml}
            </div>
        `;
    }
    window.renderGraphicAuditCard = renderGraphicAuditCard;

    // --- WYBÓR KAFELKÓW I OBSŁUGA FORMULARZA ---

    function selectTile(cat, val, btn) {
        document.querySelectorAll(`.tile-${cat}`).forEach(b => b.classList.remove('tile-selected'));
        if (btn) btn.classList.add('tile-selected');
        const state = getAppState();
        state[cat] = val;
        if (cat === 'line') {
            const hiddenLine = document.getElementById('hidden-line-input');
            if (hiddenLine) hiddenLine.value = val;
            const preauditSelect = document.getElementById('preaudit-line-select');
            if (preauditSelect) preauditSelect.value = val;
        }
        recordFormHistory('view-audit-form');
    }
    window.selectTile = selectTile;

    window.onPreauditLineChange = function(lineVal) {
        const state = getAppState();
        state.line = lineVal;
        const hiddenLine = document.getElementById('hidden-line-input');
        if (hiddenLine) hiddenLine.value = lineVal;
        const preauditSelect = document.getElementById('preaudit-line-select');
        if (preauditSelect && preauditSelect.value !== lineVal) preauditSelect.value = lineVal;
        recordFormHistory('view-audit-form');
        if (typeof window.syncAgentLineSelector === 'function') {
            window.syncAgentLineSelector();
        }
    };

    function startDirectInspection() {
        setInspectionStandard("HACCP");
        const form = document.getElementById('view-audit-form');
        if (form) form.reset();
        recordFormHistory('view-audit-form');
        if (typeof window.showModule === 'function') {
            window.showModule('audit-main');
        }
    }
    window.startDirectInspection = startDirectInspection;

    function setInspectionStandard(std, btn) {
        const state = getAppState();
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
        recordFormHistory('view-audit-form');
    }
    window.setInspectionStandard = setInspectionStandard;

    // --- CHECKLISTA DYNAMICZNA IFS FOOD V8 ---

    function handleChecklistSliderInput(id, val) {
        const state = getAppState();
        if (state.checklist_results && state.checklist_results[id] && state.checklist_results[id].locked) return;
        const scoreVal = parseInt(val);
        
        const valBadge = document.getElementById(`chk-val-${id}`);
        const statusBadge = document.getElementById(`chk-status-${id}`);
        const descEl = document.getElementById(`chk-desc-${id}`);

        if (valBadge) valBadge.innerText = `${scoreVal}/5`;

        const descs = {
            1: "Brak zgodności / Ryzyko krytyczne (NOK)",
            2: "Odchylenie poważne (NOK)",
            3: "Odchylenie niewielkie (Wymaga CAPA)",
            4: "Prawie pełna zgodność",
            5: "Pełna zgodność z normą IFS Food v8"
        };
        if (descEl) descEl.innerText = descs[scoreVal] || "";

        if (statusBadge) {
            if (scoreVal <= 2) {
                statusBadge.className = "text-[9px] font-black px-2 py-0.5 rounded border uppercase tracking-wider bg-rose-950 text-rose-300 border-rose-500/40 animate-pulse";
                statusBadge.innerText = "NIEZGODNOŚĆ";
            } else if (scoreVal <= 4) {
                statusBadge.className = "text-[9px] font-black px-2 py-0.5 rounded border uppercase tracking-wider bg-amber-950 text-amber-300 border-amber-500/40";
                statusBadge.innerText = "ODCHYLENIE";
            } else {
                statusBadge.className = "text-[9px] font-black px-2 py-0.5 rounded border uppercase tracking-wider bg-emerald-950 text-emerald-300 border-emerald-500/40";
                statusBadge.innerText = "ZGODNY";
            }
        }

        if (!state.checklist_results) state.checklist_results = {};
        if (state.checklist_results[id]) {
            state.checklist_results[id].score = scoreVal;
            state.checklist_results[id].status = scoreVal <= 2 ? "NOK" : "OK";
        }
        calculateChecklistScore();
    }
    window.handleChecklistSliderInput = handleChecklistSliderInput;

    function acceptChecklistScore(id) {
        const state = getAppState();
        if (!state.checklist_results || !state.checklist_results[id]) return;
        
        const slider = document.getElementById(`chk-slider-${id}`);
        const score = slider ? parseInt(slider.value) : (state.checklist_results[id].score || 5);
        const card = document.getElementById(`chk-card-${id}`);
        const acceptBtn = document.getElementById(`chk-btn-accept-${id}`);
        const unlockBtn = document.getElementById(`chk-btn-unlock-${id}`);

        state.checklist_results[id].score = score;
        state.checklist_results[id].status = score <= 2 ? "NOK" : "OK";
        state.checklist_results[id].locked = true;
        state.checklist_results[id].accepted = true;

        if (slider) slider.disabled = true;
        if (card) {
            card.classList.remove('border-slate-800', 'border-rose-500/40', 'border-amber-500/40');
            card.classList.add('border-emerald-500/50', 'bg-slate-900/95');
        }
        if (acceptBtn) acceptBtn.classList.add('hidden');
        if (unlockBtn) unlockBtn.classList.remove('hidden');

        // Sprawdź czy pytanie było KO i ma ocenę NOK -> natychmiastowe ostrzeżenie audytora
        if (state.checklist_results[id].is_ko && score <= 2) {
            notifyToast(`UWAGA: Zatwierdzono naruszenie wymagania Knock-Out (KO #${id})! Zgodnie z IFS Food v8 audyt zakończy się werdyktem NOK i procedurą Hold Lot.`, 'error');
        }

        calculateChecklistScore();
        recordFormHistory('view-audit-form');
    }
    window.acceptChecklistScore = acceptChecklistScore;

    function unlockChecklistScore(id) {
        const state = getAppState();
        if (!state.checklist_results || !state.checklist_results[id]) return;

        const slider = document.getElementById(`chk-slider-${id}`);
        const card = document.getElementById(`chk-card-${id}`);
        const acceptBtn = document.getElementById(`chk-btn-accept-${id}`);
        const unlockBtn = document.getElementById(`chk-btn-unlock-${id}`);

        state.checklist_results[id].locked = false;
        state.checklist_results[id].accepted = false;

        if (slider) slider.disabled = false;
        if (card) {
            card.classList.remove('border-emerald-500/50');
            card.classList.add('border-slate-800');
        }
        if (acceptBtn) acceptBtn.classList.remove('hidden');
        if (unlockBtn) unlockBtn.classList.add('hidden');

        calculateChecklistScore();
        recordFormHistory('view-audit-form');
    }
    window.unlockChecklistScore = unlockChecklistScore;

    function setChecklistScore(id, score) {
        const slider = document.getElementById(`chk-slider-${id}`);
        if (slider && !slider.disabled) {
            slider.value = score;
            handleChecklistSliderInput(id, score);
        }
    }
    window.setChecklistScore = setChecklistScore;

    function setChecklistAnswer(id, ans) {
        setChecklistScore(id, ans === 'TAK' ? 5 : 1);
    }
    window.setChecklistAnswer = setChecklistAnswer;

    async function loadChecklistForAudit(auditType) {
        const cont = document.getElementById('checklist-items-container') || document.getElementById('checklist-questions-container');
        if (!cont) return;
        cont.innerHTML = `<div class="p-8 text-center text-slate-400 flex items-center justify-center gap-2"><i class="fas fa-spinner fa-spin text-cyan-400"></i> Ładowanie pytań checklisty ${auditType}...</div>`;
        
        const state = getAppState();
        state.checklist_results = {};

        try {
            const res = await fetch(`/api/checklist-template/${auditType}`);
            const items = await res.json();
            cont.innerHTML = "";

            if (!Array.isArray(items) || items.length === 0) {
                cont.innerHTML = `<div class="p-8 text-center text-slate-500">Brak zdefiniowanych pytań dla standardu ${auditType}.</div>`;
                return;
            }

            items.forEach(q => {
                state.checklist_results[q.id] = {
                    id: q.id,
                    clause: q.clause,
                    question: q.question,
                    is_ko: Boolean(q.is_ko),
                    score: 5,
                    status: "OK",
                    locked: false,
                    accepted: false,
                    notes: ""
                };

                const koBadge = q.is_ko ? `<span class="px-2 py-0.5 rounded text-[8.5px] font-black uppercase tracking-wider bg-rose-950 text-rose-300 border border-rose-500/60 shadow-sm animate-pulse">KNOCK-OUT (KO)</span>` : '';
                
                cont.innerHTML += `
                    <div id="chk-card-${q.id}" class="glass-card bg-slate-900/80 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg transition-all text-left">
                        <div class="flex items-start justify-between gap-3 border-b border-slate-800 pb-3 mb-3">
                            <div class="space-y-1">
                                <div class="flex items-center gap-2">
                                    <span class="text-xs font-mono font-bold text-cyan-400 bg-cyan-950/60 border border-cyan-500/30 px-2 py-0.5 rounded-lg">${q.clause}</span>
                                    ${koBadge}
                                </div>
                                <h4 class="text-sm font-bold text-white leading-snug">${q.question}</h4>
                            </div>
                            <div class="flex flex-col items-end shrink-0 gap-1">
                                <span id="chk-val-${q.id}" class="text-lg font-black text-cyan-300">5/5</span>
                                <span id="chk-status-${q.id}" class="text-[9px] font-black px-2 py-0.5 rounded border uppercase tracking-wider bg-emerald-950 text-emerald-300 border-emerald-500/40">ZGODNY</span>
                            </div>
                        </div>

                        <!-- Suwak oceny punktowej 1 - 5 -->
                        <div class="space-y-2">
                            <div class="flex justify-between text-[10px] text-slate-400 font-bold">
                                <span>1 - Krytyczny brak zgodności</span>
                                <span id="chk-desc-${q.id}" class="text-slate-300">Pełna zgodność z normą IFS Food v8</span>
                                <span>5 - Zgodność pełna</span>
                            </div>
                            <input id="chk-slider-${q.id}" type="range" min="1" max="5" value="5" step="1" 
                                   oninput="handleChecklistSliderInput(${q.id}, this.value)"
                                   class="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400 hover:accent-cyan-300 transition">
                            
                            <div class="flex justify-between items-center pt-2">
                                <div class="flex items-center gap-1.5">
                                    <button type="button" onclick="setChecklistScore(${q.id}, 5)" class="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-300">5 (A)</button>
                                    <button type="button" onclick="setChecklistScore(${q.id}, 4)" class="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-300">4 (B)</button>
                                    <button type="button" onclick="setChecklistScore(${q.id}, 3)" class="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-300">3 (C)</button>
                                    <button type="button" onclick="setChecklistScore(${q.id}, 1)" class="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-rose-950/60 hover:bg-rose-900/60 text-rose-300 border border-rose-700/40">1 (NOK)</button>
                                </div>
                                <div class="flex items-center gap-2">
                                    <button id="chk-btn-accept-${q.id}" type="button" onclick="acceptChecklistScore(${q.id})" class="px-3.5 py-1.5 rounded-xl text-xs font-black bg-cyan-600 hover:bg-cyan-500 text-white shadow-md flex items-center gap-1.5 transition">
                                        <i class="fas fa-check text-[10px]"></i> <span>Zatwierdź Punkt</span>
                                    </button>
                                    <button id="chk-btn-unlock-${q.id}" type="button" onclick="unlockChecklistScore(${q.id})" class="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 shadow-md flex items-center gap-1.5 transition hidden">
                                        <i class="fas fa-lock-open text-[10px]"></i> <span>Edytuj</span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        <!-- Opcjonalne pole na uwagi / dowody z audytu -->
                        <div class="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center gap-2">
                            <i class="fas fa-pen text-[10px] text-slate-500"></i>
                            <input type="text" placeholder="Dodaj uwagi dowodowe lub numer partii wyrobu (opcjonalnie)..." 
                                   onchange="if(window.state && window.state.checklist_results[${q.id}]) window.state.checklist_results[${q.id}].notes = this.value; recordFormHistory('view-audit-form');"
                                   class="w-full bg-slate-950/50 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50">
                        </div>
                    </div>
                `;
            });

            calculateChecklistScore();
        } catch (err) {
            console.error("loadChecklistForAudit error:", err);
            cont.innerHTML = `<div class="p-6 text-center text-rose-400 bg-rose-950/20 border border-rose-500/40 rounded-xl">Błąd pobierania pytań checklisty. Sprawdź połączenie z serwerem.</div>`;
        }
    }
    window.loadChecklistForAudit = loadChecklistForAudit;

    function calculateChecklistScore() {
        const state = getAppState();
        const results = Object.values(state.checklist_results || {});
        if (results.length === 0) return;

        let totalScore = 0;
        let maxScore = results.length * 5;
        let hasKoFailure = false;
        let unacceptedCount = 0;

        results.forEach(r => {
            const sc = r.score !== undefined ? parseInt(r.score) : 5;
            totalScore += sc;
            if (r.is_ko && sc <= 2) hasKoFailure = true;
            if (!r.locked && !r.accepted) unacceptedCount++;
        });

        const percent = Math.round((totalScore / maxScore) * 100);
        const acceptedCount = results.length - unacceptedCount;
        const progressPercent = Math.round((acceptedCount / results.length) * 100);

        // 1. Aktualizacja licznika w: document.getElementById('checklist-progress-counter')
        const counterEl = document.getElementById('checklist-progress-counter');
        if (counterEl) {
            counterEl.innerText = `${acceptedCount} / ${results.length} (${progressPercent}%)`;
            counterEl.className = unacceptedCount === 0 
                ? "font-mono font-black text-emerald-400" 
                : "font-mono font-black text-amber-400";
        }

        // 2. Aktualizacja szerokości paska w: document.getElementById('checklist-progress-fill')
        const fillEl = document.getElementById('checklist-progress-fill');
        if (fillEl) {
            fillEl.style.width = `${progressPercent}%`;
            fillEl.className = unacceptedCount === 0 
                ? "h-full bg-emerald-500 transition-all duration-300 rounded-full" 
                : "h-full bg-amber-500 transition-all duration-300 rounded-full";
        }

        // 3. Aktualizacja statusu w: document.getElementById('checklist-progress-status')
        const statusEl = document.getElementById('checklist-progress-status');
        if (statusEl) {
            if (unacceptedCount === 0) {
                if (hasKoFailure) {
                    statusEl.innerHTML = `<span class="text-rose-400 font-bold flex items-center gap-1"><i class="fas fa-triangle-exclamation text-rose-500"></i> Wykryto naruszenie KO (Hold Lot)</span>`;
                } else {
                    statusEl.innerHTML = `<span class="text-emerald-400 font-bold flex items-center gap-1"><i class="fas fa-check-circle text-emerald-400"></i> Wszystkie punkty ocenione (${percent}%)</span>`;
                }
            } else {
                statusEl.innerHTML = `<span class="text-amber-400 font-bold flex items-center gap-1"><i class="fas fa-exclamation-circle text-amber-400"></i> Pozostało do oceny: ${unacceptedCount}</span>`;
            }
        }

        // 4. Aktualizacja plakietki KO w: document.getElementById('ko-status-badge')
        const koBadge = document.getElementById('ko-status-badge');
        if (koBadge) {
            if (hasKoFailure) {
                koBadge.className = "text-[9px] font-black bg-rose-950 text-rose-300 border border-rose-500/60 px-2.5 py-0.5 rounded-full animate-pulse shadow-sm";
                koBadge.innerHTML = `<i class="fas fa-triangle-exclamation text-rose-400 mr-1"></i> NARUSZENIE KO (Hold Lot)`;
            } else if (unacceptedCount === 0) {
                koBadge.className = "text-[9px] font-black bg-emerald-950 text-emerald-300 border border-emerald-500/60 px-2.5 py-0.5 rounded-full shadow-sm";
                koBadge.innerHTML = `<i class="fas fa-circle-check text-emerald-400 mr-1"></i> Status KO: Zgodny (${percent}%)`;
            } else {
                koBadge.className = "text-[9px] font-black bg-slate-900 text-slate-400 border border-slate-700 px-2 py-0.5 rounded-full";
                koBadge.innerHTML = `<i class="fas fa-clock text-amber-400 mr-0.5"></i> Ocena: ${acceptedCount}/${results.length}`;
            }
        }

        // Opcjonalne kompatybilne elementy
        const scoreBadge = document.getElementById('checklist-score-percent');
        const countBadge = document.getElementById('checklist-accepted-count');
        const verdictBadge = document.getElementById('checklist-overall-verdict');
        if (scoreBadge) scoreBadge.innerText = `${percent}%`;
        if (countBadge) countBadge.innerText = `${acceptedCount}/${results.length}`;
        if (verdictBadge) {
            if (hasKoFailure) {
                verdictBadge.className = "text-xs font-black px-2.5 py-1 rounded-lg bg-rose-950 text-rose-300 border border-rose-500/50 animate-pulse";
                verdictBadge.innerText = "NOK (NARUSZENIE KO)";
            } else if (percent < 75) {
                verdictBadge.className = "text-xs font-black px-2.5 py-1 rounded-lg bg-rose-950 text-rose-300 border border-rose-500/50";
                verdictBadge.innerText = "NOK (WYNIK < 75%)";
            } else if (percent < 95) {
                verdictBadge.className = "text-xs font-black px-2.5 py-1 rounded-lg bg-amber-950 text-amber-300 border border-amber-500/50";
                verdictBadge.innerText = "POZIOM PODSTAWOWY";
            } else {
                verdictBadge.className = "text-xs font-black px-2.5 py-1 rounded-lg bg-emerald-950 text-emerald-300 border border-emerald-500/50";
                verdictBadge.innerText = "POZIOM WYŻSZY (OK)";
            }
        }

        const saveBtn = document.getElementById('btn-save-audit');
        const saveText = document.getElementById('btn-save-audit-text');
        if (saveBtn) {
            if (unacceptedCount === 0) {
                saveBtn.disabled = false;
                saveBtn.className = "w-full tile-3d h-14 bg-gradient-to-br from-emerald-600 to-teal-600 font-black text-xs uppercase text-white shadow-xl flex items-center justify-center gap-2 rounded-2xl cursor-pointer hover:from-emerald-500 hover:to-teal-500 active:scale-[0.98] transition-all duration-200 ring-2 ring-emerald-400/40";
                if (saveText) {
                    saveText.innerHTML = `<span class="flex items-center gap-2"><i class="fas fa-floppy-disk text-sm"></i><span>Zapisz Audyt i Wykonaj Analizę SLM AI</span></span>`;
                }
            } else {
                saveBtn.disabled = true;
                saveBtn.className = "w-full h-14 font-bold text-xs uppercase shadow-none flex items-center justify-center gap-2 rounded-2xl transition-all duration-300 opacity-40 bg-slate-900 text-slate-500 border border-slate-800 cursor-not-allowed pointer-events-none select-none";
                if (saveText) {
                    saveText.innerHTML = `<span class="flex items-center gap-2"><i class="fas fa-lock text-xs"></i><span>Zaakceptuj wszystkie pytania (pozostało ${unacceptedCount}/${results.length})</span></span>`;
                }
            }
        }
    }
    window.calculateChecklistScore = calculateChecklistScore;

    // --- DOKUMENTACJA FOTOGRAFICZNA ---

    window.handleAuditPhotoSelected = function(event) {
        const file = event.target.files && event.target.files[0];
        if (!file) {
            window.removeAuditPhoto();
            return;
        }

        if (!file.type.startsWith('image/')) {
            alert('Proszę wybrać plik graficzny (zdjęcie aparatu lub plik graficzny).');
            window.removeAuditPhoto();
            return;
        }

        if (file.size > 15 * 1024 * 1024) {
            alert('Rozmiar zdjęcia przekracza dopuszczalny limit 15 MB.');
            window.removeAuditPhoto();
            return;
        }

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

    // --- REJESTRACJA AUDYTU W BAZIE DANYCH (POST /api/audit) ---

    async function saveAuditToDb() {
        const state = getAppState();
        const keys = Object.keys(state.checklist_results || {});
        const unaccepted = keys.filter(k => !state.checklist_results[k].locked && !state.checklist_results[k].accepted);
        
        if (keys.length === 0) {
            notifyToast("Błąd: Brak pytań w checkliście do zapisu.", "warning");
            return;
        }

        if (unaccepted.length > 0) {
            notifyToast(`Wymagane zatwierdzenie wszystkich punktów! Pozostało do zaakceptowania: ${unaccepted.length}.`, "warning");
            const firstMissing = document.getElementById(`chk-card-${unaccepted[0]}`);
            if (firstMissing) {
                firstMissing.scrollIntoView({ behavior: 'smooth', block: 'center' });
                firstMissing.classList.add('ring-2', 'ring-rose-500', 'animate-pulse');
                setTimeout(() => firstMissing.classList.remove('ring-2', 'ring-rose-500', 'animate-pulse'), 3000);
            }
            return;
        }

        if (typeof window.updateAuditHud === 'function') {
            window.updateAuditHud(1, "KROK 1/2: ANALIZA SLM", "Wnioskowanie lokalnego modelu i weryfikacja IFS Food v8...", "loading");
        }

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

        const glassItems = filterItems(it => it.id === 205 || /szk[łl]|plastik|glass/i.test((it.clause || '') + ' ' + (it.question || '')));
        const glassPlasticOk = glassItems.length > 0 ? (getLowestScore(glassItems) <= 2 ? "NOK" : "ZGODNY") : (state.glass_plastic_ok || "ZGODNY");

        const allergenItems = filterItems(it => it.id === 102 || it.id === 208 || it.id === 307 || /alergen|allergen|cip|czyszcz/i.test((it.clause || '') + ' ' + (it.question || '')));
        const allergenCleanOk = allergenItems.length > 0 ? (getLowestScore(allergenItems) <= 2 ? "NOK" : "ZGODNY") : (state.allergen_clean_ok || "ZGODNY");

        const woodItems = filterItems(it => it.id === 207 || /drewn|wood|ta[śs]m|trytyt/i.test((it.clause || '') + ' ' + (it.question || '')));
        const woodPolicyOk = woodItems.length > 0 ? (getLowestScore(woodItems) <= 2 ? "NOK" : "ZGODNY") : (state.wood_policy_ok || "ZGODNY");

        const ppeItems = filterItems(it => it.id === 201 || it.id === 301 || it.id === 302 || /odzie[żz]|ppe|fartuch|czepk|bi[żz]uter/i.test((it.clause || '') + ' ' + (it.question || '')));
        const ppeOk = ppeItems.length > 0 ? (getLowestScore(ppeItems) <= 2 ? "NOK" : "ZGODNY") : (state.ppe_ok || "ZGODNY");

        const healthItems = filterItems(it => it.id === 203 || it.id === 303 || /zdrow|infekcj|zranie|plastr|pr15/i.test((it.clause || '') + ' ' + (it.question || '')));
        const healthOk = healthItems.length > 0 ? (getLowestScore(healthItems) <= 2 ? "NIE" : "TAK") : (state.health_ok || "TAK");

        const ccp1Items = filterItems(it => it.id === 106 || it.id === 209 || /detektor|ccp1|wzorc|x-ray/i.test((it.clause || '') + ' ' + (it.question || '')));
        const ccp1Val = ccp1Items.length > 0 ? (getLowestScore(ccp1Items) <= 2 ? "NOK" : "ZGODNY") : (state.ccp1_fe_ok || "ZGODNY");
        const ccp1FeOk = ccp1Val;
        const ccp1NonfeOk = ccp1Val;
        const ccp1SsOk = ccp1Val;
        const ccp1RejectOk = ccp1Val;
        const ccp1BinLocked = ccp1Val;

        const magnetItems = filterItems(it => /magnes/i.test((it.clause || '') + ' ' + (it.question || '')));
        const ccp2MagnetOk = magnetItems.length > 0 ? (getLowestScore(magnetItems) <= 2 ? "NOK" : "ZGODNY") : (state.ccp2_magnet_ok || "ZGODNY");

        const sieveItems = filterItems(it => /sit[aoeó]/i.test((it.clause || '') + ' ' + (it.question || '')));
        const ccp3SieveOk = sieveItems.length > 0 ? (getLowestScore(sieveItems) <= 2 ? "NOK" : "ZGODNY") : (state.ccp3_sieve_ok || "ZGODNY");

        const cleanItems = filterItems(it => it.id === 204 || it.id === 208 || it.id === 304 || it.id === 305 || it.id === 306 || /czysto[śs][ćc]|higien|posadzk/i.test((it.clause || '') + ' ' + (it.question || '')));
        const gmpCleanlinessOk = cleanItems.length > 0 ? (getLowestScore(cleanItems) <= 2 ? "NOK" : "ZGODNY") : (state.gmp_cleanliness_ok || "ZGODNY");

        const gmpWoodScore = woodItems.length > 0 ? getLowestScore(woodItems) : (state.gmp_wood_score || 5);
        const foreignItems = filterItems(it => it.id === 205 || it.id === 207 || it.id === 209 || /cia[łl]a obce|szk[łl]|plastik|detekcj/i.test((it.clause || '') + ' ' + (it.question || '')));
        const gmpForeignScore = foreignItems.length > 0 ? getLowestScore(foreignItems) : (state.gmp_foreign_score || 5);

        const wasteItems = filterItems(it => it.id === 306 || /odpad/i.test((it.clause || '') + ' ' + (it.question || '')));
        const gmpWasteOk = wasteItems.length > 0 ? (getLowestScore(wasteItems) <= 2 ? "NOK" : "ZGODNY") : (state.gmp_waste_ok || "ZGODNY");

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
            const sRes = await fetch('/api/slm-analyze', { 
                method: 'POST', 
                headers: {'Content-Type': 'application/json'}, 
                body: JSON.stringify(slmReq) 
            });
            const analysis = await sRes.json();
            slmText = `${analysis.decyzja} (Poziom: ${analysis.poziom_ryzyka})`;
        } catch(e) {}

        const formData = new FormData();
        formData.append("auditor_id", state.auditor_id || "Audytor");
        formData.append("line", state.line || "Linia 1");
        formData.append("shift", state.shift || "1");
        formData.append("zone", state.zone || "Wysoka Higiena");
        formData.append("health_ok", healthOk);
        formData.append("dispense_no", state.dispense_no || "BRAK");
        formData.append("glass_plastic_ok", glassPlasticOk);
        formData.append("allergen_clean_ok", allergenCleanOk);
        formData.append("wood_policy_ok", woodPolicyOk);
        formData.append("ppe_ok", ppeOk);
        formData.append("line_status", state.line_status || "Produkcja Ciągła");
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
        formData.append("bhp_estop_ok", state.bhp_estop_ok || "ZGODNY");
        formData.append("bhp_atex_ok", state.bhp_atex_ok || "ZGODNY");
        formData.append("bhp_hot_cip_ok", state.bhp_hot_cip_ok || "ZGODNY");
        formData.append("bhp_evac_ppoz_ok", state.bhp_evac_ppoz_ok || "ZGODNY");
        formData.append("bhp_status", state.bhp_status || "BRAK ZGŁOSZEŃ");
        formData.append("slm_analysis", slmText);
        formData.append("checklist_results", JSON.stringify(state.checklist_results));
        formData.append("audit_type", state.active_audit_type || "HACCP");
        formData.append("ko_failed", koFailed ? "true" : "false");
        
        if (state.schedule_id) {
            formData.append("schedule_id", state.schedule_id);
        }

        if (window.currentAuditPhotoFile) {
            formData.append("photo", window.currentAuditPhotoFile);
        }

        if (typeof window.updateAuditHud === 'function') {
            window.updateAuditHud(1, "KROK 1/2: WNIOSKOWANIE SLM", "Analiza parametrów CCP, GMP i normy IFS Food v8...", "loading");
        }

        setTimeout(() => {
            const toastDesc = document.getElementById('audit-progress-desc');
            if (toastDesc && toastDesc.textContent.includes("CCP") && typeof window.updateAuditHud === 'function') {
                window.updateAuditHud(2, "KROK 2/2: ZAPIS I BLOKADA REKORDU", "Rejestracja w SQLite i wpis do Audit Trail...", "loading");
            }
        }, 900);

        const res = await fetch('/api/audit', { method: 'POST', body: formData });

        if (res.ok) {
            state.schedule_id = null;
            window.activeSelectedAudit = null;
            const data = await res.json().catch(() => ({}));
            const verdict = data.slm_verdict || (slmText.includes('NOK') ? 'NOK' : 'OK');
            
            if (typeof window.updateAuditHud === 'function') {
                if (verdict.includes('NOK') || verdict.includes('HOLD')) {
                    window.updateAuditHud(3, "ODCHYLENIE CCP / HOLD LOT", `Werdykt: ${verdict} | Status: ZABLOKOWANY`, "alert");
                } else {
                    window.updateAuditHud(3, "AUDYT ZAPISANY POMYŚLNIE", `Werdykt SLM: ${verdict} | Status: ZABLOKOWANY`, "success");
                }
            }

            if (typeof window.showModule === 'function') {
                window.showModule('hub');
            }
            window.removeAuditPhoto();
            if (typeof window.loadScheduleAndRender === 'function') await window.loadScheduleAndRender();
            if (typeof window.loadAuditorHistory === 'function') await window.loadAuditorHistory();
            if (typeof window.updateKpiRibbon === 'function') await window.updateKpiRibbon();
            if (typeof window.loadAuditsAndRender === 'function') await window.loadAuditsAndRender();
        } else {
            if (typeof window.updateAuditHud === 'function') {
                window.updateAuditHud(3, "BŁĄD ZAPISU AUDYTU", `Serwer zwrócił kod błędu ${res.status}`, "alert");
            }
        }
    }
    window.saveAuditToDb = saveAuditToDb;

    // --- PROCEDURA WNIOSKOWANIA O KOREKTĘ WPISU ---

    async function requestAuditCorrection(auditId) {
        const reason = prompt("IFS Food v8 wymaga uzasadnienia korekty wpisu:\nPodaj szczegółowy powód odblokowania rekordu do edycji:");
        if (!reason || reason.trim().length < 5) {
            return alert("Podanie szczegółowego powodu korekty jest wymagane przez normę IFS Food v8.");
        }

        const state = getAppState();
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
                if (typeof window.loadAuditorHistory === 'function') {
                    window.loadAuditorHistory();
                }
            } else {
                alert("" + (data.detail || "Błąd wysyłania wniosku."));
            }
        } catch(e) {
            alert("Błąd połączenia z serwerem.");
        }
    }
    window.requestAuditCorrection = requestAuditCorrection;

})(typeof window !== 'undefined' ? window : this);
