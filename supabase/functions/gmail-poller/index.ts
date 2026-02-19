// gmail-poller Edge Function
// Queries transactions with status='new', calls Gemini AI to extract
// amount, bank name, and sender name, then updates each row.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface GmailMessage {
  id: string;
  snippet?: string;
  payload?: {
    headers?: { name: string; value: string }[];
    body?: { data?: string };
    parts?: { body?: { data?: string }; mimeType?: string }[];
  };
}

function decodeBase64(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return atob(base64);
}

function extractEmailBody(message: GmailMessage): string {
  if (message.payload?.body?.data) {
    return decodeBase64(message.payload.body.data);
  }
  const textPart = message.payload?.parts?.find((p) => p.mimeType === "text/plain");
  if (textPart?.body?.data) {
    return decodeBase64(textPart.body.data);
  }
  return message.snippet ?? "";
}

async function extractWithGemini(
  rawText: string,
  geminiApiKey: string
): Promise<{ amount: number; sender_name: string; bank_source: string } | null> {
  const prompt = `Analyze this raw bank alert text. Extract the numeric Amount, the Bank Name, and clean up the Sender Name. Return strictly as a JSON object with keys: amount (number), sender_name (string), bank_source (string). If you cannot find valid payment data, return null.

Text:
${rawText.substring(0, 2000)}

Return only the JSON object, no markdown, no explanation.`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 300 },
      }),
    }
  );

  if (!res.ok) {
    console.error("Gemini error:", res.status, await res.text());
    return null;
  }

  const data = await res.json();
  const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";

  // Strip markdown code fences if present
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed.amount === "number" && parsed.sender_name) {
      return {
        amount: parsed.amount,
        sender_name: String(parsed.sender_name),
        bank_source: String(parsed.bank_source ?? "Unknown"),
      };
    }
  } catch {
    console.error("Failed to parse Gemini response:", text);
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
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!GEMINI_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(
        JSON.stringify({ error: "Missing required environment variables" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json().catch(() => ({}));
    const { company_id, access_token } = body;

    if (!company_id) {
      return new Response(
        JSON.stringify({ error: "company_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    // MODE 1: If an access_token is provided, fetch emails from Gmail directly
    // and process them end-to-end (insert + extract in one shot).
    if (access_token) {
      const query = encodeURIComponent('is:unread subject:("credit" OR "transaction" OR "alert")');
      const listRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=5`,
        { headers: { Authorization: `Bearer ${access_token}` } }
      );

      if (!listRes.ok) {
        throw new Error(`Gmail list error: ${listRes.status}`);
      }

      const listData = await listRes.json();
      const messages: { id: string }[] = listData.messages ?? [];
      processed = messages.length;

      for (const msg of messages) {
        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
          { headers: { Authorization: `Bearer ${access_token}` } }
        );
        if (!msgRes.ok) { failed++; continue; }

        const fullMsg: GmailMessage = await msgRes.json();
        const emailBody = extractEmailBody(fullMsg);

        const extracted = await extractWithGemini(emailBody, GEMINI_API_KEY);

        if (extracted) {
          const { error } = await supabaseAdmin.from("transactions").insert({
            company_id,
            amount: extracted.amount,
            sender_name: extracted.sender_name,
            bank_source: extracted.bank_source,
            status: "completed",
          });
          if (error) { console.error("Insert error:", error); failed++; }
          else {
            succeeded++;
            // Mark as read
            await fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}/modify`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${access_token}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ removeLabelIds: ["UNREAD"] }),
              }
            ).catch(() => {});
          }
        } else {
          failed++;
        }
      }
    } else {
      // MODE 2: Process existing 'new' transactions already in the DB
      const { data: newTxs, error: fetchError } = await supabaseAdmin
        .from("transactions")
        .select("*")
        .eq("company_id", company_id)
        .eq("status", "new");

      if (fetchError) {
        throw new Error(`DB fetch error: ${fetchError.message}`);
      }

      processed = (newTxs ?? []).length;

      for (const tx of newTxs ?? []) {
        // Use sender_name as raw text source if it contains email body content
        const rawText = tx.sender_name ?? "";
        if (!rawText || rawText.length < 10) {
          await supabaseAdmin
            .from("transactions")
            .update({ status: "failed" })
            .eq("id", tx.id);
          failed++;
          continue;
        }

        const extracted = await extractWithGemini(rawText, GEMINI_API_KEY);

        if (extracted) {
          const { error } = await supabaseAdmin
            .from("transactions")
            .update({
              amount: extracted.amount,
              sender_name: extracted.sender_name,
              bank_source: extracted.bank_source,
              status: "completed",
            })
            .eq("id", tx.id);
          if (error) { failed++; }
          else { succeeded++; }
        } else {
          await supabaseAdmin
            .from("transactions")
            .update({ status: "failed" })
            .eq("id", tx.id);
          failed++;
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, processed, succeeded, failed }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("gmail-poller error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
