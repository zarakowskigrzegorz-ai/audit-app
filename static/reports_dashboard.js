// static/reports_dashboard.js - SCADA Dark Telemetry Dashboard
// Food Safety & Quality System (IFS Food v8 / BRCGS v9)

let reportsState = {
    schedule: [],
    audits: [],
    filter: 'all' // 'month' | 'year' | 'all'
};

let chartVerdictsInstance = null;
let chartLinesInstance = null;

function ensureReportsViewExists() {
    let view = document.getElementById('view-reports');
    if (view) return view;

    const mainContainer = document.getElementById('app-content') || document.querySelector('main') || document.body;
    view = document.createElement('div');
    view.id = 'view-reports';
    view.className = 'w-full max-w-6xl mx-auto hidden space-y-6 view-layer pb-24 px-2 sm:px-4';

    view.innerHTML = `
        <!-- HEADER SCADA COCKPIT -->
        <div class="glass-card bg-slate-900/90 border border-cyan-500/40 p-5 rounded-2xl flex flex-wrap items-center justify-between gap-4 shadow-2xl backdrop-blur-xl">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 text-lg shadow-inner">
                    <i class="fa-solid fa-gauge-high"></i>
                </div>
                <div>
                    <h2 class="text-lg font-black text-white tracking-wide uppercase flex items-center gap-2">
                        Pulpit Telemetryczny Audytów
                        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">SCADA LIVE</span>
                    </h2>
                    <p class="text-xs text-slate-400">Monitoring realizacji harmonogramu oraz wskaźników jakościowych IFS Food v8</p>
                </div>
            </div>

            <!-- KONTROLKI I FILTRY -->
            <div class="flex flex-wrap items-center gap-2">
                <div class="bg-slate-950/80 p-1 rounded-xl flex items-center gap-1 border border-slate-800">
                    <button type="button" id="rf-btn-month" onclick="setReportsFilterRange('month')" class="px-3 py-1.5 text-xs font-bold rounded-lg text-slate-400 hover:text-white transition cursor-pointer">Bieżący Miesiąc</button>
                    <button type="button" id="rf-btn-year" onclick="setReportsFilterRange('year')" class="px-3 py-1.5 text-xs font-bold rounded-lg text-slate-400 hover:text-white transition cursor-pointer">Bieżący Rok</button>
                    <button type="button" id="rf-btn-all" onclick="setReportsFilterRange('all')" class="px-3 py-1.5 text-xs font-bold rounded-lg bg-cyan-500 text-slate-950 shadow-md transition cursor-pointer">Wszystko</button>
                </div>
                <button type="button" onclick="window.location.href='/api/audits/export/excel'" class="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-emerald-950/40 cursor-pointer active:scale-95">
                    <i class="fa-solid fa-file-excel"></i> Excel (.XLSX)
                </button>
                <button type="button" onclick="openPowerBiExportModal()" class="px-3 py-2 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-black rounded-xl text-xs transition flex items-center gap-1.5 shadow-lg shadow-amber-950/40 cursor-pointer active:scale-95">
                    <i class="fa-solid fa-chart-simple"></i> Power BI
                </button>
                <button type="button" onclick="showModule('hub')" class="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer">
                    <i class="fa-solid fa-arrow-left"></i> Wróć do Menu
                </button>
            </div>
        </div>

        <!-- SEKCJA KPI TELEMETRII -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <!-- WSKAŹNIK REALIZACJI PLANU -->
            <div class="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl shadow-xl flex items-center justify-between relative overflow-hidden group hover:border-cyan-500/50 transition">
                <div class="space-y-1">
                    <span class="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Realizacja Harmonogramu</span>
                    <div class="text-3xl font-black text-cyan-400" id="kpi-rate-text">0%</div>
                    <div class="text-xs text-slate-400 font-semibold" id="kpi-fraction-text">0 / 0 wykonanych</div>
                </div>
                <!-- Mini Radial Gauge SVG -->
                <div class="relative w-20 h-20 flex items-center justify-center">
                    <svg class="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                        <path class="text-slate-800" stroke-width="3.5" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                        <path id="kpi-radial-path" class="text-cyan-400 transition-all duration-700 ease-out" stroke-dasharray="0, 100" stroke-linecap="round" stroke-width="3.5" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                    </svg>
                    <i class="fa-solid fa-calendar-check absolute text-cyan-400/80 text-sm"></i>
                </div>
            </div>

            <!-- JAKOŚĆ / ZGODNOŚĆ -->
            <div class="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl shadow-xl flex items-center justify-between group hover:border-emerald-500/50 transition">
                <div class="space-y-1">
                    <span class="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Zgodność Standardu</span>
                    <div class="text-3xl font-black text-emerald-400" id="kpi-quality-rate">100%</div>
                    <div class="text-xs text-slate-400" id="kpi-blocked-text">0 incydentów jakościowych</div>
                </div>
                <div class="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 text-xl">
                    <i class="fa-solid fa-shield-halved"></i>
                </div>
            </div>

            <!-- ŁĄCZNA LICZBA AUDYTÓW -->
            <div class="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl shadow-xl flex items-center justify-between group hover:border-purple-500/50 transition">
                <div class="space-y-1">
                    <span class="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Odbyte Audyty w Bazie</span>
                    <div class="text-3xl font-black text-white" id="kpi-total-executed">0</div>
                    <div class="text-xs text-slate-400">Zarejestrowane inspekcje</div>
                </div>
                <div class="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 text-xl">
                    <i class="fa-solid fa-database"></i>
                </div>
            </div>
        </div>

        <!-- WYKRESY ANALITYCZNE -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl shadow-xl">
                <h3 class="text-xs font-bold text-slate-300 mb-4 uppercase tracking-wider flex items-center gap-2">
                    <i class="fa-solid fa-chart-pie text-cyan-400"></i> Werdykty i Rezultaty Audytów
                </h3>
                <div class="h-64 relative flex items-center justify-center">
                    <canvas id="chart-audit-verdicts"></canvas>
                </div>
            </div>

            <div class="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl shadow-xl">
                <h3 class="text-xs font-bold text-slate-300 mb-4 uppercase tracking-wider flex items-center gap-2">
                    <i class="fa-solid fa-chart-simple text-cyan-400"></i> Rozkład Audytów na Liniach
                </h3>
                <div class="h-64 relative flex items-center justify-center">
                    <canvas id="chart-line-stats"></canvas>
                </div>
            </div>
        </div>

        <!-- TABELA ROZKŁADU LINII -->
        <div class="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div class="p-4 border-b border-slate-800 flex items-center justify-between">
                <h3 class="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                    <i class="fa-solid fa-table-list text-cyan-400"></i> Zestawienie Telemetryczne Linii Produkcyjnych
                </h3>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-left text-xs text-slate-300">
                    <thead class="bg-slate-950/60 text-cyan-400 font-bold uppercase tracking-wider text-[10px] border-b border-slate-800">
                        <tr>
                            <th class="p-3.5">Linia Produkcyjna</th>
                            <th class="p-3.5">Audyty Zrealizowane</th>
                            <th class="p-3.5">Incydenty / NOK</th>
                            <th class="p-3.5">Wskaźnik Zgodności</th>
                        </tr>
                    </thead>
                    <tbody id="reports-table-body" class="divide-y divide-slate-800/60"></tbody>
                </table>
            </div>
        </div>
    `;

    mainContainer.appendChild(view);
    return view;
}

