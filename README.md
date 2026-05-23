# 🛠️ GemForge — Ultimate Prompt Architect for Google Gemini Gems

GemForge is a premium, subscription-based Mini SaaS platform designed to generate highly-tailored system instructions (Name, Description, Instructions, and Default Tools) for Google Gemini Gems. By utilizing advanced LLM reasoning, GemForge parses user requirements, expert personas, target audiences, and specific constraints to output production-ready Gems config prompts conforming to the **T.C.R.E.I** prompt engineering framework.

---

## 🌟 Key Features

* **🤖 Framework-Driven Prompt Generation**: Automatically generates system prompt configurations tailored to the **T.C.R.E.I** model (Task, Context, References, Evaluate, Iterate).
* **💬 In-Line AI Revision Chat (Pro/Ultra)**: Features a real-time, interactive chat sidebar allowing users to refine, iterate, and modify sections of their generated Gem configurations.
* **🔌 Companion Chrome Extension**: Bridges the SaaS platform directly to the official Google Gemini interface (`gemini.google.com`), enabling single-click export and instantiation of forged Gems.
* **💳 Unified Multi-Gateway Payment System**: Supports local and international transaction processing:
  * **PayOS**: Direct Vietnamese banking bank transfers via dynamic VietQR code modals.
  * **Stripe**: Credit/Debit card payments for global transactions.
  * **PayPal**: Sandbox-integrated secure checkout.
* **🎟️ Dynamic Coupon Engine**: Validates, tracks, and applies percentage discounts (including 100% free passes) with check constraints, expiry times, and usage limits.
* **🔔 Automation Webhooks & Cron Jobs**: Direct event listeners for upgrade provisioning (via Resend emails) and scheduled daily cron checks to auto-downgrade expired plans.
* **🌐 Complete Internationalization (i18n)**: Fully state-based bilingual support for English (🇺🇸) and Vietnamese (🇻🇳).

---

## 📁 Repository Structure

```
├── api/                       # API route layers & webhook handlers
│   └── webhooks/              # Stripe/PayOS/PayPal webhook endpoints
├── extension/                 # Chrome Extension source directory
│   ├── manifest.json          # extension configuration
│   ├── content_gemforge.js    # context script running on GemForge
│   └── content_gemini.js      # injection script running on Google Gemini
├── public/                    # Static assets & favicon resources
├── src/                       # React (Vite) frontend application
│   ├── assets/                # Images, icons, and flags
│   ├── components/            # UI components (Auth, Generator, Billing, Sidebar, Chat)
│   ├── context/               # Global AppContext & Auth states
│   ├── hooks/                 # Reusable utility hooks
│   ├── lib/                   # Supabase client & i18n translation systems
│   ├── pages/                 # Admin panels and dashboard views
│   ├── App.tsx                # Main Router and layout assembly
│   └── index.css              # Glassmorphic and Neon CSS design system
├── supabase/                  # Database migrations & configuration
│   └── migrations/            # Version-controlled SQL migration scripts
├── server.cjs                 # Express backend server (CommonJS)
├── package.json               # Package dependencies & scripts
└── vite.config.ts             # Vite bundler configurations
```

---

## 💾 Database Schema (Supabase PostgreSQL)

GemForge uses version-controlled database schema migrations. The tables in Supabase include:

### 1. `users` Table
Stores subscription state and daily AI usage statistics.
* `id` (UUID, Primary Key)
* `email` (VARCHAR, Unique)
* `current_plan` (VARCHAR: `free` | `pro` | `ultra`)
* `daily_usage` (INTEGER)
* `last_reset_date` (TIMESTAMP WITH TIME ZONE)

### 2. `subscriptions` Table
Tracks purchase periods and payment sources.
* `id` (UUID, Primary Key)
* `user_id` (UUID, Foreign Key)
* `plan_type` (VARCHAR)
* `status` (VARCHAR)
* `current_period_end` (TIMESTAMP WITH TIME ZONE)
* `provider` (VARCHAR: `payos` | `stripe` | `paypal` | `momo`)

### 3. `billing_history` Table
Logs historical records of successful transactions.
* `id` (UUID, Primary Key)
* `user_id` (UUID, Foreign Key)
* `amount` (NUMERIC)
* `status` (VARCHAR: `pending` | `success` | `failed`)
* `description` (TEXT)
* `provider` (VARCHAR)
* `created_at` (TIMESTAMP WITH TIME ZONE)

### 4. `coupons` Table
Enables discount validation and enforcement.
* `id` (UUID, Primary Key)
* `code` (VARCHAR, Unique)
* `discount_percent` (INTEGER, 0-100)
* `duration_days` (INTEGER)
* `max_uses` (INTEGER)
* `used_count` (INTEGER)
* `expires_at` (TIMESTAMP WITH TIME ZONE)
* `is_active` (BOOLEAN)

---

## 🛠️ Installation & Setup

### Prerequisites
* [Node.js](https://nodejs.org/) (v18+)
* [npm](https://www.npmjs.com/)
* [Supabase Account](https://supabase.com/)

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/CThawngs/Gem-Forge.git
cd Gem-Forge
npm install
```

### 2. Environment Configuration
Create a `.env` file in the root directory and configure the variables as follows:

```env
# Supabase Configuration
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Resend Email Automation
VITE_RESEND_API_KEY=your_resend_api_key

# AI Orchestration
OPENROUTER_API_KEY=your_openrouter_api_key

# PayOS (Vietnam VietQR Bank Transfers)
PAYOS_CLIENT_ID=your_payos_client_id
PAYOS_API_KEY=your_payos_api_key
PAYOS_CHECKSUM_KEY=your_payos_checksum_key

# Stripe (Credit/Debit Card Payments)
STRIPE_PUBLIC_KEY=your_stripe_public_key
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret

# PayPal (International Sandbox/Live)
PAYPAL_CLIENT_ID=your_paypal_client_id
PAYPAL_SECRET=your_paypal_secret

# Vercel Cron Security
CRON_SECRET=your_cron_secret_token
```

### 3. Database Migration Setup
Initialize your database schema by applying migrations located in `supabase/migrations/`:
```bash
# Apply migrations using Supabase CLI
supabase db push
```

### 4. Running the Development Server
Use `concurrently` to boot both the React frontend and Express backend:
```bash
npm run dev
```
* Frontend runs at: `http://localhost:5173`
* Backend API server runs at: `http://localhost:3001`

---

## 🔌 Companion Chrome Extension Installation

The Chrome Extension resides in the `extension/` folder. It automatically intercepts generated configurations from the GemForge web application and injects them directly into the Google Gemini Gems creator interface.

1. Open Google Chrome.
2. Navigate to `chrome://extensions/`.
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** (top-left button).
5. Select the `extension/` folder inside the cloned project directory.

---

## 📄 License
This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
