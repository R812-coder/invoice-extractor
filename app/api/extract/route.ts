import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

// Security: Simple rate limiting (IP-based, in-memory)
const requestCounts = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const limit = requestCounts.get(ip);

  if (!limit || now > limit.resetTime) {
    // Reset or create new limit (10 requests per hour)
    requestCounts.set(ip, {
      count: 1,
      resetTime: now + 60 * 60 * 1000, // 1 hour from now
    });
    return true;
  }

  if (limit.count >= 10) {
    return false; // Rate limit exceeded
  }

  limit.count++;
  return true;
}

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    // Security: Rate limiting check
    const ip = request.headers.get("x-forwarded-for") || "unknown";
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Maximum 10 requests per hour." },
        { status: 429 }
      );
    }

    // Get file from form data
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    // Security: Validate file type
    if (file.type !== "application/pdf") {
      return NextResponse.json(
        { error: "Only PDF files are allowed" },
        { status: 400 }
      );
    }

    // Security: Validate file size (10MB max)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "File size exceeds 10MB limit" },
        { status: 400 }
      );
    }

    console.log(`📄 Processing: ${file.name} (${file.size} bytes)`);

    // Convert PDF to base64
    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");

    // Send to Claude API
    console.log("🤖 Sending to Claude API...");
    const startTime = Date.now();

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: base64,
              },
            },
            {
              type: "text",
              text: `You are an expert invoice data extraction specialist.

Extract ALL the following data from this invoice PDF:

REQUIRED FIELDS:
- vendor_name (company/person billing you)
- vendor_address (full address if present, null if not)
- vendor_email (if present, null if not)
- vendor_phone (if present, null if not)
- invoice_number (invoice #, bill #, etc)
- invoice_date (date invoice was created, format: YYYY-MM-DD)
- due_date (payment due date if present, format: YYYY-MM-DD, null if not)
- purchase_order_number (PO # if present, null if not)

AMOUNTS (as numbers only, no currency symbols):
- subtotal (amount before tax)
- tax_amount (sales tax, VAT, etc)
- total_amount (final amount due)

LINE ITEMS (extract as array, every item/service listed):
For each product/service:
- description (what was purchased)
- quantity (how many, default to 1 if not shown)
- unit_price (price per item)
- line_total (quantity × unit_price)

CRITICAL RULES:
- Return ONLY valid JSON, no other text
- If a field is not found, use null
- Dates MUST be YYYY-MM-DD format
- Numbers must be decimals (e.g., 123.45) with no $ or currency symbols
- For line items, if quantity not shown, assume 1
- Make sure subtotal + tax = total (or very close)

Return in this EXACT JSON structure:
{
  "vendor_name": "string",
  "vendor_address": "string or null",
  "vendor_email": "string or null",
  "vendor_phone": "string or null",
  "invoice_number": "string",
  "invoice_date": "YYYY-MM-DD",
  "due_date": "YYYY-MM-DD or null",
  "purchase_order_number": "string or null",
  "subtotal": number,
  "tax_amount": number,
  "total_amount": number,
  "line_items": [
    {
      "description": "string",
      "quantity": number,
      "unit_price": number,
      "line_total": number
    }
  ]
}`,
            },
          ],
        },
      ],
    });

    const processingTime = Date.now() - startTime;
    console.log(`✅ Claude responded in ${processingTime}ms`);

    // Extract text from Claude's response
    const responseText =
      message.content[0].type === "text" ? message.content[0].text : "";

    // Find JSON in response (Claude might add explanation)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      console.error("❌ No JSON found in response:", responseText);
      return NextResponse.json(
        { error: "Failed to extract structured data from invoice" },
        { status: 500 }
      );
    }

    // Parse extracted data
    let extractedData;
    try {
      extractedData = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error("❌ JSON parse error:", parseError);
      return NextResponse.json(
        { error: "Failed to parse extracted data" },
        { status: 500 }
      );
    }

    // Security: Sanitize extracted data (prevent XSS)
    const sanitize = (str: any): any => {
      if (typeof str === "string") {
        // Remove any HTML/script tags
        return str.replace(/<[^>]*>/g, "").trim();
      }
      return str;
    };

    // Sanitize all string fields
    Object.keys(extractedData).forEach((key) => {
      if (typeof extractedData[key] === "string") {
        extractedData[key] = sanitize(extractedData[key]);
      }
    });

    // Sanitize line items
    if (Array.isArray(extractedData.line_items)) {
      extractedData.line_items = extractedData.line_items.map((item: any) => ({
        ...item,
        description: sanitize(item.description),
      }));
    }

    console.log("✅ Data extracted and sanitized successfully");

    // Return extracted data
    return NextResponse.json({
      success: true,
      data: extractedData,
      processing_time_ms: processingTime,
    });
  } catch (error: any) {
    console.error("❌ Extraction error:", error);

    return NextResponse.json(
      {
        error: "Failed to process invoice",
        details: error.message,
      },
      { status: 500 }
    );
  }
}