function parseItemDate(item, preferredField) {
    const raw = item[preferredField] || item.timestamp || item.scheduled_date || item.audit_date || item.date || item.created_at;
    if (!raw) return null;
    const cleanStr = String(raw).trim().replace(' ', 'T');
    const d = new Date(cleanStr);
    return isNaN(d.getTime()) ? null : d;
}

function filterItemsByDate(items, preferredField) {
    if (!Array.isArray(items)) return [];
    if (reportsState.filter === 'all') return items;

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    return items.filter(item => {
        const d = parseItemDate(item, preferredField);
        if (!d) return true; // Jeśli brak daty, nie ucinajmy rekordu

        if (reportsState.filter === 'month') {
            return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
        }
        if (reportsState.filter === 'year') {
            return d.getFullYear() === currentYear;
        }
        return true;
    });
}

function renderReportsUI() {
    const filteredSchedule = filterItemsByDate(reportsState.schedule, 'scheduled_date');
    const filteredAudits = filterItemsByDate(reportsState.audits, 'timestamp');

    // Kalkulacja wskaźnika realizacji harmonogramu
    const totalScheduled = filteredSchedule.length;
    const completedScheduled = filteredSchedule.filter(s => 
        s.status === 'WYKONANY' || s.is_completed === true || s.completed_at
    ).length;

    let rate = 100;
    if (totalScheduled > 0) {
        rate = Math.min(100, Math.round((completedScheduled / totalScheduled) * 100));
    } else if (filteredAudits.length > 0) {
        rate = 100;
    }

    // Aktualizacja KPI
    const elRate = document.getElementById('kpi-rate-text');
    const elFraction = document.getElementById('kpi-fraction-text');
    const elRadial = document.getElementById('kpi-radial-path');
    const elTotal = document.getElementById('kpi-total-executed');
    const elQuality = document.getElementById('kpi-quality-rate');
    const elBlocked = document.getElementById('kpi-blocked-text');

    if (elRate) elRate.innerText = `${rate}%`;
    if (elFraction) {
        if (totalScheduled > 0) {
            elFraction.innerText = `${completedScheduled} / ${totalScheduled} zrealizowano z planu`;
        } else {
            elFraction.innerText = `${filteredAudits.length} zrealizowanych audytów`;
        }
    }
    if (elRadial) elRadial.setAttribute('stroke-dasharray', `${Math.min(rate, 100)}, 100`);
    if (elTotal) elTotal.innerText = filteredAudits.length;

    // Statystyki per linia i werdykty jakościowe
    const lineStats = {};
    const statusCounts = {
        'ZGODNY (OK)': 0,
        'NIEZGODNY (NOK)': 0,
        'HOLD LOT': 0
    };
    let totalIncidents = 0;

    filteredAudits.forEach(a => {
        const line = a.line || 'Linia nieprzypisana';
        const isHold = a.compliance_verdict === 'HOLD_LOT' || (a.risk_level && a.risk_level.includes('HOLD'));
        const isNok = a.slm_verdict === 'NOK' || a.compliance_verdict === 'ODRZUCONY' || a.ko_failed == 1;

        let verdictLabel = 'ZGODNY (OK)';
        if (isHold) {
            verdictLabel = 'HOLD LOT';
            totalIncidents += 1;
        } else if (isNok) {
            verdictLabel = 'NIEZGODNY (NOK)';
            totalIncidents += 1;
        }
        statusCounts[verdictLabel] = (statusCounts[verdictLabel] || 0) + 1;

        if (!lineStats[line]) lineStats[line] = { total: 0, incidents: 0 };
        lineStats[line].total += 1;
        if (isHold || isNok) {
            lineStats[line].incidents += 1;
        }
    });

    const qualityScore = filteredAudits.length > 0 
        ? (((filteredAudits.length - totalIncidents) / filteredAudits.length) * 100).toFixed(1) + '%' 
        : '100%';

    if (elQuality) elQuality.innerText = qualityScore;
    if (elBlocked) elBlocked.innerText = `${totalIncidents} incydentów jakościowych`;

    // Tabela linii
    const tbody = document.getElementById('reports-table-body');
    if (tbody) {
        tbody.innerHTML = '';
        const lines = Object.keys(lineStats);
        if (lines.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-slate-500">Brak zarejestrowanych audytów dla wybranego zakresu</td></tr>`;
        } else {
            lines.forEach(line => {
                const row = lineStats[line];
                const lineRate = row.total > 0 
                    ? (((row.total - row.incidents) / row.total) * 100).toFixed(1) + '%' 
                    : '100%';
                tbody.innerHTML += `
                    <tr class="hover:bg-slate-800/40 transition">
                        <td class="p-3.5 font-semibold text-white">${line}</td>
                        <td class="p-3.5 font-bold">${row.total}</td>
                        <td class="p-3.5 ${row.incidents > 0 ? 'text-rose-400 font-bold' : 'text-slate-400'}">${row.incidents}</td>
                        <td class="p-3.5 text-emerald-400 font-bold">${lineRate}</td>
                    </tr>
                `;
            });
        }
    }

    // Wykresy Chart.js
    if (window.Chart) {
        // Doughnut: Statusy
        const ctxVerdicts = document.getElementById('chart-audit-verdicts');
        if (ctxVerdicts) {
            if (chartVerdictsInstance) chartVerdictsInstance.destroy();
            const labels = Object.keys(statusCounts).filter(k => statusCounts[k] > 0);
            const dataValues = labels.map(k => statusCounts[k]);

            chartVerdictsInstance = new Chart(ctxVerdicts, {
                type: 'doughnut',
                data: {
                    labels: labels.length ? labels : ['Brak audytów'],
                    datasets: [{
                        data: dataValues.length ? dataValues : [1],
                        backgroundColor: ['#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#64748b']
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 11 } } } }
                }
            });
        }

        // Bar: Linie
        const ctxLines = document.getElementById('chart-line-stats');
        if (ctxLines) {
            if (chartLinesInstance) chartLinesInstance.destroy();
            chartLinesInstance = new Chart(ctxLines, {
                type: 'bar',
                data: {
                    labels: Object.keys(lineStats),
                    datasets: [{
                        label: 'Liczba audytów',
                        data: Object.keys(lineStats).map(k => lineStats[k].total),
                        backgroundColor: '#06b6d4',
                        borderRadius: 6
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: { ticks: { color: '#94a3b8' }, grid: { color: '#1e293b' } },
                        y: { ticks: { color: '#94a3b8', stepSize: 1 }, grid: { color: '#1e293b' } }
                    },
                    plugins: { legend: { display: false } }
                }
            });
        }
    }
}

