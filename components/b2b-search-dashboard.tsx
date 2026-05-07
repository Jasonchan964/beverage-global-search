"use client";

import { useMemo, useState, type KeyboardEvent } from "react";

type ApiSearchResult = {
  name: string;
  domain: string | null;
  industryTags: string[];
};

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

function matchesLocalQuery(company: ApiSearchResult, q: string): boolean {
  if (!q.trim()) return true;
  const needle = q.trim().toLowerCase();
  const hay = [
    company.name,
    company.domain ?? "",
    ...company.industryTags,
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(needle);
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
          <div className="h-6 w-20 animate-pulse rounded-md bg-slate-200" />
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
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiResults, setApiResults] = useState<ApiSearchResult[]>([]);
  const [searchedCountryCode, setSearchedCountryCode] = useState<string>("");
  const [hasSearched, setHasSearched] = useState(false);

  const displayResults = useMemo(() => {
    return apiResults.filter((c) => matchesLocalQuery(c, query));
  }, [apiResults, query]);

  const runSearch = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          country: country.trim() === "" ? undefined : country.trim(),
        }),
      });

      const data: unknown = await res.json();

      if (!res.ok) {
        const msg =
          typeof data === "object" &&
          data !== null &&
          "error" in data &&
          typeof (data as { error: unknown }).error === "string"
            ? (data as { error: string }).error
            : `请求失败（${res.status}）`;
        throw new Error(msg);
      }

      if (
        typeof data !== "object" ||
        data === null ||
        !("results" in data) ||
        !Array.isArray((data as { results: unknown }).results)
      ) {
        throw new Error("返回数据格式异常。");
      }

      const raw = (data as { results: unknown[] }).results;
      const parsed: ApiSearchResult[] = raw.map((row) => {
        const r = row as Record<string, unknown>;
        const name = typeof r.name === "string" ? r.name : "";
        const domain = typeof r.domain === "string" ? r.domain : null;
        const tags = Array.isArray(r.industryTags)
          ? r.industryTags.filter((t): t is string => typeof t === "string")
          : [];
        return { name, domain, industryTags: tags };
      });

      setApiResults(parsed);
      setSearchedCountryCode(country);
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

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") void runSearch();
  };

  const countryShown = countryLabelForCode(searchedCountryCode);

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
          选择国家并搜索，对接 Apollo 企业库（饮料 / 乳制品 / 水等关键词）；可使用关键词框在结果中筛选。
        </p>
      </header>

      <div className="rounded-2xl border border-slate-200/80 bg-white p-2 shadow-sm shadow-slate-200/50 ring-1 ring-slate-100 sm:p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
          <div className="relative sm:w-48 sm:flex-shrink-0">
            <label htmlFor="country" className="sr-only">
              国家
            </label>
            <select
              id="country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              disabled={loading}
              className="h-14 w-full cursor-pointer appearance-none rounded-xl border border-slate-200 bg-slate-50 pl-4 pr-10 text-sm font-medium text-slate-800 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60"
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

          <div className="relative min-w-0 flex-1">
            <label htmlFor="query" className="sr-only">
              搜索企业
            </label>
            <input
              id="query"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="在当前结果中筛选：企业名、域名或标签…"
              disabled={loading}
              className="h-14 w-full rounded-xl border border-slate-200 bg-white px-4 text-base text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60 sm:text-[15px]"
            />
          </div>

          <button
            type="button"
            onClick={handleSearchClick}
            disabled={loading}
            className="h-14 shrink-0 rounded-xl bg-blue-600 px-8 text-sm font-semibold text-white shadow-sm shadow-blue-600/25 transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 active:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-70 sm:px-10"
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
                    {displayResults.length}
                  </span>
                  {displayResults.length !== apiResults.length && (
                    <span className="text-slate-400">
                      {" "}
                      / {apiResults.length} 条已加载
                    </span>
                  )}
                  {!query.trim() ? " 家企业" : " 条匹配筛选"}
                </>
              ) : (
                <span>点击「搜索」从 Apollo 拉取数据</span>
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
              请选择国家（可选），点击「搜索」加载饮料 / 乳制品 / 水相关行业企业。
            </p>
          </div>
        ) : displayResults.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-16 text-center">
            <p className="text-slate-600">
              {apiResults.length === 0
                ? "未返回企业，请更换国家筛选或稍后重试。"
                : "当前筛选条件下无匹配结果，请调整关键词。"}
            </p>
          </div>
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {displayResults.map((company, index) => {
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
