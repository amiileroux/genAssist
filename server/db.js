const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, '..', 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const DB_PATH = path.join(DATA_DIR, 'genassist.db');

fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    own_email TEXT NOT NULL,
    additional_contact_email TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS quotations (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    insurance_type TEXT NOT NULL,
    proposer_name TEXT,
    registration_no TEXT,
    agent_id TEXT,
    agent_name TEXT,
    data TEXT NOT NULL,
    images TEXT NOT NULL DEFAULT '[]',
    email_status TEXT NOT NULL DEFAULT '{}'
  )
`);

// --- agents -----------------------------------------------------------

function upsertAgent({ id, name, ownEmail, additionalContactEmail }) {
  const now = new Date().toISOString();
  const agentId = id || crypto.randomUUID();
  const existing = id ? getAgent(id) : null;

  if (existing) {
    db.prepare(`
      UPDATE agents SET name = ?, own_email = ?, additional_contact_email = ?, updated_at = ?
      WHERE id = ?
    `).run(name, ownEmail, additionalContactEmail || null, now, agentId);
  } else {
    db.prepare(`
      INSERT INTO agents (id, name, own_email, additional_contact_email, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(agentId, name, ownEmail, additionalContactEmail || null, now, now);
  }
  return getAgent(agentId);
}

function agentRowToRecord(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    ownEmail: row.own_email,
    additionalContactEmail: row.additional_contact_email || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getAgent(id) {
  const row = db.prepare('SELECT * FROM agents WHERE id = ?').get(id);
  return agentRowToRecord(row);
}

function listAgents() {
  const rows = db.prepare('SELECT * FROM agents ORDER BY name ASC').all();
  return rows.map(agentRowToRecord);
}

// --- quotations ---------------------------------------------------------

function insertQuotation(record) {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO quotations (id, created_at, insurance_type, proposer_name, registration_no, agent_id, agent_name, data, images, email_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    id,
    createdAt,
    record.insuranceType || 'Unspecified',
    record.fields?.proposerName || '',
    record.fields?.registrationNo || '',
    record.agentId || null,
    record.agentName || null,
    JSON.stringify(record.fields || {}),
    JSON.stringify(record.images || []),
    JSON.stringify({ status: 'pending' })
  );
  return getQuotation(id);
}

function setQuotationEmailStatus(id, status) {
  db.prepare('UPDATE quotations SET email_status = ? WHERE id = ?').run(JSON.stringify(status), id);
  return getQuotation(id);
}

function rowToRecord(row) {
  if (!row) return null;
  return {
    id: row.id,
    createdAt: row.created_at,
    insuranceType: row.insurance_type,
    proposerName: row.proposer_name,
    registrationNo: row.registration_no,
    agentId: row.agent_id,
    agentName: row.agent_name,
    fields: JSON.parse(row.data),
    images: JSON.parse(row.images),
    emailStatus: JSON.parse(row.email_status || '{}'),
  };
}

function getQuotation(id) {
  const row = db.prepare('SELECT * FROM quotations WHERE id = ?').get(id);
  return rowToRecord(row);
}

function listQuotations({ insuranceType, from, to, q, agentId } = {}) {
  let sql = 'SELECT * FROM quotations WHERE 1=1';
  const params = [];
  if (insuranceType) {
    sql += ' AND insurance_type = ?';
    params.push(insuranceType);
  }
  if (agentId) {
    sql += ' AND agent_id = ?';
    params.push(agentId);
  }
  if (from) {
    sql += ' AND created_at >= ?';
    params.push(from);
  }
  if (to) {
    sql += ' AND created_at <= ?';
    params.push(to);
  }
  if (q) {
    sql += ' AND (proposer_name LIKE ? OR registration_no LIKE ? OR agent_name LIKE ? OR data LIKE ?)';
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  sql += ' ORDER BY created_at DESC';
  const rows = db.prepare(sql).all(...params);
  return rows.map(rowToRecord);
}

function deleteQuotation(id) {
  const existing = getQuotation(id);
  if (existing) {
    for (const img of existing.images || []) {
      if (img.filename) {
        const filePath = path.join(UPLOADS_DIR, img.filename);
        fs.rm(filePath, { force: true }, () => {});
      }
    }
  }
  db.prepare('DELETE FROM quotations WHERE id = ?').run(id);
  return existing;
}

module.exports = {
  db,
  UPLOADS_DIR,
  upsertAgent,
  getAgent,
  listAgents,
  insertQuotation,
  setQuotationEmailStatus,
  getQuotation,
  listQuotations,
  deleteQuotation,
};
