# UX & Navigation Structure

**Status:** Draft v1
**Date:** 2026-08-25
**Related:** [PRODUCT_SPEC.md](./PRODUCT_SPEC.md) · [ACTIVITY_MODEL.md](./ACTIVITY_MODEL.md) · [CHILD_SAFETY.md](./CHILD_SAFETY.md)

---

## 1. Shape of the product

Three distinct surfaces, deliberately separated at the route-group level so the child
surface cannot accidentally inherit parent navigation, and so its constraints are
structural rather than conventional.

| Surface | Who | Chrome | Route group |
|---|---|---|---|
| **Public** | Anyone | Marketing header | `(marketing)` |
| **Parent app** | Authenticated parent | Sidebar (desktop) / bottom tabs (mobile) | `(parent)` |
| **Child mode** | Child, on the parent's device | **None** — full screen, no nav, no exit but the PIN | `(child)` |
| **Print** | Parent's printer | Print CSS only | `print` |

**Language convention (decision A8):** routes and code identifiers are English; every
user-facing string is a Vietnamese i18n key. So `/children/[childId]` renders "Hồ sơ của
con". This keeps the codebase greppable and tests stable while shipping a Vietnamese product.

Mobile-first at 360px. Desktop is a widened version of the same layout, never a different
information architecture.

## 2. Route map

```
(marketing)
  /                                  Landing: what it is, safety promise, sign up
  /privacy                           Privacy & child-data commitments
  /safety                            Plain-language summary of CHILD_SAFETY.md

(auth)
  /login
  /signup
  /forgot-password
  /reset-password

(parent)                             ← requires session; redirects to /login otherwise
  /dashboard                         Home: today, awaiting review, per-child summary
  /children                          List of child profiles
  /children/new                      Create child (wizard)
  /children/[childId]                Child overview: current, history, difficulty per type
  /children/[childId]/edit           Edit profile & interests
  /children/[childId]/history        Full assignment history, filterable
  /library                           Browse catalog: filter by type / age / difficulty / interest
  /library/[templateId]              Activity preview (exactly as the child would see it)
  /assign                            Assign flow: pick child → suggestions → preview → confirm
  /assignments/[assignmentId]        Parent view: status, snapshot, submission, review
  /settings                          Account, locale, child-mode PIN
  /settings/safety                   PIN, what child mode does and does not protect
  /settings/data                     Export all data · delete account

(child)                              ← requires session + unlocked child context
  /play                              Locked entry: PIN prompt → today's cards
  /play/[assignmentId]               Activity player (one of six renderers)
  /play/[assignmentId]/done          Completion screen

print
  /print/[assignmentId]              Printable worksheet (print CSS, no app chrome)
  /print/preview/[templateId]        Printable preview from the library
```

## 3. Parent navigation

Four destinations, no more. Bottom tabs on mobile, sidebar on desktop.

| Tab | VI label | Route |
|---|---|---|
| Home | Trang chủ | `/dashboard` |
| Children | Các con | `/children` |
| Library | Thư viện | `/library` |
| Settings | Cài đặt | `/settings` |

A persistent **"Giao bài"** (Assign) primary action sits in the header on desktop and as
a floating action button on mobile — assigning is the core loop and is never more than
one tap away.

## 4. Core flows

### 4.1 Onboarding — target: first activity assigned in under 3 minutes

```
/signup  (email + password)
   ↓  email confirmation
/children/new  — wizard, one question per screen
   1. Tên gọi ở nhà (nickname; copy explains a nickname is fine and preferred)
   2. Tháng & năm sinh  (never an exact date)
   3. Lớp                (mẫu giáo … lớp 6)
   4. Chọn hình đại diện (preset illustrations only — no photo upload)
   5. Sở thích           (pick 3–6 interest chips)
   ↓
/settings/safety  — set the 4-digit child-mode PIN
   Copy states plainly: this keeps the app on your child's activity;
   it does not lock your phone or your account.
   ↓
/assign  — engine proposes 3 activities, pre-filtered for this child
   ↓
/dashboard  — "Đã giao 3 hoạt động"
```

Escape hatches: the wizard is resumable, interests can be skipped (the engine falls back
to age + grade + difficulty scoring), and the PIN can be set later from settings.

### 4.2 Assign

```
/assign
  Step 1  Pick child (skipped when there is only one)
  Step 2  Suggestions — 3 cards, at most one per type (engine §7)
            Each card: type icon · title · ~minutes · difficulty dots · why it was picked
            Actions: [Xem trước] [Đổi gợi ý khác] [Chọn từ thư viện]
            "Đổi gợi ý khác" increments an explicit shuffleSeed → still deterministic
  Step 3  Preview — the full activity, rendered exactly as the child will see it
            (This is the same component the future AI preview gate uses.)
  Step 4  Confirm — optional due date, then assign
            → writes the immutable content_snapshot
  Done    Confirmation + "Đưa máy cho con" → deep link into child mode
```

### 4.3 Child completes an activity

