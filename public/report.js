/* Informe PDF - Grupo Bimbo Uruguay */

const STORES = ['tata', 'disco', 'eldorado', 'tiendainglesa'];
const STORE_LABELS = { tata: 'Tata', disco: 'Disco', eldorado: 'El Dorado', tiendainglesa: 'T. Inglesa' };
const STORE_COLORS = {
  tata:         '#e31837',
  disco:        '#1565c0',
  eldorado:     '#2e7d32',
  tiendainglesa:'#f57c00',
};

let state = null;
let pdfBlob = null;
let emailList = [];

// ─── Boot ────────────────────────────────────────────────────────────────────
async function init() {
  try {
    const res = await fetch('/data/latest.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('No se pudo cargar latest.json');
    const data = await res.json();
    state = processData(data);
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('mainContent').style.display = '';
    renderAll();
    setupActions();
  } catch (e) {
    document.getElementById('loadingState').innerHTML =
      `<p style="color:#c62828">Error al cargar datos: ${e.message}</p>`;
  }
}

// ─── Data processing ─────────────────────────────────────────────────────────
function processData(raw) {
  const items = (raw.items || []).filter(i => i.price != null && i.price > 0);
  const brands = [...new Set(items.map(i => i.brand))].filter(Boolean).sort();
  const offers = items.filter(i => i.listPrice && i.listPrice > 0 && i.price < i.listPrice);
  const withSuggested = items.filter(i => i.suggestedPrice);
  const above  = withSuggested.filter(i => i.gapPct > 0);
  const ok     = withSuggested.filter(i => i.gapPct === 0 || (i.gapPct >= -3 && i.gapPct <= 3));
  const below  = withSuggested.filter(i => i.gapPct < -3);

  // Coverage: brand × store → count of SKUs
  const coverage = {};
  brands.forEach(b => {
    coverage[b] = {};
    STORES.forEach(s => {
      coverage[b][s] = items.filter(i => i.brand === b && i.super === s).length;
    });
  });

  return {
    raw, items, brands, offers,
    withSuggested, above, ok, below, coverage,
    generatedAt: raw.generatedAt,
    suggested: raw.suggested,
  };
}

// ─── Render all sections ──────────────────────────────────────────────────────
function renderAll() {
  renderHeader();
  renderKPIs();
  renderCoverageMatrix();
  renderCharts();
  renderPriceTable();
  renderOffersTable();
  renderCatalogTable();
  renderDataInfo();
}

function renderHeader() {
  const d = state.generatedAt ? new Date(state.generatedAt) : new Date();
  document.getElementById('headerDate').textContent =
    `Grupo Bimbo · Uruguay · ${d.toLocaleDateString('es-UY', { day:'2-digit', month:'long', year:'numeric' })} ${d.toLocaleTimeString('es-UY', { hour:'2-digit', minute:'2-digit' })}`;
}

function renderKPIs() {
  const { items, brands, offers, withSuggested, above, below } = state;
  const supers = [...new Set(items.map(i => i.super))];
  const covPct = brands.length > 0
    ? Math.round(brands.filter(b => STORES.some(s => state.coverage[b][s] > 0)).length / brands.length * 100)
    : 0;

  const kpis = [
    { label: 'Total Productos', value: items.length, sub: `${supers.length} cadenas` },
    { label: 'Marcas', value: brands.length, sub: 'en cartera' },
    { label: 'Ofertas activas', value: offers.length, sub: 'con descuento' },
    { label: 'Sobre PVP', value: above.length, sub: `de ${withSuggested.length} con PVP` },
    { label: 'Bajo PVP', value: below.length, sub: 'precio bajo sugerido' },
    { label: 'Cobertura', value: covPct + '%', sub: 'marcas en al menos 1 cadena' },
  ];

  document.getElementById('kpiGrid').innerHTML = kpis.map(k => `
    <div class="kpi-card">
      <div class="label">${k.label}</div>
      <div class="value">${k.value}</div>
      <div class="sub">${k.sub}</div>
    </div>
  `).join('');
}

function renderCoverageMatrix() {
  const { brands, coverage } = state;
  let html = `<thead><tr><th>Marca</th>${STORES.map(s => `<th class="num">${STORE_LABELS[s]}</th>`).join('')}<th class="num">Total</th></tr></thead><tbody>`;
  brands.forEach(b => {
    const counts = STORES.map(s => coverage[b][s]);
    const total = counts.reduce((a, v) => a + v, 0);
    html += `<tr><td><strong>${cap(b)}</strong></td>`;
    counts.forEach((c, i) => {
      html += `<td class="num"><span class="cov-dot ${c > 0 ? 'has' : 'none'}"></span>${c > 0 ? c : '—'}</td>`;
    });
    html += `<td class="num"><strong>${total}</strong></td></tr>`;
  });
  html += '</tbody>';
  document.getElementById('covMatrix').innerHTML = html;
}

function renderCharts() {
  renderCoverageChart();
  renderGapChart();
}

function renderCoverageChart() {
  const { brands, coverage } = state;
  const ctx = document.getElementById('chartCoverage').getContext('2d');
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: brands.map(cap),
      datasets: STORES.map(s => ({
        label: STORE_LABELS[s],
        data: brands.map(b => coverage[b][s]),
        backgroundColor: STORE_COLORS[s] + 'cc',
        borderColor: STORE_COLORS[s],
        borderWidth: 1,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } },
      scales: {
        x: { grid: { display: false } },
        y: { beginAtZero: true, ticks: { stepSize: 1 } },
      },
    },
  });
}

