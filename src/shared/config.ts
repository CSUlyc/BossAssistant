export type HrActiveFilter = "online" | "three-days" | "seven-days" | "any";
export type ReplyTone = "professional" | "friendly" | "concise";

export type AssistantConfig = {
  introText: string;
  keywords: string;
  cities: string;
  hrActiveFilter: HrActiveFilter;
  dailyLimit: number;
  resumeText: string;
  replyTone: ReplyTone;
};

export const DEFAULT_CONFIG: AssistantConfig = {
  introText: [
    "您好，我对这个岗位很感兴趣",
    "我是张三，3年前端开发经验",
    "熟悉 Vue、React、TypeScript",
    "做过多个大型项目",
    "希望能有机会进一步沟通"
  ].join("\n"),
  keywords: "前端,React,Vue",
  cities: "杭州",
  hrActiveFilter: "three-days",
  dailyLimit: 50,
  resumeText: [
    "张三，3年前端开发经验",
    "熟悉 Vue、React、TypeScript、工程化和组件化开发",
    "参与过后台管理系统、数据可视化平台和移动端 H5 项目",
    "关注代码质量、性能优化和用户体验",
    "期望前端开发相关岗位，可尽快到岗"
  ].join("\n"),
  replyTone: "professional"
};

export const HR_ACTIVE_OPTIONS: Array<{ value: HrActiveFilter; label: string }> = [
  { value: "online", label: "在线或刚刚活跃" },
  { value: "three-days", label: "3天内活跃" },
  { value: "seven-days", label: "7天内活跃" },
  { value: "any", label: "不限" }
];

export const REPLY_TONE_OPTIONS: Array<{ value: ReplyTone; label: string }> = [
  { value: "professional", label: "专业稳重" },
  { value: "friendly", label: "自然亲和" },
  { value: "concise", label: "简洁直接" }
];

export function splitIntroLines(introText: string): string[] {
  return introText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function splitKeywords(keywords: string): string[] {
  return keywords
    .split(",")
    .map((keyword) => keyword.trim())
    .filter(Boolean);
}

export function splitCities(cities: string): string[] {
  return cities
    .split(",")
    .map((city) => city.trim())
    .filter(Boolean);
}

export function splitResumeLines(resumeText: string): string[] {
  return resumeText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function normalizeConfig(config: Partial<AssistantConfig> | null | undefined): AssistantConfig {
  return {
    introText: config?.introText ?? DEFAULT_CONFIG.introText,
    keywords: config?.keywords ?? DEFAULT_CONFIG.keywords,
    cities: config?.cities ?? DEFAULT_CONFIG.cities,
    hrActiveFilter: config?.hrActiveFilter ?? DEFAULT_CONFIG.hrActiveFilter,
    dailyLimit: clampDailyLimit(config?.dailyLimit ?? DEFAULT_CONFIG.dailyLimit),
    resumeText: config?.resumeText ?? DEFAULT_CONFIG.resumeText,
    replyTone: config?.replyTone ?? DEFAULT_CONFIG.replyTone
  };
}

export function clampDailyLimit(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_CONFIG.dailyLimit;
  }

  return Math.min(150, Math.max(1, Math.round(value)));
}

export function validateConfig(config: AssistantConfig): string[] {
  const errors: string[] = [];

  if (splitIntroLines(config.introText).length === 0) {
    errors.push("请先填写至少一句自我介绍");
  }

  if (splitKeywords(config.keywords).length === 0) {
    errors.push("请至少填写一个职位关键词");
  }

  if (splitCities(config.cities).length === 0) {
    errors.push("请至少填写一个目标城市");
  }

  return errors;
}

export function validateReplyConfig(config: AssistantConfig): string[] {
  const errors: string[] = [];

  if (splitResumeLines(config.resumeText).length === 0) {
    errors.push("请先在设置页填写简历资料");
  }

  return errors;
}