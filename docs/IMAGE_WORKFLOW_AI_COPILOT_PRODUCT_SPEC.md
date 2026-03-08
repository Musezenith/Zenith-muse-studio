# Musezenith Studio - In-Product AI Copilot Spec (Image Workflow)

## 1) Document purpose
Define a production-ready AI copilot for the current shipped image workflow.

This spec is implementation-oriented and intended for:
- Product/design
- Frontend engineering
- Backend/orchestration engineering
- Prompt/system design
- QA and safety review

Knowledge base alignment:
- Image workflow operating manual
- GTM playbook
- Founder sales kit
- Landing copy package
- Customer onboarding package

## 2) Product intent
The copilot is a **workflow assistant**, not a generic chat surface.

It should:
- Improve generation decision quality
- Reduce failed or low-quality runs
- Accelerate path to final selection and export-ready handoff
- Guide onboarding and support recovery paths in context

It should not:
- Replace core workflow controls
- Auto-run hidden actions without user confirmation
- Invent capabilities not present in app

## 3) Non-goals
- Open-ended unconstrained assistant chat as primary mode
- Fully autonomous generation loop
- Replacing human creative decision authority
- New creative rendering models in this phase

## 4) User value summary
For operators:
- Better prompts before generate
- Fewer avoidable failed runs
- Faster compare/final decisions
- Cleaner export readiness

For teams:
- More consistent workflow behavior
- Better quality control traceability
- Faster onboarding for new users

## 5) Core copilot behaviors (P0)
1. Prompt guidance (PromptLab)
2. Pre-generate checklist (PromptLab)
3. Batch QC review (post-generation, Archive detail)
4. Final-pick recommendation (Compare + Final selection)
5. Re-run suggestion (Archive + errors + weak outputs)
6. Export readiness check (Archive detail before export)
7. Onboarding/support guidance (contextual tips + recovery)

## 6) Copilot UI model (contextual, embedded)
Primary surfaces:
- **Right-side Copilot Panel** (context-aware, collapsible)
- **Inline Checklist Cards** (inside PromptLab/Archive detail)
- **Recommendation Panel** (Compare and Final section)
- **Next-Step Suggestion Bar** (bottom sticky, stage-driven)

Interaction model:
- Screen-aware cards appear automatically by context.
- User can ask follow-up via constrained prompt input.
- Copilot outputs actionable suggestions with one-click apply where safe.

No detached bot-first screen in P0.

## 7) Entry points by workflow stage
### 7.1 PromptLab
Entry triggers:
- Brief entered
- Before user clicks Generate
- After generation error/cancel

Copilot blocks:
- Prompt guidance card
- Pre-generate checklist
- Risk flags (identity, constraints, quality)
- Suggested parameter tweaks

### 7.2 Generated result review (PromptLab output tabs)
Entry triggers:
- New generation received

Copilot blocks:
- Quick QC scan summary
- “What to inspect next” suggestions
- Top 3 refinement opportunities

### 7.3 Archive list + detail
Entry triggers:
- Run opened
- Run has error
- Run has low score / no final marked

Copilot blocks:
- Batch QC checklist
- Re-run suggestion card
- Finalization readiness indicator

### 7.4 Compare + Final selection
Entry triggers:
- Compare L/R populated
- User has not marked final

Copilot blocks:
- Side-by-side recommendation summary
- Confidence + rationale tags
- “Choose final / need rerun” suggestion

### 7.5 Export flow
Entry triggers:
- User opens detail drawer / hits export

Copilot blocks:
- Export readiness check
- Missing asset warning
- Suggested pre-export fixes

### 7.6 Onboarding/support mode
Entry triggers:
- New user session
- First run incomplete
- Repeated errors

Copilot blocks:
- Guided next step checklist
- Recovery hints
- “First success” milestone tracking

## 8) Data context the copilot can read
### 8.1 Global context
- Current screen + route
- Current run state
- User action history in current session
- Knowledge snippets from operating docs (curated)

### 8.2 PromptLab context
- Brief text
- Selected preset/model
- Variants/seed policy/base seed
- Generated prompt package (positive/negative/params/QC/score)
- Generation errors/cancel state

### 8.3 Archive context
- Selected run metadata
- Run state and errors
- Generation assets status (ready/fallback/missing)
- Final selection state
- Compare targets

### 8.4 Export context
- Export bundle composition
- Asset resolvability status
- Finalization completeness signals

### 8.5 Data constraints
- No external browsing requirement for runtime recommendations
- No hidden user data access
- Only app-available structured fields and approved KB snippets

## 9) Copilot outputs (UI primitives)
### 9.1 Checklist Card
Fields:
- Title
- 3-8 checklist items
- Status per item (`ok`, `warn`, `action`)
- Optional “Apply suggestion” action

### 9.2 Recommendation Panel
Fields:
- Recommendation title
- Confidence (`low`, `med`, `high`)
- Why (1-3 concise reasons)
- Suggested next actions (buttons)

### 9.3 Next-Step Suggestion Bar
Fields:
- Current stage
- Suggested immediate next action
- Secondary fallback action

### 9.4 Recovery Card
Fields:
- Issue summary
- Likely cause
- Step-by-step recovery
- “Try now” action

## 10) Behavior specs by capability
### 10.1 Prompt guidance
Input:
- Brief + chosen preset + params

Output:
- Brief clarity score
- Missing constraint suggestions
- Prompt structure improvements

Rules:
- Never auto-rewrite without preview.
- Provide diffs for suggested changes.

