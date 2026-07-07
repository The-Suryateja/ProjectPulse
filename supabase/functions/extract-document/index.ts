import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import pdf from "npm:pdf-parse@1.1.1";
import JSZip from "npm:jszip@3.10.1";
import { Buffer } from "node:buffer";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const GEMINI_API_TIMEOUT_MS = 120000;
const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models";

const SUPPORTED_EXTENSIONS = ["pdf", "pptx", "docx", "txt", "md"];

const EXTRACTION_PROMPT = `You are a document analysis assistant. Your task is to extract structured information from the provided document text.

CRITICAL RULES:
1. Only extract what is EXPLICITLY present or DIRECTLY implied in the text — NEVER invent information
2. For EVERY decision/risk/action item/question, include a REAL exact quote from the source document as evidence_quote
3. Use severity_hint: "explicit" ONLY if the document uses language indicating severity directly (e.g. "this is a major blocker," "critical issue"); otherwise use "implied"
4. Use status: "unclear" for any action item where completion state is not clearly stated — do NOT default to "open" when uncertain
5. If a category has no items (e.g. no risks mentioned), return an EMPTY array, not a fabricated entry
6. Return ONLY valid JSON matching the schema below, no preamble or markdown formatting

JSON SCHEMA:
{
  "summary": "string, 2-3 sentence plain summary of the document",
  "decisions": [
    {
      "decision": "string",
      "evidence_quote": "string, exact text from doc, under 25 words"
    }
  ],
  "risks": [
    {
      "risk": "string",
      "severity_hint": "explicit | implied",
      "evidence_quote": "string"
    }
  ],
  "action_items": [
    {
      "item": "string",
      "status": "open | closed | unclear",
      "owner": "string or null",
      "evidence_quote": "string"
    }
  ],
  "open_questions": [
    {
      "question": "string",
      "evidence_quote": "string"
    }
  ]
}

DOCUMENT TEXT:`;

async function setDocumentError(
  supabase: ReturnType<typeof createClient>,
  documentId: string,
  errorMessage: string
) {
  console.error(`Document ${documentId} error: ${errorMessage}`);
  await supabase
    .from("documents")
    .update({
      extraction_status: "failed",
      error_message: errorMessage
    })
    .eq("id", documentId);
}

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

function getFileExtension(filename: string): string {
  const parts = filename.toLowerCase().split(".");
  return parts.length > 1 ? parts.pop() || "" : "";
}

// PDF extraction
async function extractTextFromPdf(buffer: ArrayBuffer): Promise<string> {
  const nodeBuffer = Buffer.from(buffer);
  const pdfData = await pdf(nodeBuffer);
  return pdfData.text;
}

// PPTX extraction - parse slide XML to extract text
async function extractTextFromPptx(buffer: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const slideTexts: string[] = [];

  const slideFiles: string[] = [];
  zip.forEach((relativePath) => {
    if (relativePath.match(/^ppt\/slides\/slide\d+\.xml$/)) {
      slideFiles.push(relativePath);
    }
  });

  slideFiles.sort((a, b) => {
    const numA = parseInt(a.match(/slide(\d+)\.xml$/)?.[1] || "0");
    const numB = parseInt(b.match(/slide(\d+)\.xml$/)?.[1] || "0");
    return numA - numB;
  });

  for (const slideFile of slideFiles) {
    const slideXml = await zip.file(slideFile)?.async("text");
    if (slideXml) {
      const slideText = extractTextFromSlideXml(slideXml);
      if (slideText.trim()) {
        const slideNum = slideFile.match(/slide(\d+)\.xml$/)?.[1] || "?";
        slideTexts.push(`--- Slide ${slideNum} ---\n${slideText}`);
      }
    }
  }

  return slideTexts.join("\n\n");
}

function extractTextFromSlideXml(xml: string): string {
  const paragraphs = xml.split(/<\/a:p>/);
  const paragraphTexts: string[] = [];

  for (const paragraph of paragraphs) {
    const paraTexts: string[] = [];
    const paraMatches = paragraph.matchAll(/<a:t>([^<]*)<\/a:t>/g);
    for (const match of paraMatches) {
      if (match[1].trim()) {
        paraTexts.push(match[1].trim());
      }
    }
    if (paraTexts.length > 0) {
      paragraphTexts.push(paraTexts.join(""));
    }
  }

  return paragraphTexts.join("\n");
}

