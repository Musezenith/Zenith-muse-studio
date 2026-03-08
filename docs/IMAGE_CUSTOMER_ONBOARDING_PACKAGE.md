# Musezenith Studio - Customer Onboarding Package (Image Product)

## 1) Purpose
This package is the customer-facing onboarding system for getting new users to first success fast and consistently.

Use it for:
- New signups
- Demo leads
- Pilot customers
- Support handoff
- Success tracking

Aligned with:
- Current shipped app behavior
- Landing page copy package
- GTM playbook
- Founder sales kit

## 2) Onboarding outcomes
Primary onboarding objective:
- Move users from “interested” to “active and successful” in one guided workflow cycle.

Definition of first success:
1. User completes at least one end-to-end run:
   - PromptLab -> Generate -> Archive -> Compare/Final -> Export
2. User can explain why one output was selected.
3. User has one reusable artifact (export bundle) for team/client review.

## 3) Product workflow (customer-facing explanation)
### Step-by-step
1. **PromptLab**
   - Enter brief, choose preset/model/variants/seed settings.
2. **Generate**
   - Produce image variants and inspect tabs:
     - Positive, Negative, Params, QC, JSON, Score
3. **Archive**
   - Run is saved automatically for history.
4. **Compare**
   - Place two runs/images side-by-side.
5. **Final selection**
   - Mark run final and/or mark image finals.
6. **Re-run**
   - Generate new options from an archived payload.
7. **Export**
   - Download bundle for review/handoff.

## 4) Track A - Assisted Pilot Onboarding
### A1) Welcome email (pilot)
Subject:
- Welcome to Musezenith Pilot - let’s run your first brief this week

Body:
“Great to have you onboard.  
Our goal in week 1 is simple: complete one full image workflow from PromptLab to Export using a real brief.

What we’ll do together:
1. Kickoff call (45 min)
2. First guided run
3. Compare + final selection
4. Export bundle used in your review flow

Please share before kickoff:
- 1 real campaign brief
- 1 approval use case
- 1 owner from your side

Reply with two kickoff time options.”

### A2) Kickoff agenda (45 min)
1. Context and desired business outcome (5 min)
2. Current workflow pain map (10 min)
3. Live guided run in product (20 min)
4. Success criteria alignment + next steps (10 min)

### A3) Pilot setup checklist
- Campaign brief prepared
- Desired visual direction clarified
- Owner assigned
- Pilot timeline agreed (2-4 weeks)
- Success metrics agreed

### A4) Pilot week-1 plan
Day 1:
- Guided first run
Day 2-3:
- Team executes 2 more runs
Day 4:
- Compare and final decision session
Day 5:
- Export bundle used in real review

### A5) Pilot success criteria
Minimum:
1. 3+ runs completed
2. 1 compare decision completed
3. 1 final selection set (run/image)
4. 1 export bundle used in real review

Business signal:
- Stakeholder confirms improved speed or reduced review friction.

## 5) Track B - Self-Serve Onboarding
### B1) Welcome email (self-serve)
Subject:
- Start your first Musezenith image workflow in 15 minutes

Body:
“Welcome to Musezenith.  
Your first goal: complete one workflow cycle from PromptLab to Export.

Quick start:
1. Create first run in PromptLab
2. Review generated variants
3. Open run in Archive
4. Compare two options
5. Mark final output
6. Export bundle

Tip:
- Start with one real brief you already need this week.”

### B2) First-session guide (15-20 min)
1. Open PromptLab
2. Enter brief + choose preset/model
3. Set variants and seed policy
4. Click Generate
5. Review output tabs
6. Go to Archive and open run
7. Use Compare Left/Right
8. Mark final run/image
9. Export bundle

### B3) Self-serve setup checklist
- One real brief ready
- One review use case in mind
- Goal for session defined (e.g., shortlist top 1-2 options)
- First export bundle completed

## 6) Minimum actions for fastest first success
If time is limited, require only:
1. Generate one run with at least 2 variants
2. Compare two options (run or image)
3. Mark one final output
4. Export one bundle

This is the shortest path to value.

## 7) Common blockers and recovery guidance
### Blocker: generation error
Symptoms:
- Error banner/toast, run state `error`

Recovery:
- Use `Retry`
- Check backend/provider configuration
- Try lower complexity brief and rerun

### Blocker: wrong prompt direction
Recovery:
- Adjust brief/preset in PromptLab
- Generate again
- Use Archive/Re-run for controlled iteration

### Blocker: uncertain final decision
Recovery:
- Use Compare Left/Right
- Mark provisional finals, then review with stakeholders

### Blocker: missing/broken asset
Recovery:
- System uses remote-first with inline fallback behavior
- If still unavailable, use Re-run and replace selection

### Blocker: team doesn’t adopt after first demo
Recovery:
- Set one real campaign owner
- Define one concrete weekly use case
- Track first-success criteria explicitly

## 8) FAQ (customer-facing)
Q: Do I need advanced prompt skills?
A: No. Start with your natural-language brief and refine through runs.

Q: What is the easiest first use case?
A: One campaign concept sprint with 2-4 variants and one final selection.

Q: Can multiple people review decisions?
A: Yes. Archive, compare, final markers, and export support collaborative review.

Q: What if we need more options after review?
A: Use Re-run from Archive payload to create new variants quickly.

Q: What can we share externally?
A: Export bundle containing prompt/result/metadata/asset references.

## 9) Customer success tracking template
Track these fields for each onboarded account:
- Onboarding track: assisted / self-serve
- First run completed (Y/N)
- Compare used (Y/N)
- Final selection used (Y/N)
- Export completed (Y/N)
- Time to first success (hours/days)
- Main blocker encountered
- Status: onboarding / active / at-risk

## 10) Support handoff template
Use this internal handoff summary:
- Account:
- Owner:
- Onboarding track:
- Completed milestones:
- Open blockers:
- Next scheduled touchpoint:
- Success risk level:
- Recommended next action:

## 11) Reusable customer CTA set
Use one CTA at each stage:
1. “Run your first real brief now.”
2. “Book kickoff and complete your first guided run.”
3. “Finalize one output and export your review bundle.”
4. “Start your 2-week pilot.”

## 12) Implementation note for team
Do not introduce future capabilities in onboarding copy.
Keep all guidance anchored to shipped workflow only:
- PromptLab
- Archive
- Compare/Final
- Re-run
- Export