window.setReportsFilterRange = function(range) {
    reportsState.filter = range;
    ['month', 'year', 'all'].forEach(r => {
        const btn = document.getElementById(`rf-btn-${r}`);
        if (btn) {
            if (r === range) {
                btn.className = 'px-3 py-1.5 text-xs font-bold rounded-lg bg-cyan-500 text-slate-950 shadow-md transition cursor-pointer';
            } else {
                btn.className = 'px-3 py-1.5 text-xs font-bold rounded-lg text-slate-400 hover:text-white transition cursor-pointer';
            }
        }
    });
    renderReportsUI();
};

window.openReportsDashboard = async function() {
    ensureReportsViewExists();
    
    // Pokaż widok reports
    document.querySelectorAll('.view-layer').forEach(el => el.classList.add('hidden'));
    const repView = document.getElementById('view-reports');
    if (repView) repView.classList.remove('hidden');

    if (typeof updateDockButtons === 'function') updateDockButtons();

    try {
        const token = sessionStorage.getItem('quality_audit_token');
        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

        const [resSchedule, resAudits] = await Promise.all([
            fetch('/api/schedule', { headers }),
            fetch('/api/audits?limit=500', { headers })
        ]);
        reportsState.schedule = resSchedule.ok ? await resSchedule.json() : [];
        reportsState.audits = resAudits.ok ? await resAudits.json() : [];
        renderReportsUI();
    } catch (e) {
        console.error("Błąd ładowania telemetrycznych danych audytów:", e);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    ensureReportsViewExists();
});

