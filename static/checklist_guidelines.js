/**
 * Quality Audit Enterprise - Baza Wiedzy & Standardy Kontroli
 * Układ: Split-View (Po lewej: lista punktów | Po prawej: pełne wyjaśnienie)
 */

let CHECKLIST_GUIDELINES = [];
let currentFaqCategory = 'ALL';
let activeGuidelineId = null;

async function loadChecklistGuidelines() {
  try {
    const res = await fetch('/api/checklist/guidelines');
    if (res.ok) {
      CHECKLIST_GUIDELINES = await res.json();
    }
  } catch (err) {
    console.error("Błąd pobierania wytycznych:", err);
  }
}

async function openChecklistKnowledgeBase() {
  const modal = document.getElementById('checklistFaqModal');
  if (!modal) return;
  modal.classList.remove('hidden');

  if (CHECKLIST_GUIDELINES.length === 0) {
    await loadChecklistGuidelines();
  }

  // Domyślnie aktywuj pierwszy element
  if (!activeGuidelineId && CHECKLIST_GUIDELINES.length > 0) {
    activeGuidelineId = CHECKLIST_GUIDELINES[0].id;
  }
  
  updateCounts();
  filterFaqItems();
}

function closeChecklistKnowledgeBase() {
  const modal = document.getElementById('checklistFaqModal');
  if (modal) modal.classList.add('hidden');
}

function updateCounts() {
  const counts = { ALL: CHECKLIST_GUIDELINES.length, CCP: 0, GMP: 0, GHP: 0, FOREIGN_MATTER: 0 };
  CHECKLIST_GUIDELINES.forEach(item => {
    if (counts[item.category] !== undefined) counts[item.category]++;
  });
  for (let k in counts) {
    const el = document.getElementById(`count-${k}`);
    if (el) el.innerText = counts[k];
  }
}

function setFaqCategory(category, btnElement) {
  currentFaqCategory = category;
  document.querySelectorAll('.faq-nav-btn').forEach(btn => {
    btn.className = 'faq-nav-btn w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-800/60 flex items-center justify-between transition';
  });
  if (btnElement) {
    btnElement.className = 'faq-nav-btn w-full text-left px-3 py-2 rounded-xl text-xs font-black bg-emerald-500 text-slate-950 flex items-center justify-between transition shadow-md shadow-emerald-500/20';
  }
  filterFaqItems(true);
}

function selectGuideline(id) {
  activeGuidelineId = id;
  renderItemList();
  renderDetailPanel();
}

function getRiskBadge(risk) {
  if (risk === 'KO') return '<span class="px-2 py-0.5 text-[9px] font-black rounded bg-rose-500/20 text-rose-400 border border-rose-500/30 uppercase">KO</span>';
  if (risk === 'MAJOR') return '<span class="px-2 py-0.5 text-[9px] font-black rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 uppercase">Major</span>';
  return '<span class="px-2 py-0.5 text-[9px] font-black rounded bg-slate-800 text-slate-400 border border-slate-700 uppercase">Minor</span>';
}

function isManagerLoggedIn() {
  const roleEl = document.getElementById('display-user-role') || document.querySelector('[data-current-role]');
  if (roleEl && roleEl.innerText.includes('MANAGER')) return true;
  return localStorage.getItem('user_role') === 'MANAGER';
}

let currentFilteredList = [];

function filterFaqItems(autoSelectFirst = false) {
  const input = document.getElementById('faqSearchInput');
  const search = input ? input.value.toLowerCase() : '';

  currentFilteredList = CHECKLIST_GUIDELINES.filter(item => {
    const matchCat = (currentFaqCategory === 'ALL' || item.category === currentFaqCategory);
    const matchSearch = (item.title || '').toLowerCase().includes(search) || 
                        (item.question || '').toLowerCase().includes(search) || 
                        (item.criteria || '').toLowerCase().includes(search);
    return matchCat && matchSearch;
  });

  if (autoSelectFirst && currentFilteredList.length > 0) {
    activeGuidelineId = currentFilteredList[0].id;
  } else if (currentFilteredList.length > 0 && !currentFilteredList.some(i => i.id === activeGuidelineId)) {
    activeGuidelineId = currentFilteredList[0].id;
  }

  renderItemList();
  renderDetailPanel();
}

function renderItemList() {
  const container = document.getElementById('faqItemListContainer');
  if (!container) return;

  if (currentFilteredList.length === 0) {
    container.innerHTML = '<p class="text-center py-6 text-slate-500 text-xs">Brak wyników</p>';
    return;
  }

  container.innerHTML = currentFilteredList.map(item => {
    const isActive = item.id === activeGuidelineId;
    const activeClass = isActive 
      ? 'bg-slate-800 border-emerald-500/50 shadow-md ring-1 ring-emerald-500/30' 
      : 'bg-slate-900/40 border-slate-800/80 hover:bg-slate-850 hover:border-slate-700';

    return `
      <div onclick="selectGuideline('${item.id}')" 
           class="p-3 rounded-xl border cursor-pointer transition flex flex-col gap-1 ${activeClass}">
        <div class="flex items-center justify-between gap-1">
          <span class="text-[10px] font-black text-slate-400 font-mono">${item.id}</span>
          ${getRiskBadge(item.risk_level)}
        </div>
        <p class="text-xs font-bold text-slate-200 line-clamp-2 leading-snug">${item.title}</p>
        <span class="text-[10px] text-slate-500 font-mono mt-0.5 truncate">${item.ifs_clause}</span>
      </div>
    `;
  }).join('');
}

