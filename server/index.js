const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const multer = require('multer');

const {
  UPLOADS_DIR,
  upsertAgent,
  getAgent,
  listAgents,
  insertQuotation,
  setQuotationEmailStatus,
  getQuotation,
  listQuotations,
  deleteQuotation,
} = require('./db');
const { extractText, guessFields } = require('./ocr');
const { sendQuotationEmail, ADMIN_EMAIL, isConfigured } = require('./email');

const PORT = process.env.PORT || 3000;
const app = express();

// Safety net: a worker-thread failure inside tesseract.js (e.g. no network
// for its first-run language-data download) can otherwise surface as an
// uncaught exception that kills the whole process. Log and keep serving.
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception (server kept alive):', err);
});
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection (server kept alive):', err);
});

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/files', express.static(UPLOADS_DIR));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!/^image\//.test(file.mimetype)) {
      return cb(new Error('Only image uploads are supported'));
    }
    cb(null, true);
  },
});

// Run OCR on an uploaded image (DP/ID photo, vehicle certified copy, NCD letter, etc.)
app.post('/api/ocr', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image uploaded' });
  }
  try {
    const { text, confidence } = await withTimeout(
      extractText(req.file.path),
      45000,
      'OCR timed out — check your internet connection (language data must download on first run)'
    );
    const guesses = guessFields(text);
    res.json({
      filename: req.file.filename,
      originalName: req.file.originalname,
      label: req.body.label || '',
      url: `/files/${req.file.filename}`,
      text,
      confidence,
      guesses,
    });
  } catch (err) {
    console.error('OCR failed:', err);
    res.status(500).json({ error: 'OCR extraction failed', detail: err.message });
  }
});

app.get('/api/config', (req, res) => {
  res.json({ adminEmail: ADMIN_EMAIL, emailConfigured: isConfigured() });
});

app.post('/api/agents', (req, res) => {
  const { id, name, ownEmail, additionalContactEmail } = req.body || {};
  if (!name || !ownEmail) {
    return res.status(400).json({ error: 'name and ownEmail are required' });
  }
  res.status(201).json(upsertAgent({ id, name, ownEmail, additionalContactEmail }));
});

app.get('/api/agents', (req, res) => {
  res.json(listAgents());
});

app.get('/api/agents/:id', (req, res) => {
  const agent = getAgent(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Not found' });
  res.json(agent);
});

app.post('/api/quotations', async (req, res) => {
  const { fields, images, insuranceType, agentId } = req.body || {};
  if (!fields || typeof fields !== 'object') {
    return res.status(400).json({ error: 'fields object is required' });
  }
  const agent = agentId ? getAgent(agentId) : null;
  if (agentId && !agent) {
    return res.status(400).json({ error: 'Unknown agentId — save an agent profile first' });
  }

  let record = insertQuotation({
    fields,
    images: images || [],
    insuranceType,
    agentId: agent?.id,
    agentName: agent?.name,
  });

  const emailStatus = await withTimeout(
    sendQuotationEmail(record, agent),
    20000,
    'Email send timed out'
  ).catch((err) => ({ status: 'failed', error: err.message, attemptedAt: new Date().toISOString() }));
  record = setQuotationEmailStatus(record.id, emailStatus);

  res.status(201).json(record);
});

app.get('/api/quotations', (req, res) => {
  const { insuranceType, from, to, q, agentId } = req.query;
  res.json(listQuotations({ insuranceType, from, to, q, agentId }));
});

app.get('/api/quotations/:id', (req, res) => {
  const record = getQuotation(req.params.id);
  if (!record) return res.status(404).json({ error: 'Not found' });
  res.json(record);
});

app.delete('/api/quotations/:id', (req, res) => {
  const record = deleteQuotation(req.params.id);
  if (!record) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Server error' });
});

app.listen(PORT, () => {
  console.log(`genAssist running at http://localhost:${PORT}`);
});
