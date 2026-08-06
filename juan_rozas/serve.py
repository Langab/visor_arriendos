#!/usr/bin/env python3
"""
Servidor local opcional para el visor Juan Rozas.

El visor funciona abriendo viewer/index.html directamente (los datos están en
viewer/data.js, sin fetch). Pero si prefieres servirlo por HTTP:

    python serve.py      ->  http://localhost:8002/viewer/

(Puerto 8002 para poder correrlo junto al principal (8000) y Área Gris (8001).)
"""
import http.server
import os
import socketserver
import webbrowser

PORT = 8002
os.chdir(os.path.dirname(os.path.abspath(__file__)))

handler = http.server.SimpleHTTPRequestHandler
with socketserver.TCPServer(("", PORT), handler) as httpd:
    url = f"http://localhost:{PORT}/viewer/"
    print(f"Visor Juan Rozas en {url}  (Ctrl+C para detener)")
    try:
        webbrowser.open(url)
    except Exception:
        pass
    httpd.serve_forever()
