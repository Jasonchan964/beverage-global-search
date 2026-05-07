/** Apollo `q_organization_keyword_tags` — keep in sync with `/api/search` validation. */
export const APOLLO_KEYWORD_TAGS = ["Beverage", "Dairy", "Water"] as const;

export type ApolloKeywordTag = (typeof APOLLO_KEYWORD_TAGS)[number];

export const APOLLO_KEYWORD_LABEL_CN: Record<ApolloKeywordTag, string> = {
  Beverage: "饮料",
  Dairy: "乳制品",
  Water: "饮用水",
};

export const APOLLO_KEYWORD_TAG_SET = new Set<string>(APOLLO_KEYWORD_TAGS);

export function normalizeApolloKeywordTags(
  raw: unknown,
): string[] | { error: string } {
  if (raw === undefined || raw === null) {
    return { error: "缺少 industryKeywords（至少选择一项）。" };
  }
  if (!Array.isArray(raw)) {
    return { error: "industryKeywords 必须是字符串数组。" };
  }
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const t = item.trim();
    if (APOLLO_KEYWORD_TAG_SET.has(t)) out.push(t);
  }
  const unique = [...new Set(out)];
  if (unique.length === 0) {
    return { error: "请至少选择一项有效行业（Beverage / Dairy / Water）。" };
  }
  return unique;
}
