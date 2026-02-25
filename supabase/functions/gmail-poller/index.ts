import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

const ALLOWED_BANK_DOMAINS = [
  "gtbank.com", "accessbankplc.com", "zenithbank.com", "ubagroup.com",
  "firstbanknig.com", "opay-nigeria.com", "moniepoint.com", "kuda.co",
  "alat.ng", "wemabank.com", "fidelitybank.ng", "ecobank.com",
  "fairmoney.ng", "stanbicibtc.com", "sterling.ng", "unionbankng.com",
  "palmpay.com", "getcarbon.co", "safehavenmfb.com", "polarisbanklimited.com",
];

function isAllowedDomain(fromHeader: string): boolean {
  const emailMatch = fromHeader.match(/<([^>]+)>/) ?? fromHeader.match(/([^\s]+@[^\s]+)/);
  const email = emailMatch?.[1] ?? fromHeader;
  const domain = email.split("@")[1]?.toLowerCase().trim() ?? "";
  return ALLOWED_BANK_DOMAINS.some((allowed) => domain === allowed || domain.endsWith(`.${allowed}`));
}

async function extractWithGemini(
  subject: string,
  from: string,
  body: string,
  geminiApiKey: string
): Promise<{ amount: number; sender_name: string; bank_source: string } | null> {
  const prompt = `You are a Nigerian bank payment alert parser. Analyze this email and extract payment details.

From: ${from}
Subject: ${subject}
Body: ${body.substring(0, 5000)}

This is a CREDIT alert — money received into a Nigerian bank account.

Return ONLY a JSON object with these exact keys:
- amount: numeric amount in Naira as a plain number e.g. 5000
- sender_name: full name of the person who sent the money
- bank_source: name of the bank e.g. GTBank, Access Bank, OPay, Moniepoint

If you cannot find a clear credit amount and sender name, return null.
Return ONLY the JSON or null. No markdown, no explanation.`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 200 },
      }),
    }
  );

  if (!res.ok) {
    console.error("Gemini error:", res.status, await res.text());
    return null;
  }

  const data = await res.json();
  const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
  console.log("Gemini raw response:", text);

  if (!text || text === "null") return null;

  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed.amount === "number" && parsed.amount > 0 && parsed.sender_name) {
      return {
        amount: parsed.amount,
        sender_name: String(parsed.sender_name),
        bank_source: String(parsed.bank_source ?? "Unknown"),
      };
    }
  } catch {
    console.error("JSON parse failed:", text);
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("ANON_KEY");
    const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET");

    if (!GEMINI_API_KEY || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return new Response(
        JSON.stringify({ error: "Missing environment variables" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const body = await req.json().catch(() => ({}));

    // Verify webhook secret
    const incomingSecret = req.headers.get("x-webhook-secret");
    if (WEBHOOK_SECRET && incomingSecret !== WEBHOOK_SECRET) {
      console.error("Invalid webhook secret");
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { from, subject, text: emailText, html, company_id, message_id } = body;

    if (!company_id) {
      return new Response(
        JSON.stringify({ error: "company_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Reject non-bank domains
    if (!isAllowedDomain(from ?? "")) {
      console.log(`Rejected from unverified domain: ${from}`);
      return new Response(
        JSON.stringify({ skipped: true, reason: "sender_domain_not_allowed", from }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Deduplication
    if (message_id) {
      const { data: existing } = await supabaseAdmin
        .from("transactions")
        .select("id")
        .eq("message_id", message_id)
        .maybeSingle();

      if (existing) {
        console.log(`Duplicate skipped: ${message_id}`);
        return new Response(
          JSON.stringify({ skipped: true, reason: "duplicate" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const emailBody = emailText ?? html?.replace(/<[^>]*>/g, " ") ?? "";
    console.log(`Processing: "${subject}" from "${from}"`);

    const extracted = await extractWithGemini(
      subject ?? "", from ?? "", emailBody, GEMINI_API_KEY
    );

    if (!extracted) {
      console.log("No payment data found");
      return new Response(
        JSON.stringify({ processed: false, reason: "no_payment_data_found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { error: insertError } = await supabaseAdmin.from("transactions").insert({
      company_id,
      amount: extracted.amount,
      sender_name: extracted.sender_name,
      bank_source: extracted.bank_source,
      status: "completed",
      message_id: message_id ?? null,
    });

    if (insertError) {
      console.error("Insert error:", insertError.message);
      return new Response(
        JSON.stringify({ error: insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`✓ Saved: ₦${extracted.amount} from ${extracted.sender_name}`);
    return new Response(
      JSON.stringify({ success: true, amount: extracted.amount, sender: extracted.sender_name }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("Edge Function error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
