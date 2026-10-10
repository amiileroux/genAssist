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

## What it does

1. An agent submits the live "ARAL Motor Insurance Lead Intake" Google
   Form (producer/branch info, client & vehicle details, and the
   compliance document uploads).
2. An installable trigger fires, which:
   - Creates a Drive folder `[ARAL-CODE]_Pending-Name_[Coverage_Type]`
     and moves the uploaded files into it. (Client Name isn't on the
     form — see "Client Name" below.)
   - Scores the submission 0–100% against the checklist in "Vetting
     rules" below.
   - Moves the folder into the matching pipeline stage.
   - Logs a row to the `Pipeline_Tracker` sheet (the dashboard's data
     source).
   - Emails the agent the exact missing items if anything's incomplete,
     or emails Underwriting if it's 100% ready.
3. Admins work the **Admin Dashboard** (desktop) to set the client's
   name, flag, request info, approve, or mark a TATIL policy number as
   issued — each action moves the Drive folder and re-notifies the
   agent.
4. Agents work the **Agent Portal** (mobile-first) to see their own
   submissions and re-upload exactly the documents that are missing.

### Client Name

The form doesn't collect a client name as its own field — the client's
legal name is read off the **DP Licence** upload, since that has to be
exact. So a fresh submission shows up with no name until an admin opens
it, looks at the uploaded DP Licence, and clicks **Set name** on the
Admin Dashboard (`AdminController.admin_setClientName`). That both
updates the tracker row and renames the Drive folder to match.

## Drive folder architecture

```
/ARAL_Insurance_Pipeline/
  01_Incomplete_Flagged/       Missing KYC, bad photos, or misinformation
  02_Needs_Supplemental_Info/  Needs additional underwriting detail (e.g. valuation)
  03_Ready_For_Underwriting/   100% complete & vetted
  04_Completed_Policies/       Issued policies with TATIL policy numbers
```

Folders are created on first run and their IDs are cached in Script
Properties, so the structure is created once and then just reused.

## Vetting rules (Motor Insurance)

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

Routing:

- **100%** → `Ready for Underwriting`, folder moves to `03_Ready_For_Underwriting`, Underwriting is emailed.
- **Anything required is missing** → `Incomplete / Flagged`, folder moves to `01_Incomplete_Flagged`, and the agent is emailed the exact missing items.
- An admin can also manually flag a submission (e.g. for suspected misinformation, an expired permit, or a stale utility bill — none of which the form gives a date to check automatically) from the dashboard regardless of score — that always re-routes to `01` and emails the agent with the admin's note. **Request Supplemental Info** is how `02_Needs_Supplemental_Info` gets used — it's admin-only, not something the automated score routes into on its own (e.g. if TATIL comes back asking for something extra that isn't on the standard checklist).

## Project layout

```
appsscript.json      Manifest (time zone, web app access, OAuth scopes)
Code.gs               doGet, onFormSubmit trigger, setup, reprocessing
Config.gs             All the editable constants (folder names, form field titles, cutoff hour, ...)
DriveManager.gs       Folder creation/lookup, moving folders between stages, moving uploaded files
VettingEngine.gs      The scoring/routing logic described above
SheetManager.gs       Reads/writes the Pipeline_Tracker sheet
EmailService.gs       Agent/Underwriting notification emails
AdminController.gs    Server functions the Admin Dashboard calls (google.script.run)
AgentController.gs    Server functions the Agent Portal calls
Index.html            Web app entry point — picks Admin or Agent view server-side
Stylesheet.html       Tailwind CDN + shared styles, included on every page
AdminDashboard.html   Admin table UI (markup only)
AdminScript.html      Admin UI behaviour
AgentPortal.html      Agent mobile UI (markup only)
AgentScript.html      Agent UI behaviour, including document re-upload
```

## Setup

All of the steps below should be done while signed in to the
**`aral@enbfocus.com`** Google account (use the account switcher if
your browser is signed in as someone else first) — that's the account
that should own the Form, the Sheet, the Apps Script project, the Drive
folder structure, and the web app deployment (deployed with "Execute
as: Me", so it always runs as `aral@enbfocus.com` regardless of who's
viewing).

1. **The Google Form already exists** ("ARAL Motor Insurance Lead
   Intake") — this script is written to match it exactly. `Config.gs`'s
   `CONFIG.FORM_FIELDS` lists every question title it reads by:

   | `CONFIG.FORM_FIELDS` key | Exact question title on the live form |
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
   | `AGENT_EMAIL` | *(not a typed question — Google's built-in "Email Address" field from "Collect email addresses")* |

   If a question gets reworded on the live form later, update the
   matching string here — the trigger matches by exact title and will
   silently treat a renamed field as blank otherwise.

2. **Link the Form to a new Google Sheet** (Form → Responses tab → the
   green Sheets icon).

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
   This creates the Drive folder structure, the `Pipeline_Tracker`
   sheet, and installs the `onFormSubmitTrigger` trigger.

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
     automatically.

7. **Test it**: submit the Form once with every document the checklist in
   "Vetting rules" above would require for your test answers, confirm a
   folder lands in `03_Ready_For_Underwriting` and a row appears in
   `Pipeline_Tracker`. Submit again missing a required document and
   confirm it lands in `01_Incomplete_Flagged` and the agent gets an
   email. Then open the Admin Dashboard and use **Set name** on that row
   to confirm the Client Name / folder-rename flow works.

## Useful maintenance functions

Run these from the Apps Script editor's function dropdown when needed:

- `setupPipeline` — safe to re-run any time; won't duplicate folders or
  triggers.
- `reprocessAllRows` — re-scores every tracker row against its Drive
  folder's current contents. Useful after changing `Config.gs`, or after
  manually dropping a file into a folder outside the app.

## Honest notes / limitations

- **Not a true installable PWA.** Apps Script web apps are served from a
  single sandboxed `doGet` endpoint, which can't host a separate
  `manifest.json` or a service worker at a fixed path, so there's no
  offline caching or "Install app" browser prompt. What's here is a
  mobile-first responsive page that works well bookmarked or added to a
  phone's home screen as a shortcut — the day-to-day experience agents
  need — just not an offline-capable PWA in the strict sense.
- **Form field matching is title-based.** `onFormSubmitTrigger` reads
  `e.namedValues` keyed by each question's exact title. If you reword a
  question on the Form, update the matching string in `Config.gs` or the
  trigger will silently treat that field as blank.
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
