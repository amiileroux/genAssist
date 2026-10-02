const path = require('node:path');
const fs = require('node:fs');
const nodemailer = require('nodemailer');
const { UPLOADS_DIR } = require('./db');
const { FIELD_LABELS } = require('./fieldLabels');

// Every submission is always copied to this fixed oversight address, in
// addition to the submitting agent and their saved additional contact.
// Override with ADMIN_EMAIL if amii.aral@enbfocus.com was a typo for the
// intended domain.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'amii.aral@enbfocus.com';

let transporter = null;
let warnedNotConfigured = false;

function isConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransporter() {
  if (!isConfigured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporter;
}

function buildBodyText(record) {
  const lines = [
    `New motor insurance quotation saved by ${record.agentName || 'an agent'}.`,
    `Saved at: ${record.createdAt}`,
    `Insurance type: ${record.insuranceType}`,
    '',
  ];
  Object.entries(FIELD_LABELS).forEach(([key, label]) => {
    const v = record.fields[key];
    if (v) lines.push(`${label}: ${v}`);
  });
  (record.fields.additionalDrivers || []).forEach((d, i) => {
    lines.push(
      `Additional driver ${i + 1}: ${d.name || ''} | DOB ${d.dob || ''} | Age ${d.age || ''} | DP ${d.dpNo || ''} | Issued ${d.issueDate || ''} | ${d.occupation || ''}`
    );
  });
  (record.fields.accidentHistory || []).forEach((a, i) => {
    lines.push(`Accident ${i + 1}: Driver ${a.driver || ''} | Year ${a.year || ''} | ${a.details || ''}`);
  });
  return lines.join('\n');
}

function buildAttachments(record) {
  return (record.images || [])
    .map((img) => {
      const filePath = path.join(UPLOADS_DIR, img.filename);
      if (!fs.existsSync(filePath)) return null;
      return { filename: `${img.label}-${img.filename}`, path: filePath };
    })
    .filter(Boolean);
}

/**
 * Sends the saved quotation (data + source document images) to the
 * submitting agent, the fixed oversight address, and the agent's saved
 * additional contact, if any. Never throws — returns a status object the
 * caller can persist and show in the Records view instead.
 */
async function sendQuotationEmail(record, agent) {
  const to = [agent?.ownEmail, ADMIN_EMAIL, agent?.additionalContactEmail].filter(Boolean);
  const uniqueTo = [...new Set(to)];

  if (!isConfigured()) {
    if (!warnedNotConfigured) {
      console.warn(
        'Email sending is not configured (SMTP_HOST/SMTP_USER/SMTP_PASS missing) — quotations will be saved locally only. See README.'
      );
      warnedNotConfigured = true;
    }
    return { status: 'skipped', reason: 'SMTP not configured', to: uniqueTo, attemptedAt: new Date().toISOString() };
  }

  try {
    const mailer = getTransporter();
    await mailer.sendMail({
      from: process.env.EMAIL_FROM || process.env.SMTP_USER,
      to: uniqueTo,
      subject: `Motor Insurance Quotation — ${record.fields.proposerName || 'New client'} — ${record.fields.registrationNo || ''}`.trim(),
      text: buildBodyText(record),
      attachments: buildAttachments(record),
    });
    return { status: 'sent', to: uniqueTo, sentAt: new Date().toISOString() };
  } catch (err) {
    console.error('Failed to send quotation email:', err);
    return { status: 'failed', to: uniqueTo, error: err.message, attemptedAt: new Date().toISOString() };
  }
}

module.exports = { sendQuotationEmail, ADMIN_EMAIL, isConfigured };
