/**
 * System Audytowy IFS Food v8 / HACCP - Moduł Kalendarza i Harmonogramu
 * Plik: static/js/calendar.js
 * 
 * Odpowiedzialność:
 * - Wyświetlanie siatki kalendarza i filtrowanie audytów (HACCP, GMP, GHP, Wykonany, Spóźniony, Święto)
 * - Obsługa dni świątecznych i dni wolnych
 * - Planowanie ręczne (modal-plan) oraz autopilot planowania automatycznego (modal-autoplan)
 * - Przeciąganie i upuszczanie audytów (Drag & Drop rescheduling)
 * - Zarządzanie zleceniami audytów dla Kierownika Jakości i Audytora
 * - Czyszczenie harmonogramu (miesięczne oraz całościowe)
 */

(function(window) {
    "use strict";

    // Inicjalizacja stanu modułu kalendarza
    window.currentCalDate = window.currentCalDate || new Date();
    window.miniCalDate = window.miniCalDate || new Date();
    window.schedulesData = window.schedulesData || [];
    window.activeSelectedAudit = window.activeSelectedAudit || null;

    let isScheduleLoading = false;
    let activeSelectedFilter = null;
    let autoPlanCalDate = new Date();
    let autoPlanHistory = [];
    let autoPlanHistoryIndex = -1;

    function getLocalTodayString() {
        if (typeof window.getLocalDateString === 'function') {
            return window.getLocalDateString();
        }
        const d = new Date();
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function getHttpFetch() {
        return window.apiFetch || window.fetch;
    }

    function getAppState() {
        return window.state || {};
    }

    /**
     * Zwraca mapę stałych świąt ustawowych w Polsce dla danego roku
     */
    function getPolishHolidays(year) {
        return {
            [`${year}-01-01`]: "Nowy Rok",
            [`${year}-01-06`]: "Trzech Króli",
            [`${year}-05-01`]: "Święto Pracy",
            [`${year}-05-03`]: "Konstytucji 3 Maja",
            [`${year}-08-15`]: "Wniebowzięcie NMP",
            [`${year}-11-01`]: "Wszystkich Świętych",
            [`${year}-11-11`]: "Niepodległości",
            [`${year}-12-25`]: "Boże Narodzenie",
            [`${year}-12-26`]: "II Dzień Świąt"
        };
    }
    window.getPolishHolidays = getPolishHolidays;

    /**
     * Aktualizuje plakietki w stylu iOS informujące o liczbie zaplanowanych audytów
     */
    function updateAuditorScheduleBadges(schedules) {
        const list = Array.isArray(schedules) ? schedules : (window.schedulesData || []);
        const curDate = window.currentCalDate;
        const curYear = (curDate instanceof Date && !isNaN(curDate.getTime())) ? curDate.getFullYear() : new Date().getFullYear();
        const curMonth = (curDate instanceof Date && !isNaN(curDate.getTime())) ? (curDate.getMonth() + 1) : (new Date().getMonth() + 1);
        const prefix = `${curYear}-${String(curMonth).padStart(2, '0')}`;
        const monthPlannedAudits = list.filter(s => s.scheduled_date && s.scheduled_date.startsWith(prefix) && s.status === 'PLANOWANY');
        const count = monthPlannedAudits.length;

        // 1. Plakietka w górnym doku nawigacyjnym (#tag-calendar):
        const dockBadge = document.getElementById('badge-dock-schedule');
        if (dockBadge) {
            if (count > 0) {
                dockBadge.textContent = count > 99 ? '99+' : count;
                dockBadge.classList.remove('hidden');
            } else {
                dockBadge.classList.add('hidden');
            }
        }

        // 2. Plakietka na kaflu audytora (#aud-tile-calendar):
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
    window.updateAuditorScheduleBadges = updateAuditorScheduleBadges;

    /**
     * Pobiera zlecenia z backendu i renderuje kalendarz
     */
    async function loadScheduleAndRender() {
        if (isScheduleLoading) return;
        isScheduleLoading = true;
        const appState = getAppState();
        const api = getHttpFetch();
        try {
            const url = `/api/schedule?auditor=${encodeURIComponent(appState.auditor_id || '')}&role=${appState.role || 'AUDITOR'}&_t=${Date.now()}`;
            const res = await api(url, { cache: 'no-store' });
            if (res.ok) {
                const allSchedules = await res.json();
                window.schedulesData = Array.isArray(allSchedules) ? allSchedules : [];
                updateAuditorScheduleBadges(window.schedulesData);
                renderCalendar();
            }
        } catch(e) { 
            console.error("loadScheduleAndRender error:", e);
            window.schedulesData = []; 
            updateAuditorScheduleBadges([]);
            renderCalendar();
        } finally {
            isScheduleLoading = false;
        }
    }
    window.loadScheduleAndRender = loadScheduleAndRender;

    /**
     * Zmiana przeglądanego miesiąca w kalendarzu głównym
     */
    function changeMonth(delta) {
        if (!window.currentCalDate || isNaN(window.currentCalDate.getTime())) {
            window.currentCalDate = new Date();
        }
        window.currentCalDate.setDate(1);
        window.currentCalDate.setMonth(window.currentCalDate.getMonth() + delta);
        updateAuditorScheduleBadges(window.schedulesData);
        renderCalendar();
    }
    window.changeMonth = changeMonth;

    /**
     * Aktualizacja wyglądu przycisków tagów filtrów w kalendarzu
     */
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
    window.updateFilterTagButtons = updateFilterTagButtons;

    /**
     * Wybór pojedynczego filtra audytów w widoku kalendarza
     */
    function selectSingleFilter(key) {
        activeSelectedFilter = key;
        updateFilterTagButtons();
        renderCalendar();
    }
    window.selectSingleFilter = selectSingleFilter;

    /**
     * Otwiera modal akcji dla zlecenia z kalendarza
     */
    async function openAuditActionModal(id) {
        const appState = getAppState();
        try {
            let a = window.schedulesData ? window.schedulesData.find(s => String(s.id) === String(id)) : null;
            if (!a) {
                const res = await fetch(`/api/schedule/${id}`);
                if (res.ok) a = await res.json();
            }
            if (a && a.status === 'WYKONANY') {
                if (typeof window.openAuditDetailsModal === 'function') {
                    return window.openAuditDetailsModal(id);
                }
            }
            if (appState.role === 'MANAGER') {
                if (typeof window.openMgrModal === 'function') return window.openMgrModal(id);
            } else {
                if (typeof window.openAudModal === 'function') return window.openAudModal(id);
            }
        } catch (e) {
            console.warn("Błąd openAuditActionModal:", e);
            if (appState.role === 'MANAGER' && typeof window.openMgrModal === 'function') window.openMgrModal(id);
            else if (typeof window.openAudModal === 'function') window.openAudModal(id);
        }
    }
    window.openAuditActionModal = openAuditActionModal;

    /**
     * Obsługa kliknięcia kafelka audytu na siatce kalendarza
     */
    function handleAuditCardClick(event, auditId, auditType) {
        if (event) event.stopPropagation();
        if (activeSelectedFilter !== auditType) {
            selectSingleFilter(auditType);
            if (typeof window.showToast === 'function') {
                window.showToast(`Widok przefiltrowany: tylko audyty ${auditType}`, 'info');
            }
        } else {
            openAuditActionModal(auditId);
        }
    }
    window.handleAuditCardClick = handleAuditCardClick;

    /**
     * Obsługa kliknięcia komórki dnia w kalendarzu
     */
    function handleCalendarTileClick(dateStr) {
        const dayAudits = Array.isArray(window.schedulesData) ? window.schedulesData.filter(s => s.scheduled_date === dateStr) : [];
        const matchingAudits = activeSelectedFilter ? dayAudits.filter(a => {
            const aType = String(a.audit_type || "HACCP").toUpperCase().trim();
            if (activeSelectedFilter === 'HACCP') return aType.includes('HACCP');
            if (activeSelectedFilter === 'GMP') return aType.includes('GMP');
            if (activeSelectedFilter === 'GHP') return aType.includes('GHP');
            if (activeSelectedFilter === 'WYKONANY') return a.status === 'WYKONANY';
            if (activeSelectedFilter === 'SPOZNIONY') return a.status !== 'WYKONANY' && a.scheduled_date < getLocalTodayString();
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
            if (typeof window.openManualPlanModal === 'function') window.openManualPlanModal(dateStr);
        }
    }
    window.handleCalendarTileClick = handleCalendarTileClick;

    /**
     * Skraca wyświetlaną nazwę audytora do inicjału nazwiska
     */
    function formatAuditorBadge(auditor) {
        if (!auditor) return "Audytor";
        const clean = auditor.replace(/\s*\(.*?\)/g, "").trim();
        if (!clean) return "Audytor";
        if (clean.toLowerCase().includes("administrator")) return "Admin";
        
        const parts = clean.split(/\s+/);
        if (parts.length === 1) return parts[0];
        
        if (parts[0].length <= 2 && parts[0].includes('.')) {
            return `${parts[0]} ${parts[1]}`;
        }
        const lastPart = parts[parts.length - 1];
        if (lastPart.length <= 2) {
            const init = lastPart.endsWith('.') ? lastPart : `${lastPart}.`;
            return `${parts[0]} ${init}`;
        }
        return `${parts[0]} ${lastPart.charAt(0)}.`;
    }
    window.formatAuditorBadge = formatAuditorBadge;

    /**
     * Główna funkcja renderująca siatkę miesiąca kalendarza
     */
    function renderCalendar() {
        const calDate = window.currentCalDate || new Date();
        const year = calDate.getFullYear(), month = calDate.getMonth();
        const names = ["Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec", "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień"];
        
        const titleEl = document.getElementById('cal-month-title');
        if (titleEl) {
            titleEl.innerText = `${names[month]} ${year}`;
        }
        
        const holidays = getPolishHolidays(year);
        const firstDay = new Date(year, month, 1), lastDay = new Date(year, month + 1, 0);
        let startDay = firstDay.getDay() - 1; if (startDay === -1) startDay = 6;
        
        const grid = document.getElementById('calendar-grid'); 
        if (!grid) return;
        grid.innerHTML = "";
        let dateIter = 1;
        const totalDays = lastDay.getDate(), todayStr = getLocalTodayString();
        let totalMatchingAuditsInMonth = 0;
        const appState = getAppState();

        for (let row = 0; row < 6; row++) {
            if (dateIter > totalDays) break;
            for (let col = 0; col < 7; col++) {
                if ((row === 0 && col < startDay) || dateIter > totalDays) {
                    grid.innerHTML += `<div class="cal-day bg-slate-950/30 rounded-xl border border-slate-900"></div>`;
                } else {
                    const currentFullDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(dateIter).padStart(2, '0')}`;
                    const holidayName = holidays[currentFullDate], isToday = currentFullDate === todayStr;
                    let dayAudits = (window.schedulesData || []).filter(s => s.scheduled_date === currentFullDate);
                    if (appState.role !== 'MANAGER' && activeSelectedFilter !== 'WYKONANY') {
                        dayAudits = dayAudits.filter(s => s.status !== 'WYKONANY');
                    }

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
    window.renderCalendar = renderCalendar;

    /**
     * Przeciąganie i upuszczanie audytu w celu zmiany terminu (Drag & Drop)
     */
    async function handleAuditDrop(event, targetDate) {
        event.preventDefault();
        const auditId = event.dataTransfer.getData('text/plain');
        if (!auditId) return;

        const today = getLocalTodayString();
        if (targetDate < today) {
            return alert("Nie można przenosić audytów na daty wsteczne!");
        }

        const api = getHttpFetch();
        try {
            const res = await api(`/api/schedule/${auditId}/reschedule`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ new_date: targetDate })
            });

            if (res.ok) {
                await loadScheduleAndRender();
            } else {
                const err = await res.json().catch(() => ({}));
                alert("" + (err.detail || "Błąd zmiany terminu."));
            }
        } catch (e) {
            alert("Błąd połączenia z serwerem.");
        }
    }
    window.handleAuditDrop = handleAuditDrop;

    /**
     * Otwiera modal ręcznego planowania pojedynczego audytu
     */
    async function openManualPlanModal(dateStr = "") {
        const appState = getAppState();
        if (appState.role !== "MANAGER" && appState.role !== "AUDITOR") return;
        const dock = document.getElementById('bottom-dock');
        if (dock) dock.classList.add('hidden');

        const selectedDate = dateStr || getLocalTodayString();
        const dateInput = document.getElementById('plan-date');
        if (dateInput) dateInput.value = selectedDate; 
        window.miniCalDate = new Date(selectedDate);
        renderMiniCalendar();

        if (!window.productionLinesData || window.productionLinesData.length === 0) {
            if (typeof window.loadProductionLines === 'function') {
                await window.loadProductionLines();
            }
        }

        const planTypeEl = document.getElementById('plan-type');
        const currentType = planTypeEl ? planTypeEl.value : "HACCP";
        await loadAuditorsDropdown(currentType);

        if (appState.role === "AUDITOR" && appState.user && appState.user.full_name) {
            const audSelect = document.getElementById('plan-auditor');
            if (audSelect) {
                for (let i = 0; i < audSelect.options.length; i++) {
                    if (audSelect.options[i].value.includes(appState.user.full_name) || appState.user.full_name.includes(audSelect.options[i].value)) {
                        audSelect.selectedIndex = i;
                        break;
                    }
                }
            }
        }
        
        syncPlanAuditorBackupOptions();

        if (window.formHistory && typeof window.formHistory.saveState === 'function') {
            window.formHistory.saveState('modal-plan-form');
        }
        const modalEl = document.getElementById('modal-plan');
        if (modalEl) modalEl.classList.remove('hidden');
    }
    window.openManualPlanModal = openManualPlanModal;

    function closePlanModal() { 
        const modalEl = document.getElementById('modal-plan');
        if (modalEl) modalEl.classList.add('hidden');
        const dock = document.getElementById('bottom-dock');
        const appState = getAppState();
        if (dock && appState.role) dock.classList.remove('hidden');
    }
    window.closePlanModal = closePlanModal;

    function changeMiniMonth(delta) { 
        if (!window.miniCalDate || isNaN(window.miniCalDate.getTime())) {
            window.miniCalDate = new Date();
        }
        window.miniCalDate.setMonth(window.miniCalDate.getMonth() + delta); 
        renderMiniCalendar(); 
    }
    window.changeMiniMonth = changeMiniMonth;

    function renderMiniCalendar() {
        const miniDate = window.miniCalDate || new Date();
        const year = miniDate.getFullYear(), month = miniDate.getMonth();
        const names = ["Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec", "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień"];
        const titleEl = document.getElementById('mini-cal-month-title');
        if (titleEl) {
            titleEl.innerText = `${names[month]} ${year}`;
        }
        
        const firstDay = new Date(year, month, 1), lastDay = new Date(year, month + 1, 0);
        let startDay = firstDay.getDay() - 1; if (startDay === -1) startDay = 6;
        const grid = document.getElementById('mini-calendar-grid'); 
        if (!grid) return;
        grid.innerHTML = "";
        const dateInput = document.getElementById('plan-date');
        const selVal = dateInput ? dateInput.value : '';
        
        for (let i = 0; i < startDay; i++) grid.innerHTML += `<div class="p-1"></div>`;
        for (let day = 1; day <= lastDay.getDate(); day++) {
            const fDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            grid.innerHTML += `<div onclick="document.getElementById('plan-date').value='${fDate}'; renderMiniCalendar(); if(window.formHistory) formHistory.saveState('modal-plan-form');" class="p-1 rounded text-[9px] cursor-pointer ${fDate === selVal ? 'bg-cyan-500 text-slate-950 font-black' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'}">${day}</div>`;
        }
    }
    window.renderMiniCalendar = renderMiniCalendar;

    /**
     * Zapisuje nowo zaplanowany audyt (POST /api/schedule)
     */
    async function saveSchedule() {
        const dateEl = document.getElementById('plan-date');
        const pDate = dateEl ? dateEl.value : '';
        const today = getLocalTodayString();
        
        if (pDate < today) {
            return alert("Nie można planować audytów z datą wsteczną! Wybierz datę bieżącą lub przyszłą.");
        }

        const leadAuditor = (document.getElementById('plan-auditor')?.value || '').trim();
        const backupAuditor = (document.getElementById('plan-backup')?.value || '').trim();

        if (leadAuditor === backupAuditor && backupAuditor !== "Brak") {
            return alert("Niezgodność z normą IFS: Audytor Główny i Zastępca nie mogą być tą samą osobą!");
        }

        const payload = {
            scheduled_date: pDate,
            audit_type: document.getElementById('plan-type')?.value || 'HACCP',
            line: document.getElementById('plan-line')?.value || '',
            lead_auditor: leadAuditor,
            backup_auditor: backupAuditor,
            notes: document.getElementById('plan-notes')?.value || ''
        };

        const api = getHttpFetch();
        const res = await api('/api/schedule', { 
            method: 'POST', 
            headers: {'Content-Type': 'application/json'}, 
            body: JSON.stringify(payload) 
        });

        if (res.ok) { 
            alert("Audyt zaplanowany!"); 
            closePlanModal(); 
            await loadScheduleAndRender(); 
        } else {
            const err = await res.json().catch(() => ({}));
            alert("Błąd planowania: " + (err.detail || "Nie udało się zapisać audytu."));
        }
    }
    window.saveSchedule = saveSchedule;

    /**
     * Pobiera listę uprawnionych audytorów do dropdownów planowania
     */
    async function loadAuditorsDropdown(type = "HACCP") {
        const api = getHttpFetch();
        try {
            const res = await api(`/api/auth/auditors?type=${encodeURIComponent(type)}`);
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
    window.loadAuditorsDropdown = loadAuditorsDropdown;

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

    function filterPlanAuditorsByType(v) { 
        loadAuditorsDropdown(v); 
    }
    window.filterPlanAuditorsByType = filterPlanAuditorsByType;

    // --- AUTOPILOT HARMONOGRAMU (GENERATOR CYKLICZNY) ---

    function recordAutoPlanState() {
        const mEl = document.getElementById('autoplan-month');
        const yEl = document.getElementById('autoplan-year');
        const haccpEl = document.getElementById('auto-type-haccp');
        const gmpEl = document.getElementById('auto-type-gmp');
        const ghpEl = document.getElementById('auto-type-ghp');
        const weekendsEl = document.getElementById('auto-include-weekends');
        if (!mEl || !yEl) return;

        const appState = getAppState();
        const snapshot = {
            period: appState.selected_period_months || 1,
            month: parseInt(mEl.value) || (new Date().getMonth() + 1),
            year: parseInt(yEl.value) || new Date().getFullYear(),
            haccp: Boolean(haccpEl && haccpEl.checked),
            gmp: Boolean(gmpEl && gmpEl.checked),
            ghp: Boolean(ghpEl && ghpEl.checked),
            weekends: Boolean(weekendsEl && weekendsEl.checked),
            lines: Array.from(document.querySelectorAll('.auto-line-chk:checked')).map(c => c.value)
        };

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
        const appState = getAppState();
        appState.selected_period_months = snap.period;
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
        const appState = getAppState();
        const period = appState.selected_period_months || 1;

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

        const weekendsEl = document.getElementById('auto-include-weekends');
        const includeWeekends = Boolean(weekendsEl && weekendsEl.checked);
        let activeDaysCount = 0;
        let cur = new Date(startDateObj);
        while (cur <= endDateObj) {
            const dayOfWeek = cur.getDay();
            const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
            if (!isWeekend || includeWeekends) {
                activeDaysCount++;
            }
            cur.setDate(cur.getDate() + 1);
        }
        if (badgeEl) {
            badgeEl.textContent = `${activeDaysCount} dni ${includeWeekends ? 'planowanych' : 'roboczych'}`;
        }

        renderAutoPlanMiniCalendar(startDateObj, endDateObj, includeWeekends);

        if (shouldRecord) {
            recordAutoPlanState();
        }
    }
    window.updateAutoPlanPreview = updateAutoPlanPreview;

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
        if (startDayIdx === -1) startDayIdx = 6;

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
        const modal = document.getElementById('modal-autoplan');
        if (modal) modal.classList.remove('hidden'); 
        
        const curDate = window.currentCalDate;
        const targetDate = (curDate instanceof Date && !isNaN(curDate.getTime())) ? curDate : new Date();
        const targetMonth = targetDate.getMonth() + 1;
        const targetYear = targetDate.getFullYear();
        const mEl = document.getElementById('autoplan-month');
        const yEl = document.getElementById('autoplan-year');
        if (mEl) mEl.value = targetMonth;
        if (yEl) yEl.value = targetYear;
        autoPlanCalDate = new Date(targetYear, targetMonth - 1, 1);

        const autoLines = document.getElementById('autoplan-lines-container');
        if (!autoLines || autoLines.children.length === 0) {
            if (typeof window.loadProductionLines === 'function') {
                await window.loadProductionLines();
            }
        }

        const btn1 = document.querySelector('.btn-period');
        setPlanPeriod(1, btn1);

        autoPlanHistory = [];
        autoPlanHistoryIndex = -1;
        updateAutoPlanPreview(true);
    }
    window.openAutoPlanModal = openAutoPlanModal;

    function closeAutoPlanModal() { 
        const modal = document.getElementById('modal-autoplan');
        if (modal) modal.classList.add('hidden'); 
        const dock = document.getElementById('bottom-dock');
        const appState = getAppState();
        if (dock && appState.role) dock.classList.remove('hidden');
    }
    window.closeAutoPlanModal = closeAutoPlanModal;

    function setPlanPeriod(m, btn) {
        const appState = getAppState();
        appState.selected_period_months = m;
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
    window.setPlanPeriod = setPlanPeriod;

    async function runAutoSchedule() {
        const btn = document.getElementById('btn-run-auto-schedule');
        const origHtml = btn ? btn.innerHTML : '';

        const lines = [];
        document.querySelectorAll('.auto-line-chk:checked').forEach(c => lines.push(c.value));
        if (!lines.length) return alert("Wybierz przynajmniej jedną linię produkcyjną!");

        const types = [];
        if (document.getElementById('auto-type-haccp')?.checked) types.push('HACCP');
        if (document.getElementById('auto-type-gmp')?.checked) types.push('GMP');
        if (document.getElementById('auto-type-ghp')?.checked) types.push('GHP');
        if (!types.length) return alert("Wybierz przynajmniej jeden typ audytu (HACCP, GMP, GHP)!");

        const appState = getAppState();
        const payload = {
            start_year: parseInt(document.getElementById('autoplan-year')?.value) || new Date().getFullYear(),
            start_month: parseInt(document.getElementById('autoplan-month')?.value) || (new Date().getMonth() + 1),
            start_day: 1,
            period_months: appState.selected_period_months || 1,
            lines: lines,
            audit_types: types,
            include_weekends: Boolean(document.getElementById('auto-include-weekends')?.checked)
        };

        const api = getHttpFetch();
        try {
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generowanie audytów...';
            }

            const res = await api('/api/schedule/auto', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                const d = await res.json();
                alert(`Pomyślnie wygenerowano plan audytów: ${d.count} audytów w zakresie ${d.start_date} – ${d.end_date}.`);
                closeAutoPlanModal();
                window.currentCalDate = new Date(payload.start_year, payload.start_month - 1, 1);
                if (typeof window.showModule === 'function') {
                    window.showModule('calendar');
                }
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
    window.runAutoSchedule = runAutoSchedule;

    // --- MODALE EDYCJI I AKCJI NA ZLECENIACH HARMONOGRAMU ---

    async function openMgrModal(id) {
        const dock = document.getElementById('bottom-dock');
        if (dock) dock.classList.add('hidden');

        try {
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

            syncMgrAuditorBackupOptions();

            const modal = document.getElementById('modal-mgr-edit');
            if (modal) modal.classList.remove('hidden');
        } catch (err) {
            console.error("Błąd openMgrModal:", err);
        }
    }
    window.openMgrModal = openMgrModal;

    function closeMgrModal() { 
        const modalEl = document.getElementById('modal-mgr-edit');
        if (modalEl) modalEl.classList.add('hidden');
        const dock = document.getElementById('bottom-dock');
        const appState = getAppState();
        if (dock && appState.role) dock.classList.remove('hidden');
    }
    window.closeMgrModal = closeMgrModal;

    async function saveMgrScheduleEdit() {
        const id = document.getElementById('mgr-edit-id')?.value;
        const newDate = document.getElementById('mgr-edit-date')?.value;
        const today = getLocalTodayString();

        const dateInput = document.getElementById("mgr-edit-date");
        const originalDate = dateInput ? dateInput.getAttribute("data-original-date") : "";

        if (originalDate && newDate !== originalDate && newDate < today) {
            return alert("Nowy wyznaczony termin audytu musi być datą bieżącą lub przyszłą!");
        }

        const leadAuditor = document.getElementById('mgr-edit-lead')?.value || '';
        const backupAuditor = document.getElementById('mgr-edit-backup')?.value || '';

        if (leadAuditor === backupAuditor && backupAuditor !== "Brak") {
            return alert("Niezgodność z normą IFS: Audytor Główny i Zastępca nie mogą być tą samą osobą!");
        }

        const payload = {
            scheduled_date: newDate,
            audit_type: document.getElementById('mgr-edit-type')?.value || 'HACCP',
            line: document.getElementById('mgr-edit-line')?.value || '',
            lead_auditor: leadAuditor,
            backup_auditor: backupAuditor,
            status: document.getElementById('mgr-edit-status')?.value || 'PLANOWANY',
            notes: document.getElementById('mgr-edit-notes')?.value || ''
        };

        const api = getHttpFetch();
        const res = await api(`/api/schedule/${id}`, { 
            method: 'PUT', 
            headers: {'Content-Type': 'application/json'}, 
            body: JSON.stringify(payload) 
        });

        if (res.ok) { 
            closeMgrModal(); 
            await loadScheduleAndRender(); 
        } else {
            const err = await res.json().catch(() => ({}));
            alert("Błąd zapisu zmian: " + (err.detail || "Nie udało się zaktualizować audytu."));
        }
    }
    window.saveMgrScheduleEdit = saveMgrScheduleEdit;

    async function deleteMgrSchedule() {
        const id = document.getElementById('mgr-edit-id')?.value;
        if (!id || id === 'undefined') {
            return alert("Błąd: Nie wybrano poprawnego identyfikatora zlecenia do usunięcia.");
        }
        if (!confirm("Usunąć zlecenie?")) return;

        const api = getHttpFetch();
        const res = await api(`/api/schedule/${id}`, { method: 'DELETE' });
        if (res.ok) { 
            closeMgrModal(); 
            if (Array.isArray(window.schedulesData)) {
                window.schedulesData = window.schedulesData.filter(s => String(s.id) !== String(id));
                renderCalendar();
                updateAuditorScheduleBadges(window.schedulesData);
            }
            await loadScheduleAndRender(); 
        } else {
            const err = await res.json().catch(() => ({}));
            alert("Błąd usuwania: " + (err.detail || "Nie udało się usunąć audytu."));
        }
    }
    window.deleteMgrSchedule = deleteMgrSchedule;

    async function openAudModal(id) {
        const dock = document.getElementById('bottom-dock');
        if (dock) dock.classList.add('hidden');

        try {
            const res = await fetch(`/api/schedule/${id}`);
            const a = await res.json();
            window.activeSelectedAudit = a;
            const appState = getAppState();
            appState.active_audit_type = a.audit_type || "HACCP";
            document.getElementById('aud-view-date').innerText = a.scheduled_date || "";
            document.getElementById('aud-view-type').innerText = a.audit_type || "HACCP";
            document.getElementById('aud-view-line').innerText = a.line || "";
            document.getElementById('aud-view-status').innerText = a.status || "";
            const modal = document.getElementById('modal-aud-view');
            if (modal) modal.classList.remove('hidden');
        } catch (err) {
            console.error("Błąd openAudModal:", err);
        }
    }
    window.openAudModal = openAudModal;

    function closeAudModal() {
        const modalEl = document.getElementById('modal-aud-view');
        if (modalEl) modalEl.classList.add('hidden');
        const dock = document.getElementById('bottom-dock');
        const appState = getAppState();
        if (dock && appState.role) dock.classList.remove('hidden');
    }
    window.closeAudModal = closeAudModal;

    // --- CZYSZCZENIE HARMONOGRAMU ---

    window.clearAllSchedules = async function() {
        if (!confirm('Czy na pewno chcesz usunąć WSZYSTKIE audyty ze wszystkich miesięcy w całym harmonogramie?')) {
            return;
        }

        const api = getHttpFetch();
        try {
            const res = await api('/api/schedule/clear-all', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                alert(`Błąd podczas usuwania: ${errData.detail || 'Błąd serwera'}`);
                return;
            }

            window.schedulesData = [];
            updateAuditorScheduleBadges([]);
            renderCalendar();
            updateAutoPlanPreview(false);
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
        const appState = getAppState();
        const period = appState.selected_period_months || 1;
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

        const api = getHttpFetch();
        try {
            const payload = {
                month: monthNum,
                year: yearNum,
                period_months: period
            };
            const res = await api('/api/schedule/clear-month', {
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

            if (Array.isArray(window.schedulesData)) {
                window.schedulesData = window.schedulesData.filter(s => {
                    if (!s.scheduled_date) return true;
                    const sDate = String(s.scheduled_date).slice(0, 10);
                    return !(sDate >= startDateStr && sDate <= endDateStr);
                });
            }

            renderCalendar();
            updateAuditorScheduleBadges(window.schedulesData);

            await loadScheduleAndRender();
            updateAutoPlanPreview(false);

            alert(data.message || `Usunięto audyty na okres: ${periodLabel} (${startDateStr} – ${endDateStr})`);
            closeAutoPlanModal();
        } catch (err) {
            console.error('Błąd podczas czyszczenia harmonogramu:', err);
            alert('Wystąpił błąd podczas usuwania audytów.');
        }
    };

})(typeof window !== 'undefined' ? window : this);