function renderGapChart() {
  const { above, ok, below, withSuggested } = state;
  const ctx = document.getElementById('chartGap').getContext('2d');
  if (!withSuggested.length) {
    ctx.canvas.parentElement.innerHTML = '<p style="color:var(--text-muted);font-size:13px;text-align:center;padding:40px 0">Sin datos de PVP sugerido</p>';
    return;
  }
  new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Sobre PVP', 'En rango', 'Bajo PVP'],
      datasets: [{ data: [above.length, ok.length, below.length], backgroundColor: ['#c62828cc', '#2e7d32cc', '#f57c00cc'], borderWidth: 2 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      cutout: '65%',
    },
  });
  document.getElementById('gapLegend').innerHTML = [
    { label: 'Sobre PVP', count: above.length, color: '#c62828' },
    { label: 'En rango', count: ok.length, color: '#2e7d32' },
    { label: 'Bajo PVP', count: below.length, color: '#f57c00' },
  ].map(l => `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
      <span style="width:12px;height:12px;border-radius:50%;background:${l.color};flex-shrink:0"></span>
      <span style="font-size:13px">${l.label}</span>
      <span style="margin-left:auto;font-weight:700;font-size:14px">${l.count}</span>
    </div>
  `).join('');
}

function renderPriceTable() {
  const { items } = state;
  const withPvp = items.filter(i => i.suggestedPrice).sort((a, b) => Math.abs(b.gapPct || 0) - Math.abs(a.gapPct || 0));
  const show = withPvp.slice(0, 60);
  document.getElementById('priceTableNote').textContent =
    withPvp.length ? `Mostrando ${show.length} de ${withPvp.length} productos con PVP sugerido, ordenados por mayor desviación.` : 'No hay productos con PVP sugerido asignado.';
  document.getElementById('priceRows').innerHTML = show.map(i => {
    const gap = i.gapPct != null ? i.gapPct.toFixed(1) + '%' : '—';
    const cls = i.gapPct == null ? '' : i.gapPct > 3 ? 'above' : i.gapPct < -3 ? 'below' : 'ok';
    const label = cls === 'above' ? 'Sobre PVP' : cls === 'below' ? 'Bajo PVP' : cls === 'ok' ? 'En rango' : '';
    return `<tr>
      <td>${escHtml(i.name)}</td>
      <td>${escHtml(cap(i.brand))}</td>
      <td>${STORE_LABELS[i.super] || i.super}</td>
      <td class="num">${fmt(i.price)}</td>
      <td class="num">${i.suggestedPrice ? fmt(i.suggestedPrice) : '—'}</td>
      <td class="num" style="color:${cls === 'above' ? '#c62828' : cls === 'below' ? '#f57c00' : '#2e7d32'}">${gap}</td>
      <td>${cls ? `<span class="tag ${cls}">${label}</span>` : ''}</td>
    </tr>`;
  }).join('');
}

