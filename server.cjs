const express = require('express');
const cors = require('cors');
require('dotenv').config(); // Force load .env variables
console.log("🔑 [Backend] PAYOS_CLIENT_ID Loaded:", !!process.env.PAYOS_CLIENT_ID);
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const resend = require('resend');
const Stripe = require('stripe');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());

// Preserve raw body for Stripe webhook signature verification
app.use(express.json({
  verify: (req, res, buf) => {
    if (req.path === '/api/webhooks/stripe') {
      req.rawBody = buf.toString();
    }
  }
}));

// ─── Initialize Clients ───────────────────────────────────────────────────
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'placeholder';
const supabase = createClient(supabaseUrl, supabaseKey);

const resendClient = new resend.Resend(process.env.VITE_RESEND_API_KEY || 're_placeholder');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');

// ─── Constants ─────────────────────────────────────────────────────────────
const PLAN_PRICES = {
  pro: { vnd: 115000, usd: 4.99 },
  ultra: { vnd: 345000, usd: 14.99 },
};

const PAYOS_API_BASE = 'https://api.payos.vn/v2/payment-links';
const PAYOS_CLIENT_ID = process.env.PAYOS_CLIENT_ID;
const PAYOS_API_KEY = process.env.PAYOS_API_KEY;
const PAYOS_CHECKSUM_KEY = process.env.PAYOS_CHECKSUM_KEY;

// In-memory store for pending payments (maps orderId -> { userId, plan, provider })
const pendingPayments = new Map();

// ─── Helpers ──────────────────────────────────────────────────────────────
async function logEvent(type, source, message, details = {}) {
  try {
    await supabase.from('system_logs').insert({
      type,
      source,
      message,
      details
    });
  } catch (err) {
    console.error('Failed to log event to database:', err);
  }
}

function generateOrderCode() {
  return Date.now();
}

function repairJSON(jsonStr) {
  let output = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < jsonStr.length; i++) {
    const char = jsonStr[i];
    if (escaped) {
      // Pass through any escape sequence unchanged
      output += char;
      escaped = false;
    } else if (char === '\\') {
      escaped = true;
      output += char;
    } else if (char === '"') {
      inString = !inString;
      output += char;
    } else if (inString) {
      if (char === '\n') {
        output += '\\n';
      } else if (char === '\r') {
        output += '\\r';
      } else if (char === '\t') {
        output += '\\t';
      } else {
        output += char;
      }
    } else {
      output += char;
    }
  }
  // Remove trailing commas before closing brackets/braces
  return output.replace(/,\s*([\]}])/g, '$1');
}

// Aggressive fallback: strip everything outside of the outermost {...} and re-try
function extractAndRepairJSON(raw) {
  // Try direct parse first
  try { return JSON.parse(raw); } catch (_) {/* continue */}
  // Try repairJSON
  try { return JSON.parse(repairJSON(raw)); } catch (_) {/* continue */}
  // Try extracting only the outermost JSON object
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first !== -1 && last > first) {
    const sliced = raw.slice(first, last + 1);
    try { return JSON.parse(sliced); } catch (_) {/* continue */}
    try { return JSON.parse(repairJSON(sliced)); } catch (_) {/* continue */}
  }
  // Last resort: try to build a partial valid object from known fields
  const extractField = (fieldName) => {
    const pattern = new RegExp(`"${fieldName}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`);
    const m = raw.match(pattern);
    return m ? m[1].replace(/\\n/g, '\n') : null;
  };
  const name = extractField('name');
  const description = extractField('description');
  const instructions = extractField('instructions');
  const tools = extractField('tools');
  if (name && instructions) {
    return { name, description: description || '', instructions, tools: tools || 'No default tool', knowledgeBase: [] };
  }
  throw new Error('AI returned an invalid or incomplete response format. Please try again.');
}

async function getCouponDiscount(couponCode) {
  if (!couponCode) return null;
  try {
    const { data: coupon, error } = await supabase
      .from('coupons')
      .select('*')
      .eq('code', couponCode.toUpperCase())
      .eq('is_active', true)
      .maybeSingle();

    if (error || !coupon) return null;

    if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) return null;
    if (coupon.max_uses > 0 && coupon.used_count >= coupon.max_uses) return null;

    return coupon;
  } catch (err) {
    console.error('[Coupon] Error fetching coupon:', err);
    return null;
  }
}

async function validateCoupon(couponCode, userId = null) {
  if (!couponCode) return { valid: false, error: 'coupon_invalid' };
  try {
    const { data: coupon, error } = await supabase
      .from('coupons')
      .select('*')
      .eq('code', couponCode.toUpperCase())
      .maybeSingle();

    if (error || !coupon) {
      return { valid: false, error: 'coupon_invalid' };
    }
    if (!coupon.is_active) {
      return { valid: false, error: 'coupon_invalid' };
    }
    if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
      return { valid: false, error: 'coupon_expired' };
    }
    if (coupon.max_uses > 0 && coupon.used_count >= coupon.max_uses) {
      return { valid: false, error: 'coupon_limit' };
    }
    // ── 1-account-1-coupon enforcement ──────────────────────────────────────
    // Block if this user has EVER used this specific coupon code before
    if (userId) {
      const { data: existingRedemption } = await supabase
        .from('coupon_redemptions')
        .select('id')
        .eq('user_id', userId)
        .eq('coupon_code', couponCode.toUpperCase())
        .maybeSingle();
      if (existingRedemption) {
        return { valid: false, error: 'coupon_already_used' };
      }
    }
    return { valid: true, coupon };
  } catch (err) {
    console.error('[Coupon] Validation error:', err);
    return { valid: false, error: 'coupon_error' };
  }
}

async function sendPlanUpgradeEmail(userEmail, plan, amount, provider) {
  try {
    await resendClient.emails.send({
      from: 'GemForge <noreply@gemforge.ai>',
      to: userEmail,
      subject: `Welcome to GemForge ${plan.charAt(0).toUpperCase() + plan.slice(1)}!`,
      html: `
        <h1>Payment Successful</h1>
        <p>Thank you for upgrading to the <strong>${plan}</strong> plan!</p>
        <p>Amount: ${amount}</p>
        <p>Provider: ${provider}</p>
        <p>Your plan is now active. Start generating Gems with your new limits!</p>
      `,
    });
  } catch (err) {
    console.error('[Email] Failed to send upgrade email:', err.message);
  }
}

