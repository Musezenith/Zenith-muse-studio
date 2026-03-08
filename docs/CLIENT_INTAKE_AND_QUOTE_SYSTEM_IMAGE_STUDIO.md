# Musezenith Studio - Client Intake + Quote System (Solo Image Studio)

## 1) Purpose
This system standardizes how incoming requests become paid, well-scoped production jobs before any PromptLab generation starts.

Outcomes:
- Better-fit projects
- Less vague brief risk
- More consistent pricing and margin
- Clear client expectations on revisions and delivery

## 2) Intake workflow (operator pipeline)
1. Receive inquiry
2. Send client brief form
3. Run internal qualification checklist
4. Map to service package
5. Draft scope + quote
6. Get written approval
7. Move job to production (`PromptLab` starts only after approval)

## 3) Client brief form (send to client)
Required fields:
1. Brand / project name
2. Objective of this lookbook
3. Target audience
4. Desired style direction (3-5 keywords)
5. References (links or examples)
6. Must-have elements
7. Must-avoid elements
8. Deliverable count needed
9. Consistency priority:
   - Standard / High / Very high
10. Quality expectation:
    - Standard editorial / High / Premium campaign
11. Deadline and any hard launch date
12. Revision expectation (what “acceptable changes” means for them)
13. Decision owner and approval process
14. Budget range (optional but recommended)

## 4) Minimum information gate (before PromptLab)
Do not start production until all are present:
1. Clear objective
2. Style direction + references
3. Must-have / must-avoid constraints
4. Deliverable count
5. Turnaround deadline
6. Decision owner
7. Agreed package and revision scope
8. Written quote approval

## 5) Internal qualification checklist (go/no-go)
### Fit score (0-2 each, max 10)
1. Brief clarity
2. Scope realism vs deadline
3. Decision process clarity
4. Budget fit vs package
5. Creative direction stability

Decision rule:
- `8-10`: strong fit (proceed)
- `5-7`: proceed with scope tightening
- `<5`: high risk, request clarification or decline

## 6) Red flags (high-risk / low-margin)
Red flags:
- “Need premium quality, no references, urgent deadline”
- Unlimited revisions requested
- No clear decision owner
- Deliverable count too high for timeline
- Constant direction pivots expected
- “Can we decide scope later?”

Handling:
- Re-scope into paid discovery/kickoff
- Reduce deliverables or extend timeline
- Add rush or revision pricing explicitly
- Decline if risk remains high

## 7) Scope-definition template (internal + client-facing)
Project:
- Client:
- Objective:
- Package recommendation:
- Deliverables:
- Quality tier:
- Consistency level:
- Turnaround:
- Included revisions:
- Excluded items:
- Add-on rates:
- Delivery format:
- Approval milestones:

Scope lock statement:
- “Work starts after this scope is approved in writing.”

## 8) Package mapping rules (from request -> package)
Use these rules:
- Deliverables `<=6`, standard consistency, 3-day target -> **Starter**
- Deliverables `7-12`, high consistency, 4-5 day target -> **Pro**
- Deliverables `13-20`, premium consistency, 6-8 day target -> **Campaign**

If request exceeds package limits:
- Split into phases
- Add billable expansion block

## 9) Quoting logic (cost-driver based)
### Variables
- `D`: final deliverable count
- `Q`: quality tier multiplier
- `C`: consistency multiplier
- `T`: turnaround multiplier
- `R`: included revision load
- `A`: add-ons

### Pricing formula (working model)
`Quote = Base Fee + (D x Unit Value x Q x C) + Turnaround Premium(T) + Add-ons(A)`

Margin protection rules:
1. Rush deadlines always priced with premium
2. High consistency always priced above standard
3. Extra revisions billed outside included scope
4. Direction reset = new scoped phase

## 10) Solo capacity guardrail in quoting
Before sending quote, check:
1. Current active jobs
2. Revision load already committed
3. Available production hours this week

Accept only if:
- New job fits without breaking existing delivery commitments
- Revision buffer remains at least 20-30% of planned hours

## 11) Quote template (send to client)
Subject:
- Quote - [Project Name] - Musezenith Lookbook Service

Body:
“Hi [Name],  
Based on your brief, here is the recommended scope:

Package:
- [Starter / Pro / Campaign]

Included:
- Final images: [count]
- Quality tier: [Standard / High / Premium]
- Consistency level: [Standard / High / Very high]
- Turnaround: [X business days]
- Revisions included: [X rounds]
- Delivery: Export bundle + final selected outputs

Exclusions:
- Unlimited revisions
- New creative direction resets
- Unscoped additional deliverables

Add-ons (if needed):
- Extra images: [rate]
- Extra revision round: [rate]
- Rush turnaround: [rate]

Total quote:
- [amount + currency]

Approval:
- Reply with “Approved” to confirm scope and start date.
”

## 12) Approval, revision, and delivery language (ready to paste)
### Approval language
- “Production begins only after written approval of scope, timeline, and revision terms.”

### Revision language
- “Included revisions cover minor/moderate changes within approved direction. Major direction changes are treated as a new scoped phase.”

### Delivery expectation language
- “Final handoff includes selected outputs and one export bundle with prompt/result/metadata/asset references.”

### Turnaround language
- “Turnaround starts from approval timestamp and assumes timely feedback from decision owner.”

## 13) Internal pre-production checklist (final gate)
1. Brief complete
2. Fit score calculated
3. Package mapped
4. Capacity check passed
5. Quote approved
6. Project board status set to `Scoped`
7. Move to `Generating` only after all above complete

## 14) Quick response templates for common intake issues
### Vague brief
- “To keep quality and turnaround reliable, we need style references + must-have/must-avoid constraints before starting.”

### Unrealistic deadline
- “We can support this timeline via rush add-on, or we can keep standard pricing with adjusted delivery date.”

### Unlimited revisions request
- “We include a defined revision scope to protect delivery quality and schedule; additional rounds are available as add-ons.”

### Budget mismatch
- “We can reduce deliverable count or phase the project to match your budget while keeping quality standards.”

## 15) Immediate-use operating checklist
1. Copy client brief form into intake workflow
2. Use qualification score on every inquiry
3. Map to package using section 8
4. Price using section 9 + capacity guardrail
5. Send quote template and wait for written approval
6. Start PromptLab only after approval gate
