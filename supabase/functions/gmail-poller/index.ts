// Gmail Poller Edge Function
// supabase/functions/gmail-poller/index.ts
// This edge function fetches unread payment emails from Gmail,
// uses Gemini Flash to extract transaction data, and inserts into the DB.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface GmailMessage {
  id: string;
  snippet: string;
  payload: {
    headers: { name: string; value: string }[];
    body: { data?: string };
    parts?: { body: { data?: string }; mimeType: string }[];
  };
}

function decodeBase64(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return atob(base64);
}

function extractEmailBody(message: GmailMessage): string {
  if (message.payload.body?.data) {
    return decodeBase64(message.payload.body.data);
  }
  const textPart = message.payload.parts?.find(
    (p) => p.mimeType === "text/plain"
  );
  if (textPart?.body?.data) {
    return decodeBase64(textPart.body.data);
  }
  return message.snippet;
}

async function extractTransactionFromEmail(
  emailBody: string,
  geminiApiKey: string
): Promise<{ amount: number; sender_name: string; bank_source: string } | null> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `Extract payment information from this email text. Return ONLY a JSON object with these exact keys: amount (number, in Naira), sender_name (string), bank_source (string). If you cannot extract valid payment info, return null.

Email:
${emailBody.substring(0, 2000)}

Return only the JSON object, no markdown, no explanation.`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 200,
        },
      }),
    }
  );

  if (!response.ok) {
    console.error("Gemini API error:", response.status);
    return null;
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) return null;

  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed.amount === "number" && parsed.sender_name) {
      return parsed;
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
    const GMAIL_ACCESS_TOKEN = Deno.env.get("GMAIL_ACCESS_TOKEN");
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!GMAIL_ACCESS_TOKEN || !GEMINI_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(
        JSON.stringify({ error: "Missing required environment variables" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { company_id } = await req.json();
    if (!company_id) {
      return new Response(
        JSON.stringify({ error: "company_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Fetch unread emails with payment keywords from Gmail
    const searchQuery = encodeURIComponent(
      "is:unread subject:(credit OR debit OR transfer OR payment OR received) newer_than:1d"
    );
    const listResponse = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${searchQuery}&maxResults=10`,
      {
        headers: { Authorization: `Bearer ${GMAIL_ACCESS_TOKEN}` },
      }
    );

    if (!listResponse.ok) {
      throw new Error(`Gmail list API error: ${listResponse.status}`);
    }

    const listData = await listResponse.json();
    const messages: { id: string }[] = listData.messages ?? [];
    console.log(`Found ${messages.length} emails to process`);

    const results = [];

    for (const msg of messages) {
      // 2. Fetch full message
      const msgResponse = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}`,
        { headers: { Authorization: `Bearer ${GMAIL_ACCESS_TOKEN}` } }
      );

      if (!msgResponse.ok) continue;
      const fullMessage: GmailMessage = await msgResponse.json();
      const emailBody = extractEmailBody(fullMessage);

      // 3. Extract transaction data via Gemini
      const txData = await extractTransactionFromEmail(emailBody, GEMINI_API_KEY);
      if (!txData) {
        console.log(`No transaction data found in email ${msg.id}`);
        continue;
      }

      // 4. Insert into transactions table
      const { data: inserted, error } = await supabase
        .from("transactions")
        .insert({
          company_id,
          amount: txData.amount,
          sender_name: txData.sender_name,
          bank_source: txData.bank_source,
          status: "new",
        })
        .select()
        .single();

      if (error) {
        console.error("Insert error:", error);
      } else {
        results.push(inserted);
        // Mark email as read
        await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}/modify`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${GMAIL_ACCESS_TOKEN}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ removeLabelIds: ["UNREAD"] }),
          }
        );
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: messages.length,
        inserted: results.length,
        transactions: results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Gmail poller error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