function renderDetailPanel() {
  const panel = document.getElementById('faqDetailPanel');
  if (!panel) return;

  const item = CHECKLIST_GUIDELINES.find(g => g.id === activeGuidelineId);
  if (!item) {
    panel.innerHTML = '<div class="h-full flex items-center justify-center text-slate-500 text-sm">Wybierz punkt z listy po lewej stronie</div>';
    return;
  }

  const isManager = isManagerLoggedIn();

  panel.innerHTML = `
    <div class="space-y-4">
      <!-- Nagłówek punktu -->
      <div class="border-b border-slate-800 pb-4">
        <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div class="flex items-center gap-2">
            <span class="px-2.5 py-1 text-[10px] font-black rounded-lg bg-emerald-950/60 text-emerald-300 border border-emerald-500/30">${item.category_label || item.category}</span>
            ${getRiskBadge(item.risk_level)}
            <span class="text-xs font-mono text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">${item.id}</span>
          </div>
          <span class="text-xs font-mono text-cyan-400/90 bg-cyan-950/30 px-2.5 py-1 rounded-lg border border-cyan-500/30">${item.ifs_clause}</span>
        </div>
        <h1 class="text-lg sm:text-xl font-black text-white">${item.title}</h1>
      </div>

      <!-- Pytanie audytowe -->
      <div class="bg-slate-950/80 p-4 rounded-2xl border border-slate-800 flex items-start space-x-3">
        <span class="text-emerald-400 font-black text-xl leading-none">„</span>
        <div class="flex-1">
          <p class="text-xs text-slate-400 uppercase font-black tracking-wider mb-1">Pytanie z formularza audytowego</p>
          <p class="text-sm text-slate-100 font-medium leading-relaxed">${item.question}</p>
        </div>
        ${isManager ? `
          <button onclick="editGuidelinePrompt('${item.id}')" class="px-3 py-1.5 bg-slate-800 hover:bg-emerald-600 text-slate-200 hover:text-white rounded-xl text-xs font-bold border border-slate-700 transition flex items-center gap-1.5">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
            Edytuj
          </button>
        ` : ''}
      </div>

      <!-- Wyjaśnienie 1: Kryterium Zgodności -->
      <div class="bg-emerald-950/20 p-5 rounded-2xl border border-emerald-500/25 space-y-2.5">
        <div class="flex items-center justify-between">
          <h3 class="text-xs font-black text-emerald-400 uppercase tracking-wider flex items-center gap-2">
            <span class="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]"></span>
            Kryterium Zgodności (Standard Zakładowy)
          </h3>
          <span class="text-[10px] font-mono text-emerald-300 bg-emerald-900/40 px-2 py-0.5 rounded border border-emerald-500/30">WYMÓG AUDYTOWY</span>
        </div>
        <p class="text-sm text-slate-200 leading-relaxed">${item.criteria}</p>
        <div class="pt-3 border-t border-emerald-500/15 text-xs text-emerald-300 flex items-center gap-2">
          <strong class="text-white">Stan pożądany na linii:</strong> <span>${item.correct_action}</span>
        </div>
      </div>

      <!-- Wyjaśnienie 2: Postępowanie Awaryjne & CAPA -->
      <div class="bg-rose-950/20 p-5 rounded-2xl border border-rose-500/25 space-y-2.5">
        <div class="flex items-center justify-between">
          <h3 class="text-xs font-black text-rose-400 uppercase tracking-wider flex items-center gap-2">
            <span class="w-2.5 h-2.5 rounded-full bg-rose-400 shadow-[0_0_10px_rgba(251,113,133,0.8)]"></span>
            Odchylenie, Kwarantanna & Postępowanie Korekcyjne
          </h3>
          <span class="text-[10px] font-mono text-rose-300 bg-rose-900/40 px-2 py-0.5 rounded border border-rose-500/30">PROCEDURA AWARYJNA</span>
        </div>
        <p class="text-sm text-slate-200 leading-relaxed">${item.deviation_action}</p>
        <div class="pt-3 border-t border-rose-500/15 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div class="text-rose-300">
            <strong class="text-white">Klauzula normy:</strong> ${item.ifs_clause}
          </div>
          <button onclick="navigator.clipboard.writeText('${item.deviation_action}'); alert('Skopiowano działanie CAPA do schowka!');" 
                  class="px-3.5 py-1.5 bg-rose-900/50 hover:bg-rose-800 text-rose-200 rounded-xl text-xs font-bold border border-rose-500/30 transition flex items-center gap-1.5">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
            Kopiuj do CAPA
          </button>
        </div>
      </div>
    </div>
  `;
}

async function editGuidelinePrompt(id) {
  const item = CHECKLIST_GUIDELINES.find(g => g.id === id);
  if (!item) return;

  const newCrit = prompt(`Edycja Kryterium Zgodności dla [${item.id}]:`, item.criteria);
  if (newCrit === null) return;

  const newDev = prompt(`Edycja Działania Korygującego dla [${item.id}]:`, item.deviation_action);
  if (newDev === null) return;

  try {
    const res = await fetch(`/api/checklist/guidelines/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ criteria: newCrit, deviation_action: newDev })
    });
    if (res.ok) {
      item.criteria = newCrit;
      item.deviation_action = newDev;
      renderDetailPanel();
      alert("Zapisano zmiany w bazie danych!");
    } else {
      alert("Błąd zapisu w API.");
    }
  } catch (err) {
    alert("Błąd połączenia z serwerem.");
  }
}

// Inicjalizacja
loadChecklistGuidelines();
