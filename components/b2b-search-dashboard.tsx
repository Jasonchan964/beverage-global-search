"use client";

import { useState } from "react";
import {
  APOLLO_KEYWORD_LABEL_CN,
  APOLLO_KEYWORD_TAGS,
  type ApolloKeywordTag,
} from "@/lib/apollo-industry-keywords";
import type { SearchApiSuccess, SearchResultItem } from "@/types/api-search";

function safeStringify(payload: unknown): string {
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
}

function isSearchApiSuccess(data: unknown): data is SearchApiSuccess {
  if (typeof data !== "object" || data === null) return false;
  const d = data as Record<string, unknown>;
  return Array.isArray(d.results);
}

const COUNTRIES = [
  { code: "", label: "全部国家 / All" },
  { code: "CN", label: "中国" },
  { code: "US", label: "美国" },
  { code: "DE", label: "德国" },
  { code: "JP", label: "日本" },
  { code: "SG", label: "新加坡" },
  { code: "GB", label: "英国" },
] as const;

function countryLabelForCode(code: string): string {
  if (!code) return "不限地区";
  const row = COUNTRIES.find((c) => c.code === code);
  return row?.label ?? code;
}

function websiteUrl(domain: string | null): string | null {
  if (!domain?.trim()) return null;
  return `https://${domain.trim()}`;
}

function mailtoForDomain(domain: string | null): string | null {
  if (!domain?.trim()) return null;
  return `mailto:info@${domain.trim()}`;
}

function ResultCardSkeleton() {
  return (
    <li>
      <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="h-6 w-4/5 animate-pulse rounded-md bg-slate-200" />
        <div className="mt-3 flex flex-wrap gap-2">
          <div className="h-6 w-16 animate-pulse rounded-md bg-slate-200" />
          <div className="h-6 w-24 animate-pulse rounded-md bg-slate-200" />
        </div>
        <div className="mt-4 space-y-3">
          <div className="flex gap-2">
            <div className="h-4 w-16 shrink-0 animate-pulse rounded bg-slate-200" />
            <div className="h-4 flex-1 animate-pulse rounded bg-slate-200" />
          </div>
          <div className="flex gap-2">
            <div className="h-4 w-16 shrink-0 animate-pulse rounded bg-slate-200" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-slate-200" />
          </div>
        </div>
        <div className="mt-6 flex flex-1 flex-col justify-end gap-2 border-t border-slate-100 pt-4 sm:flex-row">
          <div className="h-11 flex-1 animate-pulse rounded-lg bg-slate-200" />
          <div className="h-11 flex-1 animate-pulse rounded-lg bg-slate-200" />
        </div>
      </div>
    </li>
  );
}

