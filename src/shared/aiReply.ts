import { splitKeywords, splitResumeLines, type AssistantConfig } from "./config";
import { nowBeijingTimestamp } from "./time";

export type ReplyDraft = {
  question: string;
  draft: string;
  prompt: string;
  category: string;
  resumeFacts: string[];
  createdAt: string;
};

type CategoryRule = {
  category: string;
  strong: RegExp[];
  weak?: RegExp[];
  negative?: RegExp[];
};

const CATEGORY_RULES: CategoryRule[] = [
  {
    category: "面试安排",
    strong: [/面试|一面|二面|终面|视频面|电话面|笔试|机试/, /方便.*(聊|沟通|面|电话|视频)|有时间.*(聊|沟通|面|电话|视频)|什么时候.*(方便|有空)/],
    weak: [/约|时间|几点|今天|明天|上午|下午|晚上|周一|周二|周三|周四|周五|周六|周日/]
  },
  {
    category: "到岗时间",
    strong: [/到岗|入职|到职|上岗|最快.*来|多久.*到岗/, /离职|在职|交接|离职证明/],
    weak: [/什么时候|多久|最快|目前/],
    negative: [/面试|笔试|机试|方便聊|方便沟通/]
  },
  {
    category: "实习周期",
    strong: [/实习.*(多久|几个月|多长|周期|时间)|能实习|实习期/, /(每周|一周|每星期).*(几天|多少天|到岗|出勤)/],
    weak: [/转正|长期|短期|几个月|到岗天数/]
  },
  {
    category: "薪资期望",
    strong: [/薪资|工资|待遇|月薪|日薪|时薪|薪水|报酬|package|base薪资/i, /(期望|预期|希望).*(薪|工资|待遇|多少钱|k|K)/],
    weak: [/预算|范围|多少|可谈|offer/i],
    negative: [/期望.*(城市|地点|岗位|方向|base|工作地)/i]
  },
  {
    category: "地点意向",
    strong: [/地点|城市|通勤|到公司|工作地|办公地|base|到岗地点|地点接受/i, /(期望|意向).*(城市|地点|base|工作地)/i],
    weak: [/远程|现场|线下|搬家|距离|住哪里|在哪/]
  },
  {
    category: "工作时间",
    strong: [/加班|大小周|单双休|双休|排班|夜班|倒班|996|955|工作时间|作息/],
    weak: [/接受|能不能|是否|周末|节假日/]
  },
  {
    category: "求职状态",
    strong: [/在看机会|求职状态|目前状态|是否在职|还在找|拿到offer|offer情况|流程中|入职流程/i],
    weak: [/已离职|在职|考虑机会|找工作|投递|面试中/]
  },
  {
    category: "岗位意向",
    strong: [/为什么.*(投|选择|考虑)|了解.*(岗位|职位|我们|公司)|对.*(岗位|职位|公司).*(了解|感兴趣)|岗位.*(匹配|意向|方向)/],
    weak: [/意向|方向|兴趣|匹配|职业规划|发展/]
  },
  {
    category: "学历专业",
    strong: [/学历|专业|学校|院校|本科|硕士|博士|大专|统招|全日制|毕业|年级|应届|往届/],
    weak: [/计算机|软件|自动化|通信|电子|数学/]
  },
  {
    category: "作品资料",
    strong: [/作品|作品集|github|gitee|链接|demo|简历|附件|项目地址|代码仓库|博客/i, /发.*(简历|作品|链接|附件|项目)/],
    weak: [/可以发|方便发|看一下|预览/]
  },
  {
    category: "项目经验",
    strong: [/项目|案例|作品|经验|经历|做过|负责|参与|亮点|难点|落地|上线/],
    weak: [/业务|模块|职责|成果|优化|数据|平台|系统/]
  },
  {
    category: "技术能力",
    strong: [/技术|框架|Vue|React|TypeScript|JavaScript|Node|Python|Java|算法|性能|工程化|组件|前端|后端|全栈|数据库|SQL/i],
    weak: [/熟悉|掌握|用过|能力|基础|原理|源码/]
  },
  {
    category: "自我介绍",
    strong: [/自我介绍|介绍一下|简单介绍|说说你|了解一下你|简单聊聊你/],
    weak: [/背景|情况|经历/]
  }
];

