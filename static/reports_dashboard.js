// static/reports_dashboard.js - SCADA Dark Telemetry Dashboard

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

    const mainContainer = document.querySelector('main') || document.body;
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
                    <p class="text-xs text-slate-400">Monitoring realizacji harmonogramu oraz wskaźników jakościowych</p>
                </div>
            </div>

            <!-- KONTROLKI I FILTRY -->
            <div class="flex flex-wrap items-center gap-2">
                <div class="bg-slate-950/80 p-1 rounded-xl flex items-center gap-1 border border-slate-800">
                    <button type="button" id="rf-btn-month" onclick="setReportsFilterRange('month')" class="px-3 py-1.5 text-xs font-bold rounded-lg text-slate-400 hover:text-white transition cursor-pointer">Bieżący Miesiąc</button>
                    <button type="button" id="rf-btn-year" onclick="setReportsFilterRange('year')" class="px-3 py-1.5 text-xs font-bold rounded-lg text-slate-400 hover:text-white transition cursor-pointer">Bieżący Rok</button>
                    <button type="button" id="rf-btn-all" onclick="setReportsFilterRange('all')" class="px-3 py-1.5 text-xs font-bold rounded-lg bg-cyan-500 text-slate-950 shadow-md transition cursor-pointer">Wszystko</button>
                </div>
                <button type="button" onclick="window.location.href='/api/audits/export/excel'" class="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-lg shadow-emerald-950/40 cursor-pointer">
                    <i class="fa-solid fa-file-excel"></i> Excel
                </button>
                <button type="button" onclick="showModule('menu')" class="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer">
                    <i class="fa-solid fa-arrow-left"></i> Wróć
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
                    <div class="text-xs text-slate-400" id="kpi-blocked-text">0 zablokowanych partii</div>
                </div>
                <div class="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 text-xl">
                    <i class="fa-solid fa-shield-halved"></i>
                </div>
            </div>

            <!-- ŁĄCZNA LICZBA AUDYTÓW -->
            <div class="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl shadow-xl flex items-center justify-between group hover:border-purple-500/50 transition">
                <div class="space-y-1">
                    <span class="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Rejestr Zrealizowany</span>
                    <div class="text-3xl font-black text-white" id="kpi-total-executed">0</div>
                    <div class="text-xs text-slate-400">Zapisanych arkuszy w bazie</div>
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
                    <i class="fa-solid fa-chart-pie text-cyan-400"></i> Statusy i Werdykty Audytów
                </h3>
                <div class="h-64 relative flex items-center justify-center">
                    <canvas id="chart-audit-verdicts"></canvas>
                </div>
            </div>

            <div class="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl shadow-xl">
                <h3 class="text-xs font-bold text-slate-300 mb-4 uppercase tracking-wider flex items-center gap-2">
                    <i class="fa-solid fa-chart-simple text-cyan-400"></i> Obciążenie Linii Produkcyjnych
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
                    <i class="fa-solid fa-table-list text-cyan-400"></i> Zestawienie Telemetryczne Linii
                </h3>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-left text-xs text-slate-300">
                    <thead class="bg-slate-950/60 text-cyan-400 font-bold uppercase tracking-wider text-[10px] border-b border-slate-800">
                        <tr>
                            <th class="p-3.5">Linia Produkcyjna</th>
                            <th class="p-3.5">Audyty Zrealizowane</th>
                            <th class="p-3.5">Niezgodności / Blokady</th>
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