async function sendSubscriptionCancelledEmail(userEmail, plan) {
  try {
    const planName = plan.charAt(0).toUpperCase() + plan.slice(1);
    await resendClient.emails.send({
      from: 'GemForge <noreply@gemforge.ai>',
      to: userEmail,
      subject: `[GemForge] Your ${planName} subscription has expired / Đăng ký ${planName} của bạn đã hết hạn`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
          <h2 style="color: #6200ee;">Subscription Expired / Đăng ký hết hạn</h2>
          <p>Hi,</p>
          <p>Your <strong>GemForge ${planName} Plan</strong> subscription has expired because the billing period ended or the coupon duration completed, and it has not been renewed.</p>
          <p>Your account has been reverted to the <strong>Free Plan</strong>. You can still access your Gems, but standard daily limits will apply.</p>
          <p>If you'd like to restore your high-limit access, you can upgrade your plan at any time on the <a href="https://gem-forge-pink.vercel.app/billing">Billing Page</a>.</p>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
          
          <h2 style="color: #6200ee;">Đăng ký đã hết hạn</h2>
          <p>Xin chào,</p>
          <p>Gói đăng ký <strong>GemForge ${planName}</strong> của bạn đã hết hạn do kết thúc chu kỳ thanh toán hoặc hết thời hạn của mã giảm giá, và chưa được gia hạn.</p>
          <p>Tài khoản của bạn đã được chuyển về <strong>Gói Miễn Phí (Free Plan)</strong>. Bạn vẫn có thể truy cập các Gem của mình, nhưng giới hạn sử dụng hàng ngày sẽ được áp dụng.</p>
          <p>Nếu bạn muốn khôi phục quyền truy cập hạn mức cao, bạn có thể nâng cấp gói của mình bất kỳ lúc nào tại <a href="https://gem-forge-pink.vercel.app/billing">Trang Thanh Toán</a>.</p>
          
          <p style="margin-top: 30px; font-size: 12px; color: #777;">Thank you for using GemForge! / Cảm ơn bạn đã sử dụng GemForge!</p>
        </div>
      `,
    });
    console.log(`[Email] Cancellation email sent to ${userEmail} for plan ${plan}`);
  } catch (err) {
    console.error('[Email] Failed to send cancellation email:', err.message);
  }
}

// ─── Framework Prompt (Existing) ────────────────────────────────────────
const FRAMEWORK_PROMPT_FALLBACK = `T.C.R.E.I framework summary:
- TASK: define the action, persona, and output format for the Gem.
- CONTEXT: infer missing user context, audience, purpose, and constraints without asking the GemForge user follow-up questions.
- REFERENCES: include 1-2 practical input-to-output behavior examples inside the Gem instructions.
- EVALUATE: include self-check rules the Gem must run before answering.
- ITERATE: define how the Gem should interact with its end-user, adapting by use case. Tool-like Gems should act directly; tutor/advisor Gems may ask focused questions and guide step by step.`;

function loadFrameworkPrompt() {
  try {
    return fs.readFileSync(path.join(__dirname, 'Framework_Prompting.md'), 'utf8');
  } catch (error) {
    console.warn('Framework_Prompting.md could not be loaded. Using fallback T.C.R.E.I summary.', error.message);
    return FRAMEWORK_PROMPT_FALLBACK;
  }
}

const FRAMEWORK_PROMPT = loadFrameworkPrompt();

// ─── Existing Generate Endpoint ─────────────────────────────────────────
app.post('/api/generate', async (req, res) => {
  try {
    const { input, lang, outputFormat } = req.body;
    if (!input) return res.status(400).json({ error: 'Missing input data' });
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'OPENROUTER_API_KEY is not configured' });
    const HARDCODED_MODEL = 'openrouter/free'; // Free Models Router - auto picks from all free models
    const formatMap = {
      fmt_text: 'Text',
      fmt_markdown: 'Markdown',
      fmt_table: 'Table',
      fmt_code: 'Code',
      fmt_image: 'Image',
      fmt_video: 'Video',
      fmt_audio: 'Audio',
      fmt_other: 'Other'
    };
    const rawFmt = outputFormat || input?.outputFormat || '';
    const resolvedFormat = formatMap[rawFmt] || rawFmt || 'Markdown';
    const finalFormat = (resolvedFormat === 'Other' || resolvedFormat === 'fmt_other')
      ? (input?.outputFormatOther || 'Text')
      : resolvedFormat;

    let formatInstruction = '';
    const isTextFormat = finalFormat.toLowerCase().includes('text') || finalFormat.toLowerCase().includes('plain');
    if (isTextFormat) {
      formatInstruction = '\n\nIMPORTANT: Because the user\'s output format choice is Text/Plaintext, you MUST write the generated Gem instructions (the "instructions" field in the JSON) strictly as clean plain text. DO NOT use any markdown formatting characters like #, ##, *, **, or - for headers or lists in the instructions content. Inside the instructions, explicitly direct the Gem to format its responses in plain text without any markdown elements.';
    } else {
      formatInstruction = `\n\nIMPORTANT: The generated Gem instructions (the "instructions" field in the JSON) must use clear Markdown formatting, and MUST direct the final Gem to format its responses in the ${finalFormat} format.`;
    }

    const toneMap = {
      tone_formal: 'Formal',
      tone_casual: 'Casual',
      tone_professional: 'Professional',
      tone_friendly: 'Friendly',
      tone_authoritative: 'Authoritative',
      tone_other: 'Other'
    };
    const resolvedTone = toneMap[input.toneOfVoice] || input.toneOfVoice || '';

    function extractKeywords(expertRole, mainGoal) {
      const combined = `${expertRole} ${mainGoal}`;
      const capitalizedRegex = /\p{Lu}\p{L}*(?:\s+\p{Lu}\p{L}*)*/gu;
      const matches = combined.match(capitalizedRegex) || [];
      const stopwords = new Set([
        'I', 'A', 'The', 'And', 'Or', 'For', 'With', 'By', 'From', 'To', 'In', 'On', 'At', 'An',
        'Người', 'Hãy', 'Làm', 'Cách', 'Tạo', 'Viết', 'Gợi', 'Ý', 'Tôi', 'Cần', 'Giúp', 'Để', 'Và'
      ]);
      const cleanMatches = matches
        .map(m => m.trim())
        .filter(m => m.length > 1 && !stopwords.has(m));

      const techTerms = ['setup', 'agent', 'automation', 'api', 'bot', 'gpt', 'llm', 'seo', 'code', 'database', 'design', 'app', 'web', 'marketing', 'sales'];
      const words = combined.toLowerCase().split(/[^a-z0-9\p{L}]+/u);
      const foundTechTerms = words.filter(w => techTerms.includes(w));

      return [...new Set([...cleanMatches, ...foundTechTerms])];
    }

    function cleanSearchQuery(query) {
      const words = query.split(/\s+/);
      const stopwords = new Set([
        'người', 'hướng', 'dẫn', 'đồng', 'hành', 'từng', 'bước', 'một', 'đảm', 'bảo', 'giúp', 'tôi', 'làm', 'thế', 'nào', 'để', 'cho', 'hãy', 'viết', 'tạo', 'cách', 'làm', 'sao', 'và', 'hoặc', 'của', 'tại', 'trong', 'trên', 'dưới', 'với', 'từ', 'đến', 'một', 'các', 'những', 'hệ', 'thống', 'gợi', 'ý'
      ]);
      return words.filter(w => !stopwords.has(w.toLowerCase())).join(' ').slice(0, 100).trim();
    }

    async function fetchWikiSearch(query, lang = 'en') {
      try {
        const url = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=&format=json`;
        const response = await fetch(url);
        if (!response.ok) return [];
        const data = await response.json();
        const results = data.query?.search?.slice(0, 3) || [];
        return results.map(r => ({
          title: r.title,
          url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, '_'))}`
        }));
      } catch (err) {
        console.error(`[WebSearch] Wikipedia (${lang}) error:`, err.message);
        return [];
      }
    }

    const terms = extractKeywords(input.expertRole || '', input.mainGoal || '');
    let termResultsList = [];
    
    if (terms.length > 0) {
      for (const term of terms.slice(0, 3)) {
        const enResults = await fetchWikiSearch(term, 'en');
        const viResults = await fetchWikiSearch(term, 'vi');
        const combinedForTerm = [...enResults, ...viResults];
        if (combinedForTerm.length > 0) {
          termResultsList.push(combinedForTerm);
        }
      }
    }

    let searchContextUrls = [];
    let hasMore = true;
    let index = 0;
    while (hasMore && searchContextUrls.length < 15) {
      hasMore = false;
      for (const termResults of termResultsList) {
        if (index < termResults.length) {
          searchContextUrls.push(termResults[index]);
          hasMore = true;
        }
      }
      index++;
    }

    if (searchContextUrls.length === 0) {
      const fallbackQuery = cleanSearchQuery(`${input.expertRole || ''} ${input.mainGoal || ''}`);
      if (fallbackQuery) {
        const enResults = await fetchWikiSearch(fallbackQuery, 'en');
        const viResults = await fetchWikiSearch(fallbackQuery, 'vi');
        searchContextUrls.push(...enResults, ...viResults);
      }
    }

    // Deduplicate and limit to 4 results
    const seenUrls = new Set();
    const finalUrls = [];
    for (const item of searchContextUrls) {
      if (!seenUrls.has(item.url)) {
        seenUrls.add(item.url);
        finalUrls.push(item);
      }
      if (finalUrls.length >= 4) break;
    }

    const searchContextText = finalUrls.length > 0
      ? `\n\nREAL KNOWLEDGE BASE URLS: You MUST select the items in the "knowledgeBase" array ONLY from the following list of real-world URLs. Do NOT invent, change, or hallucinate URLs or titles. Choose from these:\n${finalUrls.map(u => `- {"title": "${u.title.replace(/"/g, '\\"')}", "url": "${u.url}"}`).join('\n')}`
      : `\n\nREAL KNOWLEDGE BASE URLS: The list of verified URLs is empty. You MUST return an empty array [] for the "knowledgeBase" field. DO NOT hallucinate any URLs.`;

    let systemPrompt = `You are an expert prompt engineer and AI assistant architect. Your task is to create a system instruction (Gem) based on the user's requirements.

You MUST follow the GemForge T.C.R.E.I framework below when creating the "instructions" field. Treat it as mandatory product policy:

${FRAMEWORK_PROMPT}

Operational rules:
1. Never ask the GemForge user follow-up questions. Infer missing details using reasonable, globally inclusive assumptions.
2. The "instructions" field must be a complete, production-ready system instruction for a Gemini Gem.
3. The "instructions" field must follow the System Instruction Format rules. If the output format is Text/Plaintext, the instructions must be formatted as clean plain text without markdown elements (no #, **, or -). If the output format is Markdown, Table, Code, etc., the instructions must use clear Markdown sections. Use the selected output language (Vietnamese or English) for all text.
4. Include 1-2 practical reference examples that show user input and expected Gem behavior/output.
5. Include self-evaluation rules the Gem must check before responding.
6. Adapt interaction rules to the Gem type. Direct tool Gems should act immediately; education, coaching, medical-adjacent, legal-adjacent, or advisory Gems should guide carefully, ask end-users focused clarifying questions when appropriate, avoid unsafe claims, and avoid giving final answers too early when tutoring.
7. Support users from any country, culture, industry, and skill level. Avoid narrow assumptions unless provided by the user.
8. Tool must be exactly one of: No default tool, Create image, Canvas, Deep research, Create video, Create music.
9. Customization & Personalization: The generated Gem instructions must be highly personalized and specific to the user's unique case. Deeply analyze the user's mainGoal, expertRole, targetAudience, and constraints. Incorporate specific domain rules, concrete custom guidance, and realistic input/output examples that relate directly to the user's exact scenario. Avoid generic, placeholder-like rules.

System Output Format Requirement: The generated instructions MUST direct the final Gem to format its responses primarily in the following format: ${finalFormat}.
${searchContextText}

CRITICAL: You MUST output ONLY valid JSON. Do not include any conversational text. Do not wrap the output in markdown code blocks. The response must start strictly with { and end with }. All newlines inside Markdown strings in the JSON MUST be escaped as \\n. All double quotes inside JSON string values MUST be escaped as \\" (e.g. \\"quote\\"). The JSON must be directly parseable by JSON.parse().

Return this exact JSON structure:
{
  "name": "Short, memorable name for the Gem (2-5 words)",
  "description": "1-2 sentence description of what this Gem does and its primary purpose",
  "instructions": "A comprehensive system instruction tailored to the user's specific case. Written as plain text if format is Text, or as Markdown with T.C.R.E.I sections otherwise.",
  "tools": "Suggested single tool: one of [No default tool, Create image, Canvas, Deep research, Create video, Create music]",
  "knowledgeBase": [{"title": "Document Title (PDF)", "url": "https://..."}]
}

Remember: Output ONLY the JSON object, nothing else. No conversational preamble, no markdown fences, no postamble.`;
    const userPrompt = `Create a Gem with these specifications:

Language: ${lang === 'VI' ? 'Vietnamese' : 'English'}

User Requirements:
- Expert Role: ${input.expertRole}
- Main Goal: ${input.mainGoal}
- Target Audience: ${input.targetAudience}
- Tone of Voice: ${resolvedTone === 'Other' || resolvedTone === 'tone_other' ? input.toneOfVoiceOther : resolvedTone}
- Output Format Preference: ${finalFormat}
- Constraints/Additional Info: ${input.constraints || 'None'}

Generate the JSON response now.`;

    console.log('[Generate] Sending request to OpenRouter...');

    const messages = [
      { role: 'system', content: systemPrompt + formatInstruction },
      { role: 'user', content: userPrompt },
    ];

    // 55-second timeout abort controller
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 55000);

    let openRouterResponse;
    try {
      openRouterResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': process.env.SITE_URL || 'https://gem-forge-pink.vercel.app',
          'X-Title': 'GemForge',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: HARDCODED_MODEL, messages }),
      });
    } finally {
      clearTimeout(timeoutId);
    }

    console.log('[Generate] OpenRouter response status:', openRouterResponse.status);

    if (!openRouterResponse.ok) {
      let errorData = {};
      try { errorData = await openRouterResponse.json(); } catch (e) { errorData = { raw: await openRouterResponse.text() }; }
      const errorMessage = errorData?.error?.message || openRouterResponse.statusText;
      // Extract retry_after_seconds from OpenRouter metadata
      const retryAfter = errorData?.error?.metadata?.retry_after_seconds || 30;
      console.error('[Generate] OpenRouter Error:', openRouterResponse.status, errorMessage);
      if (openRouterResponse.status === 429) {
        return res.status(429).json({
          error: 'rate_limit',
          retryAfter,
          message: `AI server is busy. Auto-retrying in ${retryAfter}s...`
        });
      }
      return res.status(openRouterResponse.status).json({ error: `OpenRouter Error: ${errorMessage}`, details: errorData });
    }
    const data = await openRouterResponse.json();
    let responseText = data.choices?.[0]?.message?.content || '';
    console.log('[Generate] Raw response length:', responseText.length);
    // Extract JSON object from any surrounding text
    const firstBrace = responseText.indexOf('{');
    const lastBrace = responseText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace >= firstBrace) {
      responseText = responseText.slice(firstBrace, lastBrace + 1);
    }
    // Clean control characters (0x00-0x08, 0x0E-0x1F) but preserve newlines/tabs
    responseText = responseText.replace(/[\x00-\x08\x0E-\x1F]/g, '');
    console.log('[Generate] Repairing and parsing JSON...');
    let result;
    try {
      result = extractAndRepairJSON(responseText);
    } catch (parseErr) {
      console.error('[Generate] Failed to parse AI response. Raw output:', responseText);
      throw new Error('AI returned an invalid or incomplete response format. Please try again.');
    }
    console.log('[Generate] Success, sending response.');
    await logEvent('info', 'openrouter', 'Successfully generated Gem', {
      model: HARDCODED_MODEL,
      input: {
        expertRole: input?.expertRole,
        mainGoal: input?.mainGoal,
        targetAudience: input?.targetAudience
      },
      responseLength: responseText.length
    });
    return res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isTimeout = err instanceof Error && err.name === 'AbortError';
    console.error('[Generate] API error:', message, err);
    await logEvent('error', 'openrouter', `Failed to generate Gem: ${message}`, {
      error: message,
      input: {
        expertRole: req.body?.input?.expertRole,
        mainGoal: req.body?.input?.mainGoal,
        targetAudience: req.body?.input?.targetAudience
      },
      isTimeout
    });
    if (isTimeout) {
      return res.status(504).json({ error: 'AI server response timed out. Please try again.' });
    }
    return res.status(500).json({ error: message || 'Failed to generate content' });
  }
});

// ─── Existing Revise Endpoint ───────────────────────────────────────────
app.post('/api/revise', async (req, res) => {
  try {
    const { currentContent, activeTab, userPrompt, chatHistory, selectedText } = req.body;
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'OPENROUTER_API_KEY is not configured' });
    const HARDCODED_MODEL = 'openrouter/free'; // Free Models Router - auto picks from all free models
    let systemPrompt = '';
    if (activeTab === 'instructions') {
      systemPrompt = `You are an expert editor focusing ONLY on the instructions section of a Gemini Gem. Your task is to modify the provided currentContent based on the userPrompt and previous interactions.
      
You MUST preserve and improve the GemForge T.C.R.E.I framework inside the instructions:

${FRAMEWORK_PROMPT}

For instruction revisions, maintain clear Task, Context, References, Evaluate, and Iterate logic. Preserve the no-follow-up policy toward the GemForge user, auto-fill missing context when useful, keep 1-2 behavior examples, and keep self-check rules. Adapt the Gem's end-user interaction style to the use case.

CRITICAL RULES:
1. Output ONLY the raw, updated instruction text.
2. Do NOT wrap in markdown code blocks.
3. Do NOT include phrases like "Here is the revised text" or "Updated version:".
4. Do NOT append footnotes or explanations about the revision.
5. Preserve the original structure and formatting style (e.g. if currentContent is plain text, keep it as plain text without adding markdown headers; if it is markdown, keep it as markdown).
6. Make targeted, professional improvements based on the user's request.
7. If a "CONTEXT FOCUS" section is provided, focus your revision PRIMARILY on that selected text, while keeping the rest of the document intact.`;
    } else if (activeTab === 'description') {
      systemPrompt = `You are an expert copywriter focusing ONLY on the description section of a Gemini Gem. The description is a short, 1-2 sentence summary explaining what the Gem does.
      
Your task is to modify the provided currentContent (which is the current 1-2 sentence description) based on the userPrompt and previous interactions.

CRITICAL RULES:
1. Output ONLY the revised description (maximum 1-2 sentences).
2. Do NOT use any Markdown formatting, headers, or bullet points.
3. Do NOT output a prompt template, T.C.R.E.I framework sections, or Gem instructions. Output ONLY the short 1-2 sentence description.
4. Do NOT wrap in markdown code blocks or include any introductory/concluding remarks.
5. Make targeted, professional improvements to the description based on the user's request.`;
    } else {
      systemPrompt = `You are an expert editor focusing ONLY on the ${activeTab} section. Your task is to modify the provided currentContent based on the userPrompt and previous interactions.
      
CRITICAL RULES:
1. Output ONLY the revised content.
2. Do NOT wrap in markdown code blocks.
3. Do NOT include conversational preamble or postamble.`;
    }
    const messages = [{ role: 'system', content: systemPrompt }];
    if (chatHistory && Array.isArray(chatHistory)) chatHistory.forEach((msg) => messages.push({ role: msg.role, content: msg.content }));
    const selectedTextNote = selectedText ? `\n\nCONTEXT FOCUS (prioritize revising this section):\n${selectedText}\n` : '';
    messages.push({ role: 'user', content: `Current Content:\n\n${currentContent}\n\n---\n\nRevision Request: ${userPrompt}${selectedTextNote}` });
    console.log('[Revise] Sending request to OpenRouter...');
    
    // 55-second timeout abort controller
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 55000);
    
    let openRouterResponse;
    try {
      openRouterResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': process.env.SITE_URL || 'https://gem-forge-pink.vercel.app',
          'X-Title': 'GemForge',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: HARDCODED_MODEL, messages }),
      });
    } finally {
      clearTimeout(timeoutId);
    }
    console.log('[Revise] OpenRouter response status:', openRouterResponse.status);
    if (!openRouterResponse.ok) {
      let errorData = {};
      try { errorData = await openRouterResponse.json(); } catch (e) { errorData = { raw: await openRouterResponse.text() }; }
      const errorMessage = errorData?.error?.message || openRouterResponse.statusText;
      console.error('[Revise] OpenRouter Error:', openRouterResponse.status, errorMessage, errorData);
      if (openRouterResponse.status === 429) return res.status(429).json({ error: 'API rate limit exceeded. Please wait a moment and try again.', details: errorMessage });
      return res.status(openRouterResponse.status).json({ error: `OpenRouter Error: ${errorMessage}`, details: errorData });
    }
    const data = await openRouterResponse.json();
    let responseText = data.choices?.[0]?.message?.content || '';
    console.log('[Revise] Raw response length:', responseText.length);
    responseText = responseText.replace(/```(?:markdown|md|json)?\n?/gi, '').replace(/```\n?/g, '').trim();
    console.log('[Revise] Success, sending response.');
    await logEvent('info', 'openrouter', 'Successfully revised Gem', {
      activeTab,
      prompt: userPrompt,
      responseLength: responseText.length
    });
    return res.json({ content: responseText });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isTimeout = err instanceof Error && err.name === 'AbortError';
    console.error('[Revise] API error:', message, err);
    await logEvent('error', 'openrouter', `Failed to revise Gem: ${message}`, {
      error: message,
      activeTab,
      prompt: userPrompt,
      isTimeout
    });
    if (isTimeout) {
      return res.status(504).json({ error: 'AI server response timed out. Please try again.' });
    }
    return res.status(500).json({ error: message || 'Failed to revise content' });
  }
});