const CATEGORY_FACT_PATTERNS: Record<string, RegExp[]> = {
  薪资期望: [/薪资|工资|待遇|期望|package|月薪|日薪/i],
  到岗时间: [/到岗|入职|离职|在职|最快|交接/],
  面试安排: [/面试|沟通|电话|视频|时间|方便/],
  实习周期: [/实习|每周|一周|几天|几个月|转正/],
  工作时间: [/加班|双休|大小周|工作时间|作息/],
  地点意向: [/城市|地点|通勤|base|办公|远程/i],
  求职状态: [/求职|在职|离职|offer|机会|面试/i],
  岗位意向: [/岗位|方向|意向|匹配|职业规划|发展/],
  学历专业: [/学历|专业|学校|本科|硕士|毕业|应届/],
  作品资料: [/作品|链接|github|gitee|简历|项目地址|代码仓库/i],
  项目经验: [/项目|经历|负责|参与|业务|系统|平台|成果/],
  技术能力: [/Vue|React|TypeScript|JavaScript|Node|Python|Java|算法|工程化|组件|数据库|SQL/i],
  自我介绍: [/经验|技能|项目|求职|优势|背景/]
};

export function generateReplyDraft(question: string, config: AssistantConfig): ReplyDraft {
  const normalizedQuestion = normalizeQuestion(question);
  const category = detectCategory(normalizedQuestion);
  const resumeFacts = pickResumeFacts(normalizedQuestion, category, config);
  const draft = buildDraft(normalizedQuestion, category, resumeFacts, config);
  const prompt = buildReplyPrompt(normalizedQuestion, category, resumeFacts, config);

  return {
    question: normalizedQuestion,
    draft,
    prompt,
    category,
    resumeFacts,
    createdAt: nowBeijingTimestamp()
  };
}

export function buildReplyPrompt(question: string, category: string, resumeFacts: string[], config: AssistantConfig): string {
  return [
    "你是求职者的沟通助手，请根据简历资料和 HR 的问题生成自然、专业、简短的中文回复。",
    "要求：不编造简历中没有的信息；涉及薪资、到岗、地点等敏感信息时语气谨慎；输出 1-4 句话；不要自动承诺无法确认的条件。",
    `回复风格：${getToneLabel(config.replyTone)}`,
    `HR 问题：${question}`,
    `问题类型：${category}`,
    `简历资料：${resumeFacts.join("；") || "未提供"}`
  ].join("\n");
}