function filterItemsByDate(items, dateField) {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    return items.filter(item => {
        const rawDate = item[dateField] || item.created_at || item.audit_date;
        if (!rawDate) return false;
        const d = new Date(rawDate);
        if (isNaN(d.getTime())) return false;

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
    const filteredSchedule = filterItemsByDate(reportsState.schedule, 'date');
    const filteredAudits = filterItemsByDate(reportsState.audits, 'audit_date');

    // Kalkulacja wskaźnika realizacji harmonogramu
    const totalScheduled = filteredSchedule.length;
    const completedScheduled = filteredSchedule.filter(s => 
        s.status === 'WYKONANY' || s.is_completed === true
    ).length;

    const rate = totalScheduled > 0 
        ? Math.round((completedScheduled / totalScheduled) * 100) 
        : 100;

    // Aktualizacja KPI
    const elRate = document.getElementById('kpi-rate-text');
    const elFraction = document.getElementById('kpi-fraction-text');
    const elRadial = document.getElementById('kpi-radial-path');
    const elTotal = document.getElementById('kpi-total-executed');
    const elQuality = document.getElementById('kpi-quality-rate');
    const elBlocked = document.getElementById('kpi-blocked-text');

    if (elRate) elRate.innerText = `${rate}%`;
    if (elFraction) elFraction.innerText = `${completedScheduled} / ${totalScheduled} zrealizowano`;
    if (elRadial) elRadial.setAttribute('stroke-dasharray', `${Math.min(rate, 100)}, 100`);
    if (elTotal) elTotal.innerText = filteredAudits.length;

    // Statystyki per linia i statusy
    const lineStats = {};
    const statusCounts = {};
    let totalBlocked = 0;

    filteredAudits.forEach(a => {
        const line = a.line || 'Nieprzypisana';
        const st = a.record_status || 'ZATWIERDZONY';

        statusCounts[st] = (statusCounts[st] || 0) + 1;

        if (!lineStats[line]) lineStats[line] = { total: 0, blocked: 0 };
        lineStats[line].total += 1;

        if (st === 'ZABLOKOWANY' || st === 'ODBLOKOWANY_DO_KOREKTY') {
            lineStats[line].blocked += 1;
            totalBlocked += 1;
        }
    });

    const qualityScore = filteredAudits.length > 0 
        ? (((filteredAudits.length - totalBlocked) / filteredAudits.length) * 100).toFixed(1) + '%' 
        : '100%';

    if (elQuality) elQuality.innerText = qualityScore;
    if (elBlocked) elBlocked.innerText = `${totalBlocked} zarejestrowanych blokad`;

    // Tabela linii
    const tbody = document.getElementById('reports-table-body');
    if (tbody) {
        tbody.innerHTML = '';
        const lines = Object.keys(lineStats);
        if (lines.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-slate-500">Brak audytów dla wybranego zakresu dat</td></tr>`;
        } else {
            lines.forEach(line => {
                const row = lineStats[line];
                const lineRate = row.total > 0 
                    ? (((row.total - row.blocked) / row.total) * 100).toFixed(1) + '%' 
                    : '100%';
                tbody.innerHTML += `
                    <tr class="hover:bg-slate-800/40 transition">
                        <td class="p-3.5 font-semibold text-white">${line}</td>
                        <td class="p-3.5">${row.total}</td>
                        <td class="p-3.5 ${row.blocked > 0 ? 'text-red-400 font-bold' : 'text-slate-400'}">${row.blocked}</td>
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
            chartVerdictsInstance = new Chart(ctxVerdicts, {
                type: 'doughnut',
                data: {
                    labels: Object.keys(statusCounts).length ? Object.keys(statusCounts) : ['Brak danych'],
                    datasets: [{
                        data: Object.values(statusCounts).length ? Object.values(statusCounts) : [1],
                        backgroundColor: ['#10b981', '#ef4444', '#f59e0b', '#06b6d4', '#64748b']
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
    if (typeof showModule === 'function') {
        showModule('reports');
    } else {
        document.querySelectorAll('.view-layer').forEach(el => el.classList.add('hidden'));
        document.getElementById('view-reports').classList.remove('hidden');
    }

    try {
        const [resSchedule, resAudits] = await Promise.all([
            fetch('/api/schedule'),
            fetch('/api/audits')
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
