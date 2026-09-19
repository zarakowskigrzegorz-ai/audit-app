import urllib.request
import json
import time

def run_dialogue(model_name: str, user_steps: list):
    print(f"\n=======================================================")
    print(f"🤖 TEST MODELU: {model_name}")
    print(f"=======================================================")
    
    system_prompt = (
        "Jesteś profesjonalnym audytorem wiodącym IFS Food v8, BRCGS Food Safety v9 oraz HACCP dla przemysłu spożywczego. "
        "Działasz jako inteligentny Field Co-Pilot audytora na hali produkcyjnej. "
        "ZASADY WYWIADU AUDYTORSKIEGO:\n"
        "1. Prowadzisz dociekliwy, wieloetapowy dialog w czystym, profesjonalnym języku polskim (Markdown).\n"
        "2. Najpierw ustalasz strefę technologiczną i nadzorowane w niej punkty kontrolne (CCP/oPRP).\n"
        "3. Następnie ustalasz charakter wady i pytasz o kontakt ze strugą produktu.\n"
        "4. Ściśle rozróżniasz usterki BHP (np. awaria E-STOP, osłony napędu -> procedura LOTO/UR, BRAK blokady jakościowej żywności HOLD LOT) "
        "od zagrożeń jakościowych żywności (ciała obce, alergeny, mikrobiologia, awaria detektora metali -> HOLD LOT).\n"
        "5. Odpowiedzi formuluj w punktach, wyciągaj logiczne wnioski techniczne i zadawaj pytania pogłębiające bez powtarzania pytań."
    )
    
    messages = [{"role": "system", "content": system_prompt}]
    
    for i, step in enumerate(user_steps):
        print(f"\n👤 [Audytor - Krok {i+1}]: {step}")
        messages.append({"role": "user", "content": step})
        
        payload = {
            "model": model_name,
            "messages": messages,
            "stream": False,
            "options": {
                "temperature": 0.1,
                "top_p": 0.8,
                "repeat_penalty": 1.2
            }
        }
        
        req = urllib.request.Request(
            "http://127.0.0.1:11434/api/chat",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )
        
        t0 = time.time()
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                dt = round(time.time() - t0, 2)
                reply = data.get("message", {}).get("content", "").strip()
                messages.append({"role": "assistant", "content": reply})
                print(f"🤖 [Asystent - {dt}s]:\n{reply}")
        except Exception as e:
            print(f"❌ Błąd: {e}")
            break

# SCENARIUSZ TESTOWY 1: Awaria detektora metali (Jakość / CCP1 -> HOLD LOT)
scenariusz_ccp = [
    "mamy awarię na linii",
    "strefa pakowania pierwotnego, detektor metali CCP1",
    "detektor nie odrzucił wzorca testowego Non-Fe 2.0mm",
    "tak, około 40 opakowań zjechało do kartonowania zanim zatrzymano taśmę"
]

run_dialogue("qwen2.5:7b-instruct", scenariusz_ccp)