function buildDraft(question: string, category: string, resumeFacts: string[], config: AssistantConfig): string {
  const facts = resumeFacts.slice(0, 3);
  const factSentence = facts.length > 0 ? `我这边主要是${facts.join("，")}。` : "我这边的经历和岗位方向比较匹配。";
  const prefix = config.replyTone === "friendly" ? "您好呀，" : "您好，";
  const ending = config.replyTone === "concise" ? "方便的话我们可以继续沟通。" : "如果方便的话，也希望能进一步了解岗位要求。";

  if (category === "薪资期望") {
    return `${prefix}薪资这块我会结合岗位职责、团队情况和整体 package 综合考虑。${factSentence}如果岗位匹配度比较高，我这边也比较愿意深入沟通。`;
  }

  if (category === "到岗时间") {
    const availability = facts.find((fact) => /到岗|入职|离职|在职|尽快|交接/.test(fact));
    return `${prefix}${availability ? availability + "。" : "到岗时间我可以结合流程安排尽量配合。"}${ending}`;
  }

  if (category === "面试安排") {
    return `${prefix}面试或进一步沟通的时间我可以配合安排。您这边可以先发几个方便的时间段，我确认后尽快回复。`;
  }

  if (category === "实习周期") {
    const internshipFact = facts.find((fact) => /实习|每周|一周|几天|几个月|转正/.test(fact));
    return `${prefix}${internshipFact ? internshipFact + "。" : "实习周期和每周到岗天数我可以结合课程和项目安排尽量配合。"}${ending}`;
  }

  if (category === "工作时间") {
    return `${prefix}工作时间和团队节奏我可以先了解清楚。正常项目需要配合时我会积极支持，也希望能进一步了解具体安排。`;
  }

  if (category === "求职状态") {
    const statusFact = facts.find((fact) => /求职|在职|离职|offer|到岗|机会|面试/.test(fact));
    return `${prefix}${statusFact ? statusFact + "。" : "我目前在关注匹配的岗位机会，流程上可以积极配合。"}${ending}`;
  }

  if (category === "岗位意向") {
    return `${prefix}我关注这个岗位主要是因为方向和我的经历比较匹配。${factSentence}如果岗位职责和团队需求契合，我这边很愿意继续深入沟通。`;
  }

  if (category === "地点意向") {
    return `${prefix}地点方面我会结合岗位发展和通勤情况综合考虑。${factSentence}${ending}`;
  }

  if (category === "学历专业") {
    const educationFact = facts.find((fact) => /学历|专业|学校|本科|硕士|毕业|应届/.test(fact));
    return `${prefix}${educationFact ? educationFact + "。" : "我的学历和专业背景可以结合简历进一步确认。"}${ending}`;
  }

  if (category === "作品资料") {
    return `${prefix}可以的，相关简历、作品或项目资料我可以按您需要补充发送。${factSentence}`;
  }

  if (category === "项目经验") {
    return `${prefix}${factSentence}项目中我比较关注需求理解、工程质量和交付效果，可以结合岗位重点再展开介绍。`;
  }

  if (category === "技术能力") {
    return `${prefix}${factSentence}如果岗位对具体技术栈或业务场景有重点要求，我可以针对相关经验展开说明。`;
  }

  if (category === "自我介绍") {
    return `${prefix}${factSentence}${ending}`;
  }

  return `${prefix}${factSentence}${ending}`;
}

function pickResumeFacts(question: string, category: string, config: AssistantConfig): string[] {
  const lines = splitResumeLines(config.resumeText);
  const keywords = splitKeywords(config.keywords);
  const categoryPatterns = CATEGORY_FACT_PATTERNS[category] ?? [];
  const questionTokens = [...keywords, ...question.split(/[，。,.;；\s？?！!、：:（）()]/)]
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);

  const scored = lines.map((line, index) => {
    const lowerLine = line.toLowerCase();
    const tokenScore = questionTokens.reduce((total, token) => total + (lowerLine.includes(token.toLowerCase()) ? 2 : 0), 0);
    const categoryScore = categoryPatterns.reduce((total, pattern) => total + (pattern.test(line) ? 3 : 0), 0);
    return {
      line,
      index,
      score: tokenScore + categoryScore
    };
  });

  const matched = scored.filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.index - b.index);
  const fallback = scored.slice(0, 4);
  return (matched.length > 0 ? matched : fallback).slice(0, 4).map((item) => item.line);
}

function detectCategory(question: string): string {
  let bestCategory = "通用问题";
  let bestScore = 0;
  let bestIndex = Number.POSITIVE_INFINITY;

  for (const [index, rule] of CATEGORY_RULES.entries()) {
    const strongScore = rule.strong.reduce((total, pattern) => total + (pattern.test(question) ? 4 : 0), 0);
    const weakScore = (rule.weak ?? []).reduce((total, pattern) => total + (pattern.test(question) ? 2 : 0), 0);
    const negativeScore = (rule.negative ?? []).reduce((total, pattern) => total + (pattern.test(question) ? 5 : 0), 0);
    const score = strongScore + weakScore - negativeScore;

    if (score <= 0) continue;
    if (score > bestScore || (score === bestScore && index < bestIndex)) {
      bestCategory = rule.category;
      bestScore = score;
      bestIndex = index;
    }
  }

  return bestScore >= 4 ? bestCategory : "通用问题";
}

function normalizeQuestion(question: string): string {
  return question.replace(/\s+/g, " ").trim() || "HR 询问了岗位相关问题";
}

function getToneLabel(tone: AssistantConfig["replyTone"]): string {
  const labels: Record<AssistantConfig["replyTone"], string> = {
    professional: "专业稳重",
    friendly: "自然亲和",
    concise: "简洁直接"
  };

  return labels[tone];
}