// Validate coupon for client
app.post('/api/coupons/validate', async (req, res) => {
  try {
    const { couponCode, userId } = req.body;
    if (!couponCode) {
      return res.status(400).json({ valid: false, error: 'coupon_invalid' });
    }
    const result = await validateCoupon(couponCode, userId);
    if (!result.valid) {
      return res.json({ valid: false, error: result.error });
    }
    return res.json({ valid: true, discountPercent: result.coupon.discount_percent });
  } catch (err) {
    console.error('[API Coupon Validate] Error:', err);
    return res.status(500).json({ valid: false, error: 'coupon_error' });
  }
});

// ─── Payment Creation Endpoints ──────────────────────────────────────────

// 1. PayOS (VietQR)
app.post('/api/payments/payos', async (req, res) => {
  try {
    const clientId = String(process.env.PAYOS_CLIENT_ID || '').trim();
    const apiKey = String(process.env.PAYOS_API_KEY || '').trim();
    const checksumKey = String(process.env.PAYOS_CHECKSUM_KEY || '').trim();


    if (!clientId || !apiKey || !checksumKey) {
      console.error("🚨 CRITICAL: PAYOS ENV VARIABLES ARE MISSING!");
      console.log({
        hasClientId: !!clientId,
        hasApiKey: !!apiKey,
        hasChecksumKey: !!checksumKey
      });

      return res.status(500).json({
        success: false,
        message: "Server Configuration Error: Missing PayOS API Keys. Did you restart the server after updating .env?",
        missingKeys: {
          PAYOS_CLIENT_ID: !!clientId,
          PAYOS_API_KEY: !!apiKey,
          PAYOS_CHECKSUM_KEY: !!checksumKey
        }
      });
    }

    const { plan, userId, couponCode } = req.body;
    if (!plan || !userId) return res.status(400).json({ error: 'Missing plan or userId' });

    let amount = PLAN_PRICES[plan]?.vnd;
    if (!amount) return res.status(400).json({ error: 'Invalid plan' });

    // Apply coupon if provided
    let actualCoupon = null;
    if (couponCode) {
      const couponResult = await validateCoupon(couponCode, userId);
      if (!couponResult.valid) {
        return res.status(400).json({ error: couponResult.error });
      }
      const coupon = couponResult.coupon;
      amount = Math.max(0, Math.floor(amount * (1 - coupon.discount_percent / 100)));
      actualCoupon = coupon.code;
    }

    // Ensure amount is a positive integer
    amount = Math.floor(amount);

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:5173';

    // If amount is 0 (100% discount coupon), bypass payment gateway completely!
    if (amount === 0) {
      console.log(`[Coupon] 100% discount verified. Bypassing payment gateway for user: ${userId}, plan: ${plan}`);
      const orderCode = Number(String(Date.now()).slice(-6));
      await handleSuccessfulPayment(userId, plan, 0, 'coupon', `FREE-${orderCode}`, actualCoupon);
      return res.json({
        provider: 'free',
        success: true,
        message: 'Plan upgraded successfully via 100% discount coupon.',
        url: `${baseUrl}/billing?status=success`
      });
    }

    // PayOS requires amount >= 2000 VND
    const safeAmount = amount < 2000 ? 2000 : amount;

    // Ensure orderCode is a unique number (not a string, not exceeding max value)
    const orderCode = Number(String(Date.now()).slice(-6)); // MUST be a number, max 53 bit

    // Unique description including plan and order code, staying within the 25-character PayOS limit
    const description = `GF ${plan === 'pro' ? 'PRO' : 'ULTRA'} ${orderCode}`;

    // MUST be valid absolute URLs
    const returnUrl = `${baseUrl}/billing?status=success`;
    const cancelUrl = `${baseUrl}/billing?status=cancel`;

    const paymentData = {
      orderCode: orderCode,
      amount: safeAmount,
      description: description,
      returnUrl: returnUrl,
      cancelUrl: cancelUrl
    };

    console.log("🚀 Sending PayOS Data:", paymentData);

    // 1. Initialize INSIDE the route to guarantee env vars are loaded
    const PayOSModule = require('@payos/node');
    console.log('[PayOS] PayOSModule type:', typeof PayOSModule);
    console.log('[PayOS] Keys of PayOSModule:', Object.keys(PayOSModule));
    // Handle CommonJS/ESM interop
    const PayOSClass = PayOSModule.PayOS || PayOSModule.default?.PayOS || PayOSModule;
    console.log('[PayOS] PayOSClass type:', typeof PayOSClass);
    const payos = new PayOSClass({ clientId, apiKey, checksumKey });

    const d = await payos.paymentRequests.create(paymentData);

    // Store pending payment data in DB (persists across restarts)
    const { error: pendingError } = await supabase
      .from('pending_payments')
      .insert({
        order_code: orderCode,
        user_id: userId,
        plan_type: plan,
        coupon_code: actualCoupon,
        amount: safeAmount,
        provider: 'payos'
      });

    if (pendingError) {
      console.error('[PayOS] Failed to insert pending payment in DB:', pendingError);
      throw pendingError;
    }

    // Also store in-memory map as fallback
    pendingPayments.set(d.orderCode.toString(), { userId: userId, plan: plan, provider: 'payos', couponCode: actualCoupon });

    return res.json({
      provider: 'payos',
      orderCode: d.orderCode,
      qrCode: d.qrCode,
      amount: d.amount,
      description: d.description,
      url: d.checkoutUrl,
      bin: d.bin,
      accountNumber: d.accountNumber,
      accountName: d.accountName,
    });
  } catch (error) {
    const errorMessage = error.response?.data?.message || error.message || JSON.stringify(error);
    console.error("🔥 PAYOS RAW ERROR:", errorMessage);

    // Return the EXACT error message to the frontend so the user can read it in the Network tab
    return res.status(500).json({
      error: "PayOS creation failed",
      details: errorMessage
    });
  }
});

