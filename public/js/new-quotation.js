(function () {
  const DRIVER_COLS = ['name', 'dob', 'age', 'dpNo', 'issueDate', 'occupation'];
  const ACCIDENT_COLS = ['driver', 'year', 'details'];

  const AGENT_STORAGE_KEY = 'genassist_agent_id';
  let currentAgentId = localStorage.getItem(AGENT_STORAGE_KEY) || null;

  async function loadConfig() {
    try {
      const res = await fetch('/api/config');
      const cfg = await res.json();
      document.querySelectorAll('#admin-email-label, #admin-email-label-2').forEach((el) => {
        el.textContent = cfg.adminEmail;
      });
      document.getElementById('email-config-warning').hidden = cfg.emailConfigured;
    } catch (err) {
      // non-fatal — the form still works, it just won't know the admin address yet
    }
  }

  async function loadAgent() {
    if (!currentAgentId) return;
    const statusEl = document.getElementById('agent-status');
    try {
      const res = await fetch(`/api/agents/${currentAgentId}`);
      if (!res.ok) throw new Error('not found');
      const agent = await res.json();
      document.getElementById('agent-name').value = agent.name;
      document.getElementById('agent-own-email').value = agent.ownEmail;
      document.getElementById('agent-additional-email').value = agent.additionalContactEmail || '';
      statusEl.textContent = `Saved ✓ — signed in as ${agent.name}`;
    } catch (err) {
      currentAgentId = null;
      localStorage.removeItem(AGENT_STORAGE_KEY);
    }
  }

  document.getElementById('agent-save').addEventListener('click', async () => {
    const name = document.getElementById('agent-name').value.trim();
    const ownEmail = document.getElementById('agent-own-email').value.trim();
    const additionalContactEmail = document.getElementById('agent-additional-email').value.trim();
    const statusEl = document.getElementById('agent-status');
    if (!name || !ownEmail) {
      statusEl.textContent = 'Name and your email are required.';
      return;
    }
    statusEl.textContent = 'Saving…';
    try {
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: currentAgentId, name, ownEmail, additionalContactEmail }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Save failed');
      const agent = await res.json();
      currentAgentId = agent.id;
      localStorage.setItem(AGENT_STORAGE_KEY, agent.id);
      statusEl.textContent = `Saved ✓ — signed in as ${agent.name}`;
    } catch (err) {
      statusEl.textContent = `Error: ${err.message}`;
    }
  });

  loadConfig();
  loadAgent();

  function addRow(tableId, cols) {
    const table = document.getElementById(tableId);
    const tbody = table.querySelector('tbody');
    const tr = document.createElement('tr');
    cols.forEach((col) => {
      const td = document.createElement('td');
      const input = document.createElement('input');
      input.dataset.col = col;
      td.appendChild(input);
      tr.appendChild(td);
    });
    const actionTd = document.createElement('td');
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn-remove';
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', () => tr.remove());
    actionTd.appendChild(removeBtn);
    tr.appendChild(actionTd);
    tbody.appendChild(tr);
  }

  document.querySelectorAll('[data-add]').forEach((btn) => {
    const tableId = btn.dataset.add;
    const cols = tableId === 'drivers-table' ? DRIVER_COLS : ACCIDENT_COLS;
    btn.addEventListener('click', () => addRow(tableId, cols));
  });
  // seed one empty row each so the table isn't empty on load
  addRow('drivers-table', DRIVER_COLS);
  addRow('accidents-table', ACCIDENT_COLS);

  function readTable(tableId, cols) {
    const rows = [...document.querySelectorAll(`#${tableId} tbody tr`)];
    return rows
      .map((row) => {
        const obj = {};
        cols.forEach((col) => {
          obj[col] = row.querySelector(`[data-col="${col}"]`).value.trim();
        });
        return obj;
      })
      .filter((obj) => Object.values(obj).some((v) => v));
  }

  function markAutoFilled(el) {
    el.classList.add('ocr-filled');
    el.title = 'Auto-filled from OCR — please verify';
    el.addEventListener(
      'input',
      () => el.classList.remove('ocr-filled'),
      { once: true }
    );
  }

  function fillIfEmpty(id, value) {
    if (!value) return;
    const el = document.getElementById(id);
    if (el && !el.value) {
      el.value = value;
      markAutoFilled(el);
    }
  }

  // Modest, best-effort auto-fill per document type. Dates/codes are assigned
  // positionally from whatever OCR found — always meant to be checked by a human.
  function applyGuesses(slot, guesses) {
    const dates = guesses.dates || [];
    const codes = guesses.codes || [];
    const plates = guesses.plates || [];

    if (slot === 'dp') {
      fillIfEmpty('dpNo', codes[0]);
      fillIfEmpty('issueDate1', dates[0]);
      fillIfEmpty('expiryDate1', dates[1]);
    } else if (slot === 'vehicle') {
      fillIfEmpty('registrationNo', plates[0]);
      fillIfEmpty('chassisNo', codes[0]);
      fillIfEmpty('engineNo', codes[1]);
    } else if (slot === 'ncd') {
      fillIfEmpty('previousInsurer', '');
      const yearsMatch = (guesses.raw || '').match(/(\d+)\s*year/i);
      if (yearsMatch) fillIfEmpty('noClaimDiscountYears', yearsMatch[1]);
      fillIfEmpty('issueDate2', dates[0]);
    }
  }

  document.querySelectorAll('.upload-slot').forEach((slotEl) => {
    const slot = slotEl.dataset.slot;
    const fileInput = slotEl.querySelector('[data-role="file-input"]');
    const statusEl = slotEl.querySelector('[data-role="status"]');
    const rawTextEl = slotEl.querySelector('[data-role="raw-text"]');

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      if (!file) return;
      statusEl.textContent = 'Extracting text… this can take a few seconds';
      statusEl.className = 'upload-status pending';

      const formData = new FormData();
      formData.append('image', file);
      formData.append('label', slot);

      try {
        const res = await fetch('/api/ocr', { method: 'POST', body: formData });
        if (!res.ok) throw new Error((await res.json()).error || 'OCR failed');
        const result = await res.json();

        rawTextEl.value = result.text || '(no text detected)';
        statusEl.textContent = `Done — uploaded as ${result.originalName}`;
        statusEl.className = 'upload-status done';

        slotEl.dataset.filename = result.filename;
        slotEl.dataset.url = result.url;
        slotEl.dataset.originalName = result.originalName;

        applyGuesses(slot, { ...result.guesses, raw: result.text });
      } catch (err) {
        statusEl.textContent = `Error: ${err.message}`;
        statusEl.className = 'upload-status error';
      }
    });
  });

  function collectImages() {
    return [...document.querySelectorAll('.upload-slot')]
      .filter((el) => el.dataset.filename)
      .map((el) => ({
        label: el.dataset.slot,
        filename: el.dataset.filename,
        url: el.dataset.url,
        originalName: el.dataset.originalName || '',
      }));
  }

  const form = document.getElementById('quotation-form');
  const saveStatus = document.getElementById('save-status');
  const sendSection = document.getElementById('send-section');
  const sendToInput = document.getElementById('send-to-input');
  const sendStatus = document.getElementById('send-status');
  let lastSavedRecordId = null;

  document.getElementById('send-btn').addEventListener('click', async () => {
    if (!lastSavedRecordId) return;
    const emails = sendToInput.value.trim();
    if (!emails) {
      sendStatus.textContent = 'Type at least one email address first.';
      return;
    }
    sendStatus.textContent = 'Sending…';
    try {
      const res = await fetch(`/api/quotations/${lastSavedRecordId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails }),
      });
      const record = await res.json();
      if (!res.ok) throw new Error(record.error || 'Send failed');
      sendStatus.textContent =
        record.emailStatus?.status === 'sent'
          ? `Sent ✓ to ${record.emailStatus.to.join(', ')}`
          : record.emailStatus?.status === 'skipped'
            ? 'Not sent — email isn’t configured on this server yet (see README)'
            : `Could not send: ${record.emailStatus?.error || 'unknown error'}`;
    } catch (err) {
      sendStatus.textContent = `Error: ${err.message}`;
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const fields = {};
    new FormData(form).forEach((value, key) => {
      fields[key] = value;
    });
    fields.additionalDrivers = readTable('drivers-table', DRIVER_COLS);
    fields.accidentHistory = readTable('accidents-table', ACCIDENT_COLS);

    const agentName = document.getElementById('agent-name').value.trim();
    const agentOwnEmail = document.getElementById('agent-own-email').value.trim();
    const agentAdditionalEmail = document.getElementById('agent-additional-email').value.trim();

    saveStatus.textContent = 'Saving…';

    try {
      const res = await fetch('/api/quotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields,
          images: collectImages(),
          insuranceType: fields.typeOfCoverage || 'Unspecified',
          agentId: currentAgentId,
          agentName,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Save failed');
      const record = await res.json();

      saveStatus.innerHTML = `Saved ✓ — <a href="/records.html">view in records</a>. Use the box below to send it, then fill in the next client.`;
      lastSavedRecordId = record.id;
      sendStatus.textContent = '';
      sendToInput.value = [agentOwnEmail, agentAdditionalEmail].filter(Boolean).join(', ');
      sendSection.hidden = false;
      sendSection.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // agent-name/own-email/additional-email live outside this <form>, so
      // form.reset() below intentionally leaves them in place for reuse.
      form.reset();
      document.querySelectorAll('.ocr-filled').forEach((el) => el.classList.remove('ocr-filled'));
      document.querySelectorAll('.upload-slot').forEach((el) => {
        delete el.dataset.filename;
        delete el.dataset.url;
        delete el.dataset.originalName;
        el.querySelector('[data-role="status"]').textContent = '';
        el.querySelector('[data-role="raw-text"]').value = '';
      });
      document.querySelector('#drivers-table tbody').innerHTML = '';
      document.querySelector('#accidents-table tbody').innerHTML = '';
      addRow('drivers-table', DRIVER_COLS);
      addRow('accidents-table', ACCIDENT_COLS);
    } catch (err) {
      saveStatus.textContent = `Error: ${err.message}`;
    }
  });
})();
