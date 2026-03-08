# Musezenith Studio - Internal Operations + Service Packaging Playbook

## 1) Purpose
This playbook defines how one operator runs Musezenith as a paid lookbook production service.

Objective:
- Deliver client-ready lookbook outputs consistently
- Keep quality and turnaround predictable
- Package service by outcome, not tool access

Scope:
- Client intake -> production -> QC -> delivery -> revision handling
- Uses current shipped workflow only

## 2) Service model (what you sell)
You are selling:
- Curated image outcomes
- Consistency and selection quality
- Delivery reliability and handoff clarity

You are not selling:
- Self-serve prompt access
- Unlimited experimental generations
- Open-ended creative exploration without scope control

## 3) Standard operator workflow (single job)
1. Intake brief and constraints
2. Plan package scope and confirm tier/turnaround
3. PromptLab generation runs
4. Archive review and compare
5. Final selection marking
6. Re-run for quality/consistency gaps
7. Export bundle + delivery pack
8. Revision round handling (if in scope)

## 4) In-app SOP for paid jobs
### 4.1 PromptLab SOP
- Enter approved client brief
- Choose preset aligned with lookbook style
- Set variants by package tier
- Use seed policy based on consistency need:
  - `locked` for highest continuity
  - `incremental` for controlled variation
  - `random` for broader exploration (only in concept-heavy jobs)
- Generate and review tabs:
  - Positive, Negative, Params, QC, JSON, Score
- Use Retry/Cancel as needed

### 4.2 Archive SOP
- Ensure each meaningful run is saved and traceable
- Use search/filter/sort to isolate best candidates
- Open detail drawer for run-level QA

### 4.3 Compare + Final SOP
- Add top options to Compare Left/Right
- Mark run final for shortlisted run
- Mark image finals for selected delivery candidates

### 4.4 Re-run SOP
- Re-run when:
  - final quality gap remains
  - consistency not achieved
  - asset status issue needs replacement
- Avoid blind reruns; adjust brief/params intentionally

### 4.5 Export SOP
- Run export readiness check manually:
  - final images marked
  - no unresolved blocking errors
  - bundle includes prompt/result/metadata/assets refs
- Export bundle from detail drawer

## 5) Service packages (output-based)
## Package A - Starter Lookbook
- Deliverables:
  - 6 final lookbook images
  - 1 export bundle
- Quality tier:
  - Standard editorial consistency
- Consistency level:
  - Medium
- Turnaround:
  - 3 business days
- Included:
  - 1 kickoff brief review
  - 1 revision round (minor)

## Package B - Pro Lookbook
- Deliverables:
  - 12 final lookbook images
  - 2 themed subsets (if requested in brief)
  - 1 export bundle + shortlist rationale
- Quality tier:
  - High consistency and stronger curation
- Consistency level:
  - High
- Turnaround:
  - 4-5 business days
- Included:
  - 1 kickoff + style calibration
  - 2 revision rounds (minor/moderate)

## Package C - Campaign Lookbook
- Deliverables:
  - 20 final lookbook images
  - campaign-oriented option matrix
  - 1 master export bundle
- Quality tier:
  - Premium consistency + decision support
- Consistency level:
  - Very high
- Turnaround:
  - 6-8 business days
- Included:
  - kickoff + checkpoint review
  - up to 2 revision rounds

## 6) Included vs excluded vs add-ons
Included (default):
- Generation and curation in agreed scope
- Compare/final selection
- Export bundle handoff
- Revision rounds per package

Excluded:
- Raw self-serve workspace access
- Unlimited reruns
- Unscoped concept pivots after approval
- Full brand strategy work

Billable add-ons:
- Extra final images (per image block)
- Rush turnaround
- Additional revision round
- New creative direction reset (new brief branch)
- Multi-format delivery pack extension

## 7) Revision policy (operational)
Revision types:
- Minor:
  - small style/selection adjustments without changing brief direction
- Moderate:
  - controlled reruns and reselection within same direction
- Major:
  - new direction, new prompt strategy, broad rerun cycle

Billing rule:
- Minor/moderate inside package allowance
- Major counted as add-on or new phase

Revision SLA:
- Standard revisions: 24-48h response cycle
- Rush revision: billable add-on

## 8) Intake checklist (before production starts)
Required inputs:
1. Objective of lookbook
2. Audience and style references
3. Must-have and must-avoid constraints
4. Identity/consistency priority
5. Output count and due date
6. Approval stakeholder and decision owner

Scope lock:
- Confirm package, timeline, included revisions, add-on rates

## 9) Production QC checklist (internal)
Per candidate final image:
1. Matches brief direction
2. Visual quality acceptable for tier
3. Consistency with selected set
4. No obvious artifact issues
5. Asset status is usable (`ready` or acceptable fallback)
6. Included in final marker set

Per project:
1. Final count matches package
2. Compare rationale documented
3. Export bundle validated
4. Delivery naming/versioning consistent

## 10) Delivery checklist
Before sending to client:
1. Final selections marked in Archive
2. Export bundle generated
3. Deliverable count verified
4. Revision status noted
5. Handoff note drafted

## 11) Client handoff template
Subject:
- Lookbook Delivery - [Client] - [Project]

Body:
“Your lookbook package is ready.

Included:
- Final images: [count]
- Package tier: [Starter/Pro/Campaign]
- Export bundle: attached/shared

Summary:
- Direction delivered: [short]
- Final selection basis: [short rationale]
- Open revision allowance remaining: [x]

If you want changes, reply with:
1) image IDs
2) requested adjustments
3) priority level”

## 12) Pricing logic (cost-driver based)
Use pricing variables, not random fixed numbers:
- `D` = final deliverable count
- `Q` = quality tier multiplier (standard/high/premium)
- `C` = consistency complexity multiplier
- `T` = turnaround multiplier (standard/rush)
- `R` = included revision load

Pricing model:
- Base project fee + (D x per-image value x Q x C) + turnaround premium + add-ons

Practical rule:
- Price by decision-ready outputs, not generation attempts

## 13) Capacity planning for solo operator
### Time blocks per project (typical)
- Intake + setup: 0.5-1h
- Generation + curation: 2-6h (depends on package)
- Compare/final + QC: 1-3h
- Export + delivery: 0.5-1h
- Revision buffer: 1-3h

### Weekly capacity heuristic
Conservative solo capacity:
- 2-4 active jobs/week depending on tier mix

Suggested load mix:
- 2 Pro + 1 Starter
or
- 1 Campaign + 1 Starter

Do-not-overload rule:
- Never exceed available revision buffer by >30%
- Keep at least one half-day/week for catch-up and support

## 14) Production board statuses (simple operating system)
Use these statuses per job:
1. `Intake`
2. `Scoped`
3. `Generating`
4. `Comparing`
5. `Finalizing`
6. `Delivered`
7. `Revision`
8. `Closed`

## 15) Risk controls
Risk: scope creep  
Control: lock package + revision policy in writing

Risk: too many reruns  
Control: rerun only against explicit gap hypothesis

Risk: delivery inconsistency  
Control: mandatory QC + final marker + export checklist

Risk: solo bottleneck  
Control: capacity cap and rush add-on pricing

## 16) Immediate launch checklist (for selling now)
1. Pick 3 service packages and publish clear inclusions
2. Prepare intake form from checklist section
3. Prepare delivery email template
4. Define add-on and revision rates
5. Set weekly capacity limit
6. Run one internal dry-run end-to-end in app
