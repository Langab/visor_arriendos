/* ===================================================================
   Visor de Arriendos — lógica de UI (lista + mapa + filtros)
   Datos: window.LISTINGS y window.META (generados por consolidate.py).
   Estado "contactada": persistido en localStorage.
   =================================================================== */
(() => {
  "use strict";

  const LISTINGS = (window.LISTINGS || []).slice();
  const META = window.META || {};
  const LS_KEY = "arriendos_contactadas";

  // ---------- estado contactadas (localStorage) ----------
  const contactadas = new Set(JSON.parse(localStorage.getItem(LS_KEY) || "[]"));
  const guardarContactadas = () =>
    localStorage.setItem(LS_KEY, JSON.stringify([...contactadas]));

  // ---------- helpers ----------
  const $ = (s, ctx = document) => ctx.querySelector(s);
  const $$ = (s, ctx = document) => [...ctx.querySelectorAll(s)];
  const clp = (n) =>
    n == null ? "—" : "$" + Math.round(n).toLocaleString("es-CL");
  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  const FUENTE_NOMBRE = {
    portalinmobiliario: "Portal Inmob.",
    yapo: "Yapo",
    toctoc: "TocToc",
    goplaceit: "GoPlaceIt",
    facebook_marketplace: "Facebook",
  };

  // ---------- nivel de match (color) ----------
  function nivel(l) {
    if (l.dentro_presupuesto && l.calza_dormitorios) return "good";
    if (l.dentro_presupuesto || (l.dormitorios || 0) >= 2) return "mid";
    return "bad";
  }

  // ---------- estado de filtros ----------
  const F = {
    texto: "",
    precioMax: Math.max(META.presupuesto_max || 800000, 800000),
    dorm: 0,
    comunas: new Set(),
    barrios: new Set(),
    fuentes: new Set(),
    soloPresupuesto: false,
    soloBarrio: false,
    ocultarContactadas: false,
    orden: "relevancia",
  };

  // ===================================================================
  // Construcción de chips dinámicos (comuna / barrio / fuente)
  // ===================================================================
  function valoresUnicos(campo) {
    return [...new Set(LISTINGS.map((l) => l[campo]).filter(Boolean))].sort();
  }

  function montarChips(contenedorId, valores, setEstado, etiqueta) {
    const cont = $("#" + contenedorId);
    cont.innerHTML = "";
    valores.forEach((v) => {
      const c = document.createElement("div");
      c.className = "chip";
      c.textContent = etiqueta ? etiqueta(v) : v;
      c.onclick = () => {
        c.classList.toggle("active");
        if (setEstado.has(v)) setEstado.delete(v);
        else setEstado.add(v);
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
      if (F.texto) {
        const hay = (l.titulo + " " + l.direccion + " " + l.barrio).toLowerCase();
        if (!hay.includes(F.texto.toLowerCase())) return false;
      }
      if (l.total_estimado_clp != null && l.total_estimado_clp > F.precioMax) return false;
      if (F.dorm && (l.dormitorios || 0) < F.dorm) return false;
      if (F.comunas.size && !F.comunas.has(l.comuna)) return false;
      if (F.barrios.size && !F.barrios.has(l.barrio)) return false;
      if (F.fuentes.size && !F.fuentes.has(l.fuente)) return false;
      if (F.soloPresupuesto && !l.dentro_presupuesto) return false;
      if (F.soloBarrio && !l.en_barrio_objetivo) return false;
      if (F.ocultarContactadas && contactadas.has(l.id)) return false;
      return true;
    });

    const ord = {
      relevancia: (a, b) =>
        (b.relevancia || 0) - (a.relevancia || 0) ||
        (a.total_estimado_clp || 9e9) - (b.total_estimado_clp || 9e9),
      "precio-asc": (a, b) => (a.total_estimado_clp || 9e9) - (b.total_estimado_clp || 9e9),
      "precio-desc": (a, b) => (b.total_estimado_clp || 0) - (a.total_estimado_clp || 0),
      "m2-desc": (a, b) => (b.superficie_m2 || 0) - (a.superficie_m2 || 0),
    };
    out.sort(ord[F.orden]);
    return out;
  }

  // ===================================================================
  // Render — tarjetas
  // ===================================================================
  function tarjeta(l) {
    const nv = nivel(l);
    const esContactada = contactadas.has(l.id);
    const relTxt = { good: "Calza", mid: "Parcial", bad: "Fuera" }[nv];
    const card = document.createElement("article");
    card.className = "card" + (esContactada ? " contactada" : "");

    const specs = [];
    if (l.dormitorios) specs.push(`🛏 ${l.dormitorios}D`);
    if (l.banos) specs.push(`🛁 ${l.banos}B`);
    if (l.superficie_m2) specs.push(`📐 ${Math.round(l.superficie_m2)} m²`);
    if (l.plazo_entrega) specs.push(`🗓 ${l.plazo_entrega}`);
    if (l.barrio) specs.push(`<span class="spec tag-barrio">📍 ${l.barrio}</span>`);

    const gcTxt = l.gastos_comunes_estimado
      ? `<span class="est">GC est.</span>`
      : `GC ${clp(l.gastos_comunes_clp)}`;

    const img = l.imagen
      ? `<img loading="lazy" src="${l.imagen}" alt="" onerror="this.parentNode.innerHTML='<div class=ph>🏢</div>'">`
      : `<div class="ph">🏢</div>`;

    card.innerHTML = `
      <div class="thumb">
        <span class="badge-rel ${nv}">${relTxt}</span>
        <span class="src-chip">${FUENTE_NOMBRE[l.fuente] || l.fuente}</span>
        ${img}
      </div>
      <div class="body">
        <div class="price-row">
          <div class="price">${clp(l.precio_clp)} <small>/mes</small></div>
        </div>
        <div class="total">Total est. <b>${clp(l.total_estimado_clp)}</b> · ${gcTxt}</div>
        <h3 class="title">${l.titulo || "Departamento en arriendo"}</h3>
        <p class="addr">${l.direccion || ""}</p>
        <div class="specs">${specs
          .map((s) => (s.startsWith("<") ? s : `<span class="spec">${s}</span>`))
          .join("")}</div>
        <div class="actions">
          <a class="btn primary" href="${l.url}" target="_blank" rel="noopener">Ver fotos ↗</a>
          ${l.google_maps ? `<a class="btn map" href="${l.google_maps}" target="_blank" rel="noopener" title="Ver en Google Maps">🗺</a>` : ""}
          <button class="btn contact ${esContactada ? "on" : ""}" title="Marcar contactada" data-id="${l.id}">✓</button>
        </div>
      </div>`;

    card.querySelector(".btn.contact").onclick = (e) => {
      e.stopPropagation();
      toggleContactada(l.id);
    };
    return card;
  }

  function toggleContactada(id) {
    if (contactadas.has(id)) contactadas.delete(id);
    else contactadas.add(id);
    guardarContactadas();
    render();
  }

  // ===================================================================
  // Render — mapa (Leaflet)
  // ===================================================================
  let map, capaMarcadores;
  function initMapa() {
    map = L.map("map", { scrollWheelZoom: true }).setView([-33.435, -70.62], 14);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap",
      maxZoom: 19,
    }).addTo(map);
    capaMarcadores = L.layerGroup().addTo(map);
  }

  function pinIcon(nv) {
    return L.divIcon({
      className: "",
      html: `<div class="marker-pin ${nv}"></div>`,
      iconSize: [26, 26],
      iconAnchor: [13, 26],
      popupAnchor: [0, -24],
    });
  }

  function pintarMapa(items) {
    if (!map) initMapa();
    capaMarcadores.clearLayers();
    const conGeo = items.filter((l) => l.lat && l.lng);
    const bounds = [];
    conGeo.forEach((l) => {
      const nv = contactadas.has(l.id) ? "done" : nivel(l);
      const m = L.marker([l.lat, l.lng], {
        icon: pinIcon(nv),
        opacity: l.ubicacion_aprox ? 0.6 : 1,
      });
      const img = l.imagen
        ? `<img src="${l.imagen}" onerror="this.style.display='none'">`
        : "";
      const aprox = l.ubicacion_aprox
        ? `<div class="pop-aprox">📍 Ubicación aproximada (centro de comuna)</div>`
        : "";
      m.bindPopup(`
        <div class="pop">
          ${img}
          <div class="pop-b">
            <div class="pop-price">${clp(l.precio_clp)} <small style="font-size:11px;color:#7a736b">/mes · total ${clp(l.total_estimado_clp)}</small></div>
            <div class="pop-t">${l.titulo || "Departamento"}</div>
            <div class="pop-a">${l.direccion || ""}</div>
            ${aprox}
            <a class="pop-link" href="${l.url}" target="_blank" rel="noopener">Ver propiedad y fotos ↗</a>
          </div>
        </div>`);
      m.addTo(capaMarcadores);
      bounds.push([l.lat, l.lng]);
    });
    if (bounds.length) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    return conGeo.length;
  }

  // ===================================================================
  // Render principal
  // ===================================================================
  let vista = "lista";
  function render() {
    const items = aplicar();
    const grid = $("#grid");
    const count = $("#count");

    // contador
    const calzan = items.filter((l) => nivel(l) === "good").length;
    count.innerHTML = `<b>${items.length}</b> propiedades · ${calzan} calzan con tu búsqueda`;

    // lista
    grid.innerHTML = "";
    if (!items.length) {
      grid.innerHTML = `<div class="empty"><h3>Sin resultados</h3><p>Prueba ampliando el presupuesto o quitando filtros.</p></div>`;
    } else {
      const frag = document.createDocumentFragment();
      items.forEach((l) => frag.appendChild(tarjeta(l)));
      grid.appendChild(frag);
    }

    // mapa
    if (vista === "mapa") {
      const n = pintarMapa(items);
      if (n < items.length) {
        count.innerHTML += ` · <span style="color:var(--muted)">${n} en el mapa (con coordenadas)</span>`;
      }
    }
  }

  // ===================================================================
  // Stats del encabezado
  // ===================================================================
  function montarStats() {
    const total = LISTINGS.length;
    const calzan = LISTINGS.filter((l) => l.dentro_presupuesto && l.calza_dormitorios).length;
    const enBarrio = LISTINGS.filter((l) => l.en_barrio_objetivo).length;
    $("#stats").innerHTML = `
      <div class="stat"><b>${total}</b><span>avisos</span></div>
      <div class="stat hl"><b>${calzan}</b><span>calzan</span></div>
      <div class="stat"><b>${enBarrio}</b><span>en barrio</span></div>`;
  }

  // ===================================================================
  // Cableado de filtros
  // ===================================================================
  function montarFiltros() {
    const precio = $("#f-precio");
    precio.value = F.precioMax;
    $("#f-precio-val").textContent = clp(F.precioMax);
    precio.oninput = () => {
      F.precioMax = +precio.value;
      $("#f-precio-val").textContent = clp(F.precioMax);
      render();
    };

    $("#f-texto").oninput = (e) => { F.texto = e.target.value; render(); };

    $$("#f-dorm button").forEach((b) => {
      b.onclick = () => {
        $$("#f-dorm button").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        F.dorm = +b.dataset.v;
        render();
      };
    });

    montarChips("f-comuna", valoresUnicos("comuna"), F.comunas);
    montarChips("f-barrio", valoresUnicos("barrio"), F.barrios);
    montarChips("f-fuente", valoresUnicos("fuente"), F.fuentes,
      (v) => FUENTE_NOMBRE[v] || v);

    $("#f-presupuesto").onchange = (e) => { F.soloPresupuesto = e.target.checked; render(); };
    $("#f-barrio-obj").onchange = (e) => { F.soloBarrio = e.target.checked; render(); };
    $("#f-ocultar-contactadas").onchange = (e) => { F.ocultarContactadas = e.target.checked; render(); };
    $("#f-orden").onchange = (e) => { F.orden = e.target.value; render(); };

    $("#reset").onclick = () => {
      F.texto = ""; F.dorm = 0; F.comunas.clear(); F.barrios.clear(); F.fuentes.clear();
      F.soloPresupuesto = F.soloBarrio = F.ocultarContactadas = false;
      F.precioMax = Math.max(META.presupuesto_max || 800000, 800000);
      document.querySelectorAll(".chip.active").forEach((c) => c.classList.remove("active"));
      $("#f-texto").value = ""; precio.value = F.precioMax;
      $("#f-precio-val").textContent = clp(F.precioMax);
      $$("#f-dorm button").forEach((x, i) => x.classList.toggle("active", i === 0));
      $("#f-presupuesto").checked = $("#f-barrio-obj").checked = $("#f-ocultar-contactadas").checked = false;
      $("#f-orden").value = "relevancia"; F.orden = "relevancia";
      render();
    };
  }

  // ===================================================================
  // Cambio de vista lista/mapa
  // ===================================================================
  function montarVista() {
    $$(".view-toggle button").forEach((b) => {
      b.onclick = () => {
        $$(".view-toggle button").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        vista = b.dataset.view;
        $("#grid").classList.toggle("hidden", vista === "mapa");
        $("#map").classList.toggle("hidden", vista !== "mapa");
        if (vista === "mapa") {
          if (!map) initMapa();
          setTimeout(() => { map.invalidateSize(); render(); }, 60);
        } else {
          render();
        }
      };
    });
  }

  // ===================================================================
  // Init
  // ===================================================================
  function init() {
    if (!LISTINGS.length) {
      $("#grid").innerHTML =
        `<div class="empty"><h3>No hay datos todavía</h3>
         <p>Corre <code>python run_all.py</code> en la carpeta del proyecto para generar la base.</p></div>`;
      return;
    }
    montarStats();
    montarFiltros();
    montarVista();
    render();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
