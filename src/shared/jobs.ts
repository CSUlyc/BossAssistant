import { splitCities, splitKeywords, type AssistantConfig, type HrActiveFilter } from "./config";

export type HrActiveLevel = "online" | "three-days" | "seven-days" | "inactive" | "unknown";

export type JobCardInfo = {
  element: HTMLElement;
  id: string;
  title: string;
  company: string;
  location: string;
  salary: string;
  salaryFontFamily: string;
  hrActiveText: string;
  hrActiveLevel: HrActiveLevel;
  detailUrl: string;
  rawText: string;
};

export type JobFilterResult = {
  accepted: boolean;
  reasons: string[];
};

export type ScannedJob = {
  job: JobCardInfo;
  filter: JobFilterResult;
};

export type JobScanSummary = {
  processed: number;
  matched: number;
  skipped: number;
  failed: number;
  jobs: ScannedJob[];
  errors: string[];
};

const CARD_SELECTORS = [
  ".job-card-wrapper",
  ".job-card-box",
  ".job-card-body",
  ".job-primary",
  "li[class*='job-card']",
  "div[class*='job-card']",
  "li[class*='job-list']"
];

const TITLE_SELECTORS = [
  ".job-name",
  ".job-title",
  ".job-info .name",
  "[class*='job-name']",
  "[class*='job-title']",
  "a[href*='/job_detail/']"
];

const COMPANY_SELECTORS = [
  ".company-name",
  ".company-text",
  ".company-info .name",
  ".company-info a",
  "[class*='company-name']",
  "[class*='company'] a",
  "[class*='brand-name']",
  "a[href*='/gongsi/']",
  "a[href*='/company/']",
  "h3[class*='name']",
  "[class*='company'] [class*='name']",
  "[class*='company'] h3"
];

const LOCATION_SELECTORS = [
  ".job-area",
  ".job-location",
  "[class*='area']",
  "[class*='location']"
];

const SALARY_SELECTORS = [".salary", "[class*='salary']", "[class*='job-salary']"];

const ACTIVE_PATTERNS: Array<{ pattern: RegExp; level: HrActiveLevel }> = [
  { pattern: /(在线|刚刚活跃|当前活跃)/, level: "online" },
  { pattern: /(今日活跃|今天活跃|1日内活跃|昨天活跃|2日内活跃|3日内活跃|近3日活跃)/, level: "three-days" },
  { pattern: /(本周活跃|7日内活跃|近7日活跃)/, level: "seven-days" },
  { pattern: /(半月内活跃|30日内活跃|月内活跃|很久没活跃|长期未活跃)/, level: "inactive" }
];

const ACTIVE_RANK: Record<HrActiveLevel, number> = {
  online: 0,
  "three-days": 1,
  "seven-days": 2,
  inactive: 3,
  unknown: 4
};

export function scanVisibleJobs(root: ParentNode, config: AssistantConfig): JobScanSummary {
  const cards = collectJobCardElements(root);
  const jobs: ScannedJob[] = [];
  const errors: string[] = [];
  let failed = 0;

  cards.forEach((element, index) => {
    const extracted = extractJobCard(element, index);

    if (!extracted.title) {
      failed += 1;
      errors.push(`第 ${index + 1} 个岗位卡片未识别到职位名称`);
      return;
    }

    const filter = filterJob(extracted, config);
    jobs.push({ job: extracted, filter });
  });

  const matched = jobs.filter((item) => item.filter.accepted).length;
  const skipped = jobs.length - matched;

  return {
    processed: cards.length,
    matched,
    skipped,
    failed,
    jobs,
    errors
  };
}

export function filterJob(job: JobCardInfo, config: AssistantConfig): JobFilterResult {
  const reasons: string[] = [];
  const keywords = splitKeywords(config.keywords);
  const haystack = `${job.title} ${job.company} ${job.rawText}`.toLowerCase();

  if (keywords.length > 0 && !keywords.some((keyword) => haystack.includes(keyword.toLowerCase()))) {
    reasons.push(`职位不包含关键词：${keywords.join("、")}`);
  }

  const cities = splitCities(config.cities);
  if (cities.length > 0 && !cities.some((city) => job.location.includes(city) || job.rawText.includes(city))) {
    reasons.push(`地点不匹配：期望 ${cities.join("、")}，实际 ${job.location || "未识别"}`);
  }

  if (!matchesHrActiveFilter(job.hrActiveLevel, config.hrActiveFilter)) {
    reasons.push(`HR 活跃度不匹配：${job.hrActiveText || "未识别"}`);
  }

  return {
    accepted: reasons.length === 0,
    reasons
  };
}

export function matchesHrActiveFilter(level: HrActiveLevel, filter: HrActiveFilter): boolean {
  if (filter === "any") {
    return true;
  }

  if (level === "unknown") {
    return true;
  }

  return ACTIVE_RANK[level] <= ACTIVE_RANK[filter];
}

