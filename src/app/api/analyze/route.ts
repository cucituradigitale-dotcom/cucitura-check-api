import { NextRequest, NextResponse } from "next/server";
import { analyzeSite } from "@/lib/cucituraCheck";

export const runtime = "nodejs";

function corsHeaders(origin: string | null) {
  // Se vuoi aprire l’API a QUALSIASI sito: usa "*"
  // Se invece vuoi essere più restrittivo: metti una whitelist e fai echo solo se origin è permesso.
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");

  try {
    const body = await req.json().catch(() => ({}));
    const domain = typeof body?.domain === "string" ? body.domain.trim() : "";

    if (!domain) {
      return NextResponse.json(
        { error: "Missing 'domain' in request body" },
        { status: 400, headers: { ...corsHeaders(origin) } }
      );
    }

    // Validazione URL base
    let url: URL;
    try {
      url = new URL(domain);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error("bad protocol");
    } catch {
      return NextResponse.json(
        { error: "Invalid URL. Use a full URL like https://example.com" },
        { status: 400, headers: { ...corsHeaders(origin) } }
      );
    }

    const result = await analyzeSite(url.toString());

    return NextResponse.json(result, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        ...corsHeaders(origin),
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Internal error" },
      { status: 500, headers: { ...corsHeaders(origin) } }
    );
  }
}
