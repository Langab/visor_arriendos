"""
Distancia a la estación de Metro más cercana.

No requiere scraping: tenemos lat/lng de cada propiedad y aquí van las
coordenadas de las estaciones del Metro de Santiago en la zona de búsqueda
(Líneas 1, 5, 3 y 6, sectores Providencia / Santiago Centro / Ñuñoa).
Se calcula la distancia en metros (haversine) a la más cercana.
"""
from __future__ import annotations

import math

# (nombre, línea, lat, lng) — coordenadas aproximadas (±100 m), suficientes
# para ordenar y filtrar por cercanía.
ESTACIONES = [
    ("Baquedano", "L1/L5", -33.4366, -70.6347),
    ("Salvador", "L1", -33.4266, -70.6281),
    ("Manuel Montt", "L1", -33.4275, -70.6173),
    ("Pedro de Valdivia", "L1", -33.4259, -70.6106),
    ("Los Leones", "L1/L6", -33.4216, -70.6034),
    ("Tobalaba", "L1/L4", -33.4180, -70.6018),
    ("Universidad Católica", "L1", -33.4404, -70.6406),
    ("Santa Lucía", "L1", -33.4408, -70.6432),
    ("Universidad de Chile", "L1", -33.4407, -70.6486),
    ("La Moneda", "L1", -33.4429, -70.6539),
    ("Parque Bustamante", "L5", -33.4429, -70.6306),
    ("Santa Isabel", "L5", -33.4503, -70.6310),
    ("Irarrázaval", "L5/L3", -33.4560, -70.6236),
    ("Bellas Artes", "L5", -33.4366, -70.6418),
    ("Plaza de Armas", "L5/L3", -33.4378, -70.6506),
    ("Ñuble", "L5/L6", -33.4694, -70.6300),
    ("Inés de Suárez", "L6", -33.4287, -70.5953),
    ("Ñuñoa", "L3/L6", -33.4555, -70.5972),
    ("Bío Bío", "L6", -33.4663, -70.6379),
    ("Franklin", "L6/L2", -33.4699, -70.6447),
    ("Parque Almagro", "L3", -33.4575, -70.6470),
    ("Matta", "L3", -33.4631, -70.6440),
    ("Chile España", "L3", -33.4561, -70.6121),
]


def _haversine_m(lat1, lng1, lat2, lng2) -> float:
    R = 6_371_000  # m
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def estacion_mas_cercana(lat: float, lng: float):
    """Devuelve (nombre, linea, distancia_m_redondeada) de la estación más cercana."""
    mejor = None
    for nombre, linea, elat, elng in ESTACIONES:
        d = _haversine_m(lat, lng, elat, elng)
        if mejor is None or d < mejor[2]:
            mejor = (nombre, linea, d)
    return mejor[0], mejor[1], int(round(mejor[2]))