function renderOffersTable() {
  const { offers } = state;
  if (!offers.length) {
    document.getElementById('offersTable').style.display = 'none';
    document.getElementById('offersEmpty').style.display = '';
    return;
  }
  const sorted = [...offers].sort((a, b) => {
    const da = (a.listPrice - a.price) / a.listPrice;
    const db = (b.listPrice - b.price) / b.listPrice;
    return db - da;
  });
  document.getElementById('offersRows').innerHTML = sorted.map(i => {
    const disc = ((i.listPrice - i.price) / i.listPrice * 100).toFixed(1);
    return `<tr>
      <td>${escHtml(i.name)}</td>
      <td>${escHtml(cap(i.brand))}</td>
      <td>${STORE_LABELS[i.super] || i.super}</td>
      <td class="num">${fmt(i.listPrice)}</td>
      <td class="num" style="color:var(--primary);font-weight:700">${fmt(i.price)}</td>
      <td class="num">
        <span class="tag offer">-${disc}%</span>
        <div class="disc-bar"><div class="disc-bar-fill" style="width:${Math.min(parseFloat(disc)*2,100)}%"></div></div>
      </td>
    </tr>`;
  }).join('');
}

function renderCatalogTable() {
  const { items } = state;
  document.getElementById('catalogRows').innerHTML = [...items]
    .sort((a, b) => a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name))
    .map(i => `<tr>
      <td>${escHtml(i.name)}</td>
      <td>${escHtml(cap(i.brand))}</td>
      <td>${STORE_LABELS[i.super] || i.super}</td>
      <td class="num">${fmt(i.price)}</td>
      <td class="num">${i.listPrice ? fmt(i.listPrice) : '—'}</td>
      <td>${i.listPrice && i.price < i.listPrice ? '<span class="tag offer">Oferta</span>' : ''}</td>
    </tr>`).join('');
}

function renderDataInfo() {
  const { items, brands, offers, generatedAt } = state;
  const d = generatedAt ? new Date(generatedAt) : null;
  document.getElementById('dataInfo').innerHTML = `
    <div><strong>Actualizado:</strong> ${d ? d.toLocaleString('es-UY') : 'Desconocido'}</div>
    <div><strong>Total SKUs:</strong> ${items.length}</div>
    <div><strong>Marcas:</strong> ${brands.length}</div>
    <div><strong>Cadenas:</strong> ${[...new Set(items.map(i => i.super))].length}</div>
    <div><strong>Ofertas:</strong> ${offers.length}</div>
  `;
}

