const Tesseract = require('tesseract.js');

const DATE_RE = /\b(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})\b/g;
const PLATE_RE = /\b[A-Z]{1,3}[\s\-]?\d{2,4}[A-Z]?\b/g;
const EMAIL_RE = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g;
const PHONE_RE = /\b(\+?\d[\d\s\-]{6,14}\d)\b/g;
const ALNUM_CODE_RE = /\b[A-Z0-9]{6,17}\b/g;

// A single worker is created lazily and reused across requests, per
// tesseract.js's recommended server-side pattern. Keeping it as a module
// singleton (instead of Tesseract.recognize()'s create-a-worker-per-call
// convenience wrapper) avoids repeatedly re-downloading language data and
// keeps worker lifecycle failures (e.g. no network for the first-run
// language data fetch) contained to a rejected promise instead of an
// uncaught error on a throwaway worker thread.
let workerPromise = null;

function getWorker() {
  if (!workerPromise) {
    workerPromise = Tesseract.createWorker('eng').catch((err) => {
      workerPromise = null; // allow retry on the next call
      throw err;
    });
  }
  return workerPromise;
}

async function extractText(filePath) {
  const worker = await getWorker();
  const result = await worker.recognize(filePath);
  return {
    text: result.data.text.trim(),
    confidence: result.data.confidence,
  };
}

function unique(arr) {
  return [...new Set(arr)];
}

/**
 * Best-effort heuristics only — handwriting recognition is unreliable.
 * Returned guesses are suggestions for the UI to pre-fill, never final values.
 */
function guessFields(text) {
  const dates = unique((text.match(DATE_RE) || []));
  const emails = unique((text.match(EMAIL_RE) || []));
  const phones = unique((text.match(PHONE_RE) || []));
  const plates = unique((text.match(PLATE_RE) || []));
  const codes = unique((text.match(ALNUM_CODE_RE) || []).filter((c) => !plates.includes(c)));

  return { dates, emails, phones, plates, codes };
}

module.exports = { extractText, guessFields };