### 10.2 Pre-generate checklist
Checks:
- Brief completeness
- Identity-sensitive terms present?
- Contradictory constraints
- Variant count appropriate for goal
- Seed policy fit for user intent

Actions:
- “Fix now” quick edits (opt-in only)

### 10.3 Batch QC
Checks:
- Obvious artifacts / quality issues inferred from existing metadata signals
- QC checklist coverage
- Asset readiness/fallback/missing status

Output:
- Per-run QC status summary and recommended rerun/keep.

### 10.4 Final-pick recommendation
Inputs:
- Compare left/right selected runs/images
- Score and QC context
- Final selection status

Output:
- Suggested winner + rationale
- “Need rerun before final” condition

Guardrail:
- Recommendation is advisory, never auto-mark final.

### 10.5 Re-run suggestion
Triggers:
- Error run
- Low quality signal
- Missing assets without fallback
- No final marked after compare

Output:
- Suggested rerun strategy:
  - adjust brief constraints
  - tweak variants
  - seed strategy guidance

### 10.6 Export readiness check
Checks:
- Final selection exists?
- Asset status resolvable?
- Generation error unresolved?
- Metadata completeness for handoff

Output:
- Ready / Not ready badge
- Blocking issues list
- One-click “proceed anyway” confirmation path

### 10.7 Onboarding/support guidance
Output:
- “First success” progress checklist
- Next best action per user maturity
- Contextual FAQ snippets

## 11) Guardrails and safety
### 11.1 Identity preservation guardrails
- Detect identity-sensitive requests and recommend conservative parameters.
- Warn when suggestions may risk identity drift.
- Never suggest unsafe changes silently.

### 11.2 Workflow safety
- No destructive writes without explicit user confirmation.
- No automatic final marking/export.
- No hidden reruns.

### 11.3 Recommendation integrity
- Must cite concrete in-app signals behind recommendation.
- No fabricated claims about unseen images/data.
- Use confidence labels for uncertainty.

### 11.4 Misleading guidance prevention
- Prohibit statements that imply guaranteed visual outcomes.
- Use probabilistic language for quality predictions.

## 12) UX states and fallback behavior
Copilot states:
- `idle`
- `analyzing`
- `ready`
- `needs_user_input`
- `warning`
- `error`

Failure mode:
- If copilot backend fails, workflow remains fully usable.
- Show concise fallback message and static checklist template.

## 13) System architecture (implementation spec)
### 13.1 Frontend components
- `CopilotPanel`
- `ChecklistCard`
- `RecommendationPanel`
- `NextStepBar`
- `RecoveryCard`

Context providers:
- `WorkflowContextProvider` (route/stage/run snapshot)
- `CopilotStateProvider` (requests, results, errors)

### 13.2 Backend orchestration service
New service boundary:
- `POST /api/copilot/recommend`

Request payload:
- `stage` (`promptlab`, `review`, `archive`, `compare`, `export`, `onboarding`)
- `context` (structured subset only)
- `userIntent` (optional action intent)

Response payload:
- `cards[]` (typed UI cards)
- `nextStep`
- `confidence`
- `warnings[]`

### 13.3 Knowledge retrieval
Use curated static knowledge pack derived from product docs:
- workflow manual
- gtm narrative
- onboarding/support guidance

No broad open-ended retrieval in P0.

### 13.4 Prompt/system design direction
System prompt must enforce:
- contextual behavior only
- no off-workflow hallucination
- recommendation explanations tied to provided context

## 14) Eventing and analytics
Track:
- Copilot open rate by screen
- Suggestion acceptance rate
- Checklist completion rate
- Impact on:
  - generation retries
  - time to final selection
  - export readiness success
  - onboarding first-success completion

## 15) Rollout plan
Phase 1 (internal beta):
- Prompt guidance + pre-generate checklist + onboarding checklist

Phase 2:
- Compare recommendation + export readiness

Phase 3:
- Batch QC + adaptive rerun strategy

Success gate before next phase:
- measurable increase in first-success and faster final selection cycles

## 16) QA acceptance criteria
1. Copilot appears contextually on target screens.
2. Suggestions map to actual stage data.
3. No destructive action occurs without confirmation.
4. Final-pick remains advisory only.
5. Export readiness flags missing assets correctly.
6. Workflow remains functional when copilot fails.
7. UI copy remains consistent with shipped product terminology.

## 17) MVP UI content examples
### PromptLab checklist card
Title:
- “Pre-Generate Readiness”
Items:
- Brief is specific enough (`warn`)
- Constraints are non-conflicting (`ok`)
- Seed policy fits intent (`action`)
Action:
- “Apply suggested seed policy”

### Compare recommendation card
Title:
- “Suggested Final Candidate”
Confidence:
- `medium`
Reasons:
- “Higher score and cleaner QC alignment”
- “Closer to stated brief constraints”
Actions:
- “Mark run final”
- “Recommend rerun”

### Export readiness card
Title:
- “Export Readiness”
Status:
- `warning`
Issues:
- “1 asset marked missing (fallback available)”
Actions:
- “Proceed with export”
- “Re-run before export”

## 18) Out-of-the-box copy tone rules
- Direct, practical, non-hype.
- Avoid generic AI language.
- Tie every recommendation to workflow outcome.
- Keep recommendations short and actionable.

## 19) Open decisions (for implementation kickoff)
1. Should copilot responses be cached per run/stage?
2. Which suggestions are one-click apply vs manual only?
3. Do we allow user feedback on recommendation quality in MVP?
4. Which model/provider to use for copilot orchestration in P1?