// ─── PDF Generation ───────────────────────────────────────────────────────────
async function generatePDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const W = 210, H = 297;
  const MARGIN = 14;
  const CONTENT_W = W - MARGIN * 2;
  const RED = [227, 24, 55];
  const DARK = [26, 26, 46];
  const GRAY = [100, 100, 100];

  const d = state.generatedAt ? new Date(state.generatedAt) : new Date();
  const dateStr = d.toLocaleDateString('es-UY', { day:'2-digit', month:'long', year:'numeric' });
  const timeStr = d.toLocaleTimeString('es-UY', { hour:'2-digit', minute:'2-digit' });

  // ── Page 1: Cover ──────────────────────────────────────────────────────────
  // Header bar
  doc.setFillColor(...RED);
  doc.rect(0, 0, W, 42, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('Informe de Precios', MARGIN, 20);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text('Grupo Bimbo · Supermercados Uruguay', MARGIN, 30);
  doc.setFontSize(10);
  doc.text(`${dateStr}  ${timeStr}`, MARGIN, 38);

  // KPI cards
  const { items, brands, offers, withSuggested, above, below } = state;
  const kpis = [
    { label: 'Total Productos', value: String(items.length) },
    { label: 'Marcas en cartera', value: String(brands.length) },
    { label: 'Ofertas activas', value: String(offers.length) },
    { label: 'Con PVP asignado', value: String(withSuggested.length) },
    { label: 'Sobre PVP sugerido', value: String(above.length) },
    { label: 'Bajo PVP sugerido', value: String(below.length) },
  ];

  let y = 56;
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...DARK);
  doc.text('Resumen ejecutivo', MARGIN, y);
  y += 8;

  const cardW = (CONTENT_W - 10) / 3;
  kpis.forEach((k, idx) => {
    const col = idx % 3;
    const row = Math.floor(idx / 3);
    const x = MARGIN + col * (cardW + 5);
    const cy = y + row * 28;

    doc.setFillColor(249, 249, 249);
    doc.setDrawColor(220, 220, 220);
    doc.roundedRect(x, cy, cardW, 22, 2, 2, 'FD');

    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...RED);
    doc.text(k.value, x + cardW / 2, cy + 12, { align: 'center' });

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...GRAY);
    doc.text(k.label, x + cardW / 2, cy + 19, { align: 'center' });
  });

  y += 64;

  // Stores legend
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...DARK);
  doc.text('Cadenas monitoreadas:', MARGIN, y);
  y += 6;
  const storeColors = { tata: RED, disco: [21,101,192], eldorado: [46,125,50], tiendainglesa: [245,124,0] };
  STORES.forEach((s, i) => {
    const x = MARGIN + i * 46;
    const [r,g,b] = storeColors[s];
    doc.setFillColor(r, g, b);
    doc.circle(x + 2, y - 1.5, 2, 'F');
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...DARK);
    doc.text(STORE_LABELS[s], x + 6, y);
  });
  y += 12;

  // ── Coverage chart image ───────────────────────────────────────────────────
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...DARK);
  doc.text('SKUs por Marca y Cadena', MARGIN, y);
  y += 6;

  try {
    const covImg = document.getElementById('chartCoverage').toDataURL('image/png');
    doc.addImage(covImg, 'PNG', MARGIN, y, CONTENT_W, 60);
    y += 65;
  } catch(e) { y += 4; }

  // ── Gap chart ─────────────────────────────────────────────────────────────
  if (withSuggested.length > 0) {
    try {
      const gapImg = document.getElementById('chartGap').toDataURL('image/png');
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...DARK);
      doc.text('Distribución vs PVP Sugerido', MARGIN, y);
      y += 6;
      doc.addImage(gapImg, 'PNG', MARGIN, y, 60, 50);

      // Legend
      const legendItems = [
        { label: 'Sobre PVP', count: above.length, color: [198,40,40] },
        { label: 'En rango',  count: state.ok.length,    color: [46,125,50] },
        { label: 'Bajo PVP',  count: below.length, color: [245,124,0] },
      ];
      let ly = y + 10;
      legendItems.forEach(l => {
        doc.setFillColor(...l.color);
        doc.circle(MARGIN + 68, ly - 1.5, 3, 'F');
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...DARK);
        doc.text(`${l.label}: ${l.count}`, MARGIN + 74, ly);
        ly += 12;
      });
      y += 56;
    } catch(e) { y += 4; }
  }

  // ── Page 2: Coverage matrix ────────────────────────────────────────────────
  doc.addPage();
  addPageHeader(doc, 'Cobertura por Marca y Cadena', W, RED, MARGIN);
  let py = 48;

  doc.autoTable({
    startY: py,
    head: [['Marca', ...STORES.map(s => STORE_LABELS[s]), 'Total']],
    body: state.brands.map(b => {
      const counts = STORES.map(s => state.coverage[b][s]);
      return [cap(b), ...counts.map(c => c > 0 ? String(c) : '—'), String(counts.reduce((a,v) => a+v, 0))];
    }),
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: RED, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [249,249,249] },
    columnStyles: { 0: { fontStyle: 'bold' }, 1: { halign: 'center' }, 2: { halign: 'center' }, 3: { halign: 'center' }, 4: { halign: 'center' }, 5: { halign: 'center' } },
    margin: { left: MARGIN, right: MARGIN },
  });

  // ── Page 3: Price vs PVP table ─────────────────────────────────────────────
  doc.addPage();
  addPageHeader(doc, 'Precios vs PVP Sugerido', W, RED, MARGIN);

  const pvpRows = items.filter(i => i.suggestedPrice)
    .sort((a, b) => Math.abs(b.gapPct || 0) - Math.abs(a.gapPct || 0))
    .slice(0, 100);

  doc.autoTable({
    startY: 48,
    head: [['Producto', 'Marca', 'Cadena', 'Precio', 'PVP Sug.', 'GAP %', 'Estado']],
    body: pvpRows.map(i => {
      const gap = i.gapPct != null ? i.gapPct.toFixed(1) + '%' : '—';
      const status = i.gapPct == null ? '' : i.gapPct > 3 ? 'Sobre PVP' : i.gapPct < -3 ? 'Bajo PVP' : 'En rango';
      return [
        i.name.substring(0, 45),
        cap(i.brand),
        STORE_LABELS[i.super] || i.super,
        fmtN(i.price),
        i.suggestedPrice ? fmtN(i.suggestedPrice) : '—',
        gap,
        status,
      ];
    }),
    theme: 'striped',
    styles: { fontSize: 8, cellPadding: 2.5, overflow: 'ellipsize' },
    headStyles: { fillColor: RED, textColor: 255, fontStyle: 'bold', fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 62 },
      2: { cellWidth: 22 },
      3: { halign: 'right', cellWidth: 20 },
      4: { halign: 'right', cellWidth: 20 },
      5: { halign: 'right', cellWidth: 16 },
      6: { cellWidth: 20 },
    },
    didParseCell(data) {
      if (data.column.index === 6 && data.section === 'body') {
        const v = data.cell.raw;
        if (v === 'Sobre PVP') data.cell.styles.textColor = [198,40,40];
        else if (v === 'Bajo PVP') data.cell.styles.textColor = [245,124,0];
        else if (v === 'En rango') data.cell.styles.textColor = [46,125,50];
      }
    },
    margin: { left: MARGIN, right: MARGIN },
  });

  // ── Page 4: Offers ─────────────────────────────────────────────────────────
  doc.addPage();
  addPageHeader(doc, 'Ofertas Vigentes', W, RED, MARGIN);

  if (state.offers.length === 0) {
    doc.setFontSize(11);
    doc.setTextColor(...GRAY);
    doc.text('No hay ofertas activas actualmente.', MARGIN, 60);
  } else {
    const sortedOffers = [...state.offers].sort((a, b) => {
      const da = (a.listPrice - a.price) / a.listPrice;
      const db = (b.listPrice - b.price) / b.listPrice;
      return db - da;
    });
    doc.autoTable({
      startY: 48,
      head: [['Producto', 'Marca', 'Cadena', 'Precio Lista', 'Precio Oferta', 'Descuento']],
      body: sortedOffers.map(i => {
        const disc = ((i.listPrice - i.price) / i.listPrice * 100).toFixed(1);
        return [
          i.name.substring(0, 50),
          cap(i.brand),
          STORE_LABELS[i.super] || i.super,
          fmtN(i.listPrice),
          fmtN(i.price),
          `-${disc}%`,
        ];
      }),
      theme: 'striped',
      styles: { fontSize: 8, cellPadding: 2.5 },
      headStyles: { fillColor: RED, textColor: 255, fontStyle: 'bold', fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 65 },
        2: { cellWidth: 22 },
        3: { halign: 'right', cellWidth: 24 },
        4: { halign: 'right', cellWidth: 24, textColor: RED },
        5: { halign: 'right', cellWidth: 20, textColor: RED, fontStyle: 'bold' },
      },
      margin: { left: MARGIN, right: MARGIN },
    });
  }

  // ── Page 5: Full catalog ───────────────────────────────────────────────────
  doc.addPage();
  addPageHeader(doc, 'Catálogo Completo', W, RED, MARGIN);

  const catalogSorted = [...items].sort((a, b) => a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name));
  doc.autoTable({
    startY: 48,
    head: [['Producto', 'Marca', 'Cadena', 'Precio', 'Precio Lista', 'Oferta']],
    body: catalogSorted.map(i => [
      i.name.substring(0, 55),
      cap(i.brand),
      STORE_LABELS[i.super] || i.super,
      fmtN(i.price),
      i.listPrice ? fmtN(i.listPrice) : '—',
      i.listPrice && i.price < i.listPrice ? 'Sí' : '',
    ]),
    theme: 'striped',
    styles: { fontSize: 7.5, cellPadding: 2 },
    headStyles: { fillColor: RED, textColor: 255, fontStyle: 'bold', fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 70 },
      2: { cellWidth: 22 },
      3: { halign: 'right', cellWidth: 20 },
      4: { halign: 'right', cellWidth: 22 },
      5: { halign: 'center', cellWidth: 14 },
    },
    margin: { left: MARGIN, right: MARGIN },
  });

  // Page numbers
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(...GRAY);
    doc.text(`Pág. ${i} / ${totalPages}`, W - MARGIN, H - 8, { align: 'right' });
    doc.text('Informe generado automáticamente · Grupo Bimbo Uruguay', MARGIN, H - 8);
  }

  return doc;
}

