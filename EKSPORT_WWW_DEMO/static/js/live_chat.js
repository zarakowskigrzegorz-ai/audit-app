/**
 * Quality Audit Enterprise - Moduł Live Chat Operacyjny (live_chat.js)
 * Komunikator operacyjny: Hala ↔ Biuro / Audytorzy ↔ Kierownik Jakości
 * Zgodność ze standardem IFS Food v8 / BRCGS v9 (alerty HOLD CCP, UWAGA CP, INFO)
 */

(function(window) {
    'use strict';

    let liveChatPollingTimer = null;
    let cachedChatMessages = [];

    function openLiveChatModal(initialText = '', initialPrio = '') {
        const modal = document.getElementById('modal-live-chat') || document.getElementById('modal-quick-note');
        if (modal) {
            modal.classList.remove('hidden');

            // Zasilenie listy linii w formularzu Chatu
            const chatLine = document.getElementById('live-chat-line');
            const linesData = window.productionLinesData || [];
            if (chatLine && Array.isArray(linesData) && linesData.length > 0) {
                const curVal = chatLine.value;
                chatLine.innerHTML = `<option value="Hala Główna">— Cała Hala / Ogólna —</option>` + 
                    linesData.map(l => `<option value="${l.name}">${l.name}${l.code ? ' (' + l.code + ')' : ''}</option>`).join('');
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
    }

    function closeLiveChatModal() {
        const modal = document.getElementById('modal-live-chat') || document.getElementById('modal-quick-note');
        if (modal) modal.classList.add('hidden');
        if (liveChatPollingTimer) {
            clearInterval(liveChatPollingTimer);
            liveChatPollingTimer = null;
        }
    }

    async function loadLiveChatMessages(shouldScrollToBottom = true) {
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
            const state = window.state || {};
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
    }

    async function sendLiveChatMessage() {
        const inputEl = document.getElementById('live-chat-input');
        const lineEl = document.getElementById('live-chat-line');
        const prioEl = document.getElementById('live-chat-prio');
        const sendBtn = document.getElementById('btn-live-chat-send');
        if (!inputEl) return;

        const text = (inputEl.value || '').trim();
        if (!text) return;

        const state = window.state || {};
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
    }

    function handleLiveChatKeyDown(event) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendLiveChatMessage();
        }
    }

    function insertLiveChatQuickAction(actionType) {
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
    }

    async function clearLiveChatHistory() {
        if (!confirm("Czy na pewno chcesz wyczyścić całą historię Live Chatu?")) return;
        try {
            const res = await fetch('/api/auditor-notes/chat-clear', { method: 'POST' });
            if (res.ok) {
                await loadLiveChatMessages(true);
            }
        } catch(e) {
            console.error("Błąd czyszczenia czatu:", e);
        }
    }

    function updateQuickNoteCounter(el) {
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
    }

    function setQuickNotePriority(prio) {
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
    }

    function toggleAnonymousNote(isAnon) {
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
    }

    async function sendQuickAuditorNote() {
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

        const state = window.state || {};
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
                updateQuickNoteCounter(textarea);
                setQuickNotePriority('INFO');
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

                updateAuditorNotesBadge();
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
    }

    let currentQuickNoteTab = 'inbox';

    function switchQuickNoteTab(tab) {
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
    }

    function updateAuditorNotesBadge() {
        try {
            const quickNoteTag = document.getElementById('tag-quick-note');
            if (quickNoteTag) {
                quickNoteTag.classList.remove('hidden');
            }
        } catch(e) {}
    }

    // Eksport do obiektu globalnego window
    window.openLiveChatModal = openLiveChatModal;
    window.closeLiveChatModal = closeLiveChatModal;
    window.loadLiveChatMessages = loadLiveChatMessages;
    window.sendLiveChatMessage = sendLiveChatMessage;
    window.handleLiveChatKeyDown = handleLiveChatKeyDown;
    window.insertLiveChatQuickAction = insertLiveChatQuickAction;
    window.clearLiveChatHistory = clearLiveChatHistory;
    window.updateAuditorNotesBadge = updateAuditorNotesBadge;

    window.updateQuickNoteCounter = updateQuickNoteCounter;
    window.setQuickNotePriority = setQuickNotePriority;
    window.toggleAnonymousNote = toggleAnonymousNote;
    window.sendQuickAuditorNote = sendQuickAuditorNote;
    window.switchQuickNoteTab = switchQuickNoteTab;

    // Aliases dla wstecznej kompatybilności
    window.openQuickNoteModal = openLiveChatModal;
    window.closeQuickNoteModal = closeLiveChatModal;
    window.openAuditorNotesInbox = openLiveChatModal;
    window.loadManagerAuditorNotes = loadLiveChatMessages;
    window.loadAuditorInboxMessages = loadLiveChatMessages;
    window.loadAuditorSentMessages = loadLiveChatMessages;

})(window);
