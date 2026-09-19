# Fitonomy Benchmark & Product Expansion Roadmap

## Purpose

Fitonomy is used as a product benchmark only. NutriTrack must not copy proprietary source code, assets, branding, or private implementation details. We use publicly observable product behavior to identify capabilities worth implementing independently.

Reference product: Fitonomy (App Store)
- AI workout planning
- workout logging and history
- exercise guidance
- nutrition / calorie / macro tracking
- AI meal/photo logging
- body/progress tracking
- reminders/accountability
- health/wearable integrations
- subscription model

## NutriTrack product direction

NutriTrack is PT-centric rather than only consumer self-service:

Trainer -> AI Coach Core -> Training / Nutrition / Progress -> Client App

The trainer remains the authority for assigned daily nutrition goals. AI/coach reads goals and proposes analysis/recommendations; it must not silently rewrite trainer/system targets.

## Architecture principles

### Nutrition Source of Truth

`calculated_nutrition` remains the single nutrition source of truth.

Flow:

Photo -> vision food recognition -> food matching -> portion estimate -> user confirmation -> Nutrition Source of Truth -> calculation -> persisted MealItem snapshot.

AI estimated weight must never be treated as consumed weight without confirmation.

### Workout Engine

Introduce independently:

- Program
- Week
- Training Day
- Workout Session
- Exercise
- Set
- Reps
- Weight
- RIR/RPE where supported
- Rest
- Workout history

Workout logging must be deterministic and auditable.

### Progressive Overload Engine

Use historical workout data to calculate progression candidates.

Example:

Bench Press
- Previous: 80 kg x 8 x 3, target RIR 2
- Successful completion -> next-session progression candidate
- Candidate must be explainable and reviewable, not an opaque AI mutation

The engine should distinguish:
- observed performance
- calculated progression candidate
- trainer-approved prescription
- client execution

### AI Coach

AI Coach is an orchestration/recommendation layer over trusted domain data.

Inputs:
- nutrition adherence
- workout history
- bodyweight / measurements
- assigned goals
- activity/recovery data when integrations exist

Outputs:
- explanations
- recommendations
- alerts
- review candidates

AI Coach must not independently recalculate authoritative nutrition values or mutate trainer-assigned goals.

### PT / Client Management

Core differentiation:

Trainer
  -> clients
  -> assigned nutrition targets
  -> assigned workout programs
  -> progress
  -> adherence
  -> alerts

Client
  -> daily nutrition
  -> meal logging
  -> workout execution
  -> progress
  -> AI assistance

## Implementation phases

### Phase A — Benchmark / contracts
1. Keep Fitonomy benchmark document.
2. Map each benchmark capability to an existing NutriTrack domain or a future domain.
3. Define contracts before UI implementation.
4. Preserve current nutrition invariants.

### Phase B — Workout Engine
1. Exercise library contract.
2. Program/week/day/session model.
3. Workout logger.
4. Set/repetition/weight/RIR recording.
5. Workout history.
6. Tests for idempotency, ownership, and authorization.

### Phase C — Progression
1. Training-volume calculations.
2. Exercise performance history.
3. Progression candidate engine.
4. Explainability/reason codes.
5. Trainer approval boundary.
6. Regression tests.

### Phase D — Nutrition AI hardening
1. Photo analysis remains stateless.
2. Food candidate matching.
3. Per-food confirmation.
4. Nutrition Source of Truth calculation.
5. Meal persistence only after confirmed consumed weights.
6. Confidence / confirmation UX.
7. Hallucination and wrong-food regression tests.

### Phase E — PT Dashboard
1. Client list.
2. Client nutrition adherence.
3. Workout adherence.
4. Body/progress history.
5. Alert center.
6. Trainer assignment workflows.
7. RBAC and user-isolation tests.

### Phase F — AI Coach
1. Read-only coach context.
2. Nutrition explanations.
3. Workout explanations.
4. Adherence alerts.
5. Recommendation engine.
6. Explicit mutation/approval boundaries.

### Phase G — Integrations
Later, after core domain stability:
- Apple Health
- Health Connect
- Apple Watch / wearable data
- steps
- activity
- weight
- sleep / recovery where available

Integrations must feed normalized domain data; they must not bypass domain invariants.

### Phase H — Commercial
After core product validation:
- subscriptions
- trainer/client plans
- trials
- billing
- product analytics
- retention metrics

## Priority rule

Do not implement every benchmark feature immediately.

Priority order:

1. Domain correctness and security
2. Nutrition Source of Truth
3. Workout domain + logger
4. Progression
5. PT/client workflows
6. AI Coach
7. Integrations
8. Commercial features

## Definition of done for benchmark-derived features

A feature is not complete when only the UI exists.

It requires:
- domain contract
- authorization / user isolation
- persistence model where needed
- deterministic business logic
- API boundary
- UI state handling
- idempotency where mutations exist
- regression tests
- failure/edge-case tests
- documentation

## Explicit non-goals

- No Fitonomy proprietary source-code copying.
- No copying Fitonomy branding/assets.
- No treating reverse-engineered APK metadata as authoritative product documentation.
- No AI mutation of trainer-owned nutrition goals.
- No duplicated nutrition calculations outside the Nutrition Source of Truth.
