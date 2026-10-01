/**
 * Quality Audit Enterprise - Moduł Pulpitu Managera (manager_dashboard.js)
 * Panel Key Usera / Kierownika Jakości: tabela audytów, zatwierdzanie / odrzucanie,
 * podgląd szczegółów audytu, obsługa notatek operacyjnych, Audit Trail i procedury HOLD LOT.
 * Zgodność z normą IFS Food v8 / BRCGS v9.
 */

(function(window) {
    'use strict';

    let activeManagerResultsTab = 'pending'; // 'pending', 'approved', 'rejected', 'history'
    let cachedManagerAudits = [];
    let cachedManagerNotes = [];
    let activeNotesFilter = 'all';
    let currentDetailedAuditId = null;
    let currentDetailedAuditData = null;
    let activeReplyNoteId = null;

    function setManagerResultsTab(tab) {
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
    }

    function formatAuditorInitials(auditor) {
        if (!auditor) return 'Audytor';
        const str = String(auditor).trim();
        const parts = str.split(/\s+/);
        if (parts.length >= 2) {
            return `${parts[0]} ${parts[1][0]}.`;
        }
        return str;
    }

    function openAuditorNotesInbox(filter = 'all') {
        if (typeof window.showModule === 'function') {
            window.showModule('manager-notes');
        }
        filterAuditorNotesInbox(filter);
    }

    function filterAuditorNotesInbox(filter = 'all') {
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
    }

    async function markAllAuditorNotesAsRead() {
        if (!confirm('Czy na pewno chcesz oznaczyć wszystkie notatki jako przeczytane?')) return;
        try {
            const res = await fetch('/api/auditor-notes/mark-all-read', { method: 'POST' });
            if (res.ok) {
                await loadManagerAuditorNotes();
            }
        } catch(e) {
            console.error("Błąd oznaczania wszystkich notatek:", e);
        }
    }

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
            window.cachedManagerNotes = cachedManagerNotes;
            
            const unread = Array.isArray(cachedManagerNotes) ? cachedManagerNotes.filter(n => !n.is_read).length : 0;
            
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

    async function markAuditorNoteAsRead(noteId) {
        try {
            const res = await fetch(`/api/auditor-notes/${noteId}/read`, { method: 'PATCH' });
            if (res.ok) {
                await loadManagerAuditorNotes();
            }
        } catch(e) {
            console.error("Błąd oznaczania notatki jako przeczytana:", e);
        }
    }

    function openManagerReplyModal(noteId) {
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
    }

    function closeManagerReplyModal() {
        const modal = document.getElementById('modal-manager-reply-note');
        if (modal) modal.classList.add('hidden');
        activeReplyNoteId = null;
    }

    async function submitManagerReply() {
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

        const state = window.state || {};

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
    }

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

        const parseDateFn = window.parseAuditDate || function(ts) {
            if (!ts) return null;
            const d = new Date(ts);
            return isNaN(d.getTime()) ? null : d;
        };

        cachedManagerAudits.forEach(a => {
            const cv = String(a.compliance_verdict || '').trim().toUpperCase();
            const ps = String(a.process_status || '').trim().toUpperCase();
            const isApproved = (cv === 'ZATWIERDZONY' || ps === 'ZATWIERDZONY');
            const isRejected = (cv === 'ODRZUCONY' || ps === 'ODRZUCONY');

            const auditDate = parseDateFn(a.timestamp);
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
        const apiFetch = window.apiFetch || fetch;
        try {
            const res = await apiFetch(`/api/audits?limit=300`);
            if (!res.ok) return;
            const data = await res.json();
            cachedManagerAudits = Array.isArray(data) ? data : [];
            window.cachedManagerAudits = cachedManagerAudits;
            renderManagerAuditsTable();
            await loadManagerAuditorNotes();
        } catch(e) { 
            console.error(e); 
            if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="py-4 text-center text-xs text-rose-400">Błąd ładowania danych audytów.</td></tr>';
        }
    }

    async function loadManagerEditRequests() {}

    async function decideEditRequest(requestId, decision) {
        const comment = prompt(`Komentarz do decyzji (${decision}):`) || "";
        const apiFetch = window.apiFetch || fetch;
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

    function closeAuditDetailsModal() {
        const modal = document.getElementById('modal-audit-details');
        if (modal) modal.classList.add('hidden');
        currentDetailedAuditId = null;
        currentDetailedAuditData = null;
    }

    function switchAuditDetailTab(tab) {
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
    }

    async function openAuditDetailsModal(id) {
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

            document.getElementById('det-audit-id-badge').textContent = '#' + a.id;
            const sVal = String(a.shift || '1').trim().toUpperCase();
            const shiftRoman = (sVal === '2' || sVal === 'II' || sVal.includes('B')) ? 'II' : ((sVal === '3' || sVal === 'III' || sVal.includes('C')) ? 'III' : 'I');
            document.getElementById('det-head-line-shift').textContent = `Linia: ${a.line || '---'} • Zmiana: ${shiftRoman}`;
            document.getElementById('det-head-auditor-date').textContent = `Audytor: ${a.auditor_id || '---'} • Czas: ${(a.timestamp || '').substring(0, 16)}`;

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

            const fmtOk = (val) => {
                const isOk = (val === 'ZGODNY' || val === 'TAK' || val === 'OK');
                return `<span class="${isOk ? 'text-emerald-400 font-bold' : 'text-rose-400 font-black'}">${val || '---'}</span>`;
            };

            document.getElementById('det-ccp1-fe').innerHTML = fmtOk(a.ccp1_fe_ok);
            document.getElementById('det-ccp1-nonfe').innerHTML = fmtOk(a.ccp1_nonfe_ok);
            document.getElementById('det-ccp1-ss').innerHTML = fmtOk(a.ccp1_ss_ok);
            document.getElementById('det-ccp1-reject').innerHTML = fmtOk(a.ccp1_reject_ok);
            document.getElementById('det-ccp1-bin').innerHTML = fmtOk(a.ccp1_bin_locked);
            document.getElementById('det-ccp2-magnet').innerHTML = fmtOk(a.ccp2_magnet_ok);
            document.getElementById('det-ccp3-sieve').innerHTML = fmtOk(a.ccp3_sieve_ok);

            const koFailed = (a.ko_failed == 1 || (a.checklist_parsed && Object.values(a.checklist_parsed).some(q => q.is_ko && (q.score !== undefined ? parseInt(q.score) <= 2 : q.status === 'NOK'))));
            const koEl = document.getElementById('det-ko-status');
            if (koFailed) {
                koEl.textContent = 'KO: NARUSZONE (KRYTYCZNE)';
                koEl.className = 'text-[9px] font-black px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-500/50 animate-pulse';
            } else {
                koEl.textContent = 'KO: ZGODNE';
                koEl.className = 'text-[9px] font-black px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-500/30';
            }

            document.getElementById('det-health-ok').innerHTML = fmtOk(a.health_ok);
            document.getElementById('det-glass-ok').innerHTML = fmtOk(a.glass_plastic_ok);
            document.getElementById('det-allergen-ok').innerHTML = fmtOk(a.allergen_clean_ok);
            document.getElementById('det-wood-ok').innerHTML = fmtOk(a.wood_policy_ok);
            document.getElementById('det-cleanliness-ok').innerHTML = fmtOk(a.gmp_cleanliness_ok);
            document.getElementById('det-bhp-estop-ok').innerHTML = fmtOk(a.bhp_estop_ok);

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
    }

    async function handleAuditApproveFromModal() {
        if (!currentDetailedAuditId) return;
        const targetId = Number(currentDetailedAuditId);
        const apiFetch = window.apiFetch || fetch;
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
                if (typeof window.loadAuditorHistory === 'function') window.loadAuditorHistory();
            } else {
                const err = await res.json().catch(() => ({}));
                alert('Błąd zatwierdzania audytu: ' + (err.detail || 'Błąd serwera.'));
            }
        } catch (e) {
            console.error(e);
            alert('Błąd połączenia podczas zatwierdzania audytu.');
        }
    }

    async function handleAuditRejectFromModal() {
        if (!currentDetailedAuditId) return;
        const targetId = Number(currentDetailedAuditId);
        const reason = prompt('Podaj powód odrzucenia raportu z audytu (wymóg IFS Food v8):');
        if (!reason || reason.trim() === '') return;
        const apiFetch = window.apiFetch || fetch;

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
                if (typeof window.loadAuditorHistory === 'function') window.loadAuditorHistory();
            } else {
                const err = await res.json().catch(() => ({}));
                alert('Błąd odrzucania audytu: ' + (err.detail || 'Błąd serwera.'));
            }
        } catch (e) {
            console.error(e);
            alert('Błąd połączenia podczas odrzucania audytu.');
        }
    }

    async function handleHoldLotFromModal() {
        if (!currentDetailedAuditId) return;
        const confirmAction = confirm(`UWAGA: Czy na pewno chcesz natychmiast zarządzić procedurę wstrzymania partii (HOLD LOT) dla audytu #${currentDetailedAuditId}? Ta operacja zostanie trwale odnotowana w Audit Trail.`);
        if (!confirmAction) return;
        const apiFetch = window.apiFetch || fetch;

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
    }

    async function submitAuditCorrection() {
        if (!currentDetailedAuditId) return;

        const line = document.getElementById('adm-edit-line').value.trim();
        const shift = document.getElementById('adm-edit-shift').value;
        const reason = document.getElementById('adm-reply-text').value.trim();

        if (!reason || reason.length < 5) {
            alert("Podanie szczegółowego powodu korekty jest wymagane przez normę IFS Food v8 (min. 5 znaków).");
            return;
        }

        const state = window.state || {};
        const payload = {
            audit_id: currentDetailedAuditId,
            modified_by: (state.currentAuditor || state.role || "Manager"),
            change_reason: reason,
            updated_fields: {
                line: line,
                shift: shift
            }
        };

        const btn = document.getElementById('btn-save-correction');
        btn.disabled = true;
        btn.textContent = 'Wysyłanie...';

        const apiFetch = window.apiFetch || fetch;

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
                if (typeof window.loadAuditorHistory === 'function') window.loadAuditorHistory();
            } else {
                alert('Błąd: ' + (data.detail || 'Nie udało się zapisać korekty.'));
            }
        } catch (e) {
            alert('Błąd połączenia z serwerem podczas zapisu korekty.');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<span class="flex items-center gap-1.5"><i class="fas fa-floppy-disk"></i><span>Zapisz korektę w Audit Trail</span></span>';
        }
    }

    async function handleAuditAction(action, id) {
        const numId = Number(id);
        const apiFetch = window.apiFetch || fetch;

        if (action === 'approve') {
            const item = cachedManagerAudits.find(a => Number(a.id) === numId || String(a.id) === String(id));
            if (item) {
                item.compliance_verdict = 'ZATWIERDZONY';
                item.process_status = 'ZATWIERDZONY';
                item.record_status = 'ZABLOKOWANY';
            }

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
                    if (typeof window.loadAuditorHistory === 'function') window.loadAuditorHistory();
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

            const item = cachedManagerAudits.find(a => Number(a.id) === numId || String(a.id) === String(id));
            if (item) {
                item.compliance_verdict = 'ODRZUCONY';
                item.process_status = 'ODRZUCONY';
                item.record_status = 'ZABLOKOWANY';
            }

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
                    if (typeof window.loadAuditorHistory === 'function') window.loadAuditorHistory();
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
    }

    // Eksport do obiektu window
    window.activeManagerResultsTab = activeManagerResultsTab;
    window.cachedManagerAudits = cachedManagerAudits;
    window.cachedManagerNotes = cachedManagerNotes;
    window.setManagerResultsTab = setManagerResultsTab;
    window.showManagerTab = setManagerResultsTab;
    window.formatAuditorInitials = formatAuditorInitials;
    window.renderManagerNotesView = renderManagerNotesView;
    window.loadManagerAuditorNotes = loadManagerAuditorNotes;
    window.openAuditorNotesInbox = openAuditorNotesInbox;
    window.filterAuditorNotesInbox = filterAuditorNotesInbox;
    window.markAllAuditorNotesAsRead = markAllAuditorNotesAsRead;
    window.markAuditorNoteAsRead = markAuditorNoteAsRead;
    window.openManagerReplyModal = openManagerReplyModal;
    window.closeManagerReplyModal = closeManagerReplyModal;
    window.submitManagerReply = submitManagerReply;
    window.renderManagerAuditsTable = renderManagerAuditsTable;
    window.loadAuditResults = loadAuditResults;
    window.loadManagerEditRequests = loadManagerEditRequests;
    window.decideEditRequest = decideEditRequest;
    window.closeAuditDetailsModal = closeAuditDetailsModal;
    window.switchAuditDetailTab = switchAuditDetailTab;
    window.openAuditDetailsModal = openAuditDetailsModal;
    window.handleAuditApproveFromModal = handleAuditApproveFromModal;
    window.handleAuditRejectFromModal = handleAuditRejectFromModal;
    window.handleHoldLotFromModal = handleHoldLotFromModal;
    window.submitAuditCorrection = submitAuditCorrection;
    window.handleAuditAction = handleAuditAction;

})(window);