function collectJobCardElements(root: ParentNode): HTMLElement[] {
  const found = new Set<HTMLElement>();

  CARD_SELECTORS.forEach((selector) => {
    root.querySelectorAll<HTMLElement>(selector).forEach((element) => {
      if (looksLikeJobCard(element)) {
        found.add(element);
      }
    });
  });

  root.querySelectorAll<HTMLAnchorElement>("a[href*='/job_detail/']").forEach((link) => {
    const card = link.closest<HTMLElement>(CARD_SELECTORS.join(",")) ?? link.closest<HTMLElement>("li, .job-card-wrapper, .job-card-box, .job-primary, div");
    if (card && looksLikeJobCard(card)) {
      found.add(card);
    }
  });

  return Array.from(found).filter((element, _index, all) => !all.some((other) => other !== element && other.contains(element)));
}

function extractJobCard(element: HTMLElement, index: number): JobCardInfo {
  const rawText = normalizeText(element.innerText || element.textContent || "");
  const detailLink = element.querySelector<HTMLAnchorElement>("a[href*='/job_detail/']");
  const title = pickText(element, TITLE_SELECTORS) || guessTitle(rawText);
  const company = pickText(element, COMPANY_SELECTORS) || guessCompany(element, rawText);
  const location = pickText(element, LOCATION_SELECTORS) || guessLocation(rawText);
  const salaryElement = pickElement(element, SALARY_SELECTORS);
  const salary = normalizeText(salaryElement?.innerText || salaryElement?.textContent || "");
  const salaryFontFamily = salaryElement ? window.getComputedStyle(salaryElement).fontFamily : "";
  const active = parseHrActive(rawText);
  const detailUrl = detailLink?.href ?? "";
  const id = detailUrl || `${title}-${company}-${location}-${index}`;

  return {
    element,
    id,
    title,
    company,
    location,
    salary,
    salaryFontFamily,
    hrActiveText: active.text,
    hrActiveLevel: active.level,
    detailUrl,
    rawText
  };
}

function pickText(element: HTMLElement, selectors: string[]): string {
  const target = pickElement(element, selectors);
  return normalizeText(target?.innerText || target?.textContent || "");
}

function pickElement(element: HTMLElement, selectors: string[]): HTMLElement | null {
  for (const selector of selectors) {
    const target = element.querySelector<HTMLElement>(selector);
    const text = normalizeText(target?.innerText || target?.textContent || "");
    if (target && text) {
      return target;
    }
  }

  return null;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function looksLikeJobCard(element: HTMLElement): boolean {
  // 最可靠：本身就是或包含职位详情链接
  if (element.tagName === "A" && (element as HTMLAnchorElement).href.includes("/job_detail/")) return true;
  if (element.querySelector("a[href*='/job_detail/']")) return true;

  const text = normalizeText(element.innerText || element.textContent || "");

  if (text.length < 10) return false;

  // 排除广告、推荐、页脚
  if (/广告|推广|banner|footer|底部/.test(text)) return false;
  if (element.closest("[class*='footer'], [class*='ad-banner'], [class*='recommend']")) return false;

  // 岗位特征：薪资数字 + 职位关键词
  const hasSalary = /\d{1,2}[kK]|\d+k-\d+k|[0-9]+K·|薪/.test(text);
  const hasJobWord = /工程师|前端|后端|开发|产品|运营|测试|设计|Java|React|Vue|Python|销售|行政|财务|人力|实习|管培|经理|专员|助理/.test(text);

  return hasSalary || hasJobWord;
}

function guessTitle(rawText: string): string {
  const parts = rawText.split(" ").filter(Boolean);
  return parts.find((part) => /前端|后端|开发|工程师|产品|运营|测试|设计|Java|React|Vue|Python/i.test(part)) ?? parts[0] ?? "";
}

function guessLocation(rawText: string): string {
  const match = rawText.match(/[一-龥]{2,8}(?:区|市|县|镇|街道)?/);
  return match?.[0] ?? "";
}

function guessCompany(element: HTMLElement, rawText: string): string {
  // 尝试从链接提取公司名
  const links = element.querySelectorAll<HTMLAnchorElement>("a");
  for (const link of links) {
    const text = normalizeText(link.innerText || link.textContent || "");
    if (text.length >= 2 && text.length <= 30 && /[一-龥]/.test(text)) {
      return text;
    }
  }

  // 从原始文本中匹配公司名
  const parts = rawText.split(/\s+/);
  for (const part of parts) {
    if (
      part.length >= 3 &&
      part.length <= 20 &&
      /[一-龥]/.test(part) &&
      !/岗位|招聘|前端|后端|开发|工程师|产品|运营|测试|设计|薪资|经验|学历|本科|大专|硕士|博士|实习|应届|在校|在校生|全职|兼职|[Kk]|薪/.test(part) &&
      !/\d/.test(part)
    ) {
      return part;
    }
  }

  return "未识别公司";
}

function parseHrActive(rawText: string): { text: string; level: HrActiveLevel } {
  for (const item of ACTIVE_PATTERNS) {
    const match = rawText.match(item.pattern);
    if (match?.[0]) {
      return {
        text: match[0],
        level: item.level
      };
    }
  }

  return {
    text: "活跃度未显示",
    level: "unknown"
  };
}