function addPageHeader(doc, title, W, RED, MARGIN) {
  doc.setFillColor(...RED);
  doc.rect(0, 0, W, 36, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.text(title, MARGIN, 16);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Grupo Bimbo · Supermercados Uruguay', MARGIN, 27);
}

// ─── Actions ──────────────────────────────────────────────────────────────────
function setupActions() {
  document.getElementById('btnGenerate').addEventListener('click', handleGenerate);
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('pdfModal').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });
  document.getElementById('modalDownload').addEventListener('click', downloadPDF);
  document.getElementById('modalConfirm').addEventListener('click', () => {
    closeModal();
    document.getElementById('emailPanel').style.display = '';
    document.getElementById('emailPanel').scrollIntoView({ behavior: 'smooth' });
  });
  document.getElementById('btnDownloadOnly').addEventListener('click', downloadPDF);
  document.getElementById('btnSendEmail').addEventListener('click', handleSendEmail);
  setupEmailInput();
}

async function handleGenerate() {
  const btn = document.getElementById('btnGenerate');
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner" style="width:14px;height:14px;border-width:2px"></span> Generando...`;

  try {
    const doc = await generatePDF();
    pdfBlob = doc.output('blob');
    const url = URL.createObjectURL(pdfBlob);
    document.getElementById('pdfPreview').src = url;
    document.getElementById('pdfModal').classList.add('open');
  } catch (e) {
    alert('Error al generar el PDF: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg> Previsualizar y Generar PDF`;
  }
}

function closeModal() {
  document.getElementById('pdfModal').classList.remove('open');
}

function downloadPDF() {
  if (!pdfBlob) return;
  const d = state.generatedAt ? new Date(state.generatedAt) : new Date();
  const fname = `informe-bimbo-${d.toISOString().slice(0,10)}.pdf`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(pdfBlob);
  a.download = fname;
  a.click();
}

async function handleSendEmail() {
  if (!emailList.length || !pdfBlob) return;

  const btn = document.getElementById('btnSendEmail');
  const msg = document.getElementById('statusMsg');

  btn.disabled = true;
  btn.textContent = 'Enviando...';

  try {
    // Convert blob to base64
    const base64 = await blobToBase64(pdfBlob);
    const d = state.generatedAt ? new Date(state.generatedAt) : new Date();
    const dateStr = d.toLocaleDateString('es-UY', { day:'2-digit', month:'long', year:'numeric' });
    const fname = `informe-bimbo-${d.toISOString().slice(0,10)}.pdf`;

    const res = await fetch('/api/send-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        emails: emailList,
        subject: `Informe de Precios Bimbo - ${dateStr}`,
        pdfBase64: base64,
        filename: fname,
        summary: buildEmailSummary(),
      }),
    });

    const json = await res.json();

    if (res.ok && json.ok) {
      showStatus('ok', `Email enviado correctamente a ${emailList.length} destinatario(s).`);
    } else if (json.fallback === 'mailto') {
      // Server unavailable — open Outlook via mailto
      openMailto(dateStr);
      downloadPDF();
      showStatus('info', 'Se abrió Outlook. Adjuntá el PDF descargado y enviá.');
    } else {
      throw new Error(json.error || 'Error al enviar');
    }
  } catch (e) {
    // Network error — fallback to mailto
    const d = state.generatedAt ? new Date(state.generatedAt) : new Date();
    const dateStr = d.toLocaleDateString('es-UY', { day:'2-digit', month:'long', year:'numeric' });
    openMailto(dateStr);
    downloadPDF();
    showStatus('info', 'Se abrió Outlook con el informe. Adjuntá el PDF descargado y enviá.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Enviar a destinatarios';
    updateSendBtn();
  }
}

