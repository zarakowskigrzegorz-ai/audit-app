#!/bin/bash
# 1. Weryfikacja składni Pythona
python3 -m py_compile main.py 2>/dev/null
PY_STATUS=$?

# 2. Weryfikacja składni JavaScript w index.html



echo "var window = { addEventListener: function() {} }; var document = { addEventListener: function() {} };" > /tmp/check.js
sed -n '/<script>/,/<\/script>/p' index.html | sed 's/<script>//g' | sed 's/<\/script>//g' >> /tmp/check.js
/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -e "load('/tmp/check.js')" 2>/dev/null



JS_STATUS=$?
rm -f /tmp/check.js

# 3. Warunkowy commit
if [ $PY_STATUS -eq 0 ] && [ $JS_STATUS -eq 0 ]; then
  git add index.html main.py .clinerules
  git commit -m "AUTO-STABLE: $(date +'%Y-%m-%d %H:%M:%S')"
  echo "✅ Składnia poprawna. Stan bezpiecznie zapisany w Git."
  exit 0
else
  echo "❌ BŁĄD SKŁADNI! Zmiany odrzucone. Cofam pliki do stabilnego stanu..."
  git checkout index.html
  exit 1
fi
