/* ===================================================================
   Visor de Arriendos — lógica de UI
   Vistas: Lista · Mapa · Métricas
   Estado persistido en localStorage: contactadas y favoritas.
   =================================================================== */
(() => {
  "use strict";

  const LISTINGS = (window.LISTINGS || []).slice();
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
    dorm: 0, metroMax: 2000, antiguedad: "",
    comunas: new Set(), barrios: new Set(), fuentes: new Set(),
    soloPresupuesto: false, soloBarrio: false, mascotas: false,
    favoritos: false, ocultarContactadas: false, matchOnly: false,
    soloNuevas: false, soloBajaron: false,
    orden: "relevancia",
  };

  // ===================================================================
  // Chips dinámicos
  // ===================================================================
  const valoresUnicos = (campo) =>
    [...new Set(LISTINGS.map((l) => l[campo]).filter(Boolean))].sort();

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
    if (l.barrio) specs.push(`<span class="spec tag-barrio">📍 ${l.barrio}</span>`);
    if (l.metro_dist_m != null)
      specs.push(`<span class="spec tag-metro">Ⓜ ${l.metro_cercano} · ${l.metro_dist_m} m</span>`);

    const gcTxt = l.gastos_comunes_estimado
      ? `<span class="est">GC est.</span>` : `GC ${clp(l.gastos_comunes_clp)}`;

    // cambio de precio vs. la foto anterior
    let precioCambio = "";
    if (l.precio_delta) {
      const baja = l.precio_delta < 0;
      precioCambio = `<span class="precio-cambio ${baja ? "baja" : "sube"}">${baja ? "▼" : "▲"} ${clp(Math.abs(l.precio_delta))} vs. antes</span>`;
    }
    const nuevoBadge = l.es_nuevo ? `<span class="nuevo-badge">✦ Nuevo</span>` : "";

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
        <div class="price-row"><div class="price">${clp(l.precio_clp)} <small>/mes</small></div>${precioCambio}</div>
        <div class="total">Total est. <b>${clp(l.total_estimado_clp)}</b> · ${gcTxt}</div>
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
      const aprox = l.ubicacion_aprox ? `<div class="pop-aprox">📍 Ubicación aproximada (centro de comuna)</div>` : "";
      m.bindPopup(`
        <div class="pop">${img}
          <div class="pop-b">
            <div class="pop-price">${clp(l.precio_clp)} <small style="font-size:11px;color:#7a736b">/mes · total ${clp(l.total_estimado_clp)}</small></div>
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
  // Banner de última actualización
  // ===================================================================
  function montarBannerActualizacion() {
    const bar = $("#update-bar");
    if (!bar) return;
    const fecha = META.ultima_actualizacion || META.generado || "—";
    let extra = "";
    if (META.es_primera_foto) {
      extra = `<span class="ub-tag">primera foto — el análisis temporal se llena al re-ejecutar</span>`;
    } else {
      const n = META.nuevos_desde_anterior || 0;
      const baja = META.bajaron_precio || 0;
      extra = `<span class="ub-tag nuevo">✦ ${n} nuevas</span>` +
        (baja ? `<span class="ub-tag baja">▼ ${baja} bajaron de precio</span>` : "") +
        `<span class="ub-since">desde ${(META.fecha_anterior || "").replace("_", " ")}</span>`;
    }
    bar.innerHTML = `<span class="ub-date">🕒 Última actualización: <b>${fecha}</b></span>${extra}`;
  }

  // ===================================================================
  // Análisis temporal
  // ===================================================================
  function pintarTemporal() {
    const serie = META.serie_temporal || [];
    const cont = $("#temporal");
    if (serie.length <= 1) {
      cont.innerHTML = `
        <div class="metric-card wide">
          <h3>Análisis temporal</h3>
          <p style="color:var(--muted);font-size:14px;line-height:1.6">
            Esta es la <b>primera foto</b> de la base (${(META.ultima_actualizacion||"")}).
            Cada vez que corras <code>python run_all.py</code> se guarda una nueva foto
            fechada en <code>data/snapshots/</code>, y aquí verás la evolución:
            cuántas propiedades nuevas aparecen, cuántas bajan de precio y cómo cambia
            el precio mediano en el tiempo. Vuelve después de la próxima actualización.
          </p>
          ${serie.length === 1 ? tablaSerie(serie) : ""}
        </div>`;
      return;
    }
    // series de tiempo (barras simples)
    const fechas = serie.map((s) => s.fecha.replace("_", " "));
    cont.innerHTML = `
      <div class="metrics-grid">
        <div class="metric-card wide">
          <h3>Evolución (cada punto es una actualización)</h3>
          ${miniSerie("Total de avisos", serie.map((s) => s.total), fechas)}
          ${miniSerie("Match perfecto 🎯", serie.map((s) => s.match_perfecto), fechas)}
          ${miniSerie("3+ dormitorios", serie.map((s) => s.tres_dorms), fechas)}
          ${miniSerie("Precio mediano (total)", serie.map((s) => s.precio_mediano), fechas, true)}
        </div>
        <div class="metric-card">
          <h3>Novedades de la última actualización</h3>
          ${kpi(META.nuevos_desde_anterior || 0, "✦ Avisos nuevos", "hl")}
          ${kpi(META.desaparecidos || 0, "✕ Ya no están")}
          ${kpi(META.bajaron_precio || 0, "▼ Bajaron de precio")}
          ${kpi(META.subieron_precio || 0, "▲ Subieron de precio")}
        </div>
        <div class="metric-card">
          <h3>✦ Avisos nuevos (${LISTINGS.filter((l) => l.es_nuevo).length})</h3>
          ${listaNuevos()}
        </div>
        <div class="metric-card">
          <h3>✕ Ya no están (${(META.desaparecidos_lista || []).length})</h3>
          ${listaDesaparecidos()}
        </div>
        <div class="metric-card">
          <h3>▼ Bajas de precio (top)</h3>
          ${listaCambios(-1)}
        </div>
        <div class="metric-card">
          <h3>▲ Subieron de precio (top)</h3>
          ${listaCambios(1)}
        </div>
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

    $("#f-texto").oninput = (e) => { F.texto = e.target.value; render(); };
    $("#f-antiguedad").onchange = (e) => { F.antiguedad = e.target.value; render(); };

    $$("#f-dorm button").forEach((b) => {
      b.onclick = () => { $$("#f-dorm button").forEach((x) => x.classList.remove("active")); b.classList.add("active"); F.dorm = +b.dataset.v; render(); };
    });

    montarChips("f-comuna", valoresUnicos("comuna"), F.comunas);
    montarChips("f-barrio", valoresUnicos("barrio"), F.barrios);
    montarChips("f-fuente", valoresUnicos("fuente"), F.fuentes, (v) => FUENTE_NOMBRE[v] || v);

    $("#f-presupuesto").onchange = (e) => { F.soloPresupuesto = e.target.checked; render(); };
    $("#f-barrio-obj").onchange = (e) => { F.soloBarrio = e.target.checked; render(); };
    $("#f-mascotas").onchange = (e) => { F.mascotas = e.target.checked; render(); };
    $("#f-nuevas").onchange = (e) => { F.soloNuevas = e.target.checked; render(); };
    $("#f-bajaron").onchange = (e) => { F.soloBajaron = e.target.checked; render(); };
    $("#f-favoritos").onchange = (e) => { F.favoritos = e.target.checked; render(); };
    // contadores junto a los filtros temporales
    const nNuevas = LISTINGS.filter((l) => l.es_nuevo).length;
    const nBaja = LISTINGS.filter((l) => l.precio_delta && l.precio_delta < 0).length;
    $("#f-nuevas-n").textContent = nNuevas ? `(${nNuevas})` : "";
    $("#f-bajaron-n").textContent = nBaja ? `(${nBaja})` : "";
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
        texto: "", dorm: 0, metroMax: 2000, antiguedad: "", precioMax: PMAX,
        arriendoMax: 1000000, gcMax: 400000,
        soloPresupuesto: false, soloBarrio: false, mascotas: false, favoritos: false,
        ocultarContactadas: false, matchOnly: false, soloNuevas: false, soloBajaron: false,
        orden: "relevancia",
      });
      F.comunas.clear(); F.barrios.clear(); F.fuentes.clear();
      $$(".chip.active").forEach((c) => c.classList.remove("active"));
      $("#f-texto").value = ""; precio.value = PMAX; $("#f-precio-val").textContent = clp(PMAX);
      arriendo.value = 1000000; setArrLbl();
      gc.value = 400000; setGcLbl();
      metro.value = 2000; setMetroLbl();
      $("#f-antiguedad").value = "";
      $$("#f-dorm button").forEach((x, i) => x.classList.toggle("active", i === 0));
      ["#f-presupuesto", "#f-barrio-obj", "#f-mascotas", "#f-nuevas", "#f-bajaron", "#f-favoritos", "#f-ocultar-contactadas"].forEach((s) => $(s).checked = false);
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
        $("#temporal").classList.toggle("hidden", vista !== "temporal");
        $(".result-bar").classList.toggle("hidden", vista === "metricas" || vista === "temporal");
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
