# genAssist — Motor Insurance Quotation Intake

A small local web app for building new motor insurance quotations:

1. **New Quotation** (`/index.html`) — upload a photo of the client's DP/ID,
   the certified copy of the vehicle, and (if applicable) their No Claim
   Discount letter. Each upload is run through OCR and used to best-effort
   auto-fill a few fields (DP number, dates, registration/chassis/engine
   numbers). The full quotation form mirrors the paper "Motor Insurance —
   Quotation Form" (proposer details, vehicle details, coverage details,
   additional drivers, accident history) and everything stays editable.
2. **Records** (`/records.html`) — every saved quotation, filterable by
   date, insurance type, or free text. Each record expands into a list of
   fields with a **Copy** button next to every line (plus a **Copy all
   fields as text** button) so you can paste values straight into another
   system.

Records are grouped automatically by the date/time they were saved and by
the selected type of coverage (Third Party / Comprehensive / Own Goods /
General Cartage).

## Honest note on OCR

Tesseract OCR reads printed text reasonably well but is unreliable on
handwriting, which most of this paper form is filled in with. Treat
auto-filled fields (highlighted in yellow) as a starting point, not a final
answer — always double check against the uploaded photo before saving. The
raw extracted text is always shown under each upload so you can copy exact
values by hand when the auto-fill guesses are wrong.

## Running it locally

```bash
npm install
npm start
```

Then open http://localhost:3000.

No API keys, cloud services, or subscriptions are required — OCR runs
entirely on-device via `tesseract.js`, and data is stored locally in a
SQLite file at `data/genassist.db` (uploaded images are kept in
`data/uploads/`). Nothing leaves your machine.

## Project layout

```
server/
  index.js   — Express app, routes for OCR + quotation CRUD
  db.js      — SQLite storage (node:sqlite, no native build step)
  ocr.js     — tesseract.js wrapper + best-effort field guessing
public/
  index.html, js/new-quotation.js   — intake form
  records.html, js/records.js       — backend/records view with copy buttons
  css/style.css
data/        — local database + uploaded document images (gitignored)
```

## Backing it up / moving it

Everything lives in `data/`. Copy that folder to back up or migrate all
saved quotations and their source document photos.
