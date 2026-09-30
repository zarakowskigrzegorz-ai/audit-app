#!/usr/bin/env python3
"""
Eksportuje system audytowy do pojedynczego, w pełni autonomicznego pliku HTML (Standalone).
Zawiera zagnieżdżone style CSS, skrypty JavaScript (w tym Mock API v11 z obsługą Agenta AI)
oraz grafiki wektorowe zakodowane w Base64.
"""
import os
import re
import base64

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
INDEX_PATH = os.path.join(BASE_DIR, "index.html")
OUTPUT_STANDALONE = os.path.join(BASE_DIR, "audit_app_standalone.html")
DEMO_STANDALONE = os.path.join(BASE_DIR, "EKSPORT_WWW_DEMO", "audit_app_standalone.html")

def export_standalone():
    with open(INDEX_PATH, "r", encoding="utf-8") as f:
        html = f.read()

    # 1. Zagnieżdżanie styli CSS (static/css/...)
    def inline_css(match):
        rel_path = match.group(1).split("?")[0]
        full_path = os.path.join(BASE_DIR, rel_path)
        if os.path.exists(full_path):
            with open(full_path, "r", encoding="utf-8") as cf:
                css_content = cf.read()
            return f"<style>/* Inlined: {rel_path} */\n{css_content}\n</style>"
        return match.group(0)

    html = re.sub(r'<link\s+rel=[\'"]stylesheet[\'"]\s+href=[\'"](static/css/[^\'"]+)[\'"]\s*/?>', inline_css, html)

    # 2. Zagnieżdżanie grafik SVG do data:image/svg+xml;base64,...
    def inline_images(match):
        rel_path = match.group(1).split("?")[0]
        full_path = os.path.join(BASE_DIR, rel_path)
        if os.path.exists(full_path):
            with open(full_path, "rb") as img_f:
                b64 = base64.b64encode(img_f.read()).decode("utf-8")
            mime = "image/svg+xml" if rel_path.endswith(".svg") else "image/png"
            return f"data:{mime};base64,{b64}"
        return match.group(0)

    html = re.sub(r'(static/img/[^\'")\s]+)', inline_images, html)

    # 3. Zagnieżdżanie skryptów JS (static/...)
    def inline_js(match):
        rel_path = match.group(1).split("?")[0]
        full_path = os.path.join(BASE_DIR, rel_path)
        if os.path.exists(full_path):
            with open(full_path, "r", encoding="utf-8") as jf:
                js_content = jf.read()
            safe_js = js_content.replace("</script>", "<\\/script>")
            return f"<script>/* Inlined: {rel_path} */\n{safe_js}\n</script>"
        return match.group(0)

    html = re.sub(r'<script\s+src=[\'"](static/[^\'"]+\.js[^\'"]*)[\'"]><\/script>', inline_js, html)

    # 4. Zapisanie autonomicznego pliku HTML w głównym katalogu oraz w katalogu demo
    with open(OUTPUT_STANDALONE, "w", encoding="utf-8") as f_out:
        f_out.write(html)

    with open(DEMO_STANDALONE, "w", encoding="utf-8") as f_demo:
        f_demo.write(html)

    size_kb = len(html.encode("utf-8")) / 1024
    print(f"✅ Wygenerowano audit_app_standalone.html ({size_kb:.1f} KB)")
    print(f"   -> {OUTPUT_STANDALONE}")
    print(f"   -> {DEMO_STANDALONE}")

if __name__ == "__main__":
    export_standalone()
