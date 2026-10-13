/* ===================================================================
   Visor de Arriendos — lógica de UI
   Búsqueda: 3 dormitorios (o 2D amplio) · ≤ $800.000 total · eje
   Bustamante–Manuel Montt. Misma base que el visor de Área Gris.
   Vistas: Lista · Mapa · Métricas · Ofertas · Día a día · Método.
   Favoritas y contactadas quedan en el navegador (localStorage), con las
   mismas claves de siempre (arriendos_*).
   Todo texto que viene de los portales pasa por esc() y todo link por
   urlOk(): los avisos son contenido de terceros.
   =================================================================== */
(() => {
  "use strict";

  const LATEST = Array.isArray(window.LISTINGS) ? window.LISTINGS.slice() : [];
  let LISTINGS = LATEST.slice();
  const META = window.META || {};

  // ---------- helpers ----------
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
  const urlOk = (u) => {
    try { const x = new URL(String(u || ""), location.href); return /^https?:$/.test(x.protocol) ? x.href : ""; }
    catch (e) { return ""; }
  };
  const n0 = (n) => (typeof n === "number" && isFinite(n) ? n : null);
  const clp = (n) => (n0(n) == null ? "—" : "$" + Math.round(n).toLocaleString("es-CL"));
  const miles = (n) => Math.round(n).toLocaleString("es-CL");
  const dist = (m) => (m >= 1000 ? (m / 1000).toLocaleString("es-CL", { maximumFractionDigits: 1 }) + " km" : m + " m");
  const ico = (n) => `<svg class="i" aria-hidden="true"><use href="#i-${n}"/></svg>`;
  const FUENTE_NOMBRE = {
    portalinmobiliario: "Portal Inmob.", chilepropiedades: "Chilepropiedades",
    yapo: "Yapo", toctoc: "TocToc", goplaceit: "GoPlaceIt", facebook_marketplace: "Facebook",
  };
  const fmtDorm = (d) => (d == null ? null : d === 0 ? "Studio" : d + "D");
  // edificio con varias tipologías: "1–3D" (el precio "desde" es de la más chica)
  const dormTxt = (l) => (l.rango_tipologias && l.dormitorios_min != null && l.dormitorios_min !== l.dormitorios
    ? `${l.dormitorios_min}–${l.dormitorios}D` : fmtDorm(l.dormitorios));

  // ---------- estado persistido (localStorage es una fuente más: se valida) ----------
  const leerSet = (k) => {
    try {
      const v = JSON.parse(localStorage.getItem(k) || "[]");
      return new Set(Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.length < 80) : []);
    } catch (e) { return new Set(); }
  };
  const guardarSet = (k, s) => { try { localStorage.setItem(k, JSON.stringify([...s])); } catch (e) { /* modo privado */ } };

  // ===================================================================
  // La búsqueda
  // ===================================================================
  const SUP_2D_AMPLIO = 68;   // config.SUPERFICIE_MIN_2D_M2: un 2D así sirve con oficina
  const CFG = {
    ls: "arriendos_",
    match: "match perfecto",
    presupuesto: META.presupuesto_max || 800000,
    nivel: (l) => (l.dentro_presupuesto && l.calza_dormitorios ? "good"
      : l.dentro_presupuesto || (l.dormitorios || 0) >= 2 ? "mid" : "bad"),
    enRango: (l) => !!l.dentro_presupuesto,
    rangoTxt: "dentro de presupuesto",
    specs(l) {
      const s = [];
      const d = l.dormitorios;
      if (d != null) {
        if (d >= 3) s.push(["tag-ok", d + "D"]);
        else if (d === 2 && (l.superficie_m2 || 0) >= SUP_2D_AMPLIO) s.push(["tag-ok", "2D amplio"]);
        else s.push(["", fmtDorm(d)]);
      }
      if (l.banos) s.push(["", l.banos + "B"]);
      if (l.es_mariposa) s.push(["", "mariposa"]);
      if (l.amoblado === true) s.push(["tag-warn", "amoblado"]);
      return s;
    },
    funnel(L) {
      return [
        [L.length, "avisos totales"],
        [L.filter((x) => x.dentro_presupuesto).length, `≤ ${clp(this.presupuesto)} total`],
        [L.filter((x) => (x.dormitorios || 0) >= 3).length, "3+ dormitorios"],
        [L.filter((x) => x.en_barrio_objetivo).length, "en barrio objetivo"],
        [L.filter((x) => x.match_perfecto).length, "match perfecto", "hl"],
      ];
    },
    kpis(L) {
      return [
        [L.filter((x) => x.match_perfecto).length, "Match perfecto", "hl"],
        [META.nuevos_desde_anterior || 0, "Nuevas desde la última actualización"],
        [L.filter((x) => n0(x.metro_dist_m) != null && x.metro_dist_m <= 500).length, "A 500 m o menos del metro"],
        [L.filter((x) => x.admite_mascotas === true).length, "Admiten mascotas"],
      ];
    },
    bins: [500000, 650000, 800000],
    serieDorm: "Con 3+ dormitorios",
    vacio: "Prueba subiendo el total máximo o quitando algún filtro.",
  };

  const contactadas = leerSet(CFG.ls + "contactadas");
  const favoritos = leerSet(CFG.ls + "favoritos");
  const saveContact = () => guardarSet(CFG.ls + "contactadas", contactadas);
  const saveFav = () => guardarSet(CFG.ls + "favoritos", favoritos);

  const claseNivel = (l) => (l.match_perfecto ? "match" : CFG.nivel(l));
  const TXT_NIVEL = { match: "Match", good: "Calza", mid: "Parcial", bad: "Fuera" };

  // ===================================================================
  // Filtros: el estado se lee de los controles (los defaults viven en el HTML)
  // ===================================================================
  const RANGOS = ["f-precio", "f-arriendo", "f-gc", "f-metro", "f-sup"];
  const SEGS = ["f-dorm", "f-moneda"];
  const CHECKS = ["f-mascotas", "f-mariposa", "f-presupuesto",
    "f-barrio-obj", "f-ofertas", "f-nuevas", "f-bajaron", "f-favoritos",
    "f-ocultar-contactadas"];
  const CHIPS = { "f-comuna": "comuna", "f-barrio": "barrio", "f-fuente": "fuente" };

  const F = {};
  const segVal = (id) => { const b = $(`#${id} [aria-pressed="true"]`); return b ? b.dataset.v : ""; };
  const chipSet = (id) => new Set($$(`#${id} [aria-pressed="true"]`).map((c) => c.dataset.v));
  const rango = (id) => { const el = $("#" + id); return el ? { v: +el.value, max: +el.max, min: +el.min } : null; };
  const sinTope = (r) => !r || r.v >= r.max;
  const chk = (id) => !!($("#" + id) && $("#" + id).checked);

  function leerFiltros() {
    const r = Object.fromEntries(RANGOS.map((id) => [id, rango(id)]));
    F.texto = ($("#f-texto")?.value || "").trim().toLowerCase();
    F.totalMax = sinTope(r["f-precio"]) ? Infinity : r["f-precio"].v;
    F.arriendoMax = sinTope(r["f-arriendo"]) ? Infinity : r["f-arriendo"].v;
    F.gcMax = sinTope(r["f-gc"]) ? Infinity : r["f-gc"].v;
    F.metroMax = sinTope(r["f-metro"]) ? Infinity : r["f-metro"].v;
    F.supMin = r["f-sup"] ? r["f-sup"].v : 0;
    F.dorm = segVal("f-dorm"); F.moneda = segVal("f-moneda");
    F.antiguedad = $("#f-antiguedad")?.value || "";
    F.orden = $("#f-orden")?.value || "relevancia";
    for (const [id, campo] of Object.entries(CHIPS)) F[campo] = chipSet(id);
    for (const id of CHECKS) F[id] = chk(id);
    F.match = $("#match-btn")?.getAttribute("aria-pressed") === "true";
  }

  // cuántos filtros se apartan de lo que trae la página por defecto (para la barra de abajo)
  function filtrosActivos() {
    let n = 0;
    if ($("#f-texto")?.value.trim()) n++;
    RANGOS.forEach((id) => { const el = $("#" + id); if (el && el.value !== el.defaultValue) n++; });
    SEGS.forEach((id) => { const b = $(`#${id} [aria-pressed="true"]`); if (b && !b.hasAttribute("data-default")) n++; });
    CHECKS.forEach((id) => { const el = $("#" + id); if (el && el.checked !== el.defaultChecked) n++; });
    const ant = $("#f-antiguedad"); if (ant && ant.value) n++;
    Object.keys(CHIPS).forEach((id) => { n += $$(`#${id} [aria-pressed="true"]`).length; });
    return n;
  }

  function aplicar() {
    const out = LISTINGS.filter((l) => {
      if (F.match && !l.match_perfecto) return false;
      if (F.texto) {
        const h = `${l.titulo || ""} ${l.direccion || ""} ${l.barrio || ""}`.toLowerCase();
        if (!h.includes(F.texto)) return false;
      }
      const tot = n0(l.total_estimado_clp), arr = n0(l.precio_clp);
      if (F.totalMax < Infinity && tot != null && tot > F.totalMax) return false;
      if (F.arriendoMax < Infinity && arr != null && arr > F.arriendoMax) return false;
      if (F.gcMax < Infinity && tot != null && arr != null && tot - arr > F.gcMax) return false;
      if (F.dorm && (l.dormitorios || 0) < +F.dorm) return false;
      if (F.metroMax < Infinity && (l.metro_dist_m == null || l.metro_dist_m > F.metroMax)) return false;
      if (F.supMin > 0 && (l.superficie_m2 == null || l.superficie_m2 < F.supMin)) return false;
      if (F.moneda && (l.moneda || "CLP") !== F.moneda) return false;
      if (F["f-mariposa"] && !l.es_mariposa) return false;
      if (F["f-ofertas"] && l.etiqueta_precio !== "oferta") return false;
      if (F.antiguedad) {
        const a = l.antiguedad_anios;
        if (F.antiguedad === "dato" && a == null) return false;
        if (F.antiguedad === "30+" && !(a != null && a > 30)) return false;
        if (F.antiguedad === "20+" && !(a != null && a > 20)) return false;
        if (F.antiguedad === "0-10" && !(a != null && a < 10)) return false;
      }
      if (F.comuna.size && !F.comuna.has(l.comuna)) return false;
      if (F.barrio.size && !F.barrio.has(l.barrio)) return false;
      if (F.fuente.size && !F.fuente.has(l.fuente)) return false;
      if (F["f-presupuesto"] && !l.dentro_presupuesto) return false;
      if (F["f-barrio-obj"] && !l.en_barrio_objetivo) return false;
      if (F["f-mascotas"] && l.admite_mascotas !== true) return false;
      if (F["f-nuevas"] && !l.es_nuevo) return false;
      if (F["f-bajaron"] && !(l.precio_delta && l.precio_delta < 0)) return false;
      if (F["f-favoritos"] && !favoritos.has(l.id)) return false;
      if (F["f-ocultar-contactadas"] && contactadas.has(l.id)) return false;
      return true;
    });

    const tot = (x) => n0(x.total_estimado_clp) ?? 9e9;
    const ord = {
      relevancia: (a, b) => (b.relevancia || 0) - (a.relevancia || 0) || tot(a) - tot(b),
      "precio-asc": (a, b) => tot(a) - tot(b),
      "precio-desc": (a, b) => (n0(b.total_estimado_clp) || 0) - (n0(a.total_estimado_clp) || 0),
      "m2-desc": (a, b) => (b.superficie_m2 || 0) - (a.superficie_m2 || 0),
      "metro-asc": (a, b) => (a.metro_dist_m ?? 9e9) - (b.metro_dist_m ?? 9e9),
      "antiguedad-desc": (a, b) => (b.antiguedad_anios ?? -1) - (a.antiguedad_anios ?? -1),
      "oferta-asc": (a, b) => (a.delta_grupo_pct ?? 9e9) - (b.delta_grupo_pct ?? 9e9),
      "nuevas": (a, b) => (b.es_nuevo ? 1 : 0) - (a.es_nuevo ? 1 : 0) || (b.relevancia || 0) - (a.relevancia || 0),
    };
    out.sort(ord[F.orden] || ord.relevancia);
    return out;
  }

  // ===================================================================
  // Tarjetas
  // ===================================================================
  function tarjeta(l) {
    const cls = claseNivel(l);
    const esContact = contactadas.has(l.id);
    const esFav = favoritos.has(l.id);
    const card = document.createElement("article");
    card.className = "card" + (l.match_perfecto ? " es-match" : "") + (esContact ? " contactada" : "");
    card.dataset.id = l.id || "";
    const titulo = l.titulo || "Departamento en arriendo";

    const specs = CFG.specs(l);
    if (l.superficie_m2) specs.push(["", `${Math.round(l.superficie_m2)} m²`]);
    if (l.antiguedad_anios != null) specs.push(["", `${l.antiguedad_anios} años`]);
    if (l.admite_mascotas === true) specs.push(["", "mascotas ✓"]);
    if (l.barrio) specs.push(["tag-barrio", "◈ " + l.barrio]);
    if (l.metro_dist_m != null) specs.push(["tag-metro", `Ⓜ ${l.metro_cercano} · ${dist(l.metro_dist_m)}`]);

    const gcTxt = l.gastos_comunes_estimado
      ? `<span class="est" title="El aviso no publica gastos comunes: se estimaron">GC estimado</span>`
      : `GC ${clp(l.gastos_comunes_clp)}`;

    let precioCambio = "";
    if (l.precio_delta) {
      const baja = l.precio_delta < 0;
      const val = l.moneda === "UF" ? `${Math.abs(l.precio_delta)} UF` : clp(Math.abs(l.precio_delta));
      precioCambio = `<span class="precio-cambio ${baja ? "baja" : "sube"}">${baja ? "▼ bajó" : "▲ subió"} ${val}</span>`;
    }

    let grupoBadge = "";
    if (l.delta_grupo_pct != null && Math.abs(l.delta_grupo_pct) >= 10) {
      const of = l.delta_grupo_pct < 0;
      grupoBadge = `<div class="grupo-badge ${of ? "oferta" : "caro"}"
        title="Grupo: ${esc(l.grupo_carac)} (${l.grupo_n} avisos) · típico ${clp(l.precio_grupo_prom)}">
        ${of ? "◆" : "▲"} ${Math.abs(Math.round(l.delta_grupo_pct))}% ${of ? "bajo" : "sobre"} similares
        <small>(típico ${clp(l.precio_grupo_prom)})</small></div>`;
    }

    const img = urlOk(l.imagen);
    const url = urlOk(l.url);
    const gmaps = urlOk(l.google_maps);
    const precio = l.moneda === "UF" && l.precio_uf != null
      ? `<div class="price">UF ${esc(l.precio_uf)} <small>/mes</small></div>
         <div class="price-ref">≈ ${clp(l.precio_clp)} con la UF a ${clp(META.uf_valor)}</div>`
      : `<div class="price">${clp(l.precio_clp)} <small>/mes</small></div>`;

    card.innerHTML = `
      <div class="thumb">
        <div class="badges">
          <span class="badge-rel ${cls}">${TXT_NIVEL[cls]}</span>
          ${l.es_nuevo ? `<span class="nuevo-badge">Nuevo</span>` : ""}
        </div>
        <span class="src-chip">${esc(FUENTE_NOMBRE[l.fuente] || l.fuente)}</span>
        <button type="button" class="fav-btn" data-accion="fav" aria-pressed="${esFav}"
          aria-label="Favorita: ${esc(titulo)}"><span>${ico("star")}</span></button>
        ${img ? `<img loading="lazy" decoding="async" src="${esc(img)}" alt="">` : `<div class="ph"></div>`}
      </div>
      <div class="body">
        <div class="price-row"><div class="price-col">${precio}</div>${precioCambio}</div>
        <div class="total">Total <b>${clp(l.total_estimado_clp)}</b> · ${gcTxt}</div>
        ${grupoBadge}
        <h3 class="title">${esc(titulo)}</h3>
        <p class="addr">${esc(l.direccion || "")}</p>
        <div class="specs">${specs.map(([c, t]) => `<span class="spec ${c}">${esc(t)}</span>`).join("")}</div>
        <div class="actions">
          ${url ? `<a class="btn primary" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Ver aviso<span class="sr">: ${esc(titulo)} (abre el portal)</span> ${ico("ext")}</a>` : ""}
          ${gmaps ? `<a class="btn sq" href="${esc(gmaps)}" target="_blank" rel="noopener noreferrer" aria-label="Ver en Google Maps: ${esc(titulo)}" title="Ver en Google Maps">${ico("pin")}</a>` : ""}
          <button type="button" class="btn sq contact" data-accion="contact" aria-pressed="${esContact}"
            aria-label="Contactada: ${esc(titulo)}" title="Marcar como contactada">${ico("check")}</button>
        </div>
      </div>`;
    return card;
  }

  // lista por tandas: en el celular pintar 900 tarjetas de una vez se nota
  const LOTE = 36;
  let RES = [], mostrados = 0, observador = null;
  function pintarLista(items) {
    RES = items; mostrados = 0;
    const grid = $("#grid");
    grid.innerHTML = "";
    if (!items.length) {
      grid.innerHTML = `<div class="empty"><h3>Sin resultados</h3><p>${CFG.vacio}</p>
        <button type="button" class="btn" data-accion="limpiar">Limpiar filtros</button></div>`;
      return;
    }
    agregarLote(false);
  }
  function agregarLote(conFoco) {
    const grid = $("#grid");
    grid.querySelector(".mas")?.remove();
    const nuevos = RES.slice(mostrados, mostrados + LOTE).map(tarjeta);
    const frag = document.createDocumentFragment();
    nuevos.forEach((c) => frag.appendChild(c));
    grid.appendChild(frag);
    mostrados += nuevos.length;
    if (conFoco && nuevos[0]) nuevos[0].querySelector("a, button")?.focus();
    if (mostrados < RES.length) {
      const mas = document.createElement("div");
      mas.className = "mas";
      const quedan = RES.length - mostrados;
      mas.innerHTML = `<button type="button" class="btn" data-accion="mas">Ver ${Math.min(LOTE, quedan)} más · quedan ${quedan}</button>`;
      grid.appendChild(mas);
      if ("IntersectionObserver" in window) {
        observador?.disconnect();
        observador = new IntersectionObserver((ents) => {
          if (ents.some((e) => e.isIntersecting)) { observador.disconnect(); agregarLote(false); }
        }, { rootMargin: "700px 0px" });
        observador.observe(mas);
      }
    }
  }

  function montarAccionesGrid() {
    $("#grid").addEventListener("click", (e) => {
      const b = e.target.closest("[data-accion]");
      if (!b) return;
      const accion = b.dataset.accion;
      if (accion === "mas") return agregarLote(true);
      if (accion === "limpiar") return limpiar();
      const card = b.closest(".card");
      const id = card?.dataset.id;
      if (!id) return;
      if (accion === "fav") {
        favoritos.has(id) ? favoritos.delete(id) : favoritos.add(id);
        saveFav();
        b.setAttribute("aria-pressed", favoritos.has(id));
        montarStats();
        if (F["f-favoritos"]) render();
      } else if (accion === "contact") {
        contactadas.has(id) ? contactadas.delete(id) : contactadas.add(id);
        saveContact();
        b.setAttribute("aria-pressed", contactadas.has(id));
        card.classList.toggle("contactada", contactadas.has(id));
        if (F["f-ocultar-contactadas"]) render();
      }
    });
    // foto rota → placeholder (sin onerror en línea)
    document.addEventListener("error", (e) => {
      const t = e.target;
      if (t && t.tagName === "IMG" && t.closest(".thumb")) {
        const ph = document.createElement("div"); ph.className = "ph"; t.replaceWith(ph);
      } else if (t && t.tagName === "IMG" && t.closest(".pop")) t.remove();
    }, true);
  }

  // ===================================================================
  // Mapa (Leaflet)
  // ===================================================================
  let map, capa;
  function initMapa() {
    if (!window.L) { $("#map").innerHTML = `<div class="empty"><h3>No cargó el mapa</h3><p>Revisa la conexión y recarga la página.</p></div>`; return false; }
    map = L.map("map", { scrollWheelZoom: true }).setView([-33.443, -70.632], 14);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      { attribution: "© OpenStreetMap", maxZoom: 19 }).addTo(map);
    capa = L.layerGroup().addTo(map);
    return true;
  }
  function pinIcon(nv) {
    return L.divIcon({ className: "", html: `<div class="marker-pin ${nv}"></div>`, iconSize: [26, 26], iconAnchor: [13, 26], popupAnchor: [0, -24] });
  }
  const PRIORIDAD = { match: 5, good: 3, mid: 2, bad: 1, done: 0 };
  function pintarMapa(items) {
    if (!map && !initMapa()) return 0;
    capa.clearLayers();
    const conGeo = items.filter((l) => n0(l.lat) != null && n0(l.lng) != null);
    const bounds = [];
    conGeo.forEach((l) => {
      const nv = contactadas.has(l.id) ? "done" : claseNivel(l);
      const m = L.marker([l.lat, l.lng], { icon: pinIcon(nv), opacity: l.ubicacion_aprox ? 0.6 : 1, zIndexOffset: PRIORIDAD[nv] * 100, title: l.titulo || "" });
      const img = urlOk(l.imagen);
      const url = urlOk(l.url);
      const metro = l.metro_dist_m != null ? `<div class="pop-a">Ⓜ ${esc(l.metro_cercano)} a ${dist(l.metro_dist_m)}</div>` : "";
      const aprox = l.ubicacion_aprox ? `<div class="pop-aprox">Ubicación aproximada (centro de barrio o comuna)</div>` : "";
      const precio = l.moneda === "UF" && l.precio_uf != null ? "UF " + esc(l.precio_uf) : clp(l.precio_clp);
      m.bindPopup(`
        <div class="pop">${img ? `<img src="${esc(img)}" alt="">` : ""}
          <div class="pop-b">
            <div class="pop-price">${precio} <small>/mes · total ${clp(l.total_estimado_clp)}</small></div>
            <div class="pop-t">${esc(l.titulo || "Departamento")}</div>
            <div class="pop-a">${esc(l.direccion || "")}</div>${metro}${aprox}
            ${url ? `<a class="pop-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Ver aviso y fotos</a>` : ""}
          </div></div>`);
      m.addTo(capa);
      bounds.push([l.lat, l.lng]);
    });
    // el encuadre se centra en lo que sirve (match; si no hay, lo que calza)
    let utiles = conGeo.filter((l) => claseNivel(l) === "match" && !l.ubicacion_aprox);
    if (utiles.length < 5) utiles = conGeo.filter((l) => ["match", "good"].includes(claseNivel(l)) && !l.ubicacion_aprox);
    if (utiles.length >= 5 && utiles.length < conGeo.length) {
      bounds.length = 0;
      utiles.forEach((l) => bounds.push([l.lat, l.lng]));
    }
    // encuadre sin los extremos: una dirección mal ubicada en Puente Alto no
    // debe alejar todo el mapa (se recorta el 4% de cada borde)
    if (bounds.length >= 20) {
      const corte = (arr) => { const s = arr.slice().sort((a, b) => a - b), k = Math.floor(s.length * 0.04); return [s[k], s[s.length - 1 - k]]; };
      const [la0, la1] = corte(bounds.map((b) => b[0])), [ln0, ln1] = corte(bounds.map((b) => b[1]));
      map.fitBounds([[la0, ln0], [la1, ln1]], { padding: [30, 30], maxZoom: 16 });
    } else if (bounds.length) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    return conGeo.length;
  }

  // ===================================================================
  // Métricas
  // ===================================================================
  function barras(titulo, datos) {
    const max = Math.max(1, ...datos.map((d) => d[1]));
    const filas = datos.map(([k, v]) => `
      <div class="bar-row">
        <span class="bar-label" title="${esc(k)}">${esc(k)}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${(v / max) * 100}%"></span></span>
        <span class="bar-val">${v}</span>
      </div>`).join("");
    return `<div class="metric-card"><h3>${esc(titulo)}</h3>${filas}</div>`;
  }
  const kpi = (n, t, cls = "") => `<div class="kpi ${cls}"><b>${n}</b><span>${esc(t)}</span></div>`;
  function cuenta(arr, fn) {
    const m = {};
    arr.forEach((x) => { const k = fn(x) || "sin dato"; m[k] = (m[k] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }

  function pintarMetricas() {
    const L = LISTINGS;
    const b = CFG.bins;
    const t = (x) => n0(x.total_estimado_clp);
    const k = (v) => (v / 1000) + "k";
    const porPrecio = [
      ["≤ " + k(b[0]), L.filter((x) => t(x) != null && t(x) <= b[0]).length],
      [`${k(b[0])}–${k(b[1])}`, L.filter((x) => t(x) > b[0] && t(x) <= b[1]).length],
      [`${k(b[1])}–${k(b[2])}`, L.filter((x) => t(x) > b[1] && t(x) <= b[2]).length],
      ["> " + k(b[2]), L.filter((x) => t(x) > b[2]).length],
    ];
    const porMetro = [
      ["≤ 300 m", L.filter((x) => x.metro_dist_m != null && x.metro_dist_m <= 300).length],
      ["300–600 m", L.filter((x) => x.metro_dist_m > 300 && x.metro_dist_m <= 600).length],
      ["600 m–1 km", L.filter((x) => x.metro_dist_m > 600 && x.metro_dist_m <= 1000).length],
      ["> 1 km", L.filter((x) => x.metro_dist_m > 1000).length],
    ];
    const conAnt = L.filter((x) => x.antiguedad_anios != null);
    const porAnt = [
      ["Nuevo (<10)", conAnt.filter((x) => x.antiguedad_anios < 10).length],
      ["10–20", conAnt.filter((x) => x.antiguedad_anios >= 10 && x.antiguedad_anios <= 20).length],
      ["20–30", conAnt.filter((x) => x.antiguedad_anios > 20 && x.antiguedad_anios <= 30).length],
      ["+30 años", conAnt.filter((x) => x.antiguedad_anios > 30).length],
    ];
    const funnel = CFG.funnel(L).map(([n, txt, cls]) => `<div class="fn ${cls || ""}"><b>${n}</b><span>${esc(txt)}</span></div>`).join("");
    $("#metrics").innerHTML = `
      <div class="metrics-grid">
        <div class="metric-card wide">
          <h3>¿Cuántas se ajustan a lo que buscamos?</h3>
          <div class="funnel">${funnel}</div>
          <p class="tp-note">Cada paso cuenta solo lo que pasó el anterior. Foto del ${esc(fmtFecha(META.generado))}.</p>
        </div>
        <div class="kpis">${CFG.kpis(L).map(([n, txt, cls]) => kpi(n, txt, cls)).join("")}
          ${kpi(favoritos.size, "Tus favoritas")}${kpi(L.filter((x) => !x.gastos_comunes_estimado).length, "Con gastos comunes reales")}</div>
        ${tablaPrecios("Promedio por barrio", "barrio")}
        ${tablaPrecios("Promedio por comuna", "comuna")}
        ${barras("Total mensual estimado", porPrecio)}
        ${barras("Por formato", cuenta(L, (x) => fmtDorm(x.dormitorios)))}
        ${barras("Distancia al metro", porMetro)}
        ${barras("Por barrio objetivo", cuenta(L.filter((x) => x.barrio), (x) => x.barrio))}
        ${barras("Antigüedad (de los que tienen dato)", porAnt)}
      </div>`;
  }

  function promediosPor(campo) {
    const g = {};
    LISTINGS.forEach((l) => {
      if (!CFG.enRango(l)) return;
      const k = l[campo];
      if (!k) return;
      const tot = n0(l.total_estimado_clp), arr = n0(l.precio_clp);
      const x = (g[k] = g[k] || { total: 0, arr: 0, gc: 0, ngc: 0, n: 0 });
      x.total += tot || 0; x.arr += arr || 0;
      if (tot != null && arr != null) { x.gc += tot - arr; x.ngc++; }
      x.n++;
    });
    return Object.entries(g).map(([k, v]) => ({
      grupo: k, n: v.n, total: v.total / v.n, arr: v.arr / v.n, gc: v.ngc ? v.gc / v.ngc : null,
    })).sort((a, b) => b.total - a.total);
  }
  function tablaPrecios(titulo, campo) {
    const filas = promediosPor(campo);
    if (!filas.length) return "";
    const rows = filas.map((f) => `
      <tr><td class="tp-g">${esc(f.grupo)} <span class="tp-n">(${f.n})</span></td>
        <td>${clp(f.total)}</td><td class="tp-sub">${clp(f.arr)}</td>
        <td class="tp-sub">${f.gc != null ? clp(f.gc) : "—"}</td></tr>`).join("");
    return `<div class="metric-card"><h3>${esc(titulo)}</h3>
      <div class="tp-scroll"><table class="tp-table">
        <thead><tr><th scope="col"><span class="sr">Zona</span></th><th scope="col">Total</th><th scope="col">Arriendo</th><th scope="col">G. comunes</th></tr></thead>
        <tbody>${rows}</tbody></table></div>
      <p class="tp-note">Promedio de los avisos ${esc(CFG.rangoTxt)}. Más caro arriba.</p></div>`;
  }

  // ===================================================================
  // Ofertas — comparación contra similares
  // ===================================================================
  function filaOferta(l) {
    const of = l.delta_grupo_pct < 0;
    const specs = [fmtDorm(l.dormitorios), l.banos ? l.banos + "B" : null,
      l.superficie_m2 ? Math.round(l.superficie_m2) + " m²" : null, l.barrio || l.comuna].filter(Boolean).join(" · ");
    const url = urlOk(l.url);
    return `<a class="of-row" href="${esc(url || "#")}" target="_blank" rel="noopener noreferrer">
      <div class="of-info"><div class="of-title">${esc(l.titulo || "Departamento")}</div>
        <div class="of-specs">${esc(specs)} · típico ${clp(l.precio_grupo_prom)} (${l.grupo_n} avisos)</div></div>
      <div class="of-price"><b>${clp(l.precio_clp)}</b>
        <span class="of-delta ${of ? "oferta" : "caro"}">${of ? "▼" : "▲"} ${Math.abs(Math.round(l.delta_grupo_pct))}%</span></div></a>`;
  }
  function pintarOfertas() {
    const conDelta = LISTINGS.filter((l) => l.delta_grupo_pct != null);
    const ofertas = conDelta.filter((l) => l.etiqueta_precio === "oferta").sort((a, b) => a.delta_grupo_pct - b.delta_grupo_pct);
    const caros = conDelta.filter((l) => l.etiqueta_precio === "caro").sort((a, b) => b.delta_grupo_pct - a.delta_grupo_pct);
    const ofertasTop = ofertas.filter(CFG.enRango);
    const grupos = {};
    conDelta.forEach((l) => {
      const g = (grupos[l.grupo_carac] = grupos[l.grupo_carac] || { n: l.grupo_n, prom: l.precio_grupo_prom, min: l.precio_clp, max: l.precio_clp });
      g.min = Math.min(g.min, l.precio_clp); g.max = Math.max(g.max, l.precio_clp);
    });
    const filasGrupos = Object.entries(grupos).sort((a, b) => b[1].n - a[1].n).slice(0, 18)
      .map(([k, g]) => `<tr><td class="tp-g">${esc(k)} <span class="tp-n">(${g.n})</span></td>
        <td>${clp(g.prom)}</td><td class="tp-sub">${clp(g.min)}</td><td class="tp-sub">${clp(g.max)}</td></tr>`).join("");
    $("#ofertas").innerHTML = `
      <div class="metrics-grid">
        <div class="metric-card wide">
          <h3>¿Está caro o barato? Comparación contra similares</h3>
          <p class="tp-intro">Cada aviso se compara con el <b>arriendo típico (mediana) de su grupo</b>: misma zona,
            dormitorios, baños y tramo de m², con al menos 5 avisos. <b>Oferta</b> = 10% o más bajo su grupo;
            <b>caro</b> = 10% o más sobre. Se compara el arriendo sin gastos comunes. El detalle está en <b>Método</b>.</p>
          <div class="kpis" style="grid-template-columns:repeat(auto-fit,minmax(130px,1fr));margin-top:14px">
            ${kpi(conDelta.length, "avisos comparables")}${kpi(ofertas.length, "ofertas", "hl")}
            ${kpi(caros.length, "sobre precio")}${kpi(Object.keys(grupos).length, "grupos de características")}
          </div>
        </div>
        <div class="metric-card wide"><h3>Mejores ofertas dentro del presupuesto (${ofertasTop.length})</h3>
          ${ofertasTop.slice(0, 15).map(filaOferta).join("") || '<p class="ts-empty">Hoy no hay ofertas dentro del presupuesto.</p>'}</div>
        <div class="metric-card"><h3>Todas las ofertas (top 12)</h3>${ofertas.slice(0, 12).map(filaOferta).join("") || '<p class="ts-empty">—</p>'}</div>
        <div class="metric-card"><h3>Los más sobre precio (top 12)</h3>${caros.slice(0, 12).map(filaOferta).join("") || '<p class="ts-empty">—</p>'}</div>
        <div class="metric-card wide"><h3>Arriendo típico por grupo de características</h3>
          <div class="tp-scroll"><table class="tp-table">
            <thead><tr><th scope="col"><span class="sr">Grupo</span></th><th scope="col">Típico</th><th scope="col">Mín</th><th scope="col">Máx</th></tr></thead>
            <tbody>${filasGrupos}</tbody></table></div>
          <p class="tp-note">Grupos con más avisos primero.</p></div>
      </div>`;
  }

  // ===================================================================
  // Fechas: banner, foto histórica y análisis temporal
  // ===================================================================
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  function fmtFecha(f) {
    let m = /(\d{4})-(\d{2})-(\d{2})[_ ](\d{2}):?(\d{2})/.exec(f || "");
    if (m) return `${+m[3]} ${MESES[+m[2] - 1]} ${m[1]}, ${m[4]}:${m[5]}`;
    m = /(\d{4})-(\d{2})-(\d{2})/.exec(f || "");
    if (m) return `${+m[3]} ${MESES[+m[2] - 1]} ${m[1]}`;
    return f || "—";
  }
  const DIAS = () => (Array.isArray(META.fechas_disponibles) ? META.fechas_disponibles : []);
  function diasDesde(f) {
    const m = /(\d{4})-(\d{2})-(\d{2})/.exec(f || "");
    if (!m) return null;
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    return Math.round((hoy - d) / 864e5);
  }
  function tagsActualizacion() {
    const dd = diasDesde(META.generado);
    let t = "";
    if (dd != null && dd >= 2) t += `<span class="ub-tag vieja">Ojo: datos de hace ${dd} días</span>`;
    if (META.es_primera_foto) return t + `<span class="ub-tag">primera foto</span>`;
    if (META.nuevos_desde_anterior == null) return t;
    const n = META.nuevos_desde_anterior || 0, baja = META.bajaron_precio || 0;
    return t + `<span class="ub-tag nuevo">${n} nuevas</span>` + (baja ? `<span class="ub-tag baja">▼ ${baja} bajaron</span>` : "");
  }
  function montarBannerActualizacion() {
    const bar = $("#update-bar");
    const fechas = DIAS();
    if (fechas.length < 2) {
      bar.innerHTML = `<span>Datos del <b>${fmtFecha(META.generado)}</b></span><span id="ub-extra">${tagsActualizacion()}</span>`;
      return;
    }
    const opciones = fechas.map((f, i) => `<option value="${esc(f)}">${fmtFecha(f)}${i === 0 ? " (la más reciente)" : ""}</option>`).join("");
    bar.innerHTML = `<label for="f-fecha">Datos del</label>
      <select id="f-fecha" class="ub-select">${opciones}</select>
      <span id="ub-extra">${tagsActualizacion()}</span>`;
    $("#f-fecha").onchange = (e) => cargarDia(e.target.value);
  }
  function cargarScript(src) {
    return new Promise((res) => {
      const s = document.createElement("script");
      s.src = src; s.onload = () => res(true); s.onerror = () => res(false);
      document.body.appendChild(s);
    });
  }
  async function cargarHistoriaDia(dia) {
    window.HISTORIA = window.HISTORIA || {};
    if (dia === DIAS()[0]) return LATEST;
    if (!window.HISTORIA[dia] && /^\d{4}-\d{2}-\d{2}$/.test(dia)) await cargarScript("historia/" + dia + ".js");
    return Array.isArray(window.HISTORIA[dia]) ? window.HISTORIA[dia] : [];
  }
  async function cargarDia(fecha) {
    const esUltima = fecha === DIAS()[0];
    const datos = await cargarHistoriaDia(fecha);
    LISTINGS = esUltima ? LATEST.slice() : datos;
    construirChips();
    actualizarContadores();
    $("#ub-extra").innerHTML = esUltima ? tagsActualizacion()
      : `<span class="ub-tag viendo-pasado">Viendo la foto del ${fmtFecha(fecha)}</span>`;
    render();
  }
  function refrescarContadoresTemporales() {
    const set = (id, n) => { const el = $(id); if (el) el.textContent = n ? `(${n})` : ""; };
    set("#f-nuevas-n", LISTINGS.filter((l) => l.es_nuevo).length);
    set("#f-bajaron-n", LISTINGS.filter((l) => l.precio_delta && l.precio_delta < 0).length);
    set("#f-ofertas-n", LISTINGS.filter((l) => l.etiqueta_precio === "oferta").length);
  }

  function pintarTemporal() {
    const serie = Array.isArray(META.serie_temporal) ? META.serie_temporal : [];
    const dias = DIAS();
    const cont = $("#temporal");
    const fechasBar = serie.map((s) => String(s.fecha || "").replace("_", " "));
    const serieHTML = serie.length ? `
      <div class="metric-card wide"><h3>Evolución (cada barra es una actualización)</h3>
        ${miniSerie("Total de avisos", serie.map((s) => s.total), fechasBar)}
        ${miniSerie("Match", serie.map((s) => s.match_perfecto), fechasBar)}
        ${miniSerie(CFG.serieDorm, serie.map((s) => s.tres_dorms), fechasBar)}
        ${miniSerie("Total mediano", serie.map((s) => s.precio_mediano), fechasBar, true)}
      </div>` : "";
    if (dias.length <= 1) {
      cont.innerHTML = `<div class="metrics-grid"><div class="metric-card wide"><h3>Comparación entre días</h3>
        <p class="tp-intro">Por ahora hay una sola foto${dias[0] ? " (" + fmtFecha(dias[0]) + ")" : ""}. Con la
        actualización diaria se va sumando una por día y aquí aparecen los nuevos, los que bajaron y los que ya no están.</p>
        </div>${serieHTML}</div>`;
      return;
    }
    const opts = (sel) => dias.map((d) => `<option value="${esc(d)}" ${d === sel ? "selected" : ""}>${fmtFecha(d)}${d === dias[0] ? " (última)" : ""}</option>`).join("");
    cont.innerHTML = `<div class="metrics-grid">
      <div class="metric-card wide"><h3>Comparar dos días</h3>
        <div class="cmp-controls">
          <label>Día A <select id="cmp-a">${opts(dias[1])}</select></label>
          <span class="cmp-arrow" aria-hidden="true">→</span>
          <label>Día B <select id="cmp-b">${opts(dias[0])}</select></label>
        </div>
        <div id="cmp-result" aria-live="polite">Cargando…</div>
      </div>${serieHTML}</div>`;
    $("#cmp-a").onchange = actualizarComparacion;
    $("#cmp-b").onchange = actualizarComparacion;
    actualizarComparacion();
  }
  async function actualizarComparacion() {
    const a = $("#cmp-a").value, b = $("#cmp-b").value;
    $("#cmp-result").textContent = "Cargando…";
    const la = await cargarHistoriaDia(a);
    const lb = await cargarHistoriaDia(b);
    $("#cmp-result").innerHTML = renderComparacion(la, lb);
  }
  function renderComparacion(la, lb) {
    const mapA = {}; la.forEach((l) => (mapA[l.id] = l));
    const idsB = new Set(lb.map((l) => l.id));
    const nuevos = lb.filter((l) => !mapA[l.id]);
    const desap = la.filter((l) => !idsB.has(l.id));
    const nativo = (e) => (e.moneda === "UF" && e.precio_uf) ? ["UF", e.precio_uf] : ["CLP", e.precio_clp];
    const cambios = [];
    lb.forEach((l) => {
      const p = mapA[l.id]; if (!p) return;
      const [mA, pA] = nativo(p), [mB, pB] = nativo(l);
      if (mA === mB && pA && pB && pA !== pB) cambios.push({ ...l, delta: pB - pA, moneda: mB });
    });
    const bajas = cambios.filter((c) => c.delta < 0).sort((x, y) => x.delta - y.delta);
    const subidas = cambios.filter((c) => c.delta > 0).sort((x, y) => y.delta - x.delta);
    const dval = (l) => (l.moneda === "UF" ? `${Math.abs(l.delta).toFixed(1).replace(".0", "")} UF` : clp(Math.abs(l.delta)));
    const fila = (l, der, cls) => `<a class="ts-row" href="${esc(urlOk(l.url) || "#")}" target="_blank" rel="noopener noreferrer"><span class="ts-t">${esc(l.titulo || "Depto")}</span><span class="ts-d ${cls}">${der}</span></a>`;
    const lista = (arr, f) => (arr.length ? arr.slice(0, 10).map(f).join("") : `<p class="ts-empty">—</p>`);
    return `
      <div class="cmp-kpis">${kpi(la.length, "avisos día A")}${kpi(lb.length, "avisos día B")}
        ${kpi(nuevos.length, "Nuevos en B", "hl")}${kpi(desap.length, "Ya no están")}
        ${kpi(bajas.length, "Bajaron")}${kpi(subidas.length, "Subieron")}</div>
      <div class="cmp-lists">
        <div><h4>Nuevos en B (${nuevos.length})</h4>${lista(nuevos, (l) => fila(l, clp(l.total_estimado_clp || l.precio_clp), "nuevo"))}</div>
        <div><h4>Ya no están (${desap.length})</h4>${lista(desap, (l) => fila(l, clp(l.total_estimado_clp || l.precio_clp), "sube"))}</div>
        <div><h4>Bajaron de precio (${bajas.length})</h4>${lista(bajas, (l) => fila(l, "▼ " + dval(l), "baja"))}</div>
        <div><h4>Subieron de precio (${subidas.length})</h4>${lista(subidas, (l) => fila(l, "▲ " + dval(l), "sube"))}</div>
      </div>`;
  }
  function miniSerie(titulo, valores, fechas, money) {
    const max = Math.max(1, ...valores.filter((v) => n0(v) != null));
    const cols = valores.map((v, i) => {
      const h = n0(v) == null ? 0 : (v / max) * 100;
      const lbl = money ? (n0(v) == null ? "—" : Math.round(v / 1000) + "k") : (v ?? "—");
      return `<div class="ts-col" title="${esc(fechas[i])}: ${money ? clp(v) : lbl}">
        <span class="ts-val">${lbl}</span><span class="ts-bar" style="height:${Math.max(3, h)}%"></span>
        <span class="ts-x">${esc((fechas[i] || "").slice(5, 10))}</span></div>`;
    }).join("");
    return `<div class="ts-block"><div class="ts-title">${esc(titulo)}</div><div class="ts-scroll"><div class="ts-chart">${cols}</div></div></div>`;
  }

  // ===================================================================
  // Método (lo arma la página: cada modo trae su <template id="tpl-metodo">)
  // ===================================================================
  function pintarMetodo() {
    const tpl = $("#tpl-metodo");
    if (!tpl || $("#metodo").childElementCount) return;
    $("#metodo").appendChild(tpl.content.cloneNode(true));
    $$("#metodo [data-meta]").forEach((el) => {
      const k = el.dataset.meta;
      el.textContent = k === "generado" ? fmtFecha(META.generado) : String(META[k] ?? "—");
    });
  }

  // ===================================================================
  // Render principal
  // ===================================================================
  let vista = "lista";
  function render() {
    leerFiltros();
    const items = aplicar();
    const nMatch = items.filter((l) => l.match_perfecto).length;
    $("#count").innerHTML = `<b>${items.length}</b> ${items.length === 1 ? "propiedad" : "propiedades"} · <span class="n-match">${nMatch} ${esc(CFG.match)}</span>`;
    const verRes = $("#ver-resultados");
    if (verRes) verRes.textContent = items.length ? `Ver ${items.length} ${items.length === 1 ? "propiedad" : "propiedades"}` : "Sin resultados";
    const nAct = filtrosActivos();
    $("#dock-n").textContent = nAct || "";
    $("#abrir-filtros").setAttribute("aria-label", nAct ? `Filtros, ${nAct} activos` : "Filtros");

    if (vista === "metricas") return pintarMetricas();
    if (vista === "ofertas") return pintarOfertas();
    if (vista === "temporal") return pintarTemporal();
    if (vista === "metodo") return pintarMetodo();
    if (vista === "mapa") {
      const n = pintarMapa(items);
      if (n < items.length) $("#count").innerHTML += ` · ${n} en el mapa`;
      return;
    }
    pintarLista(items);
  }
  // los sliders y el texto disparan muchos eventos: un render por cuadro
  let pendiente = 0;
  const renderSuave = () => { cancelAnimationFrame(pendiente); pendiente = requestAnimationFrame(render); };

  // ===================================================================
  // Stats + contadores
  // ===================================================================
  function actualizarContadores() {
    const nMatch = LISTINGS.filter((l) => l.match_perfecto).length;
    $("#match-count").textContent = nMatch;
    $("#dock-match-n").textContent = nMatch;
    refrescarContadoresTemporales();
    montarStats();
  }
  function montarStats() {
    const total = LISTINGS.length;
    const match = LISTINGS.filter((l) => l.match_perfecto).length;
    $("#stats").innerHTML = `
      <div class="stat"><b>${total}</b><span>avisos</span></div>
      <div class="stat hl"><b>${match}</b><span>match</span></div>
      <div class="stat"><b>${favoritos.size}</b><span>favoritas</span></div>`;
  }

  // ===================================================================
  // Controles de filtro
  // ===================================================================
  const ETIQ = {
    "f-precio": (v, max) => (v >= max ? "sin límite" : clp(v)),
    "f-arriendo": (v, max) => (v >= max ? "sin límite" : clp(v)),
    "f-gc": (v, max) => (v >= max ? "sin límite" : clp(v)),
    "f-metro": (v, max) => (v >= max ? "sin límite" : dist(v)),
    "f-sup": (v) => (v > 0 ? v + " m²" : "sin mínimo"),
  };
  function etiquetarRango(id) {
    const el = $("#" + id), out = $(`#${id}-val`);
    if (!el || !out) return;
    const txt = ETIQ[id](+el.value, +el.max);
    out.textContent = txt;
    el.setAttribute("aria-valuetext", txt);
  }

  const valoresUnicos = (campo) => [...new Set(LISTINGS.map((l) => l[campo]).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "es"));
  function construirChips() {
    for (const [id, campo] of Object.entries(CHIPS)) {
      const cont = $("#" + id);
      if (!cont) continue;
      const activos = chipSet(id);
      const vals = valoresUnicos(campo);
      cont.innerHTML = vals.map((v) => `<button type="button" class="chip" data-v="${esc(v)}" aria-pressed="${activos.has(v)}">${esc(campo === "fuente" ? (FUENTE_NOMBRE[v] || v) : v)}</button>`).join("");
      if (!vals.length) cont.innerHTML = `<span class="hint">—</span>`;
    }
  }

  function montarFiltros() {
    RANGOS.forEach((id) => {
      const el = $("#" + id);
      if (!el) return;
      etiquetarRango(id);
      el.addEventListener("input", () => { etiquetarRango(id); renderSuave(); });
    });
    SEGS.forEach((id) => {
      const grupo = $("#" + id);
      if (!grupo) return;
      grupo.addEventListener("click", (e) => {
        const b = e.target.closest("button"); if (!b) return;
        $$("button", grupo).forEach((x) => x.setAttribute("aria-pressed", x === b));
        render();
      });
    });
    Object.keys(CHIPS).forEach((id) => {
      $("#" + id)?.addEventListener("click", (e) => {
        const c = e.target.closest(".chip"); if (!c) return;
        c.setAttribute("aria-pressed", c.getAttribute("aria-pressed") !== "true");
        render();
      });
    });
    CHECKS.forEach((id) => $("#" + id)?.addEventListener("change", render));
    $("#f-texto")?.addEventListener("input", renderSuave);
    $("#f-antiguedad")?.addEventListener("change", render);
    $("#f-orden")?.addEventListener("change", render);
    construirChips();

    const toggle = (btn, otros = []) => {
      const on = btn.getAttribute("aria-pressed") !== "true";
      btn.setAttribute("aria-pressed", on);
      otros.forEach((o) => o && o.setAttribute("aria-pressed", on));
      if (on && (vista === "metricas" || vista === "metodo" || vista === "ofertas" || vista === "temporal")) cambiarVista("lista");
      render();
    };
    $("#match-btn").addEventListener("click", () => toggle($("#match-btn"), [$("#dock-match")]));
    $("#dock-match").addEventListener("click", () => toggle($("#dock-match"), [$("#match-btn")]));
    $("#reset").addEventListener("click", limpiar);
  }

  function limpiar() {
    if ($("#f-texto")) $("#f-texto").value = "";
    RANGOS.forEach((id) => { const el = $("#" + id); if (el) { el.value = el.defaultValue; etiquetarRango(id); } });
    SEGS.forEach((id) => $$(`#${id} button`).forEach((b) => b.setAttribute("aria-pressed", b.hasAttribute("data-default"))));
    CHECKS.forEach((id) => { const el = $("#" + id); if (el) el.checked = el.defaultChecked; });
    ["f-antiguedad", "f-orden"].forEach((id) => {
      const el = $("#" + id); if (!el) return;
      const def = [...el.options].find((o) => o.defaultSelected) || el.options[0];
      el.value = def.value;
    });
    $$(".chip[aria-pressed='true']").forEach((c) => c.setAttribute("aria-pressed", "false"));
    ["#match-btn", "#dock-match"].forEach((s) => $(s)?.setAttribute("aria-pressed", "false"));
    render();
  }

  // ===================================================================
  // Panel de filtros en el celular (sube desde abajo)
  // ===================================================================
  const escritorio = window.matchMedia("(min-width: 1000px)");
  let abridor = null;
  function abrirFiltros() {
    const p = $("#filters");
    abridor = document.activeElement;
    p.classList.add("abierto");
    p.setAttribute("role", "dialog");
    p.setAttribute("aria-modal", "true");
    $("#velo").classList.remove("hidden");
    document.body.classList.add("bloqueado");
    $("#abrir-filtros").setAttribute("aria-expanded", "true");
    setTimeout(() => $("#cerrar-filtros").focus(), 30);
  }
  function cerrarFiltros(irAResultados) {
    const p = $("#filters");
    if (!p.classList.contains("abierto")) return;
    p.classList.remove("abierto");
    p.removeAttribute("role"); p.removeAttribute("aria-modal");
    $("#velo").classList.add("hidden");
    document.body.classList.remove("bloqueado");
    $("#abrir-filtros").setAttribute("aria-expanded", "false");
    if (irAResultados) {
      $("#resultados").scrollIntoView({ block: "start" });
      $("#resultados").focus({ preventScroll: true });
    } else abridor?.focus();
  }
  function montarPanel() {
    $("#abrir-filtros").addEventListener("click", abrirFiltros);
    $("#cerrar-filtros").addEventListener("click", () => cerrarFiltros(false));
    $("#ver-resultados").addEventListener("click", () => cerrarFiltros(true));
    $("#velo").addEventListener("click", () => cerrarFiltros(false));
    document.addEventListener("keydown", (e) => {
      const p = $("#filters");
      if (!p.classList.contains("abierto")) return;
      if (e.key === "Escape") { e.preventDefault(); cerrarFiltros(false); }
      if (e.key === "Tab") {   // el foco no se escapa del panel mientras está abierto
        const f = $$("button, input, select, a[href]", p).filter((x) => x.offsetParent !== null && !x.disabled);
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    });
    escritorio.addEventListener?.("change", (e) => { if (e.matches) cerrarFiltros(false); });
  }

  // ===================================================================
  // Vistas (pestañas) + el modo recuerda la vista al cambiar de búsqueda
  // ===================================================================
  const VISTAS = { lista: "grid", mapa: "map", metricas: "metrics", ofertas: "ofertas", temporal: "temporal", metodo: "metodo" };
  function cambiarVista(v, foco) {
    if (!VISTAS[v]) v = "lista";
    vista = v;
    $$("#view-toggle [role=tab]").forEach((b) => {
      const on = b.dataset.view === v;
      b.setAttribute("aria-selected", on);
      b.tabIndex = on ? 0 : -1;
      if (on && foco) b.focus();
    });
    Object.entries(VISTAS).forEach(([k, id]) => $("#" + id).classList.toggle("hidden", k !== v));
    $(".result-bar").classList.toggle("hidden", v !== "lista" && v !== "mapa");
    $("#dock").classList.toggle("hidden", v !== "lista" && v !== "mapa");
    // "#/mapa" y no "#mapa": así el navegador no salta a la sección con ese id
    try { history.replaceState(null, "", v === "lista" ? location.pathname : "#/" + v); } catch (e) { /* file:// */ }
    if (v === "mapa") {
      if (!map) initMapa();
      setTimeout(() => { map?.invalidateSize(); render(); }, 60);
    } else render();
  }
  function montarVista() {
    const tabs = $$("#view-toggle [role=tab]");
    tabs.forEach((b, i) => {
      b.addEventListener("click", () => cambiarVista(b.dataset.view));
      b.addEventListener("keydown", (e) => {
        const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        cambiarVista(tabs[(i + d + tabs.length) % tabs.length].dataset.view, true);
      });
    });
  }

  // ===================================================================
  // Init
  // ===================================================================
  function init() {
    if (!LISTINGS.length) {
      $("#grid").innerHTML = `<div class="empty"><h3>Todavía no hay datos</h3><p>Corre <code>python run_all.py</code> para generar la base.</p></div>`;
      return;
    }
    montarBannerActualizacion();
    actualizarContadores();
    montarFiltros();
    montarAccionesGrid();
    montarPanel();
    montarVista();
    cambiarVista((location.hash || "").replace(/^#\/?/, ""));
  }
  document.addEventListener("DOMContentLoaded", init);
})();
