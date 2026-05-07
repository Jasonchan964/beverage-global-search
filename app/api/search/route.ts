import axios, { isAxiosError } from "axios";
import { NextResponse } from "next/server";
import {
  APOLLO_KEYWORD_TAGS,
  normalizeApolloKeywordTags,
} from "@/lib/apollo-industry-keywords";
import type { SearchApiSuccess } from "@/types/api-search";

/** Apollo documents “Organization Search” at this path (not `organizations/search`). */
const APOLLO_ORGANIZATION_SEARCH_URL =
  "https://api.apollo.io/api/v1/mixed_companies/search";

const LOG_PREFIX = "[api/search]";

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

function buildApolloPayload(
  country: string | undefined,
  industryKeywords: string[],
): SearchPayload {
  const payload: SearchPayload = {
    page: 1,
    per_page: 50,
    q_organization_keyword_tags: [...industryKeywords],
  };

  const locations = resolveOrganizationLocation(country);
  if (locations.length > 0) {
    payload.organization_locations = locations;
  }

  return payload;
}

function safeStringify(payload: unknown): string {
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
}

async function runSearch(countryRaw: unknown, industryKeywordsRaw: unknown) {
  const apiKey = process.env.APOLLO_API_KEY;

  if (!apiKey?.trim()) {
    console.log(
      `${LOG_PREFIX} APOLLO_API_KEY is missing or empty. Set it in Vercel → Settings → Environment Variables (name: APOLLO_API_KEY, Production + Preview).`,
    );
    return NextResponse.json(
      { error: "Server misconfiguration: APOLLO_API_KEY is not set." },
      { status: 500 },
    );
  }

  const masked =
    apiKey.trim().length > 8
      ? `${apiKey.trim().slice(0, 4)}…${apiKey.trim().slice(-4)}`
      : "(short key)";
  console.log(
    `${LOG_PREFIX} Using APOLLO_API_KEY loaded (length=${apiKey.trim().length}, masked=${masked})`,
  );

  const country = normalizeCountry(countryRaw);

  const keywordsNorm = normalizeApolloKeywordTags(industryKeywordsRaw);
  if (!Array.isArray(keywordsNorm)) {
    return NextResponse.json({ error: keywordsNorm.error }, { status: 400 });
  }
  const industryKeywords = keywordsNorm;

  try {
    const payload = buildApolloPayload(country, industryKeywords);

    const { data, status } = await axios.post<{
      organizations?: ApolloOrganization[];
      pagination?: unknown;
      error?: string;
      message?: string;
    }>(APOLLO_ORGANIZATION_SEARCH_URL, payload, {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Cache-Control": "no-cache",
        "x-api-key": apiKey.trim(),
      },
      timeout: 45_000,
    });

    console.log(`${LOG_PREFIX} Apollo HTTP ${status}`, {
      country: country ?? null,
      industryKeywords,
      orgCount: Array.isArray(data?.organizations)
        ? data.organizations.length
        : null,
    });

    if (typeof data !== "object" || data === null) {
      console.log(
        `${LOG_PREFIX} Apollo returned non-object body:`,
        safeStringify(data),
      );
      return NextResponse.json(
        { error: "Unexpected Apollo response shape." },
        { status: 502 },
      );
    }

    if (typeof data.error === "string" && data.error.trim()) {
      console.log(`${LOG_PREFIX} Apollo error field:`, safeStringify(data));
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

    const body: SearchApiSuccess = {
      country: country ?? null,
      appliedIndustryKeywords: industryKeywords,
      pagination: data.pagination ?? null,
      results,
    };

    return NextResponse.json(body);
  } catch (e) {
    if (isAxiosError(e)) {
      const apolloBody = e.response?.data;
      const apolloStatus = e.response?.status;
      console.log(
        `${LOG_PREFIX} Axios error calling Apollo`,
        JSON.stringify({
          message: e.message,
          code: e.code,
          apolloStatus,
          apolloBody:
            typeof apolloBody === "object"
              ? apolloBody
              : apolloBody != null
                ? String(apolloBody)
                : undefined,
        }),
      );

      const status =
        typeof apolloStatus === "number" &&
        apolloStatus >= 400 &&
        apolloStatus < 600
          ? apolloStatus
          : 502;

      return NextResponse.json(
        {
          error: "Failed to reach Apollo API.",
          details: apolloBody ?? e.message,
        },
        { status },
      );
    }
    console.log(`${LOG_PREFIX} Unexpected error`, e);
    throw e;
  }
}

/**
 * Body: `{ country?: string; industryKeywords: ("Beverage"|"Dairy"|"Water")[] }`.
 * Omit country or empty string = no HQ location filter.
 */
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

  const industryKeywords =
    typeof body === "object" && body !== null && "industryKeywords" in body
      ? (body as { industryKeywords: unknown }).industryKeywords
      : undefined;

  return runSearch(country, industryKeywords);
}

/** `GET /api/search?country=US&keywords=Beverage,Water` — keywords optional (default all three). */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const country = searchParams.get("country") ?? undefined;
  const kwParam = searchParams.get("keywords");
  const industryKeywords =
    kwParam === null || kwParam.trim() === ""
      ? [...APOLLO_KEYWORD_TAGS]
      : kwParam.split(",").map((s) => s.trim());
  return runSearch(country, industryKeywords);
}
