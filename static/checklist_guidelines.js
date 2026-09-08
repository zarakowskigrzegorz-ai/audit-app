/**
 * Quality Audit Enterprise - Baza Wiedzy & Standardy Kontroli
 * Zgodność: IFS Food v8 / BRCGS
 */

const CHECKLIST_GUIDELINES = [
  {
    id: "CCP-1",
    category: "CCP",
    categoryLabel: "CCP / OPRP",
    title: "Detektor Metali / Rentgen (X-Ray) – Weryfikacja sprawności",
    question: "Czy test sprawności detektora metali/X-Ray został wykonany poprawnie przed startem partii?",
    ifsClause: "IFS Food v8 p. 4.12.1 • BRCGS p. 4.10",
    criteria: "Wymagany test na 3 wzorcach (Fe, Non-Fe, SS) umieszczonych w produkcie testowym. Mechanizm odrzutu musi zadziałać i skierować produkt do zamkniętego pojemnika.",
    correctAction: "Wszystkie 3 wzorce wykryte i odrzucone. Prawidłowy zapis w systemie lub karcie kontrolnej.",
    deviationAction: "Natychmiastowe zatrzymanie linii, kwarantanna wyrobów od ostatniego poprawnego testu, wezwanie UR."
  },
  {
    id: "CCP-2",
    category: "CCP",
    categoryLabel: "CCP / OPRP",
    title: "Temperatura i parametry obróbki / chłodzenia",
    question: "Czy temperatura w krytycznym punkcie procesu mieści się w dopuszczalnych limitach technologicznych?",
    ifsClause: "IFS Food v8 p. 2.2.3.8",
    criteria: "Pomiar skalibrowanym termometrem bagnetowym lub bieżący odczyt ze SCADA. Brak przekroczeń górnego limitu krytycznego.",
    correctAction: "Temperatura w normie, rejestrator ciągły aktywny.",
    deviationAction: "Zatrzymanie partii, zablokowanie surowca w magazynie, powiadomienie Managera Jakości."
  },
  {
    id: "GMP-1",
    category: "GMP",
    categoryLabel: "GMP / Higiena",
    title: "Higiena personelu i odzież ochronna",
    question: "Czy operatorzy stosują kompletną i czystą odzież strefową zgodnie z instrukcją?",
    ifsClause: "IFS Food v8 p. 3.2.1 • BRCGS p. 7.4",
    criteria: "Całkowite zakrycie włosów i zarostu, brak biżuterii, zegarków oraz widocznych kieszeni zewnętrznych powyżej pasa. Czyste obuwie robocze.",
    correctAction: "100% pracowników spełnia standard strefy czystej.",
    deviationAction: "Natychmiastowe nakazanie poprawy odzieży, wymiana na czystą. W razie ryzyka – inspekcja produktu."
  },
  {
    id: "GMP-2",
    category: "GMP",
    categoryLabel: "GMP / Higiena",
    title: "Czystość linii (C&D) i brak alergenów resztkowych",
    question: "Czy linia i jej otoczenie są wolne od zanieczyszczeń organicznych oraz resztek poprzedniej partii?",
    ifsClause: "IFS Food v8 p. 4.6.1",
    criteria: "Brak pozostałości po poprzednim produkcie (zwłaszcza alergenów). Wizualna czystość taśm, zsypów, stołów pakujących.",
    correctAction: "Linia sucha, czysta, zatwierdzona do startu.",
    deviationAction: "Ponowne mycie linii, wykonanie testu wymazowego ATP/alergenowego przed dopuszczeniem."
  },
  {
    id: "FM-1",
    category: "FOREIGN_MATTER",
    categoryLabel: "Ciała obce",
    title: "Kontrola szkła, twardego plastiku i drewna",
    question: "Czy w obszarze otwartego produktu nie znajdują się niedozwolone przedmioty drewniane ani uszkodzone osłony?",
    ifsClause: "IFS Food v8 p. 4.9.3 • BRCGS p. 4.9",
    criteria: "Całkowity brak drewna w strefie kontaktu. Osłony maszyn z poliwęglanu w stanie nienaruszonym, wpisane do rejestru szkła/tworzyw.",
    correctAction: "Osłony całe, brak spękań, rejestr aktualny.",
    deviationAction: "Uruchomienie procedury pęknięcia szkła/plastiku, zatrzymanie linii, inspekcja i kwarantanna partii."
  }
];

let currentFaqCategory = 'ALL';

function openChecklistKnowledgeBase() {
  const modal = document.getElementById('checklistFaqModal');
  if (modal) {
    modal.classList.remove('hidden');
    renderFaqList();
  }
}

function closeChecklistKnowledgeBase() {
  const modal = document.getElementById('checklistFaqModal');
  if (modal) {
    modal.classList.add('hidden');
  }
}

function setFaqCategory(category, btnElement) {
  currentFaqCategory = category;
  document.querySelectorAll('.faq-chip').forEach(btn => {
    btn.className = 'faq-chip px-4 py-2 rounded-xl text-xs font-bold transition-all bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-700 border border-slate-700/50';
  });
  if (btnElement) {
    btnElement.className = 'faq-chip px-4 py-2 rounded-xl text-xs font-bold transition-all bg-emerald-500 text-slate-950 font-black shadow-lg shadow-emerald-500/20 border border-emerald-400';
  }
  filterFaqItems();
}