```
Parent taps "Đưa máy cho con" (or opens /play)
   ↓
PIN gate  — parent enters PIN, picks which child
   ↓
/play  — full screen, no navigation
   "Chào Bi! Hôm nay con có 2 hoạt động"
   Cards: large, illustrated, one tap to open. Completed cards show a calm check.
   ↓
/play/[assignmentId]  — one of six renderers:
   handwriting          instructions + "in ra để viết" + take/upload a photo of the work
   drawing_prompt       prompt + checklist + take/upload a photo
   story_comprehension  story (large type, adjustable size) → questions one per screen
   story_summary        story → single writing area with prompt hints and sentence starters
   reflection           one question per screen + optional sentence starters
   situation_judgment   scenario → guided options (or open text) → gentle feedback
   ↓
Submit → /play/[assignmentId]/done
   Warm, non-judgemental: "Con làm xong rồi! Bố mẹ sẽ xem nhé."
   No score shown to the child (open question Q8). No timer at any point.
   ↓
Back to /play, or "Xong rồi" → PIN required to return to the parent app
```

Child-mode constraints, enforced structurally by the route group:
no navigation bar · no links out · no catalog · no search · no settings · no other
child's profile · no history browsing · no exit without the PIN · single child locked
for the session ([CHILD_SAFETY.md](./CHILD_SAFETY.md) §6).

Accessibility in child mode: minimum 18px body text with a size control, ≥ 48px touch
targets, high-contrast palette, a dyslexia-friendly font option, generous spacing, no
motion that cannot be disabled, and full keyboard operability.

### 4.4 Parent review

```
/dashboard  — "Chờ bố mẹ xem (2)"
   ↓
/assignments/[assignmentId]
   Left / top:  what was assigned (from the snapshot)
   Right / below: what the child did
      text answers verbatim · multiple-choice with correct/incorrect and the
      parent-only rationale · photo submissions (signed URL, tap to zoom)
   Score: shown to the parent only, for choice questions only
   ↓
Verdict — three large buttons, one tap:
   [Hơi dễ]  [Vừa sức]  [Hơi khó]
   Optional note to self
   ↓
Saves the review → difficulty for that (child, type) adapts (§7 of PRODUCT_SPEC)
   ↓
Back to dashboard, with a suggested next activity
```

If a parent never leaves a verdict, adaptation degrades gracefully to completion
signals — two consecutive incomplete assignments lower difficulty by one.

### 4.5 Print

From a library preview, an assignment, or the child's card:
`/print/[assignmentId]` renders the snapshot with print CSS — A4 portrait, no app
chrome, activity title and child nickname in the header, ruled guides for handwriting,
generous blank space for drawing, and the questions laid out for pen answers.
The browser's own print dialog does the rest; no PDF generation service.

## 5. Key screens

### `/dashboard`
1. Greeting + child switcher (when more than one child)
2. **Hôm nay** — today's assignments per child, with status
3. **Chờ bố mẹ xem** — submitted, awaiting review (the strongest call to action)
4. **Gợi ý cho con** — 3 engine suggestions, one tap to assign
5. **Gần đây** — last 5 completed, with the parent's verdict

### `/children/[childId]`
Profile summary · interests as chips · **difficulty per activity type** shown as five
dots each (this is the only place the adaptation is made legible to the parent) ·
current assignments · recent history · actions: edit, assign, view history, archive.

### `/library`
Filters: type · age · difficulty · interest · estimated minutes. Cards show type icon,
title, minutes, difficulty. Every item opens the same preview component used in the
assign flow and in the future AI approval gate — one preview implementation, three call
sites.

### `/settings/safety`
The PIN, and an honest explanation of what child mode is: it keeps the app on your
child's activities; it is **not** a device lock and **not** a security boundary; your
account stays signed in behind it. Also links to the plain-language safety summary and
the "report content" mechanism.

## 6. Empty, loading and error states

| Situation | Treatment |
|---|---|
| No children yet | Illustrated empty state → "Thêm con đầu tiên" |
| No assignments today | Calm, not guilt-inducing: "Hôm nay chưa có hoạt động nào" + suggestions |
| Catalog exhausted for a child | Explain honestly ("con đã làm hết các hoạt động phù hợp gần đây") and offer the library with cooldown filters relaxed |
| Photo upload fails | Retry, keep the answer text, never lose the child's work |
| Offline in child mode | Answers are kept in local state and retried; the child is never shown a raw error |
| Session expired mid child-mode | Return to the PIN gate, not to the login screen with a child watching |

## 7. Visual and tone principles

- **Two moods, one system.** The parent app is calm, dense, and efficient. Child mode is
  large, warm, spacious and playful. Both use the same shadcn/ui primitives and design
  tokens; child mode overrides scale and colour, not the component library.
- Vietnamese diacritics must render correctly at every weight and size — font selection
  is a first-class requirement, not a polish item (see open question Q4).
- Encouraging, never evaluative. Effort over ability. No red, no X marks, no "sai rồi".
- No dark patterns: no artificial urgency, no streak guilt, no notification badges
  engineered to pull a parent back.
- Illustration over photography for anything depicting children.