function openMailto(dateStr) {
  const subject = encodeURIComponent(`Informe de Precios Bimbo - ${dateStr}`);
  const body = encodeURIComponent(buildEmailSummary());
  const to = emailList.join(',');
  window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
}

function buildEmailSummary() {
  const { items, brands, offers, withSuggested, above, below } = state;
  const d = state.generatedAt ? new Date(state.generatedAt) : new Date();
  return `Informe de Precios - Grupo Bimbo Uruguay
Fecha: ${d.toLocaleDateString('es-UY')}

Resumen ejecutivo:
• Total productos relevados: ${items.length}
• Marcas en cartera: ${brands.length}
• Cadenas monitoreadas: ${[...new Set(items.map(i => i.super))].length}
• Ofertas activas: ${offers.length}
• Productos con PVP asignado: ${withSuggested.length}
• Sobre PVP sugerido: ${above.length}
• Bajo PVP sugerido: ${below.length}

Ver informe completo adjunto en PDF.`;
}

// ─── Email tag input ───────────────────────────────────────────────────────────
function setupEmailInput() {
  const input = document.getElementById('emailInput');
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addEmail(input.value.trim().replace(/,/g, ''));
      input.value = '';
    } else if (e.key === 'Backspace' && input.value === '' && emailList.length) {
      removeEmail(emailList[emailList.length - 1]);
    }
  });
  input.addEventListener('blur', () => {
    if (input.value.trim()) {
      addEmail(input.value.trim());
      input.value = '';
    }
  });
}

