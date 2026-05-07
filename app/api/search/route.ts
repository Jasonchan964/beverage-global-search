import axios, { isAxiosError } from "axios";
import { NextResponse } from "next/server";

/** Apollo documents “Organization Search” at this path (not `organizations/search`). */
const APOLLO_ORGANIZATION_SEARCH_URL =
  "https://api.apollo.io/api/v1/mixed_companies/search";

const INDUSTRY_KEYWORDS = ["Beverage", "Dairy", "Water"] as const;

/** Map ISO codes from the UI to Apollo-friendly HQ location strings. */
const COUNTRY_CODE_TO_APOLLO_LOCATION: Record<string, string> = {
  CN: "China",
  US: "United States",
  DE: "Germany",
  JP: "Japan",
  SG: "Singapore",
  GB: "United Kingdom",
};

type ApolloOrganization = {
  name?: string;
  primary_domain?: string;
  website_url?: string;
  industry?: string;
  keywords?: string[];
};

type SearchPayload = Record<string, unknown>;

function normalizeCountry(raw: unknown): string | undefined {
  if (raw === null || raw === undefined) return undefined;
  const s = String(raw).trim();
  return s === "" ? undefined : s;
}

function resolveOrganizationLocation(countryParam: string | undefined): string[] {
  if (!countryParam) return [];
  const upper = countryParam.toUpperCase();
  const mapped = COUNTRY_CODE_TO_APOLLO_LOCATION[upper];
  return mapped ? [mapped] : [countryParam];
}

function extractDomain(org: ApolloOrganization): string | null {
  if (org.primary_domain?.trim()) {
    return org.primary_domain.trim();
  }
  const url = org.website_url;
  if (!url?.trim()) return null;
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./i, "") || null;
  } catch {
    return null;
  }
}

function buildIndustryTags(org: ApolloOrganization): string[] {
  const tags: string[] = [];
  if (typeof org.industry === "string" && org.industry.trim()) {
    tags.push(org.industry.trim());
  }
  if (Array.isArray(org.keywords)) {
    for (const k of org.keywords) {
      if (typeof k === "string" && k.trim()) tags.push(k.trim());
    }
  }
  return [...new Set(tags)];
}

function buildApolloPayload(country: string | undefined): SearchPayload {
  const payload: SearchPayload = {
    page: 1,
    per_page: 50,
    q_organization_keyword_tags: [...INDUSTRY_KEYWORDS],
  };

  const locations = resolveOrganizationLocation(country);
  if (locations.length > 0) {
    payload.organization_locations = locations;
  }

  return payload;
}

async function runSearch(countryRaw: unknown) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey?.trim()) {
    return NextResponse.json(
      { error: "Server misconfiguration: APOLLO_API_KEY is not set." },
      { status: 500 },
    );
  }

  const country = normalizeCountry(countryRaw);

  try {
    const { data } = await axios.post<{
      organizations?: ApolloOrganization[];
      pagination?: unknown;
    }>(APOLLO_ORGANIZATION_SEARCH_URL, buildApolloPayload(country), {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Cache-Control": "no-cache",
        "x-api-key": apiKey.trim(),
      },
      timeout: 45_000,
      validateStatus: (s) => s < 600,
    });

    if (typeof data !== "object" || data === null) {
      return NextResponse.json(
        { error: "Unexpected Apollo response shape." },
        { status: 502 },
      );
    }

    if ((data as { error?: string }).error) {
      return NextResponse.json(
        {
          error: "Apollo returned an error.",
          details: data,
        },
        { status: 502 },
      );
    }

    const orgs = data.organizations ?? [];

    const results = orgs.map((org) => ({
      name: org.name ?? "",
      domain: extractDomain(org),
      industryTags: buildIndustryTags(org),
    }));

    return NextResponse.json({
      country: country ?? null,
      appliedIndustryKeywords: [...INDUSTRY_KEYWORDS],
      pagination: data.pagination ?? null,
      results,
    });
  } catch (e) {
    if (isAxiosError(e)) {
      const status = e.response?.status ?? 502;
      return NextResponse.json(
        {
          error: "Failed to reach Apollo API.",
          details: e.response?.data ?? e.message,
        },
        { status: status >= 400 && status < 600 ? status : 502 },
      );
    }
    throw e;
  }
}

/** Body: `{ "country": "US" | "China" | ... }` — optional; omit or empty = no HQ location filter. */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const country =
    typeof body === "object" &&
    body !== null &&
    "country" in body &&
    typeof (body as { country: unknown }).country !== "undefined"
      ? (body as { country: unknown }).country
      : undefined;

  return runSearch(country);
}

/** `GET /api/search?country=US` for quick checks. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const country = searchParams.get("country") ?? undefined;
  return runSearch(country);
}
