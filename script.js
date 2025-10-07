(() => {
  const DEFAULT_WEIGHTS = Object.freeze({
    formative: 0.10,
    minor: 0.30,
    major: 0.60,
  });

  const TYPE_LABELS = Object.freeze({
    formative: 'Graded Formative',
    minor: 'Minor Summative',
    major: 'Major Summative',
  });

  const STORAGE_KEY = 'grade_calc_assignments_v1';
  const ROW_TEMPLATE = document.getElementById('rowTemplate');

  const els = {
    rows: document.getElementById('rows'),
    addRowBtn: document.getElementById('addRowBtn'),
    clearAllBtn: document.getElementById('clearAllBtn'),
    renormalizeToggle: document.getElementById('renormalizeToggle'),

    // Category percent + weight text and bars
    formativePct: document.getElementById('formativePct'),
    minorPct: document.getElementById('minorPct'),
    majorPct: document.getElementById('majorPct'),
    formativeW: document.getElementById('formativeW'),
    minorW: document.getElementById('minorW'),
    majorW: document.getElementById('majorW'),
    formativeBar: document.getElementById('formativeBar'),
    minorBar: document.getElementById('minorBar'),
    majorBar: document.getElementById('majorBar'),

    weightNote: document.getElementById('weightNote'),

    finalPct: document.getElementById('finalPct'),
    finalLetter: document.getElementById('finalLetter'),
  };

  let assignments = loadAssignments();

  function loadAssignments() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(Boolean).map(sanitizeAssignment);
    } catch {
      return [];
    }
  }

  function saveAssignments() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(assignments));
  }

  function sanitizeAssignment(a) {
    return {
      id: String(a.id ?? cryptoRandomId()),
      name: String(a.name ?? '').slice(0, 200),
      type: ['formative', 'minor', 'major'].includes(a.type) ? a.type : 'formative',
      earned: toNum(a.earned),
      possible: toNum(a.possible),
    };
  }

  function cryptoRandomId() {
    if (window.crypto?.randomUUID) return crypto.randomUUID();
    return 'id_' + Math.random().toString(36).slice(2, 10);
  }

  function toNum(v) {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }

  function addAssignment(preset = {}) {
    const a = sanitizeAssignment({
      id: cryptoRandomId(),
      name: preset.name ?? '',
      type: preset.type ?? 'formative',
      earned: preset.earned ?? 0,
      possible: preset.possible ?? 0,
    });
    assignments.push(a);
    saveAssignments();
    render();
  }

  function removeAssignment(id) {
    assignments = assignments.filter(a => a.id !== id);
    saveAssignments();
    render();
  }

  function updateAssignment(id, field, value) {
    const idx = assignments.findIndex(a => a.id === id);
    if (idx === -1) return;
    if (field === 'name') assignments[idx].name = String(value).slice(0, 200);
    if (field === 'type') assignments[idx].type = ['formative','minor','major'].includes(value) ? value : 'formative';
    if (field === 'earned') assignments[idx].earned = clampNum(value);
    if (field === 'possible') assignments[idx].possible = clampNum(value);
    saveAssignments();
    updateRowPercentDisplay(id);
    updateSummary();
  }

  function clampNum(v) {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return 0;
    return n;
  }

  function computeStats() {
    const buckets = {
      formative: { earned: 0, possible: 0 },
      minor: { earned: 0, possible: 0 },
      major: { earned: 0, possible: 0 },
    };

    for (const a of assignments) {
      if (a.possible > 0 && a.earned >= 0) {
        const b = buckets[a.type];
        b.earned += a.earned;
        b.possible += a.possible;
      }
    }

    const pct = {};
    for (const [k, v] of Object.entries(buckets)) {
      pct[k] = v.possible > 0 ? (v.earned / v.possible) : null;
    }

    return { buckets, pct };
  }

  function normalizeWeights(include, renormalize) {
    const included = Object.entries(DEFAULT_WEIGHTS)
      .filter(([k]) => include[k]);

    const totalIncluded = included.reduce((s, [, w]) => s + w, 0);

    const result = { formative: 0, minor: 0, major: 0 };

    if (!renormalize) {
      // Use defaults, but categories with no data contribute 0
      for (const [k, w] of Object.entries(DEFAULT_WEIGHTS)) {
        result[k] = include[k] ? w : 0;
      }
      return result;
    }

    // Renormalize so present categories sum to 1
    if (totalIncluded <= 0) return result;
    for (const [k, w] of Object.entries(DEFAULT_WEIGHTS)) {
      result[k] = include[k] ? (w / totalIncluded) : 0;
    }
    return result;
  }

  function percentToText(p) {
    if (p == null) return '--';
    return (p * 100).toFixed(2) + '%';
  }

  function letterFor(p) {
    if (p == null) return '–';
    const x = p * 100;
    if (x >= 97) return 'A+';
    if (x >= 93) return 'A';
    if (x >= 90) return 'A-';
    if (x >= 87) return 'B+';
    if (x >= 83) return 'B';
    if (x >= 80) return 'B-';
    if (x >= 77) return 'C+';
    if (x >= 73) return 'C';
    if (x >= 70) return 'C-';
    if (x >= 67) return 'D+';
    if (x >= 63) return 'D';
    if (x >= 60) return 'D-';
    return 'F';
  }

  function colorClassFor(p) {
    if (p == null) return '';
    const x = p * 100;
    if (x >= 90) return 'good';
    if (x >= 75) return 'warn';
    return 'bad';
  }

  function render() {
    els.rows.innerHTML = '';
    for (const a of assignments) {
      const tr = ROW_TEMPLATE.content.firstElementChild.cloneNode(true);
      tr.dataset.id = a.id;

      const nameInput = tr.querySelector('input[data-field="name"]');
      const typeSelect = tr.querySelector('select[data-field="type"]');
      const earnedInput = tr.querySelector('input[data-field="earned"]');
      const possibleInput = tr.querySelector('input[data-field="possible"]');
      const percentSpan = tr.querySelector('span[data-field="percent"]');
      const removeBtn = tr.querySelector('button[data-action="remove"]');

      nameInput.value = a.name;
      typeSelect.value = a.type;
      earnedInput.value = a.earned || '';
      possibleInput.value = a.possible || '';

      const p = (a.possible > 0) ? (a.earned / a.possible) : null;
      percentSpan.textContent = percentToText(p);
      percentSpan.classList.remove('good','warn','bad');
      if (p != null) percentSpan.classList.add(colorClassFor(p));

      nameInput.addEventListener('input', (e) => updateAssignment(a.id, 'name', e.target.value));
      typeSelect.addEventListener('change', (e) => updateAssignment(a.id, 'type', e.target.value));
      earnedInput.addEventListener('input', (e) => updateAssignment(a.id, 'earned', e.target.value));
      possibleInput.addEventListener('input', (e) => updateAssignment(a.id, 'possible', e.target.value));
      removeBtn.addEventListener('click', () => removeAssignment(a.id));

      els.rows.appendChild(tr);
    }
    updateSummary();
  }

  function updateRowPercentDisplay(id) {
    const tr = els.rows.querySelector(`tr[data-id="${id}"]`);
    if (!tr) return;
    const earned = toNum(tr.querySelector('input[data-field="earned"]').value);
    const possible = toNum(tr.querySelector('input[data-field="possible"]').value);
    const span = tr.querySelector('span[data-field="percent"]');
    const p = possible > 0 ? (earned / possible) : null;
    span.textContent = percentToText(p);
    span.classList.remove('good','warn','bad');
    if (p != null) span.classList.add(colorClassFor(p));
  }

  function updateSummary() {
    const { pct } = computeStats();

    // Determine which categories have data
    const present = {
      formative: pct.formative != null,
      minor: pct.minor != null,
      major: pct.major != null,
    };

    const renormalize = !!els.renormalizeToggle.checked;
    const weightsUsed = normalizeWeights(present, renormalize);

    // Update category displays
    const entries = [
      ['formative', els.formativePct, els.formativeW, els.formativeBar],
      ['minor', els.minorPct, els.minorW, els.minorBar],
      ['major', els.majorPct, els.majorW, els.majorBar],
    ];

    let final = 0;
    let weightSum = 0;

    for (const [key, pctEl, wEl, barEl] of entries) {
      const p = pct[key];
      const w = weightsUsed[key];
      pctEl.textContent = percentToText(p);
      wEl.textContent = (w * 100).toFixed(0) + '%';
      barEl.style.width = p != null ? (p * 100).toFixed(0) + '%' : '0%';

      if (p != null && w > 0) {
        final += p * w;
        weightSum += w;
      }
    }

    // If no weights contributed, final is null
    const finalPct = weightSum > 0 ? final : null;

    els.finalPct.textContent = finalPct == null ? '--' : (finalPct * 100).toFixed(2) + '%';
    els.finalLetter.textContent = letterFor(finalPct);

    // Weight note
    if (!present.formative || !present.minor || !present.major) {
      const missing = Object.entries(present).filter(([, v]) => !v).map(([k]) => TYPE_LABELS[k]);
      if (renormalize) {
        els.weightNote.textContent = `Note: No assignments in ${missing.join(', ')}. Weights re-normalized across present categories.`;
      } else {
        els.weightNote.textContent = `Note: No assignments in ${missing.join(', ')}. Missing categories contribute 0 under fixed 10/30/60 weights.`;
      }
    } else {
      els.weightNote.textContent = '';
    }
  }

  // Event wiring
  els.addRowBtn.addEventListener('click', () => addAssignment());
  els.clearAllBtn.addEventListener('click', () => {
    if (!assignments.length) return;
    const ok = confirm('Clear all assignments? This cannot be undone.');
    if (!ok) return;
    assignments = [];
    saveAssignments();
    render();
  });
  els.renormalizeToggle.addEventListener('change', updateSummary);

  // Initial state
  if (assignments.length === 0) {
    addAssignment({ name: 'Sample Assignment', type: 'major', earned: 45, possible: 50 });
  } else {
    render();
  }
})();