// GET status of PayOS payment
app.get('/api/payments/payos/status/:orderCode', async (req, res) => {
  try {
    const { orderCode } = req.params;
    if (!orderCode) return res.status(400).json({ error: 'Missing orderCode' });

    // 1. Retrieve pending payment from DB
    const { data: pending, error: fetchErr } = await supabase
      .from('pending_payments')
      .select('*')
      .eq('order_code', Number(orderCode))
      .maybeSingle();

    if (fetchErr) {
      console.error('[PayOS Status] DB error:', fetchErr);
      return res.status(500).json({ error: 'Database error' });
    }

    // If not found in pending, check if it's already processed
    if (!pending) {
      const { data: billing } = await supabase
        .from('billing_history')
        .select('*')
        .eq('transaction_id', `PAYOS-${orderCode}`)
        .maybeSingle();

      if (billing) {
        return res.json({ status: 'PAID', message: 'Payment already processed' });
      }
      return res.json({ status: 'NOT_FOUND', message: 'No pending payment found' });
    }

    // 2. Query PayOS directly
    const clientId = String(process.env.PAYOS_CLIENT_ID || '').trim();
    const apiKey = String(process.env.PAYOS_API_KEY || '').trim();
    const checksumKey = String(process.env.PAYOS_CHECKSUM_KEY || '').trim();

    const PayOSModule = require('@payos/node');
    const PayOSClass = PayOSModule.PayOS || PayOSModule.default?.PayOS || PayOSModule;
    const payos = new PayOSClass({ clientId, apiKey, checksumKey });

    const paymentInfo = await payos.paymentRequests.get(Number(orderCode));

    console.log(`[PayOS Status] Query orderCode ${orderCode} got status:`, paymentInfo.status);

    if (paymentInfo.status === 'PAID') {
      const { user_id: userId, plan_type: plan, coupon_code: couponCode, amount } = pending;

      // Perform database updates
      await handleSuccessfulPayment(userId, plan, amount, 'payos', `PAYOS-${orderCode}`, couponCode);

      // Clean up pending payment in DB & in-memory Map
      await supabase.from('pending_payments').delete().eq('order_code', Number(orderCode));
      pendingPayments.delete(orderCode.toString());

      return res.json({ status: 'PAID' });
    }
    return res.json({ status: paymentInfo.status });
  } catch (error) {
    console.error('[PayOS Status] Query status failed:', error);
    return res.status(500).json({ error: error.message || 'Failed to query status' });
  }
});

