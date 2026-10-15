/**
 * Quality Audit Enterprise - Moduł Linii Produkcyjnych (production_lines.js)
 * Zarządzanie rejestrem fabrycznym linii, paszport techniczny, strefy higieniczne,
 * profile alergenowe, statusy sanitarne (HOLD LOT, CIP, Zwolniona) i akordeon linii.
 * Zgodność z normą IFS Food v8 / BRCGS v9.
 */

(function(window) {
    'use strict';

    let productionLinesData = [];
    let currentPassportLineId = null;
    let editingLineId = null;
    let isCodeManuallyEdited = false;

    async function loadProductionLines() {
        try {
            const res = await fetch('/api/lines');
            productionLinesData = await res.json();
            window.productionLinesData = productionLinesData;

            const planLine = document.getElementById('plan-line');
            if (planLine) planLine.innerHTML = productionLinesData.map(l => `<option value="${l.name}">${l.name}</option>`).join('');
            
            const autoLines = document.getElementById('autoplan-lines-container');
            if (autoLines) autoLines.innerHTML = productionLinesData.map(l => `<label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" class="auto-line-chk" value="${l.name}" checked> ${l.name}</label>`).join('');

            const state = window.state || {};

            // Zasilenie rozwijanej listy linii w formularzu inspekcji
            const preauditSelect = document.getElementById('preaudit-line-select');
            if (preauditSelect && Array.isArray(productionLinesData) && productionLinesData.length > 0) {
                if (!state.line || !productionLinesData.some(l => l.name === state.line)) {
                    state.line = productionLinesData[0].name;
                }
                preauditSelect.innerHTML = productionLinesData.map(l => {
                    const codeStr = l.code ? ` [${l.code}]` : '';
                    const zoneStr = l.default_zone ? ` (${l.default_zone})` : '';
                    const isSel = (l.name === state.line) ? 'selected' : '';
                    return `<option value="${l.name}" ${isSel}>${l.name}${codeStr}${zoneStr}</option>`;
                }).join('');
                preauditSelect.value = state.line;
                const hiddenLine = document.getElementById('hidden-line-input');
                if (hiddenLine) hiddenLine.value = state.line;
            }

            // Opcjonalne kafelki
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
            if (typeof window.syncAgentLineSelector === 'function') {
                window.syncAgentLineSelector();
            }

            // Zasilenie listy linii w formularzu Szybkiej Notatki Audytora
            const qnLine = document.getElementById('quick-note-line');
            if (qnLine && Array.isArray(productionLinesData)) {
                const curVal = qnLine.value;
                qnLine.innerHTML = `<option value="">— Ogólna / Cała Hala —</option>` + 
                    productionLinesData.map(l => `<option value="${l.name}">${l.name}${l.code ? ' (' + l.code + ')' : ''}</option>`).join('');
                if (curVal) qnLine.value = curVal;
            }

            // Zasilenie listy linii w formularzu Chatu
            const chatLine = document.getElementById('live-chat-line');
            if (chatLine && Array.isArray(productionLinesData) && productionLinesData.length > 0) {
                const curVal = chatLine.value;
                chatLine.innerHTML = `<option value="Hala Główna">— Cała Hala / Ogólna —</option>` + 
                    productionLinesData.map(l => `<option value="${l.name}">${l.name}${l.code ? ' (' + l.code + ')' : ''}</option>`).join('');
                if (curVal) chatLine.value = curVal;
            }
        } catch(e) {
            console.warn("Błąd ładowania linii produkcyjnych:", e);
        }
    }

    function onPreauditLineChange(lineVal) {
        const state = window.state || {};
        state.line = lineVal;
        const hiddenLine = document.getElementById('hidden-line-input');
        if (hiddenLine) hiddenLine.value = lineVal;
        const preauditSelect = document.getElementById('preaudit-line-select');
        if (preauditSelect && preauditSelect.value !== lineVal) preauditSelect.value = lineVal;
        if (window.formHistory && typeof formHistory.saveState === 'function') {
            formHistory.saveState('view-audit-form');
        }
        if (typeof window.syncAgentLineSelector === 'function') {
            window.syncAgentLineSelector();
        }
    }

    function generateLineCodeFromName(name) {
        if (!name || !name.trim()) return '';

        // Usuń polskie znaki diakrytyczne
        const clean = name.trim()
            .replace(/ą/gi, 'a').replace(/ć/gi, 'c').replace(/ę/gi, 'e')
            .replace(/ł/gi, 'l').replace(/ń/gi, 'n').replace(/ó/gi, 'o')
            .replace(/ś/gi, 's').replace(/ź/gi, 'z').replace(/ż/gi, 'z');

        const numMatch = clean.match(/(?:linia\s*|l\s*|#\s*)(\d+)/i) || clean.match(/(\d+)/);
        const lineNum = numMatch ? numMatch[1] : null;

        const stopWords = new Set(['linia', 'line', 'i', 'w', 'na', 'oraz', 'z', 'do', 'dla', 'nr', 'the', 'and', '&', '-']);
        const words = clean.replace(/[^a-zA-Z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length > 0 && !stopWords.has(w.toLowerCase()));

        const processWords = words.filter(w => !/^\d+$/.test(w) && !(lineNum && w.toLowerCase() === `l${lineNum}`.toLowerCase()));
        let keyword = '';
        if (processWords.length > 0) {
            keyword = processWords[0].substring(0, 5).toUpperCase();
        }

        if (lineNum && keyword) {
            return `L${lineNum}-${keyword}`;
        } else if (lineNum) {
            return `LIN-${lineNum}`;
        } else if (words.length > 0) {
            const codeParts = words.slice(0, 3).map(w => w.substring(0, 4).toUpperCase());
            return `LIN-${codeParts.join('-')}`;
        }

        return 'LIN-01';
    }

    function handleNewLineNameInput(nameVal) {
        const codeInput = document.getElementById('new-line-code');
        if (!codeInput) return;

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

    function startEditLineFromPassport() {
        if (!currentPassportLineId) return;
        const targetId = Number(currentPassportLineId);
        const line = productionLinesData.find(l => Number(l.id) === targetId);
        if (!line) {
            alert("Nie odnaleziono danych wybranej linii.");
            return;
        }

        editingLineId = targetId;
        closeLinePassportModal();

        const form = document.getElementById('form-add-line-container');
        const btnToggle = document.getElementById('btn-toggle-add-line');
        if (form) form.classList.remove('hidden');
        if (btnToggle) btnToggle.innerHTML = '<i class="fas fa-times"></i> Zwiń Edycję';

        const titleEl = document.getElementById('form-line-title');
        if (titleEl) {
            titleEl.innerHTML = `<i class="fas fa-edit mr-1 text-amber-400"></i> Edycja linii: <span class="text-white">${line.name}</span>`;
        }
        const btnSave = document.getElementById('btn-save-line');
        if (btnSave) {
            btnSave.innerHTML = `<i class="fas fa-floppy-disk mr-1.5"></i>Zapisz Zmiany w Linii #${targetId}`;
        }

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

        if (form) form.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (nameEl) nameEl.focus();
    }

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

        const apiFetch = window.apiFetch || fetch;

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

    async function openLinePassportModal(lineId) {
        currentPassportLineId = lineId;
        const modal = document.getElementById('modal-line-passport');
        if (!modal) return;
        const apiFetch = window.apiFetch || fetch;

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
        
        if (notes === null) return;

        const apiFetch = window.apiFetch || fetch;

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
                openLinePassportModal(currentPassportLineId);
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
        const apiFetch = window.apiFetch || fetch;
        const res = await apiFetch(`/api/lines/${id}`, { method: 'DELETE' });
        if (res && res.ok) {
            await loadProductionLines();
            renderLinesManagerList();
        } else {
            const err = await res.json().catch(() => ({}));
            alert(`Błąd usuwania linii: ${err.detail || 'Brak uprawnień'}`);
        }
    }

    // Eksport do obiektu window
    window.productionLinesData = productionLinesData;
    window.loadProductionLines = loadProductionLines;
    window.onPreauditLineChange = onPreauditLineChange;
    window.generateLineCodeFromName = generateLineCodeFromName;
    window.handleNewLineNameInput = handleNewLineNameInput;
    window.resetLineFormToNew = resetLineFormToNew;
    window.toggleLineAddForm = toggleLineAddForm;
    window.startEditLineFromPassport = startEditLineFromPassport;
    window.getStatusBadgeClass = getStatusBadgeClass;
    window.getStatusBadge = getStatusBadge;
    window.getZoneBadge = getZoneBadge;
    window.renderLinesManagerList = renderLinesManagerList;
    window.saveProductionLine = saveProductionLine;
    window.addNewProductionLine = saveProductionLine;
    window.openLinePassportModal = openLinePassportModal;
    window.closeLinePassportModal = closeLinePassportModal;
    window.applyLineStatusChange = applyLineStatusChange;
    window.deleteProductionLine = deleteProductionLine;

})(window);
