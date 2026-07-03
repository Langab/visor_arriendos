/* ===================================================================
   Visor de Arriendos — lógica de UI
   Vistas: Lista · Mapa · Métricas
   Estado persistido en localStorage: contactadas y favoritas.
   =================================================================== */
(() => {
  "use strict";

  const LATEST = (window.LISTINGS || []).slice();   // foto más reciente (default)
  let LISTINGS = LATEST.slice();                     // dataset activo (cambia por fecha)
  const META = window.META || {};

  // ---------- estado persistido ----------
  const LS_CONTACT = "arriendos_contactadas";
  const LS_FAV = "arriendos_favoritos";
  const contactadas = new Set(JSON.parse(localStorage.getItem(LS_CONTACT) || "[]"));
  const favoritos = new Set(JSON.parse(localStorage.getItem(LS_FAV) || "[]"));
  const saveContact = () => localStorage.setItem(LS_CONTACT, JSON.stringify([...contactadas]));
  const saveFav = () => localStorage.setItem(LS_FAV, JSON.stringify([...favoritos]));

  // ---------- helpers ----------
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const clp = (n) => (n == null ? "—" : "$" + Math.round(n).toLocaleString("es-CL"));
  const FUENTE_NOMBRE = {
    portalinmobiliario: "Portal Inmob.", chilepropiedades: "Chilepropiedades",
    yapo: "Yapo", toctoc: "TocToc",
    goplaceit: "GoPlaceIt", facebook_marketplace: "Facebook",
  };

  function nivel(l) {
    if (l.dentro_presupuesto && l.calza_dormitorios) return "good";
    if (l.dentro_presupuesto || (l.dormitorios || 0) >= 2) return "mid";
    return "bad";
  }

  // ---------- estado de filtros ----------
  const PMAX = Math.max(META.presupuesto_max || 800000, 800000);
  const F = {
    texto: "", precioMax: PMAX, arriendoMax: 1000000, gcMax: 400000,
    dorm: 0, metroMax: 2000, supMin: 0, antiguedad: "", moneda: "",
    comunas: new Set(), barrios: new Set(), fuentes: new Set(),
    soloPresupuesto: false, soloBarrio: false, mascotas: false, mariposa: false,
    soloOfertas: false,
    favoritos: false, ocultarContactadas: false, matchOnly: false,
    soloNuevas: false, soloBajaron: false,
    orden: "relevancia",
  };

  // ===================================================================
  // Chips dinámicos
  // ===================================================================
  const valoresUnicos = (campo) =>
    [...new Set(LISTINGS.map((l) => l[campo]).filter(Boolean))].sort();

  function construirChips() {
    montarChips("f-comuna", valoresUnicos("comuna"), F.comunas);
    montarChips("f-barrio", valoresUnicos("barrio"), F.barrios);
    montarChips("f-fuente", valoresUnicos("fuente"), F.fuentes, (v) => FUENTE_NOMBRE[v] || v);
  }

  function montarChips(id, valores, set, etiqueta) {
    const cont = $("#" + id);
    cont.innerHTML = "";
    valores.forEach((v) => {
      const c = document.createElement("div");
      c.className = "chip";
      c.textContent = etiqueta ? etiqueta(v) : v;
      c.onclick = () => {
        c.classList.toggle("active");
        set.has(v) ? set.delete(v) : set.add(v);
        render();
      };
      cont.appendChild(c);
    });
  }

  // ===================================================================
  // Filtrado + orden
  // ===================================================================
  function aplicar() {
    let out = LISTINGS.filter((l) => {
      if (F.matchOnly && !l.match_perfecto) return false;
      if (F.texto) {
        const h = (l.titulo + " " + l.direccion + " " + l.barrio).toLowerCase();
        if (!h.includes(F.texto.toLowerCase())) return false;
      }
      if (l.total_estimado_clp != null && l.total_estimado_clp > F.precioMax) return false;
      if (F.arriendoMax < 1000000 && l.precio_clp != null && l.precio_clp > F.arriendoMax) return false;
      if (F.gcMax < 400000) {
        // GC efectivo = total - arriendo (sirve igual si es real o estimado)
        const gc = (l.total_estimado_clp != null && l.precio_clp != null)
          ? l.total_estimado_clp - l.precio_clp : null;
        if (gc != null && gc > F.gcMax) return false;
      }
      if (F.dorm && (l.dormitorios || 0) < F.dorm) return false;
      if (F.metroMax < 2000 && (l.metro_dist_m == null || l.metro_dist_m > F.metroMax)) return false;
      if (F.supMin > 0 && (l.superficie_m2 == null || l.superficie_m2 < F.supMin)) return false;
      if (F.moneda && (l.moneda || "CLP") !== F.moneda) return false;
      if (F.mariposa && !l.es_mariposa) return false;
      if (F.soloOfertas && l.etiqueta_precio !== "oferta") return false;
      if (F.antiguedad) {
        const a = l.antiguedad_anios;
        if (F.antiguedad === "dato" && a == null) return false;
        if (F.antiguedad === "30+" && !(a != null && a > 30)) return false;
        if (F.antiguedad === "20+" && !(a != null && a > 20)) return false;
        if (F.antiguedad === "0-10" && !(a != null && a < 10)) return false;
      }
      if (F.comunas.size && !F.comunas.has(l.comuna)) return false;
      if (F.barrios.size && !F.barrios.has(l.barrio)) return false;
      if (F.fuentes.size && !F.fuentes.has(l.fuente)) return false;
      if (F.soloPresupuesto && !l.dentro_presupuesto) return false;
      if (F.soloBarrio && !l.en_barrio_objetivo) return false;
      if (F.mascotas && l.admite_mascotas !== true) return false;
      if (F.soloNuevas && !l.es_nuevo) return false;
      if (F.soloBajaron && !(l.precio_delta && l.precio_delta < 0)) return false;
      if (F.favoritos && !favoritos.has(l.id)) return false;
      if (F.ocultarContactadas && contactadas.has(l.id)) return false;
      return true;
    });

    const ord = {
      relevancia: (a, b) => (b.relevancia || 0) - (a.relevancia || 0) ||
        (a.total_estimado_clp || 9e9) - (b.total_estimado_clp || 9e9),
      "precio-asc": (a, b) => (a.total_estimado_clp || 9e9) - (b.total_estimado_clp || 9e9),
      "precio-desc": (a, b) => (b.total_estimado_clp || 0) - (a.total_estimado_clp || 0),
      "m2-desc": (a, b) => (b.superficie_m2 || 0) - (a.superficie_m2 || 0),
      "metro-asc": (a, b) => (a.metro_dist_m ?? 9e9) - (b.metro_dist_m ?? 9e9),
      "antiguedad-desc": (a, b) => (b.antiguedad_anios ?? -1) - (a.antiguedad_anios ?? -1),
      "oferta-asc": (a, b) => (a.delta_grupo_pct ?? 9e9) - (b.delta_grupo_pct ?? 9e9),
    };
    out.sort(ord[F.orden]);
    return out;
  }

  // ===================================================================
  // Tarjetas
  // ===================================================================
  function tarjeta(l) {
    const nv = nivel(l);
    const esContact = contactadas.has(l.id);
    const esFav = favoritos.has(l.id);
    const relTxt = l.match_perfecto ? "🎯 Match" : { good: "Calza", mid: "Parcial", bad: "Fuera" }[nv];
    const relCls = l.match_perfecto ? "match" : nv;
    const card = document.createElement("article");
    card.className = "card" + (esContact ? " contactada" : "");

    const specs = [];
    if (l.dormitorios) specs.push(`🛏 ${l.dormitorios}D`);
    if (l.banos) specs.push(`🛁 ${l.banos}B`);
    if (l.superficie_m2) specs.push(`📐 ${Math.round(l.superficie_m2)} m²`);
    if (l.antiguedad_anios != null) specs.push(`🏗 ${l.antiguedad_anios} años`);
    if (l.admite_mascotas === true) specs.push(`🐾 mascotas`);
    if (l.es_mariposa) specs.push(`🦋 mariposa`);
    if (l.barrio) specs.push(`<span class="spec tag-barrio">📍 ${l.barrio}</span>`);
    if (l.metro_dist_m != null)
      specs.push(`<span class="spec tag-metro">Ⓜ ${l.metro_cercano} · ${l.metro_dist_m} m</span>`);

    const gcTxt = l.gastos_comunes_estimado
      ? `<span class="est">GC est.</span>` : `GC ${clp(l.gastos_comunes_clp)}`;

    // cambio de precio vs. la foto anterior (en la moneda del arriendo)
    let precioCambio = "";
    if (l.precio_delta) {
      const baja = l.precio_delta < 0;
      const val = l.moneda === "UF" ? `${Math.abs(l.precio_delta)} UF` : clp(Math.abs(l.precio_delta));
      precioCambio = `<span class="precio-cambio ${baja ? "baja" : "sube"}">${baja ? "▼" : "▲"} ${val} vs. antes</span>`;
    }
    const nuevoBadge = l.es_nuevo ? `<span class="nuevo-badge">✦ Nuevo</span>` : "";

    // comparación contra el promedio de su grupo de características
    let grupoBadge = "";
    if (l.delta_grupo_pct != null && Math.abs(l.delta_grupo_pct) >= 10) {
      const esOferta = l.delta_grupo_pct < 0;
      grupoBadge = `<div class="grupo-badge ${esOferta ? "oferta" : "caro"}"
        title="Grupo: ${l.grupo_carac} (${l.grupo_n} avisos) · promedio ${clp(l.precio_grupo_prom)}">
        ${esOferta ? "💎" : "▲"} ${Math.abs(Math.round(l.delta_grupo_pct))}% ${esOferta ? "bajo" : "sobre"} similares
        <small>(prom. ${clp(l.precio_grupo_prom)})</small></div>`;
    }

    const img = l.imagen
      ? `<img loading="lazy" src="${l.imagen}" alt="" onerror="this.parentNode.innerHTML='<div class=ph>🏢</div>'">`
      : `<div class="ph">🏢</div>`;

    card.innerHTML = `
      <div class="thumb">
        <span class="badge-rel ${relCls}">${relTxt}</span>
        ${nuevoBadge}
        <span class="src-chip">${FUENTE_NOMBRE[l.fuente] || l.fuente}</span>
        <button class="fav-btn ${esFav ? "on" : ""}" title="Marcar de interés" data-fav="${l.id}">${esFav ? "⭐" : "☆"}</button>
        ${img}
      </div>
      <div class="body">
        <div class="price-row">
          <div class="price-col">
            ${l.moneda === "UF" && l.precio_uf != null
              ? `<div class="price">UF ${l.precio_uf} <small>/mes</small></div>
                 <div class="price-ref">≈ ${clp(l.precio_clp)} · UF del día ${clp(META.uf_valor)}</div>`
              : `<div class="price">${clp(l.precio_clp)} <small>/mes</small></div>`}
          </div>
          ${precioCambio}
        </div>
        <div class="total">Total est. <b>${clp(l.total_estimado_clp)}</b> · ${gcTxt}</div>
        ${grupoBadge}
        <h3 class="title">${l.titulo || "Departamento en arriendo"}</h3>
        <p class="addr">${l.direccion || ""}</p>
        <div class="specs">${specs.map((s) => (s.startsWith("<") ? s : `<span class="spec">${s}</span>`)).join("")}</div>
        <div class="actions">
          <a class="btn primary" href="${l.url}" target="_blank" rel="noopener">Ver fotos ↗</a>
          ${l.google_maps ? `<a class="btn map" href="${l.google_maps}" target="_blank" rel="noopener" title="Ver en Google Maps">🗺</a>` : ""}
          <button class="btn contact ${esContact ? "on" : ""}" title="Marcar contactada" data-id="${l.id}">✓</button>
        </div>
      </div>`;

    card.querySelector(".btn.contact").onclick = (e) => { e.stopPropagation(); toggleSet(contactadas, saveContact, l.id); };
    card.querySelector(".fav-btn").onclick = (e) => { e.stopPropagation(); toggleSet(favoritos, saveFav, l.id); };
    return card;
  }

  function toggleSet(set, save, id) {
    set.has(id) ? set.delete(id) : set.add(id);
    save();
    render();
    actualizarContadores();
  }

  // ===================================================================
  // Mapa (Leaflet)
  // ===================================================================
  let map, capa;
  function initMapa() {
    map = L.map("map", { scrollWheelZoom: true }).setView([-33.435, -70.62], 14);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap", maxZoom: 19 }).addTo(map);
    capa = L.layerGroup().addTo(map);
  }
  function pinIcon(nv) {
    return L.divIcon({ className: "", html: `<div class="marker-pin ${nv}"></div>`, iconSize: [26, 26], iconAnchor: [13, 26], popupAnchor: [0, -24] });
  }
  function pintarMapa(items) {
    if (!map) initMapa();
    capa.clearLayers();
    const conGeo = items.filter((l) => l.lat && l.lng);
    const bounds = [];
    conGeo.forEach((l) => {
      const nv = contactadas.has(l.id) ? "done" : (l.match_perfecto ? "match" : nivel(l));
      const m = L.marker([l.lat, l.lng], { icon: pinIcon(nv), opacity: l.ubicacion_aprox ? 0.6 : 1 });
      const img = l.imagen ? `<img src="${l.imagen}" onerror="this.style.display='none'">` : "";
      const metro = l.metro_dist_m != null ? `<div class="pop-a">Ⓜ ${l.metro_cercano} a ${l.metro_dist_m} m</div>` : "";
      const aprox = l.ubicacion_aprox ? `<div class="pop-aprox">📍 Ubicación aproximada (centro de barrio/comuna)</div>` : "";
      m.bindPopup(`
        <div class="pop">${img}
          <div class="pop-b">
            <div class="pop-price">${l.moneda === "UF" && l.precio_uf != null ? "UF " + l.precio_uf : clp(l.precio_clp)} <small style="font-size:11px;color:#7a736b">/mes · total ${clp(l.total_estimado_clp)}</small></div>
            <div class="pop-t">${l.titulo || "Departamento"}</div>
            <div class="pop-a">${l.direccion || ""}</div>${metro}${aprox}
            <a class="pop-link" href="${l.url}" target="_blank" rel="noopener">Ver propiedad y fotos ↗</a>
          </div></div>`);
      m.addTo(capa);
      bounds.push([l.lat, l.lng]);
    });
    if (bounds.length) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    return conGeo.length;
  }

  // ===================================================================
  // Métricas (dashboard)
  // ===================================================================
  function barras(titulo, datos, fmt) {
    const max = Math.max(1, ...datos.map((d) => d[1]));
    const filas = datos.map(([k, v]) => `
      <div class="bar-row">
        <span class="bar-label">${k}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${(v / max) * 100}%"></span></span>
        <span class="bar-val">${fmt ? fmt(v) : v}</span>
      </div>`).join("");
    return `<div class="metric-card"><h3>${titulo}</h3>${filas}</div>`;
  }

  function pintarMetricas() {
    const L = LISTINGS;
    const total = L.length;
    const match = L.filter((x) => x.match_perfecto).length;
    const presu = L.filter((x) => x.dentro_presupuesto).length;
    const tresD = L.filter((x) => (x.dormitorios || 0) >= 3).length;
    const barrio = L.filter((x) => x.en_barrio_objetivo).length;
    const mascotas = L.filter((x) => x.admite_mascotas === true).length;
    const cercaMetro = L.filter((x) => x.metro_dist_m != null && x.metro_dist_m <= 500).length;
    const gcReal = L.filter((x) => !x.gastos_comunes_estimado).length;

    // funnel
    const funnel = `
      <div class="metric-card wide">
        <h3>¿Cuántas se ajustan a lo que buscamos?</h3>
        <div class="funnel">
          <div class="fn"><b>${total}</b><span>avisos totales</span></div>
          <div class="fn"><b>${presu}</b><span>≤ $${(META.presupuesto_max||800000).toLocaleString("es-CL")} total</span></div>
          <div class="fn"><b>${tresD}</b><span>3+ dormitorios</span></div>
          <div class="fn"><b>${barrio}</b><span>en barrio objetivo</span></div>
          <div class="fn hl"><b>${match}</b><span>🎯 match perfecto</span></div>
        </div>
      </div>`;

    // por comuna
    const porComuna = cuenta(L, (x) => x.comuna);
    const porDorm = cuenta(L, (x) => (x.dormitorios ? x.dormitorios + "D" : "s/d"));
    const porBarrio = cuenta(L.filter((x) => x.barrio), (x) => x.barrio);
    const porMetro = [
      ["≤ 300 m", L.filter((x) => x.metro_dist_m != null && x.metro_dist_m <= 300).length],
      ["300–600 m", L.filter((x) => x.metro_dist_m > 300 && x.metro_dist_m <= 600).length],
      ["600–1000 m", L.filter((x) => x.metro_dist_m > 600 && x.metro_dist_m <= 1000).length],
      ["> 1000 m", L.filter((x) => x.metro_dist_m > 1000).length],
    ];
    const porPrecio = [
      ["≤ 500k", L.filter((x) => x.total_estimado_clp <= 500000).length],
      ["500–650k", L.filter((x) => x.total_estimado_clp > 500000 && x.total_estimado_clp <= 650000).length],
      ["650–800k", L.filter((x) => x.total_estimado_clp > 650000 && x.total_estimado_clp <= 800000).length],
      ["> 800k", L.filter((x) => x.total_estimado_clp > 800000).length],
    ];
    const conAnt = L.filter((x) => x.antiguedad_anios != null);
    const porAnt = [
      ["Nuevo (<10)", conAnt.filter((x) => x.antiguedad_anios < 10).length],
      ["10–20", conAnt.filter((x) => x.antiguedad_anios >= 10 && x.antiguedad_anios <= 20).length],
      ["20–30", conAnt.filter((x) => x.antiguedad_anios > 20 && x.antiguedad_anios <= 30).length],
      ["+30 años", conAnt.filter((x) => x.antiguedad_anios > 30).length],
    ];

    $("#metrics").innerHTML = `
      <div class="metrics-grid">
        ${funnel}
        <div class="kpis">
          ${kpi(match, "🎯 Match perfecto", "hl")}
          ${kpi(META.nuevos_desde_anterior || 0, "✦ Nuevas desde la última act.")}
          ${kpi(cercaMetro, "≤ 500 m del metro")}
          ${kpi(mascotas, "Admiten mascotas 🐾")}
          ${kpi(favoritos.size, "⭐ Tus favoritas")}
          ${kpi(gcReal, "Con gastos comunes reales")}
        </div>
        ${tablaPrecios("💰 Precio promedio por barrio", "barrio")}
        ${tablaPrecios("💰 Precio promedio por comuna", "comuna")}
        ${barras("Por comuna", porComuna)}
        ${barras("Por nº de dormitorios", porDorm)}
        ${barras("Total mensual estimado", porPrecio)}
        ${barras("Distancia al metro", porMetro)}
        ${barras("Por barrio objetivo", porBarrio)}
        ${barras("Antigüedad (de los que tienen dato)", porAnt)}
      </div>`;
  }
  const kpi = (n, t, cls = "") => `<div class="kpi ${cls}"><b>${n}</b><span>${t}</span></div>`;
  function cuenta(arr, fn) {
    const m = {};
    arr.forEach((x) => { const k = fn(x) || "s/d"; m[k] = (m[k] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }

  // Promedios de precio (total / arriendo / gastos comunes) por grupo (barrio o comuna).
  // Solo considera avisos dentro del presupuesto, para ver qué zona conviene en NUESTRO rango.
  function promediosPor(campo) {
    const g = {};
    LISTINGS.forEach((l) => {
      if (!l.dentro_presupuesto) return;
      const k = l[campo];
      if (!k) return;
      const gc = (l.total_estimado_clp != null && l.precio_clp != null)
        ? l.total_estimado_clp - l.precio_clp : null;
      (g[k] = g[k] || { total: 0, arr: 0, gc: 0, ngc: 0, n: 0 });
      g[k].total += l.total_estimado_clp || 0;
      g[k].arr += l.precio_clp || 0;
      if (gc != null) { g[k].gc += gc; g[k].ngc++; }
      g[k].n++;
    });
    return Object.entries(g).map(([k, v]) => ({
      grupo: k, n: v.n,
      total: v.total / v.n, arr: v.arr / v.n, gc: v.ngc ? v.gc / v.ngc : null,
    })).sort((a, b) => b.total - a.total);
  }

  function tablaPrecios(titulo, campo) {
    const filas = promediosPor(campo);
    if (!filas.length) return "";
    const rows = filas.map((f) => `
      <tr>
        <td class="tp-g">${f.grupo} <span class="tp-n">(${f.n})</span></td>
        <td>${clp(Math.round(f.total))}</td>
        <td class="tp-sub">${clp(Math.round(f.arr))}</td>
        <td class="tp-sub">${f.gc != null ? clp(Math.round(f.gc)) : "—"}</td>
      </tr>`).join("");
    return `<div class="metric-card">
      <h3>${titulo}</h3>
      <table class="tp-table">
        <thead><tr><th></th><th>Total</th><th>Arriendo</th><th>G. comunes</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="tp-note">Promedios de avisos dentro de presupuesto. Ordenado por total (más caro arriba).</p>
    </div>`;
  }

  // ===================================================================
  // Render principal
  // ===================================================================
  let vista = "lista";
  function render() {
    const items = aplicar();
    const count = $("#count");
    const calzan = items.filter((l) => l.match_perfecto).length;
    count.innerHTML = `<b>${items.length}</b> propiedades · ${calzan} 🎯 match perfecto`;

    if (vista === "metricas") { pintarMetricas(); return; }
    if (vista === "ofertas") { pintarOfertas(); return; }
    if (vista === "temporal") { pintarTemporal(); return; }

    const grid = $("#grid");
    grid.innerHTML = "";
    if (!items.length) {
      grid.innerHTML = `<div class="empty"><h3>Sin resultados</h3><p>Prueba ampliando el presupuesto o quitando filtros.</p></div>`;
    } else {
      const frag = document.createDocumentFragment();
      items.forEach((l) => frag.appendChild(tarjeta(l)));
      grid.appendChild(frag);
    }
    if (vista === "mapa") {
      const n = pintarMapa(items);
      if (n < items.length) count.innerHTML += ` · <span style="color:var(--muted)">${n} en el mapa</span>`;
    }
  }

  // ===================================================================
  // Ofertas — análisis por características
  // ===================================================================
  function filaOferta(l) {
    const esOferta = l.delta_grupo_pct < 0;
    const specs = [l.dormitorios ? l.dormitorios + "D" : null,
      l.banos ? l.banos + "B" : null,
      l.superficie_m2 ? Math.round(l.superficie_m2) + " m²" : null,
      l.barrio || l.comuna].filter(Boolean).join(" · ");
    return `<a class="of-row" href="${l.url}" target="_blank" rel="noopener">
      <div class="of-info">
        <div class="of-title">${l.titulo || "Departamento"}</div>
        <div class="of-specs">${specs} · típico del grupo ${clp(l.precio_grupo_prom)} (${l.grupo_n} avisos)</div>
      </div>
      <div class="of-price">
        <b>${clp(l.precio_clp)}</b>
        <span class="of-delta ${esOferta ? "oferta" : "caro"}">${esOferta ? "▼" : "▲"} ${Math.abs(Math.round(l.delta_grupo_pct))}%</span>
      </div></a>`;
  }

  function pintarOfertas() {
    const conDelta = LISTINGS.filter((l) => l.delta_grupo_pct != null);
    const ofertas = conDelta.filter((l) => l.etiqueta_precio === "oferta")
      .sort((a, b) => a.delta_grupo_pct - b.delta_grupo_pct);
    const caros = conDelta.filter((l) => l.etiqueta_precio === "caro")
      .sort((a, b) => b.delta_grupo_pct - a.delta_grupo_pct);
    // ofertas dentro de lo que buscamos (en barrio + presupuesto)
    const ofertasTop = ofertas.filter((l) => l.dentro_presupuesto);

    // tabla de grupos (agregada desde los campos ya calculados)
    const grupos = {};
    conDelta.forEach((l) => {
      if (!grupos[l.grupo_carac]) grupos[l.grupo_carac] = { n: l.grupo_n, prom: l.precio_grupo_prom, min: l.precio_clp, max: l.precio_clp };
      const g = grupos[l.grupo_carac];
      g.min = Math.min(g.min, l.precio_clp); g.max = Math.max(g.max, l.precio_clp);
    });
    const filasGrupos = Object.entries(grupos).sort((a, b) => b[1].n - a[1].n).slice(0, 18)
      .map(([k, g]) => `<tr><td class="tp-g">${k} <span class="tp-n">(${g.n})</span></td>
        <td>${clp(g.prom)}</td><td class="tp-sub">${clp(g.min)}</td><td class="tp-sub">${clp(g.max)}</td></tr>`).join("");

    $("#ofertas").innerHTML = `
      <div class="metrics-grid">
        <div class="metric-card wide">
          <h3>💎 ¿Está caro o barato? — comparación contra similares</h3>
          <p class="tp-note" style="font-size:12.5px">Cada aviso se compara con el <b>arriendo típico de su grupo</b>
          (misma zona, dormitorios, baños y tramo de m²; grupos con al menos 5 avisos; mediana, robusta a avisos mal publicados).
          💎 oferta = 10%+ bajo su grupo · ▲ caro = 10%+ sobre su grupo. Se compara el arriendo sin gastos comunes.</p>
          <div class="kpis" style="grid-template-columns:repeat(auto-fit,minmax(130px,1fr));margin-top:12px">
            ${kpi(conDelta.length, "avisos comparables")}
            ${kpi(ofertas.length, "💎 ofertas", "hl")}
            ${kpi(caros.length, "▲ sobre precio")}
            ${kpi(Object.keys(grupos).length, "grupos de características")}
          </div>
        </div>
        <div class="metric-card wide">
          <h3>💎 Mejores ofertas dentro del presupuesto (${ofertasTop.length})</h3>
          ${ofertasTop.slice(0, 15).map(filaOferta).join("") || '<p class="ts-empty">Sin ofertas detectadas.</p>'}
        </div>
        <div class="metric-card">
          <h3>💎 Todas las ofertas (top 12)</h3>
          ${ofertas.slice(0, 12).map(filaOferta).join("") || '<p class="ts-empty">—</p>'}
        </div>
        <div class="metric-card">
          <h3>▲ Los más sobre precio (top 12)</h3>
          ${caros.slice(0, 12).map(filaOferta).join("") || '<p class="ts-empty">—</p>'}
        </div>
        <div class="metric-card wide">
          <h3>Arriendo típico por grupo de características</h3>
          <table class="tp-table">
            <thead><tr><th></th><th>Típico</th><th>Mín</th><th>Máx</th></tr></thead>
            <tbody>${filasGrupos}</tbody>
          </table>
          <p class="tp-note">Grupos con más avisos primero. Mín/Máx = rango de arriendos dentro del grupo.</p>
        </div>
      </div>`;
  }

  // ===================================================================
  // Banner de última actualización
  // ===================================================================
  // formatea "2026-06-30_2247" -> "30 jun 2026, 22:47"
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  function fmtFecha(f) {
    let m = /(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})/.exec(f || "");
    if (m) return `${+m[3]} ${MESES[+m[2] - 1]} ${m[1]}, ${m[4]}:${m[5]}`;
    m = /(\d{4})-(\d{2})-(\d{2})/.exec(f || "");
    if (m) return `${+m[3]} ${MESES[+m[2] - 1]} ${m[1]}`;
    return f || "—";
  }
  const DIAS = () => META.fechas_disponibles || [];

  function montarBannerActualizacion() {
    const bar = $("#update-bar");
    if (!bar) return;
    const fechas = META.fechas_disponibles || (META.fecha_actual ? [META.fecha_actual] : []);
    const opciones = fechas.map((f, i) =>
      `<option value="${f}">${fmtFecha(f)}${i === 0 ? " (más reciente)" : ""}</option>`).join("");
    let extra = "";
    if (META.es_primera_foto) {
      extra = `<span class="ub-tag">primera foto — el análisis temporal se llena al re-ejecutar</span>`;
    } else {
      const n = META.nuevos_desde_anterior || 0, baja = META.bajaron_precio || 0;
      extra = `<span class="ub-tag nuevo">✦ ${n} nuevas</span>` +
        (baja ? `<span class="ub-tag baja">▼ ${baja} bajaron</span>` : "");
    }
    bar.innerHTML =
      `<span class="ub-date">🕒 Fecha de extracción:</span>` +
      `<select id="f-fecha" class="ub-select">${opciones}</select>` +
      `<span id="ub-extra">${extra}</span>`;

    const sel = $("#f-fecha");
    if (sel) sel.onchange = (e) => cargarDia(e.target.value);
  }

  // ===================================================================
  // Cambio de fecha (foto histórica)
  // ===================================================================
  function cargarDia(fecha) {
    const esUltima = fecha === DIAS()[0];
    if (esUltima) return aplicarDia(LATEST.slice(), true);
    if (window.HISTORIA && window.HISTORIA[fecha]) return aplicarDia(window.HISTORIA[fecha], false);
    // carga bajo demanda el archivo de esa fecha
    const s = document.createElement("script");
    s.src = "historia/" + fecha + ".js";
    s.onload = () => aplicarDia((window.HISTORIA || {})[fecha] || [], false);
    s.onerror = () => aplicarDia([], false);
    document.body.appendChild(s);
  }

  function aplicarDia(dataset, esUltima) {
    LISTINGS = dataset;
    // limpia selección de chips (los valores pueden cambiar entre fechas)
    F.comunas.clear(); F.barrios.clear(); F.fuentes.clear();
    $$(".chip.active").forEach((c) => c.classList.remove("active"));
    construirChips();
    montarStats();
    actualizarContadores();
    refrescarContadoresTemporales();
    // aviso de que estás viendo una foto pasada
    const extra = $("#ub-extra");
    if (extra) extra.innerHTML = esUltima
      ? (META.es_primera_foto ? `<span class="ub-tag">primera foto</span>`
         : `<span class="ub-tag nuevo">✦ ${META.nuevos_desde_anterior || 0} nuevas</span>`)
      : `<span class="ub-tag viendo-pasado">👁 viendo foto de ${fmtFecha($("#f-fecha").value)}</span>`;
    render();
  }

  function refrescarContadoresTemporales() {
    const nN = LISTINGS.filter((l) => l.es_nuevo).length;
    const nB = LISTINGS.filter((l) => l.precio_delta && l.precio_delta < 0).length;
    if ($("#f-nuevas-n")) $("#f-nuevas-n").textContent = nN ? `(${nN})` : "";
    if ($("#f-bajaron-n")) $("#f-bajaron-n").textContent = nB ? `(${nB})` : "";
  }

  // ===================================================================
  // Análisis temporal
  // ===================================================================
  function pintarTemporal() {
    const serie = META.serie_temporal || [];
    const dias = DIAS();
    const cont = $("#temporal");
    window.HISTORIA = window.HISTORIA || {};
    if (dias[0]) window.HISTORIA[dias[0]] = window.HISTORIA[dias[0]] || LATEST;

    const fechasBar = serie.map((s) => s.fecha.replace("_", " "));
    const serieHTML = serie.length ? `
      <div class="metric-card wide">
        <h3>Evolución (cada punto es una actualización)</h3>
        ${miniSerie("Total de avisos", serie.map((s) => s.total), fechasBar)}
        ${miniSerie("Match perfecto 🎯", serie.map((s) => s.match_perfecto), fechasBar)}
        ${miniSerie("3+ dormitorios", serie.map((s) => s.tres_dorms), fechasBar)}
        ${miniSerie("Precio mediano (total)", serie.map((s) => s.precio_mediano), fechasBar, true)}
      </div>` : "";

    if (dias.length <= 1) {
      cont.innerHTML = `<div class="metrics-grid">
        <div class="metric-card wide"><h3>Comparación temporal</h3>
          <p class="tp-note" style="font-size:13.5px">Por ahora hay una sola foto${dias[0] ? " (" + fmtFecha(dias[0]) + ")" : ""}.
          La comparación entre días se habilita con al menos dos días; la actualización
          automática de las 10:00 irá sumando una foto por día.</p>
        </div>${serieHTML}</div>`;
      return;
    }

    const opts = (sel) => dias.map((d) =>
      `<option value="${d}" ${d === sel ? "selected" : ""}>${fmtFecha(d)}${d === dias[0] ? " (última)" : ""}</option>`).join("");
    cont.innerHTML = `<div class="metrics-grid">
      <div class="metric-card wide cmp-card">
        <h3>Comparar dos días</h3>
        <div class="cmp-controls">
          <label>Día A <select id="cmp-a">${opts(dias[1])}</select></label>
          <span class="cmp-arrow">→</span>
          <label>Día B <select id="cmp-b">${opts(dias[0])}</select></label>
        </div>
        <div id="cmp-result" class="cmp-result">Cargando…</div>
      </div>
      ${serieHTML}
    </div>`;
    $("#cmp-a").onchange = actualizarComparacion;
    $("#cmp-b").onchange = actualizarComparacion;
    actualizarComparacion();
  }

  function cargarHistoriaDia(dia) {
    return new Promise((res) => {
      window.HISTORIA = window.HISTORIA || {};
      if (dia === DIAS()[0]) window.HISTORIA[dia] = window.HISTORIA[dia] || LATEST;
      if (window.HISTORIA[dia]) return res(window.HISTORIA[dia]);
      const s = document.createElement("script");
      s.src = "historia/" + dia + ".js";
      s.onload = () => res(window.HISTORIA[dia] || []);
      s.onerror = () => res([]);
      document.body.appendChild(s);
    });
  }

  function actualizarComparacion() {
    const a = $("#cmp-a").value, b = $("#cmp-b").value;
    $("#cmp-result").innerHTML = "Cargando…";
    Promise.all([cargarHistoriaDia(a), cargarHistoriaDia(b)])
      .then(([la, lb]) => { $("#cmp-result").innerHTML = renderComparacion(a, b, la, lb); });
  }

  function renderComparacion(a, b, la, lb) {
    const mapA = {}; la.forEach((l) => (mapA[l.id] = l));
    const idsB = new Set(lb.map((l) => l.id));
    const nuevos = lb.filter((l) => !mapA[l.id]);
    const desap = la.filter((l) => !idsB.has(l.id));
    const nativo = (e) => (e.moneda === "UF" && e.precio_uf) ? ["UF", e.precio_uf] : ["CLP", e.precio_clp];
    const cambios = [];
    lb.forEach((l) => {
      const p = mapA[l.id];
      if (!p) return;
      const [mA, pA] = nativo(p), [mB, pB] = nativo(l);
      if (mA === mB && pA && pB && pA !== pB) cambios.push({ ...l, delta: pB - pA, moneda: mB });
    });
    const bajas = cambios.filter((c) => c.delta < 0).sort((x, y) => x.delta - y.delta);
    const subidas = cambios.filter((c) => c.delta > 0).sort((x, y) => y.delta - x.delta);
    const dval = (l) => l.moneda === "UF" ? `${Math.abs(l.delta)} UF` : clp(Math.abs(l.delta));
    const filaTotal = (arr, cls) => arr.length ? arr.slice(0, 10).map((l) =>
      `<a class="ts-row" href="${l.url}" target="_blank" rel="noopener"><span class="ts-t">${l.titulo || "Depto"}</span><span class="ts-d ${cls}">${clp(l.total_estimado_clp || l.precio_clp)}</span></a>`).join("") : `<p class="ts-empty">—</p>`;
    const filaDelta = (arr) => arr.length ? arr.slice(0, 10).map((l) =>
      `<a class="ts-row" href="${l.url}" target="_blank" rel="noopener"><span class="ts-t">${l.titulo || "Depto"}</span><span class="ts-d ${l.delta < 0 ? "baja" : "sube"}">${l.delta < 0 ? "▼" : "▲"} ${dval(l)}</span></a>`).join("") : `<p class="ts-empty">—</p>`;

    return `
      <div class="cmp-kpis">
        ${kpi(la.length, "avisos día A")}
        ${kpi(lb.length, "avisos día B")}
        ${kpi(nuevos.length, "✦ Nuevos en B", "hl")}
        ${kpi(desap.length, "✕ Ya no están")}
        ${kpi(bajas.length, "▼ Bajaron")}
        ${kpi(subidas.length, "▲ Subieron")}
      </div>
      <div class="cmp-lists">
        <div><h4>✦ Nuevos en B (${nuevos.length})</h4>${filaTotal(nuevos, "nuevo")}</div>
        <div><h4>✕ Ya no están (${desap.length})</h4>${filaTotal(desap, "sube")}</div>
        <div><h4>▼ Bajas de precio (${bajas.length})</h4>${filaDelta(bajas)}</div>
        <div><h4>▲ Subidas de precio (${subidas.length})</h4>${filaDelta(subidas)}</div>
      </div>`;
  }

  function listaDesaparecidos() {
    const items = (META.desaparecidos_lista || []).slice(0, 12);
    if (!items.length) return `<p class="ts-empty">Ninguno desapareció en esta actualización.</p>`;
    return items.map((l) => `<a class="ts-row" href="${l.url}" target="_blank" rel="noopener">
      <span class="ts-t">${l.titulo || "Depto"}</span>
      <span class="ts-d sube">✕ ${clp(l.total_estimado_clp || l.precio_clp)}</span>
    </a>`).join("");
  }

  function miniSerie(titulo, valores, fechas, money) {
    const max = Math.max(1, ...valores.filter((v) => v != null));
    const barras = valores.map((v, i) => {
      const h = v == null ? 0 : (v / max) * 100;
      const lbl = money ? clp(v) : (v ?? "—");
      return `<div class="ts-col" title="${fechas[i]}: ${lbl}">
        <span class="ts-val">${lbl}</span>
        <span class="ts-bar" style="height:${Math.max(3, h)}%"></span>
        <span class="ts-x">${fechas[i].slice(5)}</span>
      </div>`;
    }).join("");
    return `<div class="ts-block"><div class="ts-title">${titulo}</div><div class="ts-chart">${barras}</div></div>`;
  }

  function tablaSerie(serie) {
    const s = serie[serie.length - 1];
    return `<div class="kpis" style="margin-top:14px">
      ${kpi(s.total, "avisos")}${kpi(s.match_perfecto, "match perfecto", "hl")}
      ${kpi(s.tres_dorms, "3+ dorms")}${kpi(s.precio_mediano ? clp(s.precio_mediano) : "—", "precio mediano")}</div>`;
  }

  function listaCambios(signo) {
    const items = LISTINGS.filter((l) => l.precio_delta && Math.sign(l.precio_delta) === signo)
      .sort((a, b) => Math.abs(b.precio_delta) - Math.abs(a.precio_delta)).slice(0, 8);
    if (!items.length) return `<p class="ts-empty">Sin cambios registrados aún.</p>`;
    return items.map((l) => `<a class="ts-row" href="${l.url}" target="_blank" rel="noopener">
      <span class="ts-t">${l.titulo || "Depto"}</span>
      <span class="ts-d ${signo < 0 ? "baja" : "sube"}">${signo < 0 ? "▼" : "▲"} ${clp(Math.abs(l.precio_delta))}</span>
    </a>`).join("");
  }

  function listaNuevos() {
    const items = LISTINGS.filter((l) => l.es_nuevo).slice(0, 8);
    if (!items.length) return `<p class="ts-empty">No hay avisos nuevos en esta actualización.</p>`;
    return items.map((l) => `<a class="ts-row" href="${l.url}" target="_blank" rel="noopener">
      <span class="ts-t">${l.titulo || "Depto"}</span>
      <span class="ts-d nuevo">${clp(l.total_estimado_clp)}</span>
    </a>`).join("");
  }

  // ===================================================================
  // Stats encabezado + contadores
  // ===================================================================
  function actualizarContadores() {
    $("#match-count").textContent = LISTINGS.filter((l) => l.match_perfecto).length;
    montarStats();
  }
  function montarStats() {
    const total = LISTINGS.length;
    const match = LISTINGS.filter((l) => l.match_perfecto).length;
    $("#stats").innerHTML = `
      <div class="stat"><b>${total}</b><span>avisos</span></div>
      <div class="stat hl"><b>${match}</b><span>🎯 match</span></div>
      <div class="stat"><b>${favoritos.size}</b><span>⭐ favoritas</span></div>`;
  }

  // ===================================================================
  // Filtros
  // ===================================================================
  function montarFiltros() {
    const precio = $("#f-precio");
    precio.value = F.precioMax;
    $("#f-precio-val").textContent = clp(F.precioMax);
    precio.oninput = () => { F.precioMax = +precio.value; $("#f-precio-val").textContent = clp(F.precioMax); render(); };

    const arriendo = $("#f-arriendo");
    const setArrLbl = () => $("#f-arriendo-val").textContent = F.arriendoMax >= 1000000 ? "sin límite" : clp(F.arriendoMax);
    setArrLbl();
    arriendo.oninput = () => { F.arriendoMax = +arriendo.value; setArrLbl(); render(); };

    const gc = $("#f-gc");
    const setGcLbl = () => $("#f-gc-val").textContent = F.gcMax >= 400000 ? "sin límite" : clp(F.gcMax);
    setGcLbl();
    gc.oninput = () => { F.gcMax = +gc.value; setGcLbl(); render(); };

    const metro = $("#f-metro");
    const setMetroLbl = () => $("#f-metro-val").textContent = F.metroMax >= 2000 ? "sin límite" : F.metroMax + " m";
    setMetroLbl();
    metro.oninput = () => { F.metroMax = +metro.value; setMetroLbl(); render(); };

    const sup = $("#f-sup");
    const setSupLbl = () => $("#f-sup-val").textContent = F.supMin > 0 ? F.supMin + " m²" : "sin mín.";
    setSupLbl();
    sup.oninput = () => { F.supMin = +sup.value; setSupLbl(); render(); };

    $("#f-texto").oninput = (e) => { F.texto = e.target.value; render(); };
    $("#f-antiguedad").onchange = (e) => { F.antiguedad = e.target.value; render(); };

    $$("#f-dorm button").forEach((b) => {
      b.onclick = () => { $$("#f-dorm button").forEach((x) => x.classList.remove("active")); b.classList.add("active"); F.dorm = +b.dataset.v; render(); };
    });
    $$("#f-moneda button").forEach((b) => {
      b.onclick = () => { $$("#f-moneda button").forEach((x) => x.classList.remove("active")); b.classList.add("active"); F.moneda = b.dataset.v; render(); };
    });

    construirChips();

    $("#f-presupuesto").onchange = (e) => { F.soloPresupuesto = e.target.checked; render(); };
    $("#f-barrio-obj").onchange = (e) => { F.soloBarrio = e.target.checked; render(); };
    $("#f-mascotas").onchange = (e) => { F.mascotas = e.target.checked; render(); };
    $("#f-mariposa").onchange = (e) => { F.mariposa = e.target.checked; render(); };
    $("#f-ofertas").onchange = (e) => { F.soloOfertas = e.target.checked; render(); };
    const nOf = LISTINGS.filter((l) => l.etiqueta_precio === "oferta").length;
    $("#f-ofertas-n").textContent = nOf ? `(${nOf})` : "";
    $("#f-nuevas").onchange = (e) => { F.soloNuevas = e.target.checked; render(); };
    $("#f-bajaron").onchange = (e) => { F.soloBajaron = e.target.checked; render(); };
    $("#f-favoritos").onchange = (e) => { F.favoritos = e.target.checked; render(); };
    refrescarContadoresTemporales();  // contadores junto a los filtros temporales
    $("#f-ocultar-contactadas").onchange = (e) => { F.ocultarContactadas = e.target.checked; render(); };
    $("#f-orden").onchange = (e) => { F.orden = e.target.value; render(); };

    // BOTÓN MATCH PERFECTO
    $("#match-btn").onclick = () => {
      F.matchOnly = !F.matchOnly;
      $("#match-btn").classList.toggle("active", F.matchOnly);
      if (F.matchOnly && vista === "metricas") { $("#btn-lista").click(); }
      render();
    };

    $("#reset").onclick = () => {
      Object.assign(F, {
        texto: "", dorm: 0, metroMax: 2000, supMin: 0, antiguedad: "", precioMax: PMAX,
        arriendoMax: 1000000, gcMax: 400000,
        soloPresupuesto: false, soloBarrio: false, mascotas: false, mariposa: false, favoritos: false,
        soloOfertas: false,
        ocultarContactadas: false, matchOnly: false, soloNuevas: false, soloBajaron: false,
        orden: "relevancia",
      });
      F.comunas.clear(); F.barrios.clear(); F.fuentes.clear();
      $$(".chip.active").forEach((c) => c.classList.remove("active"));
      $("#f-texto").value = ""; precio.value = PMAX; $("#f-precio-val").textContent = clp(PMAX);
      arriendo.value = 1000000; setArrLbl();
      gc.value = 400000; setGcLbl();
      metro.value = 2000; setMetroLbl();
      sup.value = 0; setSupLbl();
      $("#f-antiguedad").value = "";
      $$("#f-dorm button").forEach((x, i) => x.classList.toggle("active", i === 0));
      $$("#f-moneda button").forEach((x, i) => x.classList.toggle("active", i === 0));
      ["#f-presupuesto", "#f-barrio-obj", "#f-mascotas", "#f-mariposa", "#f-ofertas", "#f-nuevas", "#f-bajaron", "#f-favoritos", "#f-ocultar-contactadas"].forEach((s) => $(s).checked = false);
      $("#f-orden").value = "relevancia";
      $("#match-btn").classList.remove("active");
      render();
    };
  }

  // ===================================================================
  // Vistas
  // ===================================================================
  function montarVista() {
    $$(".view-toggle button").forEach((b) => {
      b.onclick = () => {
        $$(".view-toggle button").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        vista = b.dataset.view;
        $("#grid").classList.toggle("hidden", vista !== "lista");
        $("#map").classList.toggle("hidden", vista !== "mapa");
        $("#metrics").classList.toggle("hidden", vista !== "metricas");
        $("#ofertas").classList.toggle("hidden", vista !== "ofertas");
        $("#temporal").classList.toggle("hidden", vista !== "temporal");
        $(".result-bar").classList.toggle("hidden", vista !== "lista" && vista !== "mapa");
        if (vista === "mapa") { if (!map) initMapa(); setTimeout(() => { map.invalidateSize(); render(); }, 60); }
        else render();
      };
    });
  }

  // ===================================================================
  // Init
  // ===================================================================
  function init() {
    if (!LISTINGS.length) {
      $("#grid").innerHTML = `<div class="empty"><h3>No hay datos todavía</h3><p>Corre <code>python run_all.py</code> para generar la base.</p></div>`;
      return;
    }
    montarBannerActualizacion();
    montarStats();
    actualizarContadores();
    montarFiltros();
    montarVista();
    render();
  }
  document.addEventListener("DOMContentLoaded", init);
})();
