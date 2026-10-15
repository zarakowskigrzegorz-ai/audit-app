// ============================================================
// MODUŁ ROZPOZNAWANIA MOWY (SPEECH-TO-TEXT / WEB SPEECH API)
// Obsługuje ciągłe dyktowanie uwag audytowych bezpośrednio do pól formularza
// ============================================================

(function() {
    window.toggleSpeechToText = function(targetElementId, btnElement) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            alert("Twoja przeglądarka nie obsługuje wbudowanego rozpoznawania mowy (Web Speech API).\nAby dyktować uwagi głosem w języku polskim, skorzystaj z przeglądarki Google Chrome, Microsoft Edge lub Safari.");
            return;
        }

        const targetInput = document.getElementById(targetElementId);
        if (!targetInput) return;

        // Jeśli aktualnie nagrywamy to pole -> zatrzymaj
        if (window.currentActiveRecognition && window.currentRecognitionTargetId === targetElementId) {
            window.currentActiveRecognition.stop();
            return;
        }

        // Jeśli nagrywaliśmy inne pole -> zatrzymaj tamto
        if (window.currentActiveRecognition) {
            try { window.currentActiveRecognition.stop(); } catch(e) {}
        }

        const recognition = new SpeechRecognition();
        recognition.lang = 'pl-PL';
        recognition.interimResults = true;
        recognition.continuous = true; // Ciągłe dyktowanie

        window.currentActiveRecognition = recognition;
        window.currentRecognitionTargetId = targetElementId;

        const existingVal = targetInput.value.trim();
        const baseText = existingVal ? existingVal + ' ' : '';
        let finalTranscript = '';

        // Automatyczny timer bezpieczeństwa na 90 sekund ciągłego mówienia
        const maxDurationTimer = setTimeout(() => {
            if (window.currentActiveRecognition === recognition) {
                recognition.stop();
            }
        }, 90000);

        recognition.onstart = function() {
            if (btnElement) {
                btnElement.className = "absolute right-1.5 top-1.5 w-6 h-6 rounded-md border border-rose-500 bg-rose-950 text-rose-400 flex items-center justify-center text-xs animate-pulse cursor-pointer shadow-md shadow-rose-500/40";
                btnElement.innerHTML = '<i class="fas fa-microphone text-rose-400"></i>';
                btnElement.title = "Trwa ciągłe nagrywanie... Mów uwagę (np. 'jest uszkodzenie w tym miejscu'). Kliknij mikrofon, aby zakończyć.";
            }
            targetInput.classList.add('ring-2', 'ring-rose-500/50', 'border-rose-500');
        };

        recognition.onresult = function(event) {
            let interimTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript + ' ';
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }
            const spoken = (finalTranscript + interimTranscript).trim();
            targetInput.value = (baseText + spoken).trim();
            targetInput.dispatchEvent(new Event('input'));
        };

        recognition.onerror = function(event) {
            console.warn('Błąd rozpoznawania mowy:', event.error);
            if (event.error === 'not-allowed') {
                alert('Dostęp do mikrofonu został zablokowany. Włącz uprawnienia mikrofonu w przeglądarce.');
            }
        };

        recognition.onend = function() {
            clearTimeout(maxDurationTimer);
            window.currentActiveRecognition = null;
            window.currentRecognitionTargetId = null;
            targetInput.classList.remove('ring-2', 'ring-rose-500/50', 'border-rose-500');
            if (btnElement) {
                btnElement.className = "absolute right-1.5 top-1.5 w-6 h-6 rounded-md bg-slate-900 border border-slate-700 hover:border-cyan-500 text-cyan-400 hover:text-white flex items-center justify-center text-xs transition-all cursor-pointer shadow-sm";
                btnElement.innerHTML = '<i class="fas fa-microphone"></i>';
                btnElement.title = "Podyktuj uwagę bezpośrednio do ramki (zamiana głosu na tekst)";
            }
        };

        try {
            recognition.start();
        } catch (e) {
            console.warn('Błąd uruchomienia dyktowania:', e);
        }
    };
})();