// 2. Stripe (International Cards)
app.post('/api/payments/stripe', async (req, res) => {
  try {
    const { plan, userId, email, couponCode } = req.body;
    if (!plan || !userId) return res.status(400).json({ error: 'Missing plan or userId' });

    let amount = PLAN_PRICES[plan]?.usd;
    if (!amount) return res.status(400).json({ error: 'Invalid plan' });

    let actualCoupon = null;
    if (couponCode) {
      const couponResult = await validateCoupon(couponCode, userId);
      if (!couponResult.valid) {
        return res.status(400).json({ error: couponResult.error });
      }
      const coupon = couponResult.coupon;
      amount = Math.max(0, amount * (1 - coupon.discount_percent / 100));
      actualCoupon = coupon.code;
    }

    // Stripe expects amount in smallest currency unit (cents for USD)
    const unitAmount = Math.round(amount * 100);

    // If amount is 0 (100% discount coupon), bypass payment gateway completely!
    if (unitAmount === 0) {
      console.log(`[Stripe] 100% discount verified. Bypassing payment gateway for user: ${userId}, plan: ${plan}`);
      const orderCode = Number(String(Date.now()).slice(-6));
      await handleSuccessfulPayment(userId, plan, 0, 'coupon', `FREE-${orderCode}`, actualCoupon);
      return res.json({
        provider: 'free',
        success: true,
        message: 'Plan upgraded successfully via 100% discount coupon.',
      });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `GemForge ${plan.charAt(0).toUpperCase() + plan.slice(1)} Plan`,
              description: `Upgrade to ${plan} plan`,
            },
            unit_amount: unitAmount,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:5173'}/billing?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:5173'}/billing?status=cancel`,
      metadata: {
        userId,
        plan,
        provider: 'stripe',
        couponCode: actualCoupon,
      },
    });

    return res.json({
      provider: 'stripe',
      sessionId: session.id,
      url: session.url,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Stripe] Payment creation error:', message);
    return res.status(500).json({ error: message || 'Failed to create Stripe payment' });
  }
});

// 3. PayPal (International Payments)
async function getPayPalAccessToken() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_SECRET;
  if (!clientId || !secret) {
    throw new Error('PayPal Client ID or Secret is not configured in .env');
  }
  const auth = Buffer.from(`${clientId}:${secret}`).toString('base64');

  const response = await fetch('https://api-m.sandbox.paypal.com/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to get PayPal token: ${errText}`);
  }
  const data = await response.json();
  return data.access_token;
}