window.openPowerBiExportModal = function() {
    let modal = document.getElementById('modal-powerbi-export');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-powerbi-export';
        modal.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4';
        const webUrl = window.location.origin + '/api/audits/export/powerbi/feed';
        modal.innerHTML = `
            <div class="glass-card bg-slate-900 border border-amber-500/50 p-6 rounded-2xl w-full max-w-lg shadow-2xl space-y-4 text-left relative">
                <div class="flex items-center justify-between border-b border-white/10 pb-3">
                    <div class="flex items-center gap-2.5">
                        <div class="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-400 text-lg shadow-inner">
                            <i class="fa-solid fa-chart-simple"></i>
                        </div>
                        <div>
                            <h3 class="text-sm font-black text-white">Eksport Danych do Microsoft Power BI</h3>
                            <p class="text-[10px] text-amber-300/80 font-semibold">Integracja analityczna IFS Food v8 / BRCGS v9</p>
                        </div>
                    </div>
                    <button type="button" onclick="document.getElementById('modal-powerbi-export').classList.add('hidden')" class="text-slate-400 hover:text-white font-bold text-lg p-1">&times;</button>
                </div>

                <div class="space-y-3">
                    <!-- OPCJA 1: POBIERZ PLIK CSV -->
                    <div class="p-4 bg-slate-950/80 rounded-xl border border-slate-800 hover:border-amber-500/40 transition space-y-2">
                        <div class="flex items-center justify-between">
                            <span class="text-xs font-black text-amber-300 uppercase tracking-wide flex items-center gap-1.5">
                                <i class="fa-solid fa-file-csv text-sm"></i> 1. Gotowy Plik CSV (UTF-8 BOM)
                            </span>
                            <span class="text-[9px] bg-amber-950 text-amber-300 px-2 py-0.5 rounded font-bold border border-amber-400/30">Zalecane</span>
                        </div>
                        <p class="text-[11px] text-slate-300">Zoptymalizowany plik ze znormalizowanymi kolumnami dla modelu gwiazdy (Star Schema) w Power BI Desktop.</p>
                        <button type="button" onclick="window.location.href='/api/audits/export/powerbi/csv'" class="w-full py-2 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-black text-xs uppercase rounded-lg shadow flex items-center justify-center gap-2 transition active:scale-95">
                            <i class="fa-solid fa-download"></i> Pobierz Raport CSV dla Power BI
                        </button>
                    </div>

                    <!-- OPCJA 2: ODŚWIEŻANIE NA ŻYWO WEB CONNECTOR -->
                    <div class="p-4 bg-slate-950/80 rounded-xl border border-slate-800 hover:border-cyan-500/40 transition space-y-2">
                        <div class="flex items-center justify-between">
                            <span class="text-xs font-black text-cyan-400 uppercase tracking-wide flex items-center gap-1.5">
                                <i class="fa-solid fa-globe text-sm"></i> 2. Web Feed (Odświeżanie na żywo)
                            </span>
                            <span class="text-[9px] bg-cyan-950 text-cyan-300 px-2 py-0.5 rounded font-bold border border-cyan-400/30">Automatyzacja</span>
                        </div>
                        <p class="text-[11px] text-slate-300">W Power BI Desktop wybierz: <b>Pobierz dane &rarr; Ze stron sieci Web</b> i wklej poniższy adres URL:</p>
                        <div class="flex items-center gap-2">
                            <input type="text" id="pbi-feed-url" readonly value="${webUrl}" class="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-[10px] font-mono text-cyan-300 select-all">
                            <button type="button" onclick="navigator.clipboard.writeText('${webUrl}'); alert('Skopiowano adres URL do schowka!');" class="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-lg border border-slate-700 whitespace-nowrap cursor-pointer">
                                Kopiuj
                            </button>
                        </div>
                    </div>
                </div>

                <div class="flex justify-end pt-2 border-t border-white/5">
                    <button type="button" onclick="document.getElementById('modal-powerbi-export').classList.add('hidden')" class="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl cursor-pointer">
                        Zamknij
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    } else {
        modal.classList.remove('hidden');
    }
};

