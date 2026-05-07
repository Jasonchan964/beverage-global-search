/** Single company row returned by `/api/search` — keep in sync with `B2bSearchDashboard` parsing. */
export type SearchResultItem = {
  name: string;
  domain: string | null;
  industryTags: string[];
};

export type SearchApiSuccess = {
  country: string | null;
  appliedIndustryKeywords: string[];
  pagination: unknown;
  results: SearchResultItem[];
};