app.post('/api/payments/paypal', async (req, res) => {
  try {
    const { plan, userId, couponCode } = req.body;
    if (!plan || !userId) return res.status(400).json({ error: 'Missing plan or userId' });

    let amount = PLAN_PRICES[plan]?.usd;
    if (!amount) return res.status(400).json({ error: 'Invalid plan' });

    let actualCoupon = null;
    if (couponCode) {
      const couponResult = await validateCoupon(couponCode, userId);
      if (!couponResult.valid) {
        return res.status(400).json({ error: couponResult.error });
      }
      const coupon = couponResult.coupon;
      amount = Math.max(0, amount * (1 - coupon.discount_percent / 100));
      actualCoupon = coupon.code;
    }

    const token = await getPayPalAccessToken();
    const orderResponse = await fetch('https://api-m.sandbox.paypal.com/v2/checkout/orders', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            amount: {
              currency_code: 'USD',
              value: amount.toFixed(2),
            },
            description: `GemForge ${plan.charAt(0).toUpperCase() + plan.slice(1)} Plan`,
          }
        ],
        application_context: {
          brand_name: 'GemForge',
          landing_page: 'BILLING',
          user_action: 'PAY_NOW',
          return_url: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:5173'}/billing?status=success&provider=paypal`,
          cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:5173'}/billing?status=cancel&provider=paypal`,
        }
      }),
    });

    if (!orderResponse.ok) {
      const errorText = await orderResponse.text();
      throw new Error(`PayPal order creation failed: ${errorText}`);
    }

    const orderData = await orderResponse.json();
    const approveUrl = orderData.links.find(link => link.rel === 'approve')?.href;

    pendingPayments.set(orderData.id, { userId, plan, provider: 'paypal', amount, couponCode: actualCoupon });

    return res.json({
      provider: 'paypal',
      orderId: orderData.id,
      url: approveUrl,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[PayPal] Payment creation error:', message);
    return res.status(500).json({ error: message || 'Failed to create PayPal payment' });
  }
});

