# ARAL &rarr; TATIL Lead Vetting Pipeline

A Google Workspace web app (Google Apps Script + Tailwind CSS) for **A.
Rauseo & Associates (ARAL)** that automatically intakes General Insurance
leads from a Google Form, vets the uploaded compliance documents, scores
each file's readiness, and routes it into the right Google Drive folder
on the way to TATIL Underwriting.

This is a separate tool from the main `genAssist` quotation app in this
repo — it's built entirely on Google Apps Script/Sheets/Drive/Gmail
rather than Node, because the ask here is specifically a Google
Workspace web app with no server to host.

## Two lines of business, one app

This single Apps Script project runs **two independent pipelines**:

- **Motor** — the "ARAL Motor Insurance Lead Intake" Form.
- **Property** — the "ARAL House & Commercial Property Insurance Lead
  Intake" Form.

Both Forms feed this one bound Google Sheet (as separate linked Forms,
each writing to its own raw-response tab), and both show up in the same
Admin Dashboard and Agent Portal with a **Motor / Property tab** to
switch between them. Each line has its own Drive folder tree, its own
tracker sheet, its own ARAL code numbering (`ARAL-MOT-######` /
`ARAL-PROP-######`), and its own vetting checklist — see `Config.gs`'s
`CONFIG.LINES` for everything that's specific to one line.

## What it does

1. An agent submits either Google Form.
2. A shared installable trigger fires (routed to the right line by
   which raw-response sheet the submission landed on), which:
   - Creates a Drive folder `[ARAL-CODE]_Pending-Name_[Category]` and
     moves the uploaded files into it. (Client Name isn't on either
     form — see "Client Name" below.)
   - Scores the submission 0–100% against that line's checklist (see
     "Vetting rules" below).
   - Moves the folder into the matching pipeline stage.
   - Logs a row to that line's tracker sheet (the dashboard's data
     source).
   - Emails the agent the exact missing items if anything's incomplete,
     or emails Underwriting if it's 100% ready.
3. Admins work the **Admin Dashboard** (desktop) to set the client's
   name, flag, request info, approve, or mark a TATIL policy number as
   issued — each action moves the Drive folder and re-notifies the
   agent.
4. Agents work the **Agent Portal** (mobile-first) to see their own
   submissions across both lines and re-upload exactly the documents
   that are missing.

### Client Name

Neither form collects a client name as its own field — the client's
legal name is read off the **DP Licence** upload, since that has to be
exact. So a fresh submission shows up with no name until an admin opens
it, looks at the uploaded DP Licence, and clicks **Set name** on the
Admin Dashboard (`AdminController.admin_setClientName`). That both
updates the tracker row and renames the Drive folder to match.

## Drive folder architecture

```
/ARAL_Insurance_Pipeline/
  Motor/
    01_Incomplete_Flagged/       Missing KYC, bad photos, or misinformation
    02_Needs_Supplemental_Info/  Needs additional underwriting detail
    03_Ready_For_Underwriting/   100% complete & vetted
    04_Completed_Policies/       Issued policies with TATIL policy numbers
  Property/
    01_Incomplete_Flagged/
    02_Needs_Supplemental_Info/
    03_Ready_For_Underwriting/
    04_Completed_Policies/
```

Folders are created on first run and their IDs are cached in Script
Properties, so the structure is created once and then just reused.

## Vetting rules

### Motor

The score is `(required items satisfied) / (required items for this
submission) × 100` — the required-item count varies per submission, it
isn't a fixed set of four.

**Always required:**

| Item | Form source |
|---|---|
| DP Licence | `Upload DP Licence` (file) |
| Certified Copy, **or** Vehicle Specs as a fallback | `Upload Certified Copy` (file) **or** `Vehicle Specs (Reg #, Make/Model, Year, CC)` (text) — the form's own note says Vehicle Specs is an acceptable stand-in when a certified copy can't be provided, e.g. for a quote requested before the vehicle is even purchased |
| Proof of Address | `Proof Of Address` (file) |
| Value of Vehicle | `Value Of vehicle` (text) — always needed to produce a quote, regardless of coverage |

**Conditionally required:**

