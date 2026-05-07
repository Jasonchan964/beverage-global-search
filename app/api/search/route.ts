import axios, { isAxiosError } from "axios";
import { NextResponse } from "next/server";
import {
  APOLLO_KEYWORD_TAGS,
  normalizeApolloKeywordTags,
} from "@/lib/apollo-industry-keywords";
import type { SearchApiSuccess } from "@/types/api-search";

/**
 * Organization search (available on plans where `mixed_companies/search` is not).
 * @see https://api.apollo.io/v1/organizations/search
 */
const APOLLO_ORGANIZATION_SEARCH_URL =
  "https://api.apollo.io/v1/organizations/search";

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

function pickOrgString(
  org: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const k of keys) {
    const v = org[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

/** Normalize differing field names across Apollo org payloads. */
function normalizeApolloOrgRecord(raw: unknown): ApolloOrganization {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;

  let keywords: string[] | undefined;
  if (Array.isArray(o.keywords)) {
    keywords = o.keywords.filter((x): x is string => typeof x === "string");
  }

  return {
    name: pickOrgString(o, "name", "organization_name"),
    primary_domain: pickOrgString(o, "primary_domain", "domain"),
    website_url: pickOrgString(o, "website_url", "website", "homepage_url"),
    industry: typeof o.industry === "string" ? o.industry.trim() || undefined : undefined,
    keywords,
  };
}

function extractOrganizationRows(data: Record<string, unknown>): unknown[] {
  if (Array.isArray(data.organizations)) return data.organizations;
  if (Array.isArray(data.accounts)) return data.accounts;

  const nested = data.data;
  if (Array.isArray(nested)) return nested;
  if (nested !== null && typeof nested === "object") {
    const d = nested as Record<string, unknown>;
    if (Array.isArray(d.organizations)) return d.organizations;
    if (Array.isArray(d.accounts)) return d.accounts;
    if (Array.isArray(d.results)) return d.results;
  }

  if (Array.isArray(data.results)) return data.results;

  return [];
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

    const { data: rawData, status } = await axios.post<
      Record<string, unknown> & {
        organizations?: unknown[];
        pagination?: unknown;
        error?: string;
        message?: string;
      }
    >(APOLLO_ORGANIZATION_SEARCH_URL, payload, {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Cache-Control": "no-cache",
        "x-api-key": apiKey.trim(),
      },
      timeout: 45_000,
    });

    if (typeof rawData !== "object" || rawData === null) {
      console.log(
        `${LOG_PREFIX} Apollo returned non-object body:`,
        safeStringify(rawData),
      );
      return NextResponse.json(
        { error: "Unexpected Apollo response shape." },
        { status: 502 },
      );
    }

    console.log(`${LOG_PREFIX} Apollo HTTP ${status}`, {
      country: country ?? null,
      industryKeywords,
      responseKeys:
        typeof rawData === "object" && rawData !== null
          ? Object.keys(rawData)
          : [],
    });

    if (typeof rawData.error === "string" && rawData.error.trim()) {
      console.log(`${LOG_PREFIX} Apollo error field:`, safeStringify(rawData));
      return NextResponse.json(
        {
          error: "Apollo returned an error.",
          details: rawData,
        },
        { status: 502 },
      );
    }

    const pagination =
      typeof rawData.pagination !== "undefined" ? rawData.pagination : null;

    const rows = extractOrganizationRows(rawData);
    console.log(`${LOG_PREFIX} Parsed organization rows count: ${rows.length}`);

    const results = rows.map((row) => {
      const org = normalizeApolloOrgRecord(row);
      return {
        name: org.name ?? "",
        domain: extractDomain(org),
        industryTags: buildIndustryTags(org),
      };
    });

    const body: SearchApiSuccess = {
      country: country ?? null,
      appliedIndustryKeywords: industryKeywords,
      pagination,
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
 * Body: `{ country?: string; industryKeywords: ("Beverage"|"Dairy")[] }`.
 * Omit country or empty string = no `organization_locations` filter.
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

/** `GET /api/search?country=US&keywords=Beverage,Dairy` — keywords optional (default: both). */
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