function getCategoryBadgeStyle(cat) {
  switch(cat) {
    case 'CCP':
      return 'bg-rose-500/10 text-rose-400 border border-rose-500/30';
    case 'GMP':
      return 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30';
    case 'FOREIGN_MATTER':
      return 'bg-amber-500/10 text-amber-300 border border-amber-500/30';
    default:
      return 'bg-slate-800 text-slate-300 border border-slate-700';
  }
}

function renderFaqList(items = CHECKLIST_GUIDELINES) {
  const container = document.getElementById('faqContainer');
  if (!container) return;

  if (items.length === 0) {
    container.innerHTML = `
      <div class="text-center py-12 text-slate-500 text-sm">
        <svg class="w-10 h-10 mx-auto text-slate-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        Brak pasujących kryteriów dla wpisanej frazy.
      </div>
    `;
    return;
  }

  container.innerHTML = items.map(item => `
    <div class="border border-slate-800/80 hover:border-slate-700 rounded-2xl overflow-hidden bg-slate-900/60 backdrop-blur-sm transition shadow-sm mb-3">
      <div onclick="toggleFaqAccordion('${item.id}')" class="p-4 bg-slate-850/40 hover:bg-slate-800/50 cursor-pointer flex justify-between items-center select-none gap-3">
        <div class="flex items-center space-x-3 min-w-0">
          <span class="px-2.5 py-1 text-[10px] font-black rounded-lg tracking-wider uppercase flex-shrink-0 ${getCategoryBadgeStyle(item.category)}">
            ${item.categoryLabel || item.category}
          </span>
          <span class="text-xs sm:text-sm font-bold text-slate-200 truncate">${item.title}</span>
        </div>
        <div class="flex items-center space-x-3 flex-shrink-0">
          <span class="text-[11px] text-slate-400 font-mono hidden md:inline bg-slate-950/60 px-2.5 py-1 rounded-lg border border-slate-800">${item.ifsClause}</span>
          <div id="icon-box-${item.id}" class="w-7 h-7 rounded-lg bg-slate-800/80 flex items-center justify-center text-slate-400 transition-transform duration-200">
            <svg id="icon-${item.id}" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </div>

      <div id="content-${item.id}" class="hidden p-5 border-t border-slate-800/60 text-xs space-y-4 bg-slate-950/50">
        <div class="text-slate-300 font-medium bg-slate-900/80 p-3.5 rounded-xl border border-slate-800 flex items-start space-x-2">
          <span class="text-emerald-400 font-black text-sm leading-none">„</span>
          <p class="leading-relaxed text-slate-200">${item.question}</p>
        </div>
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          <div class="bg-emerald-950/20 p-4 rounded-xl border border-emerald-500/20">
            <p class="font-black text-emerald-400 uppercase tracking-wider text-[10px] mb-1.5 flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
              Kryterium Zgodności (Standard)
            </p>
            <p class="text-slate-300 leading-relaxed">${item.criteria}</p>
            <div class="mt-3 pt-2.5 border-t border-emerald-500/10 text-emerald-300">
              <strong class="text-white">Stan pożądany:</strong> ${item.correctAction}
            </div>
          </div>

          <div class="bg-rose-950/20 p-4 rounded-xl border border-rose-500/20">
            <p class="font-black text-rose-400 uppercase tracking-wider text-[10px] mb-1.5 flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-rose-400"></span>
              Odchylenie & Postępowanie Korekcyjne
            </p>
            <p class="text-slate-300 leading-relaxed">${item.deviationAction}</p>
            <div class="mt-3 pt-2.5 border-t border-rose-500/10 text-rose-300">
              <strong class="text-white">Wymóg audytowy:</strong> ${item.ifsClause}
            </div>
          </div>
        </div>
      </div>
    </div>
  `).join('');
}

function toggleFaqAccordion(id) {
  const content = document.getElementById(`content-${id}`);
  const icon = document.getElementById(`icon-box-${id}`);
  if (!content) return;
  const isHidden = content.classList.contains('hidden');
  content.classList.toggle('hidden', !isHidden);
  if (icon) {
    icon.classList.toggle('rotate-180', isHidden);
    icon.classList.toggle('bg-emerald-500/20', isHidden);
    icon.classList.toggle('text-emerald-300', isHidden);
  }
}

function filterFaqItems() {
  const input = document.getElementById('faqSearchInput');
  if (!input) return;
  const search = input.value.toLowerCase();
  const filtered = CHECKLIST_GUIDELINES.filter(item => {
    const matchCat = (currentFaqCategory === 'ALL' || item.category === currentFaqCategory);
    const matchSearch = item.title.toLowerCase().includes(search) || 
                        item.question.toLowerCase().includes(search) || 
                        item.criteria.toLowerCase().includes(search) ||
                        item.ifsClause.toLowerCase().includes(search);
    return matchCat && matchSearch;
  });
  renderFaqList(filtered);
}