| Item | Required when | Waived when |
|---|---|---|
| Certified Copy *specifically* (the Vehicle Specs fallback above no longer counts) | `Is this vehicle newly purchased?` = `No` — i.e. they've had it a while, so the actual document should exist, not just dealership specs | Vehicle was newly/recently purchased (`Yes`) |
| NCD Letter | `How much is your client's NCD` ≠ `NONE` (an actual discount/history is being claimed) | NCD level is `NONE`, **or** `Do you have an NCD Letter?` indicates a first-time/new driver (no history can exist yet) |
| Claim History Letter | `Do you have a Claim History` = `Yes` | No claim history, **or** first-time/new driver (same exemption as above) |
| Certificate of Registration (**business** registration — proof the vehicle's policy is written to a company, not an individual) | `Coverage Type` = `Corporate Comprehensive` | Any other coverage type |

The new-driver exemption is computed once at submission time and saved
to the tracker row (`New Driver` column), so it's still honored
correctly if the record is re-scored later (e.g. after an agent
re-uploads a document) — the original form answer isn't re-askable at
that point.

### Property (House / Commercial)

**Always required:**

| Item | Form source |
|---|---|
| DP Licence | `Upload DP Licence` (file) |
| Proof of Address | `Upload Proof Of Address` (file) — "for the location being insured" |
| Property Image | `Upload Property Image` (file) — an actual photo of the property being insured, distinct from the utility bill used as Proof of Address |
| Value of Contents | `Value of Contents` (text) — a sum insured figure, needed to produce a quote regardless of occupancy (same reasoning as Value of Vehicle on the Motor line) |

**Conditionally required:**

| Item | Required when | Waived when | Form source |
|---|---|---|---|
| Directors ID & DP | `Type of Occupancy` is `Commercial` or `Small Business` | Any other occupancy | `Upload Directors ID & DP` (file) — the form's own label: "For Commercial and Small Businesses ONLY" |
| Contents for Residential | `Type of Occupancy` is `Residential` *(inferred — the question has no asterisk on the form, but only makes sense for a residential policy)* | Any other occupancy | `Contents for Residential` (text) |
| Property Evaluation Report | `Type of Occupancy` is anything **except** `Contents ONLY` — a contents-only policy doesn't insure the building, so there's nothing to evaluate | `Contents ONLY` | `Upload Property Evaluation Report` (file) |

> `Value of Contents`, `Upload Property Evaluation Report`, and `Upload
> Property Image` are created automatically if you use `FormBuilder.gs`
> (see Setup below). If you're hand-building or editing the Form
> instead, add `Value of Contents` as a short-answer question near
> `Contents for Residential` in Section 3, `Upload Property Evaluation
> Report` as a file upload in the same section, and `Upload Property
> Image` as a file upload in Section 2 alongside `Upload Proof Of
> Address` — with these exact titles, or the trigger won't pick them up.

Routing (same for both lines):

- **100%** → `Ready for Underwriting`, folder moves to `03_Ready_For_Underwriting`, Underwriting is emailed.
- **Anything required is missing** → `Incomplete / Flagged`, folder moves to `01_Incomplete_Flagged`, and the agent is emailed the exact missing items.
- An admin can also manually flag a submission (e.g. for suspected misinformation, an expired permit, or a stale utility bill — none of which either form gives a date to check automatically) from the dashboard regardless of score — that always re-routes to `01` and emails the agent with the admin's note. **Request Supplemental Info** is how `02_Needs_Supplemental_Info` gets used — it's admin-only, not something the automated score routes into on its own (e.g. if TATIL comes back asking for something extra that isn't on the standard checklist).

## Project layout

```
appsscript.json         Manifest (time zone, web app access, OAuth scopes)
FormBuilder.gs           One-time: builds both Forms from scratch and auto-links them to this Sheet (see Setup)
Code.gs                  doGet, the shared onFormSubmit trigger + per-line handlers, setup, reprocessing
Config.gs                CONFIG.LINES.MOTOR / CONFIG.LINES.PROPERTY - form field titles, Drive/tracker names, ARAL prefixes, cutoff hour
DriveManager.gs          Per-line folder creation/lookup, moving folders between stages, moving uploaded files
VettingShared.gs         scoreChecklist_ - the required/satisfied/score loop shared by both engines
VettingEngine.gs         Motor scoring/routing logic
PropertyVettingEngine.gs Property scoring/routing logic
SheetManager.gs          Reads/writes both lines' tracker sheets
EmailService.gs          Agent/Underwriting notification emails (line-agnostic)
AdminController.gs       Server functions the Admin Dashboard calls (google.script.run), all take `line` first
AgentController.gs       Server functions the Agent Portal calls - returns both lines together, tagged
Index.html               Web app entry point — picks Admin or Agent view server-side
Stylesheet.html          Tailwind CDN + shared styles, included on every page
AdminDashboard.html      Admin table UI incl. the Motor/Property tab row (markup only)
AdminScript.html         Admin UI behaviour
AgentPortal.html         Agent mobile UI incl. the line filter row (markup only)
AgentScript.html         Agent UI behaviour, including document re-upload
```

## Setup

All of the steps below should be done while signed in to the
**`aral@enbfocus.com`** Google account (use the account switcher if
your browser is signed in as someone else first) — that's the account
that should own both Forms, the Sheet, the Apps Script project, the
Drive folder structure, and the web app deployment (deployed with
"Execute as: Me", so it always runs as `aral@enbfocus.com` regardless
of who's viewing).

1. **Create both Google Forms by running `FormBuilder.gs`.** Open the
   Sheet → Extensions → Apps Script (same project as the rest of this
   pipeline), paste in `FormBuilder.gs` alongside the other files
   (`appsscript.json` needs the `.../auth/forms` scope this project's
   manifest already includes), then run `createBothForms()` once from
   the function dropdown — the first run will prompt you to authorize
   Forms access, approve it. This builds
   both Forms from scratch with every question `Config.gs` expects,
   links each one's responses into this Sheet, and renames the
   resulting response tabs to match `CONFIG.LINES.MOTOR.RESPONSE_SHEET_NAME`
   / `CONFIG.LINES.PROPERTY.RESPONSE_SHEET_NAME` automatically — no
   manual Form-linking step needed. Check **View → Logs** afterward for
   each Form's edit and live URL.

   `FormBuilder.gs`'s own header comment lists what it can't reproduce
   (the ARAL logo/header image — add that afterward via each Form's own
   **Customize theme** button, since Google's API has no way to set it
   programmatically — and the Property form's original welcome-page copy
   and Section 2 subtitle, which weren't available when it was written
   and are left as placeholders to replace with your real wording).

   If you'd rather hand-build or edit a Form yourself instead, every
   question title it reads is listed in `CONFIG.LINES.MOTOR.FORM_FIELDS`
   and `CONFIG.LINES.PROPERTY.FORM_FIELDS` — reproduced here for
   reference:

   **Motor:**

   | Key | Exact question title |
   |---|---|
   | `PRODUCER_NAME` | Producer Name |
   | `BRANCH` | Branch |
   | `DP_LICENCE_FILE` | Upload DP Licence |
   | `ID_FILE` | Upload ID |
   | `CERT_OF_REGISTRATION_FILE` | Certificate of Registration |
   | `VEHICLE_INVOICE_FILE` | Upload Vehicle Invoice |
   | `CERTIFIED_COPY_FILE` | Upload Certified Copy |
   | `PROOF_OF_ADDRESS_FILE` | Proof Of Address |
   | `NEWLY_PURCHASED` | Is this vehicle newly purchased? |
   | `HAS_NCD_LETTER_Q` | Do you have an NCD Letter? |
   | `NCD_LETTER_FILE` | NCD Letter |
   | `NCD_LEVEL` | How much is your client's NCD (No Claim Discount) |
   | `COVERAGE_TYPE` | Coverage Type |
   | `VALUE_OF_VEHICLE` | Value Of vehicle |
   | `VEHICLE_SPECS` | Vehicle Specs (Reg #, Make/Model, Year, CC) |
   | `CLAIM_HISTORY_Q` | Do you have a Claim History |
   | `CLAIM_HISTORY_LETTER_FILE` | Claim History Letter |
   | `AGENT_EMAIL` | *(built-in "Email Address" field, see below)* |

   **Property:**

   | Key | Exact question title |
   |---|---|
   | `PRODUCER_NAME` | Producer Name |
   | `BRANCH` | Branch |
   | `DP_LICENCE_FILE` | Upload DP Licence |
   | `ID_FILE` | Upload ID |
   | `PROOF_OF_ADDRESS_FILE` | Upload Proof Of Address |
   | `PROPERTY_IMAGE_FILE` | Upload Property Image |
   | `DIRECTORS_ID_DP_FILE` | Upload Directors ID & DP |
   | `OCCUPANCY_TYPE` | Type of Occupancy |
   | `RESIDENTIAL_CONTENTS` | Contents for Residential |
   | `VALUE_OF_CONTENTS` | Value of Contents |
   | `PROPERTY_EVALUATION_REPORT_FILE` | Upload Property Evaluation Report |
   | `AGENT_EMAIL` | *(built-in "Email Address" field, see below)* |

   `AGENT_EMAIL` isn't a typed question on either form — it's Google's
   built-in field from turning on "Collect email addresses" in Form
   settings, which always shows up in submissions as `Email Address`
   (`FormBuilder.gs` turns this on automatically via `setCollectEmail(true)`).

   If a question gets reworded on either live form later, update the
   matching string here — the trigger matches by exact title and will
   silently treat a renamed field as blank otherwise.

2. **Confirm both Forms' responses are linked to this Sheet.** If you
   used `FormBuilder.gs` in step 1, this is already done — skip to step
   3. If you built or are using a Form by hand instead: on its Responses
   tab, click the green Sheets icon and choose "Select existing
   spreadsheet" so it lands in this one. Each Form gets its own response
   tab (Google names them "Form Responses 1", "Form Responses 2", etc.)
   — **rename each tab**, or update
   `CONFIG.LINES.MOTOR.RESPONSE_SHEET_NAME` /
   `CONFIG.LINES.PROPERTY.RESPONSE_SHEET_NAME` in `Config.gs` to match
   whatever they're actually called. The trigger uses this to tell which
   Form a submission came from.

3. **Open the Sheet → Extensions → Apps Script**, and create each file
   above in the script editor (matching filenames exactly, including the
   `appsscript.json` manifest — open it via the gear-icon **Project
   Settings → Show "appsscript.json"**). Copy-paste each file's contents
   from this folder.

4. **Set Script Properties** (Project Settings → Script properties):

   | Property | Value |
   |---|---|
   | `ADMIN_EMAILS` | Comma-separated list of admin Google account emails, e.g. `aral@enbfocus.com,backoffice@aral.com` |
   | `UNDERWRITING_EMAIL` | Where "ready for underwriting" alerts go, e.g. `underwriting@tatil.co.tt` |

5. **Run `setupPipeline` once** from the script editor's function
   dropdown (▶ Run). The first run will ask you to authorize Drive,
   Sheets, Gmail, and trigger-management permissions — approve them.
   This creates both lines' Drive folder structures, both tracker
   sheets, and installs the single shared `onFormSubmitTrigger` trigger.

6. **Deploy as a web app**: Deploy → New deployment → type **Web app**.
   - Execute as: **Me** (so the script can always manage the Drive
     folders/sheet regardless of who's viewing).
   - Who has access: **Anyone within [your domain]** if all agents have
     ARAL Google Workspace accounts (recommended — this lets the app
     detect who's viewing automatically and skips straight to the right
     view). Use **Anyone** instead if some agents use personal Google
     accounts or no Google account at all; the Agent Portal falls back
     to asking for an email address in that case.
   - Copy the resulting web app URL and share it — that's the one link
     for both admins and agents; the app shows each their own view
     automatically, with a tab to switch between Motor and Property.

7. **Test it**, for each line: submit that Form once with every document
   the checklist in "Vetting rules" above would require for your test
   answers, confirm a folder lands in `03_Ready_For_Underwriting` under
   that line's Drive subtree and a row appears in the matching tracker
   sheet. Submit again missing a required document and confirm it lands
   in `01_Incomplete_Flagged` and the agent gets an email. Then open the
   Admin Dashboard, switch to that line's tab, and use **Set name** on
   that row to confirm the Client Name / folder-rename flow works.

## Useful maintenance functions

Run these from the Apps Script editor's function dropdown when needed:

- `setupPipeline` — safe to re-run any time; won't duplicate folders or
  triggers.
- `reprocessAllRows` — re-scores every tracker row (both lines) against
  its Drive folder's current contents. Useful after changing `Config.gs`,
  or after manually dropping a file into a folder outside the app.

## Honest notes / limitations

- **Not a true installable PWA.** Apps Script web apps are served from a
  single sandboxed `doGet` endpoint, which can't host a separate
  `manifest.json` or a service worker at a fixed path, so there's no
  offline caching or "Install app" browser prompt. What's here is a
  mobile-first responsive page that works well bookmarked or added to a
  phone's home screen as a shortcut — the day-to-day experience agents
  need — just not an offline-capable PWA in the strict sense.
- **Form field matching is title-based.** Each line's handler reads
  `e.namedValues` keyed by that line's exact question titles. If you
  reword a question on either Form, update the matching string in
  `Config.gs` or the trigger will silently treat that field as blank.
- **`FormBuilder.gs` can't set a Form's header/logo image or know copy
  it was never shown** — Google's Forms API has no endpoint for theme/
  header images at all (add the ARAL logo via each Form's own
  "Customize theme" button after creation), and the Property form's
  welcome-page text and Section 2 subtitle are left as placeholders in
  the script since the originals weren't available when it was written.
  Everything that affects scoring (question titles, options, required
  flags) is reproduced exactly.
- **Identity detection depends on the deployment's access setting.**
  With "Anyone within domain" + "Execute as: Me", `Session.getActiveUser()`
  reliably returns the viewer's email, which drives automatic admin/agent
  routing. With "Anyone" access, Google hides viewer identity for
  privacy, so the Agent Portal asks for an email address once and
  remembers it in that browser.
- **Misinformation flags are a human judgment call**, not something the
  automated scorer detects — that's why "Flag as Incomplete" on the
  Admin Dashboard works independently of the score, for exactly that
  case.