app.post('/api/payments/paypal/capture', async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ error: 'Missing orderId' });

    const token = await getPayPalAccessToken();
    const captureResponse = await fetch(`https://api-m.sandbox.paypal.com/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!captureResponse.ok) {
      const errorText = await captureResponse.text();
      console.warn('[PayPal] Capture response error:', errorText);
    }

    const pending = pendingPayments.get(orderId);
    if (!pending) {
      return res.json({ success: true, message: 'Payment already processed or not found' });
    }

    const { userId, plan, amount, couponCode } = pending;
    await handleSuccessfulPayment(userId, plan, amount, 'paypal', orderId, couponCode);
    pendingPayments.delete(orderId);

    return res.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[PayPal] Capture error:', message);
    return res.status(500).json({ error: message || 'Failed to capture PayPal payment' });
  }
});

// 4. MoMo is handled by PayOS (PayOS supports MoMo users via VietQR)
// No separate MoMo endpoint needed

// ─── Webhook Handlers ─────────────────────────────────────────────────────

// Helper: Update user plan and record billing
async function handleSuccessfulPayment(userId, plan, amount, provider, transactionId, couponCode = null) {
  try {
    // 1. Update user's current_plan
    const { error: userError } = await supabase
      .from('users')
      .update({ current_plan: plan })
      .eq('id', userId);

    if (userError) {
      console.error('[Webhook] Failed to update user plan:', userError);
      throw userError;
    }

    // 2. Insert into billing_history
    const planNameMap = {
      pro: 'Pro Plan',
      ultra: 'Ultra Plan',
      free: 'Free Plan'
    };
    const dbPlanName = planNameMap[plan.toLowerCase()] || plan;

    const { error: billingError } = await supabase
      .from('billing_history')
      .insert({
        user_id: userId,
        amount,
        status: 'paid',
        transaction_id: transactionId || `TXN-${Date.now()}`,
        plan_name: dbPlanName,
        currency: (provider === 'stripe' || provider === 'paypal') ? 'USD' : 'VND',
        payment_method: provider,
      });

    if (billingError) {
      console.error('[Webhook] Failed to insert billing history:', billingError);
      throw billingError;
    }

    // 3. Insert into subscriptions
    let durationDays = 30; // default to 30 days
    if (couponCode) {
      const { data: couponData } = await supabase
        .from('coupons')
        .select('duration_days')
        .eq('code', couponCode.toUpperCase())
        .maybeSingle();
      if (couponData && typeof couponData.duration_days === 'number') {
        durationDays = couponData.duration_days;
      }
    }
    const currentPeriodEnd = new Date();
    currentPeriodEnd.setDate(currentPeriodEnd.getDate() + durationDays);

    const dbProvider = (provider === 'coupon' || provider === 'free') ? 'payos' : provider;

    const { error: subError } = await supabase
      .from('subscriptions')
      .insert({
        user_id: userId,
        plan_type: plan,
        status: 'active',
        current_period_end: currentPeriodEnd.toISOString(),
        provider: dbProvider,
      });

    if (subError) {
      console.error('[Webhook] Failed to insert subscription:', subError);
      throw subError;
    }

    // Increment coupon used_count and record user redemption
    if (couponCode) {
      const { data: c } = await supabase.from('coupons').select('used_count').eq('code', couponCode.toUpperCase()).maybeSingle();
      if (c) {
        await supabase.from('coupons').update({ used_count: c.used_count + 1 }).eq('code', couponCode.toUpperCase());
      }
      // Record this user's redemption so they cannot reuse the coupon
      await supabase.from('coupon_redemptions').upsert(
        { user_id: userId, coupon_code: couponCode.toUpperCase() },
        { onConflict: 'user_id,coupon_code', ignoreDuplicates: true }
      );
    }

    // 4. Send confirmation email
    try {
      let userEmail = null;
      const { data: userProfile } = await supabase
        .from('users')
        .select('email')
        .eq('id', userId)
        .maybeSingle();

      if (userProfile?.email) {
        userEmail = userProfile.email;
      }

      if (userEmail) {
        await sendPlanUpgradeEmail(
          userEmail,
          plan,
          `${amount} ${provider === 'stripe' || provider === 'paypal' ? 'USD' : 'VND'}`,
          provider
        );
      } else {
        console.warn(`[Webhook] No email found in public.users for user ${userId}`);
      }
    } catch (emailErr) {
      console.error('[Webhook] Non-blocking error sending confirmation email:', emailErr.message);
    }

    console.log(`[Webhook] Successfully upgraded user ${userId} to ${plan} via ${provider}`);
    await logEvent('info', 'payment', `Successfully upgraded user to ${plan} via ${provider}`, {
      userId,
      plan,
      amount,
      provider,
      transactionId,
      couponCode
    });
  } catch (err) {
    console.error('[Webhook] Error handling successful payment:', err.message);
    await logEvent('error', 'payment', `Error upgrading user: ${err.message}`, {
      userId,
      plan,
      amount,
      provider,
      transactionId,
      couponCode,
      error: err.message
    });
    throw err;
  }
}

// 1. PayOS Webhook
app.post('/api/webhooks/payos', async (req, res) => {
  try {
    const payload = req.body;
    const data = payload.data || payload;
    const orderCode = data.orderCode;
    const status = data.status || payload.status;
    const amount = data.amount || payload.amount;

    if (status !== 'PAID') {
      return res.json({ received: true });
    }

    // Retrieve pending payment data from DB
    const { data: pending, error: fetchErr } = await supabase
      .from('pending_payments')
      .select('*')
      .eq('order_code', Number(orderCode))
      .maybeSingle();

    if (fetchErr) {
      console.error('[Webhook PayOS] DB fetch error:', fetchErr);
      return res.status(500).json({ error: 'Database fetch error' });
    }

    if (!pending) {
      // Check if already processed
      const { data: billing } = await supabase
        .from('billing_history')
        .select('*')
        .eq('transaction_id', `PAYOS-${orderCode}`)
        .maybeSingle();

      if (billing) {
        return res.json({ received: true, message: 'Already processed' });
      }

      console.error('[Webhook PayOS] No pending payment found for orderCode:', orderCode);
      return res.status(404).json({ error: 'Pending payment not found' });
    }

    const { user_id: userId, plan_type: plan, coupon_code: couponCode } = pending;

    await handleSuccessfulPayment(userId, plan, amount, 'payos', `PAYOS-${orderCode}`, couponCode);

    // Clean up pending payment in DB & in-memory map
    await supabase.from('pending_payments').delete().eq('order_code', Number(orderCode));
    pendingPayments.delete(orderCode.toString());

    return res.json({ received: true });
  } catch (err) {
    console.error('[Webhook PayOS] Error:', err.message);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// 2. Stripe Webhook (uses raw body for signature verification)
app.post('/api/webhooks/stripe', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    // Use rawBody preserved by express.json verify function
    const rawBody = req.rawBody || JSON.stringify(req.body);
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[Webhook Stripe] Signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.metadata.userId;
    const plan = session.metadata.plan;
    const amount = session.amount_total / 100; // Convert cents to dollars
    const couponCode = session.metadata.couponCode || null;

    try {
      await handleSuccessfulPayment(userId, plan, amount, 'stripe', session.id, couponCode);
    } catch (err) {
      console.error('[Webhook Stripe] Payment handling failed:', err.message);
      return res.status(500).json({ error: 'Payment processing failed' });
    }
  }

  res.json({ received: true });
});

// 3. PayPal Webhook
app.post('/api/webhooks/paypal', async (req, res) => {
  try {
    const body = req.body;
    const eventType = body.event_type;

    if (eventType === 'PAYMENT.CAPTURE.COMPLETED' || eventType === 'CHECKOUT.ORDER.APPROVED') {
      const resource = body.resource;
      // Get the order ID from different possible event resource fields
      const orderId = eventType === 'CHECKOUT.ORDER.APPROVED'
        ? resource.id
        : (resource.supplementary_data?.related_ids?.order_id || resource.parent_payment || resource.id);

      if (orderId) {
        const pending = pendingPayments.get(orderId);
        if (pending) {
          const { userId, plan, amount, couponCode } = pending;
          await handleSuccessfulPayment(userId, plan, amount, 'paypal', orderId, couponCode);
          pendingPayments.delete(orderId);
        }
      }
    }

    return res.json({ received: true });
  } catch (err) {
    console.error('[Webhook PayPal] Error:', err.message);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// 4. MoMo webhook removed (uses PayOS instead)

// ─── Cron Endpoint: Check Expired Subscriptions ───────────────────────────
app.get('/api/cron/check-subscriptions', async (req, res) => {
  try {
    // Verify cron secret
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const now = new Date().toISOString();

    // Find expired subscriptions
    const { data: expiredSubs, error } = await supabase
      .from('subscriptions')
      .select('user_id, id, plan_type')
      .eq('status', 'active')
      .lt('current_period_end', now);

    if (error) {
      console.error('[Cron] Failed to fetch expired subscriptions:', error);
      return res.status(500).json({ error: 'Failed to check subscriptions' });
    }

    let downgradedCount = 0;

    // Downgrade users and update subscription status
    for (const sub of expiredSubs) {
      try {
        // 1. Check if the user has any other active subscription in the future
        const { data: futureSubs } = await supabase
          .from('subscriptions')
          .select('id')
          .eq('user_id', sub.user_id)
          .eq('status', 'active')
          .gte('current_period_end', now);

        const hasFutureActive = futureSubs && futureSubs.length > 0;

        if (!hasFutureActive) {
          // 2. Downgrade user's plan to 'free'
          await supabase
            .from('users')
            .update({ current_plan: 'free' })
            .eq('id', sub.user_id);

          downgradedCount++;

          // 3. Fetch user email to send notification
          const { data: userProfile } = await supabase
            .from('users')
            .select('email')
            .eq('id', sub.user_id)
            .maybeSingle();

          if (userProfile && userProfile.email) {
            await sendSubscriptionCancelledEmail(userProfile.email, sub.plan_type);
          }
        }

        // 4. Update the expired subscription status to 'cancelled' (constraint compliant)
        await supabase
          .from('subscriptions')
          .update({ status: 'cancelled' })
          .eq('id', sub.id);

      } catch (subErr) {
        console.error(`[Cron] Error processing expired sub ${sub.id} for user ${sub.user_id}:`, subErr.message);
      }
    }

    console.log(`[Cron] Processed ${expiredSubs.length} expired rows. Downgraded ${downgradedCount} users.`);
    return res.json({ success: true, processed: expiredSubs.length, downgraded: downgradedCount });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Cron] Error:', message);
    return res.status(500).json({ error: message || 'Cron job failed' });
  }
});

// ─── Start Server ────────────────────────────────────────────────────────
// Test route
app.get('/api/test', (req, res) => {
  res.json({
    status: 'ok',
    env: {
      has_openrouter_key: !!process.env.OPENROUTER_API_KEY,
      has_supabase_url: !!process.env.VITE_SUPABASE_URL,
      has_supabase_service_key: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      has_payos_client_id: !!process.env.PAYOS_CLIENT_ID,
      has_stripe_secret_key: !!process.env.STRIPE_SECRET_KEY,
      node_env: process.env.NODE_ENV
    },
    routes: [
      '/api/generate',
      '/api/revise',
      '/api/payments/payos',
      '/api/payments/stripe',
      '/api/payments/paypal',
      '/api/webhooks/payos',
      '/api/webhooks/stripe',
      '/api/webhooks/paypal',
      '/api/cron/check-subscriptions'
    ]
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log("🔥 Backend Server is ALIVE and listening on port " + PORT);
  });
}

module.exports = app;
