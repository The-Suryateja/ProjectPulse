import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const GEMINI_API_TIMEOUT_MS = 120000;
const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models";

const AGGREGATION_PROMPT = `You are a document aggregation assistant. Your task is to synthesize information from multiple extracted document summaries into a single project report.

CRITICAL RULES:
1. Treat the same risk/topic mentioned in multiple documents as ONE merged entry, listing all documents it appears in
2. Set trend: "recurring" if a risk appears in 2+ documents with no change in framing; "escalating" if severity language increases between mentions; "new" if it only appears in the most recent document
3. ACTIVELY look for and report contradictions between documents in conflicts_detected — this is a required, valued output
4. Do NOT compute action_items_summary numeric counts — those are computed programmatically
5. document_date values come from the provided document metadata (user-provided), not invented
6. Return ONLY valid JSON matching the schema below, no preamble or markdown formatting

OUTPUT SCHEMA (you only fill the qualitative fields; action_items_summary counts are computed elsewhere):
{
  "project_name": "string",
  "documents_analyzed": ["document_id_1", "document_id_2"],
  "executive_summary": "string, 3-5 sentences synthesizing across all documents",
  "merged_risks": [
    {
      "risk": "string",
      "mentioned_in": ["document_id_1", "document_id_2"],
      "severity_hint": "explicit | implied",
      "trend": "new | recurring | escalating",
      "evidence_quotes": [
        { "document_id": "string", "quote": "string" }
      ]
    }
  ],
  "decisions_timeline": [
    { "decision": "string", "document_id": "string", "document_date": "string" }
  ],
  "open_questions_unresolved": [
    { "question": "string", "document_id": "string", "evidence_quote": "string" }
  ],
  "conflicts_detected": [
    {
      "description": "string, e.g. 'Document A states X is closed, Document B implies it is still open'",
      "document_ids": ["string"]
    }
  ]
}

EXTRACTED DOCUMENTS DATA:`;

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    throw err;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
  if (!geminiApiKey) {
    console.error("CRITICAL: GEMINI_API_KEY environment variable is not set");
    return new Response(
      JSON.stringify({
        error: "GEMINI_API_KEY is not set. Please configure the API key in Supabase Edge Function secrets."
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  console.log(`GEMINI_API_KEY present: ${!!geminiApiKey}, length: ${geminiApiKey.length}`);

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let project_id: string;
    try {
      const body = await req.json();
      project_id = body.project_id;
    } catch (parseErr) {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body: " + parseErr.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!project_id) {
      return new Response(
        JSON.stringify({ error: "project_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Starting aggregation for project: ${project_id}`);

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("*")
      .eq("id", project_id)
      .single();

    if (projectError || !project) {
      console.error("Project fetch error:", projectError);
      return new Response(
        JSON.stringify({ error: "Project not found: " + (projectError?.message || "Unknown error") }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create or update report record to processing status
    const { data: existingReport } = await supabase
      .from("reports")
      .select("id")
      .eq("project_id", project_id)
      .maybeSingle();

    if (existingReport) {
      await supabase
        .from("reports")
        .update({
          generation_status: "processing",
          error_message: null
        })
        .eq("id", existingReport.id);
    } else {
      await supabase
        .from("reports")
        .insert({
          project_id: project_id,
          generation_status: "processing",
          error_message: null
        });
    }

    const { data: documents, error: docsError } = await supabase
      .from("documents")
      .select("*")
      .eq("project_id", project_id);

    if (docsError) {
      const errorMsg = `Failed to fetch documents: ${docsError.message}`;
      await supabase
        .from("reports")
        .update({ generation_status: "failed", error_message: errorMsg })
        .eq("project_id", project_id);
      return new Response(
        JSON.stringify({ error: errorMsg }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!documents || documents.length === 0) {
      const errorMsg = "No documents found for this project";
      await supabase
        .from("reports")
        .update({ generation_status: "failed", error_message: errorMsg })
        .eq("project_id", project_id);
      return new Response(
        JSON.stringify({ error: errorMsg }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check all documents are done
    const pendingDocs = documents.filter(d => d.extraction_status !== "done");
    if (pendingDocs.length > 0) {
      const errorMsg = `Some documents are not yet processed: ${pendingDocs.map(d => `${d.file_name} (${d.extraction_status})`).join(", ")}`;
      await supabase
        .from("reports")
        .update({ generation_status: "failed", error_message: errorMsg })
        .eq("project_id", project_id);
      return new Response(
        JSON.stringify({ error: errorMsg }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check for documents with extraction errors
    const failedDocs = documents.filter(d => d.extraction_status === "failed");
    if (failedDocs.length > 0) {
      const errorMsg = `Cannot generate report: ${failedDocs.length} document(s) failed extraction: ${failedDocs.map(d => `${d.file_name}: ${d.error_message || "Unknown error"}`).join("; ")}`;
      await supabase
        .from("reports")
        .update({ generation_status: "failed", error_message: errorMsg })
        .eq("project_id", project_id);
      return new Response(
        JSON.stringify({ error: errorMsg }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Project ${project_id}: Found ${documents.length} documents, preparing for aggregation...`);

    const documentsForAggregation = documents.map(doc => ({
      document_id: doc.id,
      file_name: doc.file_name,
      document_type: doc.document_type,
      document_date: doc.document_date,
      extracted_data: doc.extracted_data
    }));

    // Compute action_items_summary programmatically
    const actionItemsSummary = {
      total: 0,
      open: 0,
      closed: 0,
      unclear: 0,
      by_document: [] as { document_id: string; open: number; closed: number; unclear: number }[]
    };

    for (const doc of documents) {
      const docStats = {
        document_id: doc.id,
        open: 0,
        closed: 0,
        unclear: 0
      };

      if (doc.extracted_data?.action_items) {
        for (const item of doc.extracted_data.action_items) {
          actionItemsSummary.total++;
          if (item.status === "open") {
            actionItemsSummary.open++;
            docStats.open++;
          } else if (item.status === "closed") {
            actionItemsSummary.closed++;
            docStats.closed++;
          } else {
            actionItemsSummary.unclear++;
            docStats.unclear++;
          }
        }
      }

      actionItemsSummary.by_document.push(docStats);
    }

    console.log(`Project ${project_id}: Calling Gemini API for aggregation...`);

    // Build Gemini API request
    const geminiUrl = `${GEMINI_API_URL}/${GEMINI_MODEL}:generateContent?key=${geminiApiKey}`;
    const geminiRequest = {
      contents: [
        {
          role: "user",
          parts: [
            { text: AGGREGATION_PROMPT + "\n\n" + JSON.stringify(documentsForAggregation, null, 2) }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 8192,
        responseMimeType: "application/json"
      }
    };

    let geminiResponse: Response;
    try {
      geminiResponse = await fetchWithTimeout(
        geminiUrl,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(geminiRequest)
        },
        GEMINI_API_TIMEOUT_MS
      );
    } catch (fetchErr) {
      const errorMsg = `Gemini API request failed: ${fetchErr.message}`;
      console.error(errorMsg);
      await supabase
        .from("reports")
        .update({ generation_status: "failed", error_message: errorMsg })
        .eq("project_id", project_id);
      return new Response(
        JSON.stringify({ error: errorMsg }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!geminiResponse.ok) {
      let errorDetails = "";
      try {
        const errorJson = await geminiResponse.json();
        errorDetails = JSON.stringify(errorJson);
      } catch {
        try {
          errorDetails = await geminiResponse.text();
        } catch {
          errorDetails = "(unable to read error body)";
        }
      }
      const errorMsg = `Gemini API error (${geminiResponse.status} ${geminiResponse.statusText}): ${errorDetails}`;
      console.error(errorMsg);
      await supabase
        .from("reports")
        .update({ generation_status: "failed", error_message: errorMsg })
        .eq("project_id", project_id);
      return new Response(
        JSON.stringify({ error: errorMsg }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Project ${project_id}: Gemini API responded, parsing JSON...`);

    let geminiData: any;
    try {
      geminiData = await geminiResponse.json();
    } catch (jsonErr) {
      const errorMsg = `Failed to parse Gemini API response as JSON: ${jsonErr.message}`;
      await supabase
        .from("reports")
        .update({ generation_status: "failed", error_message: errorMsg })
        .eq("project_id", project_id);
      return new Response(
        JSON.stringify({ error: errorMsg }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract text from Gemini response structure
    const finishReason = geminiData?.candidates?.[0]?.finishReason;
    const content = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

    // Check if response was truncated due to token limit
    if (finishReason === "MAX_TOKENS") {
      const errorMsg = "Response exceeded token limit (MAX_TOKENS). The aggregation output was too large. Consider reducing input size or contact support to increase the token limit.";
      console.error(errorMsg);
      await supabase
        .from("reports")
        .update({ generation_status: "failed", error_message: errorMsg })
        .eq("project_id", project_id);
      return new Response(
        JSON.stringify({ error: errorMsg, finishReason, usage: geminiData?.usageMetadata }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!content) {
      const safetyRatings = geminiData?.candidates?.[0]?.safetyRatings;
      let errorMsg = `No content in Gemini response`;
      if (finishReason) {
        errorMsg += ` (finishReason: ${finishReason})`;
      }
      if (safetyRatings) {
        errorMsg += ` (safetyRatings: ${JSON.stringify(safetyRatings)})`;
      }
      errorMsg += `. Full response: ${JSON.stringify(geminiData)}`;
      await supabase
        .from("reports")
        .update({ generation_status: "failed", error_message: errorMsg })
        .eq("project_id", project_id);
      return new Response(
        JSON.stringify({ error: errorMsg }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let aggregatedData: any;
    try {
      let jsonStr = content.trim();
      if (jsonStr.startsWith("```json")) {
        jsonStr = jsonStr.slice(7);
      }
      if (jsonStr.startsWith("```")) {
        jsonStr = jsonStr.slice(3);
      }
      if (jsonStr.endsWith("```")) {
        jsonStr = jsonStr.slice(0, -3);
      }
      aggregatedData = JSON.parse(jsonStr.trim());
    } catch (parseError) {
      const errorMsg = `Failed to parse aggregation JSON: ${parseError.message}. Raw content: ${content.substring(0, 500)}`;
      await supabase
        .from("reports")
        .update({ generation_status: "failed", error_message: errorMsg })
        .eq("project_id", project_id);
      return new Response(
        JSON.stringify({ error: errorMsg }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Merge programmatically computed action_items_summary
    aggregatedData.action_items_summary = actionItemsSummary;
    aggregatedData.project_name = project.name;

    console.log(`Project ${project_id}: Aggregation complete, saving to database...`);

    await supabase
      .from("reports")
      .delete()
      .eq("project_id", project_id);

    const { error: insertError } = await supabase
      .from("reports")
      .insert({
        project_id: project_id,
        aggregated_data: aggregatedData,
        generated_at: new Date().toISOString(),
        generation_status: "done",
        error_message: null
      });

    if (insertError) {
      const errorMsg = `Failed to save report to database: ${insertError.message}`;
      console.error(errorMsg);
      return new Response(
        JSON.stringify({ error: errorMsg }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Project ${project_id}: Report successfully generated and saved`);

    return new Response(
      JSON.stringify({
        success: true,
        data: aggregatedData,
        usage: geminiData?.usageMetadata
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("Unhandled edge function error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error", stack: err.stack }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
