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
  CREATE TABLE IF NOT EXISTS quotations (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    insurance_type TEXT NOT NULL,
    proposer_name TEXT,
    registration_no TEXT,
    data TEXT NOT NULL,
    images TEXT NOT NULL DEFAULT '[]'
  )
`);

function insertQuotation(record) {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO quotations (id, created_at, insurance_type, proposer_name, registration_no, data, images)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    id,
    createdAt,
    record.insuranceType || 'Unspecified',
    record.fields?.proposerName || '',
    record.fields?.registrationNo || '',
    JSON.stringify(record.fields || {}),
    JSON.stringify(record.images || [])
  );
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
    fields: JSON.parse(row.data),
    images: JSON.parse(row.images),
  };
}

function getQuotation(id) {
  const row = db.prepare('SELECT * FROM quotations WHERE id = ?').get(id);
  return rowToRecord(row);
}

function listQuotations({ insuranceType, from, to, q } = {}) {
  let sql = 'SELECT * FROM quotations WHERE 1=1';
  const params = [];
  if (insuranceType) {
    sql += ' AND insurance_type = ?';
    params.push(insuranceType);
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
    sql += ' AND (proposer_name LIKE ? OR registration_no LIKE ? OR data LIKE ?)';
    const like = `%${q}%`;
    params.push(like, like, like);
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
  insertQuotation,
  getQuotation,
  listQuotations,
  deleteQuotation,
};