function addEmail(email) {
  if (!email || emailList.includes(email)) return;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!re.test(email)) return;
  emailList.push(email);
  renderEmailTags();
  updateSendBtn();
}

function removeEmail(email) {
  emailList = emailList.filter(e => e !== email);
  renderEmailTags();
  updateSendBtn();
}

function renderEmailTags() {
  const container = document.getElementById('emailTags');
  const input = document.getElementById('emailInput');
  container.innerHTML = '';
  emailList.forEach(e => {
    const tag = document.createElement('div');
    tag.className = 'email-tag';
    tag.innerHTML = `${escHtml(e)}<button type="button" aria-label="Quitar">×</button>`;
    tag.querySelector('button').addEventListener('click', () => removeEmail(e));
    container.appendChild(tag);
  });
  container.appendChild(input);
}

function updateSendBtn() {
  document.getElementById('btnSendEmail').disabled = emailList.length === 0 || !pdfBlob;
}

function showStatus(type, msg) {
  const el = document.getElementById('statusMsg');
  el.className = `status-msg show ${type}`;
  el.textContent = msg;
  setTimeout(() => el.classList.remove('show'), 8000);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n) { return n != null ? `$ ${n.toLocaleString('es-UY', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : '—'; }
function fmtN(n) { return n != null ? `$${n.toLocaleString('es-UY', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : '—'; }
function cap(s) { return s ? s.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : s; }
function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result.split(',')[1]);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────────
init();
