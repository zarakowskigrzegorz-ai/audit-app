/**
 * Quality Audit Enterprise - Moduł Historii Audytów (audit_history.js)
 * Obsługa kart historii audytora: Oczekujące (<5 dni), Wykonane, Zaakceptowane, Archiwum (>5 dni)
 * Zgodność z normą IFS Food v8 / BRCGS v9 (autoryzacja, blokady jakościowe, odchylenia krytyczne)
 */

(function(window) {
    'use strict';

    let activeAuditorHistoryTab = 'pending'; // 'pending' (oczekujące <5 dni), 'completed' (wykonane <5 dni), 'approved' (zaakceptowane <5 dni), 'history' (starsze >5 dni)

    function setAuditorHistoryTab(tab) {
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
            const state = window.state || {};
            
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

            const parseDateFn = window.parseAuditDate || function(ts) {
                if (!ts) return null;
                const d = new Date(ts);
                return isNaN(d.getTime()) ? null : d;
            };

            myAudits.forEach(a => {
                const cv = String(a.compliance_verdict || '').trim().toUpperCase();
                const ps = String(a.process_status || '').trim().toUpperCase();
                const isApproved = (cv === 'ZATWIERDZONY' || ps === 'ZATWIERDZONY');

                const auditDate = parseDateFn(a.timestamp);
                const isOlderThan5Days = Boolean(auditDate && !isNaN(auditDate.getTime()) && (auditDate < fiveDaysAgo));

                if (isOlderThan5Days) {
                    historyAudits.push(a);
                } else {
                    completedAudits.push(a);
                    if (isApproved) {
                        approvedAudits.push(a);
                    } else {
                        pendingAudits.push(a);
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
                        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 sm:p-4 cursor-pointer ${isCritical ? 'hover:bg-rose-950/20' : 'hover:bg-emerald-950/20'} transition-all"
                             onclick="toggleAuditHistoryPanel('${panelId}', this)">
                            <div class="flex items-center gap-3 min-w-0">
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

                        <div id="${panelId}" class="hidden border-t ${isCritical ? 'border-rose-500/30 bg-rose-950/20' : 'border-emerald-500/30 bg-emerald-950/10'}">
                            <div class="p-4 space-y-3 opacity-95 bg-slate-950/70">
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
                                         <button type="button" onclick="event.stopPropagation(); if (typeof requestAuditCorrection === 'function') requestAuditCorrection(${auditId})" class="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow-md flex items-center gap-1.5 shrink-0 transition active:scale-95 cursor-pointer">
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

                                ${auditNotes ? `
                                <div class="bg-slate-900/60 rounded-xl p-3 border border-amber-700/30">
                                    <div class="text-[9px] font-black text-amber-400 uppercase tracking-wider mb-1 flex items-center gap-1.5"><i class="fas fa-comment-dots text-amber-400"></i><span>Uwagi Audytora</span></div>
                                    <p class="text-[11px] text-amber-200/90 leading-snug whitespace-pre-line">${auditNotes}</p>
                                </div>` : `
                                <div class="bg-slate-900/40 rounded-xl p-2.5 border border-slate-800">
                                    <p class="text-[10px] text-slate-500 italic">Brak uwag do tego audytu.</p>
                                </div>`}

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

    // Eksport do obiektu window
    window.activeAuditorHistoryTab = activeAuditorHistoryTab;
    window.setAuditorHistoryTab = setAuditorHistoryTab;
    window.loadAuditorHistory = loadAuditorHistory;
    window.toggleAuditHistoryPanel = toggleAuditHistoryPanel;

})(window);
