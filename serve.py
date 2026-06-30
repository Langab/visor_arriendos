#!/usr/bin/env python3
"""
Servidor local opcional para el visor.

El visor funciona abriendo viewer/index.html directamente (los datos están en
viewer/data.js, sin fetch). Pero si prefieres servirlo por HTTP:

    python serve.py      ->  http://localhost:8000/viewer/

Útil si quieres compartirlo en tu red local o evitar restricciones del navegador.
"""
import http.server
import os
import socketserver
import webbrowser

PORT = 8000
os.chdir(os.path.dirname(os.path.abspath(__file__)))

handler = http.server.SimpleHTTPRequestHandler
with socketserver.TCPServer(("", PORT), handler) as httpd:
    url = f"http://localhost:{PORT}/viewer/"
    print(f"Visor en {url}  (Ctrl+C para detener)")
    try:
        webbrowser.open(url)
    except Exception:
        pass
    httpd.serve_forever()