// DOCX extraction - parse word/document.xml to extract paragraph text
async function extractTextFromDocx(buffer: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file("word/document.xml")?.async("text");

  if (!documentXml) {
    throw new Error("Could not find word/document.xml in DOCX file");
  }

  return extractTextFromDocumentXml(documentXml);
}

function extractTextFromDocumentXml(xml: string): string {
  const paragraphs: string[] = [];

  // Split by paragraph boundaries
  const paraMatches = xml.matchAll(/<w:p[^>]*>([\s\S]*?)<\/w:p>/g);
  for (const match of paraMatches) {
    const paraContent = match[1];
    const textRuns: string[] = [];

    // Extract all text runs within the paragraph
    const textMatches = paraContent.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g);
    for (const textMatch of textMatches) {
      if (textMatch[1]) {
        textRuns.push(textMatch[1]);
      }
    }

    if (textRuns.length > 0) {
      paragraphs.push(textRuns.join(""));
    }
  }

  return paragraphs.join("\n");
}

// TXT extraction - raw text as-is
async function extractTextFromTxt(buffer: ArrayBuffer): Promise<string> {
  const decoder = new TextDecoder("utf-8");
  return decoder.decode(buffer);
}

// MD extraction - raw text as-is
async function extractTextFromMd(buffer: ArrayBuffer): Promise<string> {
  const decoder = new TextDecoder("utf-8");
  return decoder.decode(buffer);
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

    let document_id: string;
    try {
      const body = await req.json();
      document_id = body.document_id;
    } catch (parseErr) {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body: " + parseErr.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!document_id) {
      return new Response(
        JSON.stringify({ error: "document_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Starting extraction for document: ${document_id}`);

    const { data: document, error: docError } = await supabase
      .from("documents")
      .select("*")
      .eq("id", document_id)
      .single();

    if (docError || !document) {
      console.error("Document fetch error:", docError);
      return new Response(
        JSON.stringify({ error: "Document not found: " + (docError?.message || "Unknown error") }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await supabase
      .from("documents")
      .update({
        extraction_status: "processing",
        error_message: null
      })
      .eq("id", document_id);

    // Detect file type
    const fileExtension = getFileExtension(document.file_name);

    if (!SUPPORTED_EXTENSIONS.includes(fileExtension)) {
      const errorMsg = `Unsupported file type: .${fileExtension}. Supported formats: ${SUPPORTED_EXTENSIONS.map(e => `.${e}`).join(", ")}`;
      await setDocumentError(supabase, document_id, errorMsg);
      return new Response(
        JSON.stringify({ error: errorMsg }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const fileTypeLabel = fileExtension.toUpperCase();
    console.log(`Document ${document_id}: Status set to processing, downloading ${fileTypeLabel}...`);

    const { data: fileData, error: downloadError } = await supabase
      .storage
      .from("documents")
      .download(document.storage_path);

    if (downloadError) {
      const errorMsg = `Failed to download ${fileTypeLabel} from storage: ${downloadError.message || downloadError}`;
      await setDocumentError(supabase, document_id, errorMsg);
      return new Response(
        JSON.stringify({ error: errorMsg }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!fileData) {
      const errorMsg = `${fileTypeLabel} file data is empty or null`;
      await setDocumentError(supabase, document_id, errorMsg);
      return new Response(
        JSON.stringify({ error: errorMsg }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Document ${document_id}: File downloaded, extracting text...`);

    let fileBuffer: ArrayBuffer;
    try {
      fileBuffer = await fileData.arrayBuffer();
    } catch (bufferErr) {
      const errorMsg = `Failed to read file as array buffer: ${bufferErr.message}`;
      await setDocumentError(supabase, document_id, errorMsg);
      return new Response(
        JSON.stringify({ error: errorMsg }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let text: string;

    // Branch based on file type
    if (fileExtension === "pptx") {
      try {
        text = await extractTextFromPptx(fileBuffer);
      } catch (pptxParseErr) {
        const errorMsg = `Failed to parse PPTX: ${pptxParseErr.message}`;
        await setDocumentError(supabase, document_id, errorMsg);
        return new Response(
          JSON.stringify({ error: errorMsg }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else if (fileExtension === "docx") {
      try {
        text = await extractTextFromDocx(fileBuffer);
      } catch (docxParseErr) {
        const errorMsg = `Failed to parse DOCX: ${docxParseErr.message}`;
        await setDocumentError(supabase, document_id, errorMsg);
        return new Response(
          JSON.stringify({ error: errorMsg }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else if (fileExtension === "txt") {
      try {
        text = await extractTextFromTxt(fileBuffer);
      } catch (txtParseErr) {
        const errorMsg = `Failed to parse TXT: ${txtParseErr.message}`;
        await setDocumentError(supabase, document_id, errorMsg);
        return new Response(
          JSON.stringify({ error: errorMsg }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else if (fileExtension === "md") {
      try {
        text = await extractTextFromMd(fileBuffer);
      } catch (mdParseErr) {
        const errorMsg = `Failed to parse MD: ${mdParseErr.message}`;
        await setDocumentError(supabase, document_id, errorMsg);
        return new Response(
          JSON.stringify({ error: errorMsg }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      // PDF (default)
      try {
        text = await extractTextFromPdf(fileBuffer);
      } catch (pdfParseErr) {
        const errorMsg = `Failed to parse PDF: ${pdfParseErr.message}`;
        await setDocumentError(supabase, document_id, errorMsg);
        return new Response(
          JSON.stringify({ error: errorMsg }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (!text || text.trim().length === 0) {
      const errorMsg = `No text could be extracted from ${fileExtension.toUpperCase()} - document may be empty or corrupted`;
      await setDocumentError(supabase, document_id, errorMsg);
      return new Response(
        JSON.stringify({ error: errorMsg }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const MAX_TEXT_LENGTH = 50000;
    if (text.length > MAX_TEXT_LENGTH) {
      console.log(`Document ${document_id}: Text is ${text.length} chars, truncating to ${MAX_TEXT_LENGTH}`);
      text = text.substring(0, MAX_TEXT_LENGTH);
    }

    console.log(`Document ${document_id}: Extracted ${text.length} characters from ${fileExtension.toUpperCase()}, calling Gemini API...`);

    // Build Gemini API request
    const geminiUrl = `${GEMINI_API_URL}/${GEMINI_MODEL}:generateContent?key=${geminiApiKey}`;
    const geminiRequest = {
      contents: [
        {
          role: "user",
          parts: [
            { text: EXTRACTION_PROMPT + "\n\n" + text }
          ]
        }
      ],
      generationConfig: {
        temperature: 0,
        seed: 42,
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
      await setDocumentError(supabase, document_id, errorMsg);
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
      await setDocumentError(supabase, document_id, errorMsg);
      return new Response(
        JSON.stringify({ error: errorMsg }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Document ${document_id}: Gemini API responded, parsing JSON...`);

    let geminiData: any;
    try {
      geminiData = await geminiResponse.json();
    } catch (jsonErr) {
      const errorMsg = `Failed to parse Gemini API response as JSON: ${jsonErr.message}`;
      await setDocumentError(supabase, document_id, errorMsg);
      return new Response(
        JSON.stringify({ error: errorMsg }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const content = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      const finishReason = geminiData?.candidates?.[0]?.finishReason;
      const safetyRatings = geminiData?.candidates?.[0]?.safetyRatings;
      let errorMsg = `No content in Gemini response`;
      if (finishReason) {
        errorMsg += ` (finishReason: ${finishReason})`;
      }
      if (safetyRatings) {
        errorMsg += ` (safetyRatings: ${JSON.stringify(safetyRatings)})`;
      }
      errorMsg += `. Full response: ${JSON.stringify(geminiData)}`;
      await setDocumentError(supabase, document_id, errorMsg);
      return new Response(
        JSON.stringify({ error: errorMsg }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let extractedData: any;
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
      extractedData = JSON.parse(jsonStr.trim());
    } catch (parseError) {
      const errorMsg = `Failed to parse extraction JSON: ${parseError.message}. Raw content: ${content.substring(0, 500)}`;
      await setDocumentError(supabase, document_id, errorMsg);
      return new Response(
        JSON.stringify({ error: errorMsg }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Document ${document_id}: Extraction complete, saving to database...`);

    const { error: updateError } = await supabase
      .from("documents")
      .update({
        extraction_status: "done",
        extracted_data: extractedData,
        error_message: null
      })
      .eq("id", document_id);

    if (updateError) {
      const errorMsg = `Failed to update document in database: ${updateError.message}`;
      console.error(errorMsg);
      return new Response(
        JSON.stringify({ error: errorMsg }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Document ${document_id}: Successfully extracted and saved`);

    return new Response(
      JSON.stringify({
        success: true,
        data: extractedData,
        file_type: fileExtension,
        text_length: text.length,
        text_preview: text.substring(0, 500),
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
