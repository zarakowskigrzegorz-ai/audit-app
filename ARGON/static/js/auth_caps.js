/**
 * auth_caps.js - Obsługa logowania 3D Flip (Browar Wielka Sowa style)
 * Dla kafelków Key User (Manager) i Audytor Operacyjny
 */

(function() {
    'use strict';

    /**
     * Przełącz obrót kafelka (obsługa kliknięcia i tapnięcia na tablecie)
     */
    window.toggleAuthCap = function(role, ev) {
        if (ev && ev.target && ev.target.closest('input, button, select, a')) {
            return;
        }

        const managerCap = document.getElementById('cap-auth-manager');
        const auditorCap = document.getElementById('cap-auth-auditor');
        const targetCap = role === 'MANAGER' ? managerCap : auditorCap;
        const otherCap = role === 'MANAGER' ? auditorCap : managerCap;

        if (!targetCap) return;

        // Zamknij drugi kafel
        if (otherCap) {
            otherCap.classList.remove('bws-active', 'bws-focused');
        }

        const isCurrentlyActive = targetCap.classList.contains('bws-active') || targetCap.classList.contains('bws-focused');

        if (isCurrentlyActive) {
            targetCap.classList.remove('bws-active', 'bws-focused');
        } else {
            targetCap.classList.add('bws-active');
            // Auto-focus na pole PIN po animacji
            setTimeout(() => {
                const inputId = role === 'MANAGER' ? 'auth-pin-manager' : 'auth-pin-auditor';
                const inputEl = document.getElementById(inputId);
                if (inputEl) {
                    inputEl.focus();
                }
            }, 180);
        }
    };

    /**
     * Zdarzenia focus / blur na polu PIN zapobiegające zwinięciu kapsla
     */
    window.onAuthPinFocus = function(role) {
        const capId = role === 'MANAGER' ? 'cap-auth-manager' : 'cap-auth-auditor';
        const cap = document.getElementById(capId);
        if (cap) {
            cap.classList.add('bws-focused');
        }
    };

    window.onAuthPinBlur = function(role) {
        const inputId = role === 'MANAGER' ? 'auth-pin-manager' : 'auth-pin-auditor';
        const inputEl = document.getElementById(inputId);
        const capId = role === 'MANAGER' ? 'cap-auth-manager' : 'cap-auth-auditor';
        const cap = document.getElementById(capId);

        // Jeśli pole jest puste, zdejmij bws-focused po krótkim opóźnieniu
        if (cap && inputEl && !inputEl.value.trim()) {
            setTimeout(() => {
                if (document.activeElement !== inputEl) {
                    cap.classList.remove('bws-focused');
                }
            }, 250);
        }
    };

    window.onAuthPinKeyDown = function(role, ev) {
        if (ev.key === 'Enter') {
            window.submitAuthPin(role);
        }
    };

    /**
     * Wysłanie formularza logowania z obróconego kafelka
     */
    window.submitAuthPin = async function(role) {
        const inputId = role === 'MANAGER' ? 'auth-pin-manager' : 'auth-pin-auditor';
        const inputEl = document.getElementById(inputId);
        const pin = inputEl ? inputEl.value.trim() : '';

        if (!pin) {
            if (inputEl) {
                inputEl.classList.add('ring-2', 'ring-rose-500', 'animate-pulse');
                setTimeout(() => inputEl.classList.remove('ring-2', 'ring-rose-500', 'animate-pulse'), 1500);
            }
            alert("⚠️ Wprowadź kod PIN!");
            return;
        }

        try {
            const payload = {
                pin: pin,
                expected_role: role
            };

            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                if (inputEl) {
                    inputEl.classList.add('ring-2', 'ring-rose-500');
                    setTimeout(() => inputEl.classList.remove('ring-2', 'ring-rose-500'), 2000);
                    inputEl.value = '';
                    inputEl.focus();
                }
                return alert("❌ " + (err.detail || "Nieprawidłowy kod PIN!"));
            }

            const user = await res.json();

            // Czyszczenie i zamykanie kapsli
            if (inputEl) inputEl.value = '';
            document.querySelectorAll('.bws-cap-auth').forEach(c => c.classList.remove('bws-active', 'bws-focused'));

            // Przekazanie do głównego silnika aplikacji
            if (typeof window.applyLoginUser === 'function') {
                window.applyLoginUser(user);
            } else {
                console.warn('applyLoginUser is not available on window, falling back to reload or state update.');
            }

        } catch (err) {
            console.error('Auth request error:', err);
            alert("❌ Błąd połączenia z serwerem podczas autoryzacji.");
        }
    };

    /**
     * Zgodność wsteczna z poprzednimi wywołaniami openPinPrompt
     */
    window.openPinPrompt = function(role) {
        window.toggleAuthCap(role);
    };

    window.closePinPrompt = function() {
        document.querySelectorAll('.bws-cap-auth').forEach(c => c.classList.remove('bws-active', 'bws-focused'));
    };

    /**
     * Zamknij obrócone kapsle przy dotknięciu w tło (poza kafelkami)
     */
    document.addEventListener('pointerdown', (e) => {
        if (!e.target.closest('.bws-cap-viewport')) {
            const focusedEl = document.activeElement;
            const isTypingPin = focusedEl && (focusedEl.id === 'auth-pin-manager' || focusedEl.id === 'auth-pin-auditor') && focusedEl.value.trim().length > 0;
            if (!isTypingPin) {
                document.querySelectorAll('.bws-cap-auth.bws-active, .bws-cap-auth.bws-focused').forEach(el => {
                    el.classList.remove('bws-active', 'bws-focused');
                });
            }
        }
    });

})();
