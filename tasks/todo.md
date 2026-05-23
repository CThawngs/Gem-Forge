# Todo List

## Phase1: Foundation & Infrastructure ✅
- [x] Create SYSTEM_PROMPT.md with workflow rules
- [x] Set up .agent/skills/ directory
- [x] Create tasks/todo.md and tasks/lessons.md
- [x] Create Supabase project (ID: `fcfwqajwmqugvbufztnj`, region: `ap-southeast-1`)
- [x] Initialize Vite + React + TypeScript project
- [x] Set up database schema (users, subscriptions, generations) with RLS & triggers
- [x] Connect Supabase client to frontend (.env configured)

## Phase2: Core UI (Clone from Screenshot) ✅
- [x] Build dark-mode layout with glassmorphism design system
- [x] Create navigation bar (GemForge logo, Features, Pricing, Documentation, EN/VI, Dashboard)
- [x] Build hero section with gradient tagline
- [x] Build pricing cards (Free, Pro, Ultra) with neon accents & Popular badge
- [x] Build Generator form (Main Goal, Expert Role, Target Audience, Tone of Voice, Output Format, Constraints & Rules)
- [x] Build "Generate My Gem ✨" CTA button (orange gradient)
- [x] Build output cards (Name, Description, Instructions, Tool Recommendation) with copy buttons
- [x] Build footer with copyright and links
- [x] SEO meta tags and favicon

## Phase3: Backend Logic
- [ ] Implement Supabase Auth (email/password)
- [ ] Implement daily usage tracking & plan gating
- [ ] Implement Gem generation API (Gemini API integration)
- [ ] Wire up i18n (EN/VI toggle)

## Phase4: Multi-Gateway Payment System & Webhooks
- [ ] Build Payment Modal UI with 4 tabs: MoMo (QR Wallet), PayOS (Dynamic VietQR), Stripe (Card), PayPal (Global)
  - [ ] PayOS: Embed Raw QR Data directly on Modal (no redirect)
  - [ ] All tabs: Handle plan selection (Pro, Ultra) and amount calculation
- [ ] Implement Payment Creation API Endpoints:
  - [ ] `POST /api/payments/momo` - Create MoMo payment
  - [ ] `POST /api/payments/payos` - Create PayOS payment (return QR data)
  - [ ] `POST /api/payments/stripe` - Create Stripe Checkout Session
  - [ ] `POST /api/payments/paypal` - Create PayPal Order
- [ ] Implement Webhook Handlers (`/api/webhooks/...`):
  - [ ] `POST /api/webhooks/momo` - Validate signature, process successful payments
  - [ ] `POST /api/webhooks/payos` - Validate signature, process successful payments
  - [ ] `POST /api/webhooks/stripe` - Validate signature, process successful payments
  - [ ] `POST /api/webhooks/paypal` - Validate signature, process successful payments
- [ ] Webhook Logic for Successful Payments:
  - [ ] Update `users.current_plan` to new plan (pro/ultra)
  - [ ] Insert record into `billing_history` (amount, status=success, provider, description)
  - [ ] Insert record into `subscriptions` (user_id, plan_type, status=active, current_period_end, provider)
  - [ ] Trigger transactional email via Resend API
- [ ] Implement Auto-Downgrade Cron Job:
  - [ ] `GET /api/cron/check-subscriptions` (Vercel Cron) - Scan expired subscriptions, downgrade to free
- [ ] Test All Payment Flows:
  - [ ] Test MoMo payment + webhook
  - [ ] Test PayOS QR + webhook
  - [ ] Test Stripe Checkout + webhook
  - [ ] Test PayPal Order + webhook
  - [ ] Verify user plan update in Supabase
  - [ ] Verify billing history and subscription records

## Review
**Phase1 & 2 Complete (2026-05-05):** Foundation set up with Supabase + Vite, full UI cloned from design. All visual elements verified via browser screenshots.
**Phase4 Plan Updated (2026-05-08):** Detailed payment system plan added based on CONTEXT.md v4.0 requirements.