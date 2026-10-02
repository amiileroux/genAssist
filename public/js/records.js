(function () {
  const FIELD_LABELS = {
    proposerName: 'Name (Owner/s)',
    contactNo: 'Contact No.',
    dob1: 'Date of Birth #1',
    dob2: 'Date of Birth #2',
    address: 'Address',
    email: 'Email',
    dpNo: 'DP No/s.',
    issueDate1: 'Issue Date #1',
    expiryDate1: 'Expiry Date #1',
    issueDate2: 'Issue Date #2',
    expiryDate2: 'Expiry Date #2',
    occupation1: 'Occupation/Business #1',
    occupation2: 'Occupation/Business #2',
    make: 'Make',
    model: 'Model',
    useOfVehicle: 'Use of vehicle',
    registrationNo: 'Registration No.',
    yearOfManufacture: 'Year of manufacture',
    seatingCapacity: 'Seating capacity',
    ccHp: 'CC/HP',
    chassisNo: 'Chassis No.',
    engineNo: 'Engine No.',
    typeOfCoverage: 'Type of coverage',
    valueSumInsured: 'Value / Sum insured',
    vehicleMortgaged: 'Vehicle mortgaged',
    financialInstitution: 'Financial institution',
    previousInsurer: 'Previous insurer',
    noClaimDiscountYears: 'No Claim Discount (years)',
    antiTheftDevices: 'Anti-theft devices',
    windscreenLimit: 'Windscreen limit',
    lossOfUse: 'Loss of use',
    waiverOfExcess: 'Waiver of excess',
    personalAccident: 'Personal accident',
    specialPerils: 'Special perils',
    windscreenThirdPartyPrivate: 'Windscreen (TP Private)',
  };

  const listEl = document.getElementById('records-list');

  function emailStatusLabel(emailStatus) {
    if (!emailStatus || !emailStatus.status) return 'Not sent';
    switch (emailStatus.status) {
      case 'sent':
        return `Emailed to ${emailStatus.to.join(', ')}`;
      case 'failed':
        return `Email failed: ${emailStatus.error || 'unknown error'}`;
      case 'skipped':
        return 'Not emailed — SMTP not configured on server';
      default:
        return 'Not sent';
    }
  }

  async function loadAgentFilter() {
    try {
      const res = await fetch('/api/agents');
      const agents = await res.json();
      const select = document.getElementById('filter-agent');
      agents.forEach((agent) => {
        const opt = document.createElement('option');
        opt.value = agent.id;
        opt.textContent = agent.name;
        select.appendChild(opt);
      });
    } catch (err) {
      // non-fatal — filter just stays "All"
    }
  }

  function formatDateTime(iso) {
    const d = new Date(iso);
    return d.toLocaleString();
  }

  function copyToClipboard(text, btn) {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        const original = btn.textContent;
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.textContent = original;
          btn.classList.remove('copied');
        }, 1200);
      })
      .catch(() => {
        btn.textContent = 'Copy failed';
      });
  }

  function fieldRow(label, value) {
    const row = document.createElement('div');
    row.className = 'field-row';
    const labelEl = document.createElement('span');
    labelEl.className = 'field-row-label';
    labelEl.textContent = label;
    const valueEl = document.createElement('span');
    valueEl.className = 'field-row-value';
    valueEl.textContent = value || '—';
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'btn-copy';
    copyBtn.textContent = 'Copy';
    copyBtn.disabled = !value;
    copyBtn.addEventListener('click', () => copyToClipboard(value, copyBtn));
    row.append(labelEl, valueEl, copyBtn);
    return row;
  }

  function buildCopyAllText(record) {
    const lines = [];
    Object.entries(FIELD_LABELS).forEach(([key, label]) => {
      const v = record.fields[key];
      if (v) lines.push(`${label}: ${v}`);
    });
    (record.fields.additionalDrivers || []).forEach((d, i) => {
      lines.push(`Additional driver ${i + 1}: ${d.name || ''} | DOB ${d.dob || ''} | Age ${d.age || ''} | DP ${d.dpNo || ''} | Issued ${d.issueDate || ''} | ${d.occupation || ''}`);
    });
    (record.fields.accidentHistory || []).forEach((a, i) => {
      lines.push(`Accident ${i + 1}: Driver ${a.driver || ''} | Year ${a.year || ''} | ${a.details || ''}`);
    });
    return lines.join('\n');
  }

  function renderRecord(record) {
    const card = document.createElement('details');
    card.className = 'card record-card';

    const summary = document.createElement('summary');
    const badge = document.createElement('span');
    badge.className = 'record-type badge';
    badge.textContent = record.insuranceType || 'Unspecified';
    const nameSpan = document.createElement('span');
    nameSpan.className = 'record-name';
    nameSpan.textContent = record.proposerName || '(no name)';
    const regSpan = document.createElement('span');
    regSpan.className = 'record-reg';
    regSpan.textContent = record.registrationNo || '';
    const agentSpan = document.createElement('span');
    agentSpan.className = 'record-agent muted';
    agentSpan.textContent = record.agentName ? `Agent: ${record.agentName}` : '';
    const dateSpan = document.createElement('span');
    dateSpan.className = 'record-date muted';
    dateSpan.textContent = formatDateTime(record.createdAt);
    summary.append(badge, nameSpan, regSpan, agentSpan, dateSpan);
    card.appendChild(summary);

    const body = document.createElement('div');
    body.className = 'record-body';

    const topBar = document.createElement('div');
    topBar.className = 'record-topbar';
    const copyAllBtn = document.createElement('button');
    copyAllBtn.className = 'btn-secondary';
    copyAllBtn.textContent = 'Copy all fields as text';
    copyAllBtn.addEventListener('click', () => copyToClipboard(buildCopyAllText(record), copyAllBtn));
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-danger';
    deleteBtn.textContent = 'Delete record';
    deleteBtn.addEventListener('click', async () => {
      if (!confirm('Delete this quotation permanently?')) return;
      await fetch(`/api/quotations/${record.id}`, { method: 'DELETE' });
      card.remove();
    });
    topBar.append(copyAllBtn, deleteBtn);
    body.appendChild(topBar);

    body.appendChild(fieldRow('Agent', record.agentName || '(no agent recorded)'));
    body.appendChild(fieldRow('Email status', emailStatusLabel(record.emailStatus)));

    Object.entries(FIELD_LABELS).forEach(([key, label]) => {
      body.appendChild(fieldRow(label, record.fields[key]));
    });

    if ((record.fields.additionalDrivers || []).length) {
      const h = document.createElement('h4');
      h.textContent = 'Additional drivers';
      body.appendChild(h);
      record.fields.additionalDrivers.forEach((d, i) => {
        const text = `${d.name || ''} | DOB ${d.dob || ''} | Age ${d.age || ''} | DP ${d.dpNo || ''} | Issued ${d.issueDate || ''} | ${d.occupation || ''}`;
        body.appendChild(fieldRow(`Driver ${i + 1}`, text));
      });
    }

    if ((record.fields.accidentHistory || []).length) {
      const h = document.createElement('h4');
      h.textContent = 'Accident history';
      body.appendChild(h);
      record.fields.accidentHistory.forEach((a, i) => {
        const text = `Driver ${a.driver || ''} | Year ${a.year || ''} | ${a.details || ''}`;
        body.appendChild(fieldRow(`Accident ${i + 1}`, text));
      });
    }

    if ((record.images || []).length) {
      const h = document.createElement('h4');
      h.textContent = 'Source documents';
      body.appendChild(h);
      const imgRow = document.createElement('div');
      imgRow.className = 'image-links';
      record.images.forEach((img) => {
        const a = document.createElement('a');
        a.href = img.url;
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = `${img.label} ↗`;
        imgRow.appendChild(a);
      });
      body.appendChild(imgRow);
    }

    card.appendChild(body);
    return card;
  }

  async function load() {
    const params = new URLSearchParams();
    const type = document.getElementById('filter-type').value;
    const from = document.getElementById('filter-from').value;
    const to = document.getElementById('filter-to').value;
    const q = document.getElementById('filter-q').value;
    const agentId = document.getElementById('filter-agent').value;
    if (type) params.set('insuranceType', type);
    if (agentId) params.set('agentId', agentId);
    if (from) params.set('from', new Date(from).toISOString());
    if (to) params.set('to', new Date(to + 'T23:59:59').toISOString());
    if (q) params.set('q', q);

    const res = await fetch(`/api/quotations?${params.toString()}`);
    const records = await res.json();

    listEl.innerHTML = '';
    if (!records.length) {
      listEl.innerHTML = '<p class="muted">No quotations found.</p>';
      return;
    }

    let lastDateHeader = '';
    records.forEach((record) => {
      const dateHeader = new Date(record.createdAt).toLocaleDateString(undefined, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      if (dateHeader !== lastDateHeader) {
        const h = document.createElement('h3');
        h.className = 'date-header';
        h.textContent = dateHeader;
        listEl.appendChild(h);
        lastDateHeader = dateHeader;
      }
      listEl.appendChild(renderRecord(record));
    });
  }

  document.getElementById('filter-apply').addEventListener('click', load);
  document.getElementById('filter-clear').addEventListener('click', () => {
    document.getElementById('filter-type').value = '';
    document.getElementById('filter-agent').value = '';
    document.getElementById('filter-from').value = '';
    document.getElementById('filter-to').value = '';
    document.getElementById('filter-q').value = '';
    load();
  });

  loadAgentFilter();
  load();
})();