export function B2bSearchDashboard() {
  const [country, setCountry] = useState<string>("");
  const [selectedTags, setSelectedTags] = useState<Set<ApolloKeywordTag>>(
    () => new Set(APOLLO_KEYWORD_TAGS),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiResults, setApiResults] = useState<SearchResultItem[]>([]);
  const [searchedCountryCode, setSearchedCountryCode] = useState<string>("");
  const [hasSearched, setHasSearched] = useState(false);
  const [lastAppliedKeywords, setLastAppliedKeywords] = useState<string[]>([]);

  const toggleTag = (tag: ApolloKeywordTag) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  };

  const runSearch = async () => {
    const industryKeywords = APOLLO_KEYWORD_TAGS.filter((t) =>
      selectedTags.has(t),
    );

    if (industryKeywords.length === 0) {
      setError("请至少选择一个行业（饮料 / 乳制品）。");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          country: country.trim() === "" ? undefined : country.trim(),
          industryKeywords,
        }),
      });

      const data: unknown = await res.json();

      if (!res.ok) {
        const detailStr =
          typeof data === "object" &&
          data !== null &&
          "details" in data &&
          (data as { details?: unknown }).details !== undefined
            ? safeStringify((data as { details: unknown }).details)
            : "";
        const msg =
          typeof data === "object" &&
          data !== null &&
          "error" in data &&
          typeof (data as { error: unknown }).error === "string"
            ? (data as { error: string }).error
            : `请求失败（${res.status}）`;
        throw new Error(detailStr ? `${msg}: ${detailStr}` : msg);
      }

      if (!isSearchApiSuccess(data)) {
        throw new Error("返回数据格式异常。");
      }

      const parsed: SearchResultItem[] = data.results.map((row) => {
        const name = typeof row.name === "string" ? row.name : "";
        const domain =
          row.domain === null
            ? null
            : typeof row.domain === "string"
              ? row.domain
              : null;
        const tags = Array.isArray(row.industryTags)
          ? row.industryTags.filter((t): t is string => typeof t === "string")
          : [];
        return { name, domain, industryTags: tags };
      });

      setApiResults(parsed);
      setSearchedCountryCode(country);
      setLastAppliedKeywords(data.appliedIndustryKeywords);
      setHasSearched(true);
    } catch (e) {
      setApiResults([]);
      setError(e instanceof Error ? e.message : "网络错误，请稍后重试。");
    } finally {
      setLoading(false);
    }
  };

  const handleSearchClick = () => {
    void runSearch();
  };

  const countryShown = countryLabelForCode(searchedCountryCode);
  const industrySummary =
    lastAppliedKeywords.length > 0
      ? lastAppliedKeywords
          .map(
            (k) =>
              APOLLO_KEYWORD_LABEL_CN[k as ApolloKeywordTag] ?? k,
          )
          .join("、")
      : null;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <header className="mb-10 text-center sm:mb-12 sm:text-left">
        <p className="text-sm font-medium uppercase tracking-wider text-slate-500">
          B2B Intelligence
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
          企业搜索仪表盘
        </h1>
        <p className="mt-3 max-w-2xl text-slate-600">
          使用 Apollo「组织搜索」接口：选择 Beverage / Dairy
          关键词与总部国家（可选），拉取匹配企业。
        </p>
      </header>

      <div className="rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm shadow-slate-200/50 ring-1 ring-slate-100 sm:p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:gap-5">
          <div className="w-full lg:w-48 lg:flex-shrink-0">
            <label
              htmlFor="country"
              className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500"
            >
              总部国家
            </label>
            <div className="relative">
              <select
                id="country"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                disabled={loading}
                className="h-12 w-full cursor-pointer appearance-none rounded-xl border border-slate-200 bg-slate-50 pl-4 pr-10 text-sm font-medium text-slate-800 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {COUNTRIES.map((c) => (
                  <option key={c.code || "all"} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
              <span
                aria-hidden
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"
              >
                ▼
              </span>
            </div>
          </div>

          <fieldset className="min-w-0 flex-1 border-0 p-0">
            <legend className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              行业（Apollo 关键词）
            </legend>
            <div className="flex flex-wrap gap-2">
              {APOLLO_KEYWORD_TAGS.map((tag) => {
                const active = selectedTags.has(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    aria-pressed={active}
                    disabled={loading}
                    onClick={() => toggleTag(tag)}
                    className={`rounded-xl border px-4 py-2.5 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-60 ${
                      active
                        ? "border-blue-600 bg-blue-600 text-white shadow-sm shadow-blue-600/20"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    {APOLLO_KEYWORD_LABEL_CN[tag]}
                    <span
                      className={
                        active ? "ml-1.5 text-xs text-blue-100" : "ml-1.5 text-xs text-slate-400"
                      }
                    >
                      {tag}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <button
            type="button"
            onClick={handleSearchClick}
            disabled={loading}
            className="h-12 shrink-0 rounded-xl bg-blue-600 px-8 text-sm font-semibold text-white shadow-sm shadow-blue-600/25 transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 active:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-70 lg:self-end lg:px-10"
          >
            {loading ? "加载中…" : "搜索"}
          </button>
        </div>
      </div>

      <section className="mt-10" aria-live="polite" aria-busy={loading}>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2 border-b border-slate-200 pb-3">
          <h2 className="text-lg font-semibold text-slate-900">搜索结果</h2>
          {!loading && (
            <p className="text-sm text-slate-500">
              {hasSearched ? (
                <>
                  共{" "}
                  <span className="font-medium text-slate-700">
                    {apiResults.length}
                  </span>{" "}
                  家企业
                  {industrySummary ? (
                    <span className="text-slate-400">
                      {" "}
                      · 行业：{industrySummary}
                    </span>
                  ) : null}
                </>
              ) : (
                <span>选择行业后点击「搜索」从 Apollo 拉取数据</span>
              )}
            </p>
          )}
        </div>

        {error && (
          <div
            role="alert"
            className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            {error}
          </div>
        )}

        {loading ? (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <ResultCardSkeleton key={i} />
            ))}
          </ul>
        ) : !hasSearched ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-16 text-center">
            <p className="text-slate-600">
              请选择至少一个行业与国家（可选），点击「搜索」从 Apollo 加载企业。
            </p>
          </div>
        ) : apiResults.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-16 text-center">
            <p className="text-slate-600">
              未返回企业，请尝试其他行业组合或国家筛选。
            </p>
          </div>
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {apiResults.map((company, index) => {
              const url = websiteUrl(company.domain);
              const mailto = mailtoForDomain(company.domain);
              const key = `${company.name}-${company.domain ?? "nodomain"}-${index}`;

              return (
                <li key={key}>
                  <article className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow-md">
                    <h3 className="text-lg font-semibold leading-snug text-slate-900">
                      {company.name || "未命名企业"}
                    </h3>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {company.industryTags.length === 0 ? (
                        <span className="text-xs text-slate-400">暂无行业标签</span>
                      ) : (
                        company.industryTags.map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center rounded-md bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-800 ring-1 ring-inset ring-blue-600/10"
                          >
                            {tag}
                          </span>
                        ))
                      )}
                    </div>

                    <dl className="mt-4 space-y-2 text-sm">
                      <div className="flex gap-2">
                        <dt className="w-20 flex-shrink-0 text-slate-500">
                          国家
                        </dt>
                        <dd className="font-medium text-slate-800">
                          {countryShown}
                        </dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="w-20 flex-shrink-0 text-slate-500">
                          域名
                        </dt>
                        <dd className="min-w-0 break-all font-medium text-slate-800">
                          {company.domain ?? "—"}
                        </dd>
                      </div>
                    </dl>

                    <div className="mt-6 flex flex-1 flex-col justify-end gap-2 border-t border-slate-100 pt-4 sm:flex-row">
                      {url ? (
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex flex-1 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-blue-300 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                        >
                          打开网站
                        </a>
                      ) : (
                        <span className="inline-flex flex-1 cursor-not-allowed items-center justify-center rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-400">
                          打开网站
                        </span>
                      )}
                      {mailto ? (
                        <a
                          href={mailto}
                          className="inline-flex flex-1 items-center justify-center rounded-lg bg-slate-800 px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-800"
                        >
                          发送邮件
                        </a>
                      ) : (
                        <span className="inline-flex flex-1 cursor-not-allowed items-center justify-center rounded-lg bg-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-500">
                          发送邮件
                        </span>
                      )}
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
