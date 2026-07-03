# BossAssistant 深度解析：一款 BOSS 直聘自动化求职助手的技术实现

> 一个基于 Chrome Extension Manifest V3 的浏览器扩展，帮助求职者半自动化筛选职位、投递简历、管理记录，并基于本地规则引擎辅助生成聊天回复。

---

## 目录

1. [项目背景与动机](#1-项目背景与动机)
2. [技术架构总览](#2-技术架构总览)
3. [构建体系](#3-构建体系)
4. [核心模块深度解析](#4-核心模块深度解析)
   - [4.1 配置管理](#41-配置管理)
   - [4.2 页面识别](#42-页面识别)
   - [4.3 职位扫描与筛选](#43-职位扫描与筛选)
   - [4.4 半自动化投递](#44-半自动化投递)
   - [4.5 防重复机制](#45-防重复机制)
   - [4.6 AI 回复草稿引擎](#46-ai-回复草稿引擎)
   - [4.7 可视化控制面板](#47-可视化控制面板)
5. [设计决策与权衡](#5-设计决策与权衡)
6. [已知限制与未来展望](#6-已知限制与未来展望)

---

## 1. 项目背景与动机

在 BOSS 直聘上找工作，求职者每天面对大量岗位卡片，需要反复执行以下操作：

- 浏览职位列表，逐一点击查看详情
- 判断岗位是否匹配自己的方向
- 点击"立即沟通"，发送自我介绍
- 记录已投递的岗位，避免重复
- 回复 HR 的消息，反复组织语言

这些操作高度重复、耗时且容易出错。BossAssistant 的初衷就是：**让浏览器自动完成机械性操作，把决策权留给人**。

核心设计原则：
- **半自动而非全自动**：工具执行点击和发送，但筛选条件、投递上限、回复内容均由用户控制
- **透明可控**：所有操作有日志，随时可暂停/继续/停止
- **隐私优先**：AI 回复在本地生成，不上传任何数据到外部服务
- **合规边界清晰**：不绕过验证码、频率限制或平台风控

---

## 2. 技术架构总览

### 2.1 整体架构

```
┌──────────────────────────────────────────────────────────┐
│                    Chrome Extension MV3                   │
├───────────────┬──────────────────┬───────────────────────┤
│   Popup       │  Service Worker  │   Options Page         │
│   (React)     │  (background.ts) │   (React)              │
│   360px 弹窗   │  消息路由中心     │   完整设置页            │
└───────┬───────┴────────┬─────────┴───────────┬───────────┘
        │                │                     │
        │    chrome.runtime.sendMessage        │
        │                │                     │
        ▼                ▼                     ▼
┌──────────────────────────────────────────────────────────┐
│                   Content Script                         │
│                   (content/index.ts)                     │
│  ┌──────────────────────────────────────────────────┐   │
│  │  控制面板 (Shadow DOM)                             │   │
│  │  ┌─────────┐ ┌──────────┐ ┌──────────────────┐   │   │
│  │  │ 状态指示 │ │ 实时统计  │ │ 操作日志          │   │   │
│  │  └─────────┘ └──────────┘ └──────────────────┘   │   │
│  ├──────────────────────────────────────────────────┤   │
│  │  业务逻辑层                                       │   │
│  │  ┌─────────┐ ┌──────────┐ ┌──────────────────┐   │   │
│  │  │ 岗位扫描 │ │ 投递执行  │ │ AI 回复草稿       │   │   │
│  │  └─────────┘ └──────────┘ └──────────────────┘   │   │
│  └──────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────────────────────┐
│              Shared Modules (TypeScript)                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐             │
│  │ config   │ │ jobs     │ │ applications │             │
│  │ 配置模型  │ │ 岗位扫描  │ │ 投递记录存储   │             │
│  ├──────────┤ ├──────────┤ ├──────────────┤             │
│  │ storage  │ │ page     │ │ task         │             │
│  │ 本地存储  │ │ 页面检测  │ │ 任务状态机    │             │
│  ├──────────┤ ├──────────┤ ├──────────────┤             │
│  │ aiReply  │ │ messages │ │              │             │
│  │ 回复引擎  │ │ 消息类型  │ │              │             │
│  └──────────┘ └──────────┘ └──────────────┘             │
└──────────────────────────────────────────────────────────┘
```

### 2.2 技术栈

| 类别 | 选型 | 理由 |
|------|------|------|
| 扩展框架 | Chrome Extension Manifest V3 | 最新标准，强制 Service Worker，安全性更好 |
| 前端框架 | React 19 + TypeScript | 类型安全，组件化开发 Popup 和 Options 页面 |
| 构建工具 | Vite + esbuild | Vite 构建 React 页面；esbuild 独立打包 Content Script (IIFE) 和 Background (ESM) |
| 图标 | Lucide React | 轻量、Tree-shakeable |
| 存储 | chrome.storage.local | 无需云端同步，隐私友好，读写异步 |

### 2.3 运行时通信

扩展的四个运行时部分通过 Chrome 消息机制通信：

```
Popup / Options  ←→  Service Worker  ←→  Content Script
     │                    │                    │
     │  GET_CONFIG        │  PAGE_STATUS       │  注入 BOSS 页面
     │  SAVE_CONFIG       │  TASK_COMMAND      │  操作 DOM
     │  TASK_COMMAND      │  TASK_STATE        │  读取岗位信息
     └────────────────────┴────────────────────┘
```

消息类型定义在 `messages.ts` 中，使用 TypeScript 联合类型确保类型安全：

```typescript
export const MESSAGE_TYPES = {
  PAGE_STATUS_CHANGED: "bossassistant/page-status-changed",
  GET_CONFIG: "bossassistant/get-config",
  SAVE_CONFIG: "bossassistant/save-config",
  TASK_COMMAND: "bossassistant/task-command",
  TASK_STATE_CHANGED: "bossassistant/task-state-changed",
  // ...
} as const;
```

---

## 3. 构建体系

项目使用**双构建管线**解决 Manifest V3 的特殊要求：

```
┌─────────────────────────────────────────────────────┐
│                    npm run build                     │
├─────────────────┬───────────────────────────────────┤
│  tsc --noEmit   │  类型检查（全量）                   │
├─────────────────┼───────────────────────────────────┤
│  vite build     │  Popup + Options (React)           │
│                 │  输出：ESM 模块 + CSS               │
├─────────────────┼───────────────────────────────────┤
│  esbuild ×2     │  Content Script → IIFE 格式        │
│                 │  Background → ESM 格式             │
│                 │  Target: Chrome 120               │
└─────────────────┴───────────────────────────────────┘
```

**为什么 Content Script 必须用 IIFE？**

Manifest V3 的普通 Content Script（不带 `"type": "module"`）不能包含顶层 `import/export`。所以需要 esbuild 将所有依赖内联打包为 IIFE 自执行函数。

```javascript
// vite.config.ts 只处理 popup 和 options
build: {
  rollupOptions: {
    input: {
      popup: resolve(__dirname, "popup.html"),
      options: resolve(__dirname, "options.html")
    }
  }
}

// package.json 中额外的构建步骤
"build:extension-scripts": 
  "esbuild src/content/index.ts --bundle --format=iife ... && 
   esbuild src/background/index.ts --bundle --format=esm ..."
```

---

## 4. 核心模块深度解析

### 4.1 配置管理

配置模块是用户与工具交互的起点，负责定义、存储和验证所有用户设置。

**数据结构**（`config.ts`）：

```typescript
export type AssistantConfig = {
  introText: string;       // 自我介绍（多行，按句拆分发送）
  keywords: string;         // 关键词，逗号分隔
  cities: string;           // 目标城市，逗号分隔多选
  hrActiveFilter: HrActiveFilter;  // HR 活跃时间
  dailyLimit: number;       // 每日投递上限 (1-150)
  resumeText: string;       // 简历资料（用于 AI 回复）
  replyTone: ReplyTone;     // 回复风格
};
```

**存储层**（`storage.ts`）：

使用 `chrome.storage.local`，按 key `bossassistant/config` 存取。所有读写通过 `getConfig()` / `saveConfig()` 两个异步函数：

```typescript
export async function saveConfig(config: AssistantConfig): Promise<AssistantConfig> {
  const normalized = normalizeConfig(config);
  await chrome.storage.local.set({ ["bossassistant/config"]: normalized });
  return normalized;
}
```

`normalizeConfig` 确保即使存储数据部分缺失，也能用默认值补齐，实现**向前兼容**。

**UI 层**：Options 页面使用 React 构建。配置表单和预览面板左右分栏布局（CSS Grid），实时预览自我介绍拆分效果和筛选摘要。

**关键设计**：
- `clampDailyLimit()` 将输入范围锁定在 1-150，错误输入自动修正
- `splitIntroLines()` / `splitCities()` / `splitKeywords()` 将逗号/换行分隔的字符串转为数组
- `validateConfig()` 在保存和开始投递前检查必填项

---

### 4.2 页面识别

扩展需要知道自己当前在 BOSS 的哪个页面，才能触发对应的功能逻辑。

**实现**（`page.ts`）：

```typescript
export function detectBossPage(href: string): BossPageStatus {
  // 匹配 URL 模式
  if (/\/web\/geek\/jobs/.test(href)) {
    return { kind: "jobs", label: "职位列表", supported: true };
  }
  if (/\/web\/geek\/chat/.test(href)) {
    return { kind: "chat", label: "沟通聊天", supported: true };
  }
  if (/zhipin\.com/.test(href)) {
    return { kind: "zhipin-other", label: "其他页面", supported: false };
  }
  return { kind: "unsupported", label: "不支持", supported: false };
}
```

**页面变化检测**：Content Script 使用 `setInterval` 每秒检查 `window.location.href`。URL 变化时自动更新状态并重渲染面板。

```typescript
setInterval(() => {
  if (window.location.href === lastHref) return;
  lastHref = window.location.href;
  // 清理之前的状态，重新发布页面状态
  publishPageStatus();
}, 1000);
```

---

### 4.3 职位扫描与筛选

这是整个工具最核心的能力——从 BOSS 的 DOM 中精准提取岗位信息。

#### 4.3.1 卡片发现

`collectJobCardElements(root)` 使用两轮策略：

**第一轮**：用 CSS 选择器海选候选元素（`.job-card-wrapper`, `.job-card-box` 等），然后通过 `looksLikeJobCard()` 验证：

```typescript
function looksLikeJobCard(element: HTMLElement): boolean {
  // 最可靠：包含职位详情链接
  if (element.tagName === "A" && element.href.includes("/job_detail/")) return true;
  if (element.querySelector("a[href*='/job_detail/']")) return true;

  const text = normalizeText(element.innerText || "");
  // 排除广告/页脚
  // 岗位特征：薪资数字 + 职位关键词
  const hasSalary = /\d{1,2}[kK]|\d+k-\d+k/.test(text);
  const hasJobWord = /工程师|前端|后端|开发|产品|运营|测试|设计/.test(text);
  return hasSalary || hasJobWord;
}
```

**第二轮**：扫描所有职位详情链接 `<a href="/job_detail/...">`，向上查找最近的容器元素。

两轮结果合并去重，并过滤掉被其他卡片包含的嵌套元素。

#### 4.3.2 信息提取

对每个确认的卡片元素，`extractJobCard()` 用多组 CSS 选择器提取字段：

| 字段 | 选择器示例 | 兜底策略 |
|------|-----------|----------|
| 职位名称 | `.job-name`, `.job-title`, `a[href*='/job_detail/']` | 从文本分词匹配"工程师/前端/后端"等关键词 |
| 公司名称 | `.company-name`, `a[href*='/gongsi/']`, `h3[class*='name']` 等 12 个 | 遍历 `<a>` 链接提取中文文本；纯文本模式匹配 |
| 工作地点 | `.job-area`, `[class*='location']` | 正则提取"XX市/区" |
| 薪资 | `.salary`, `[class*='salary']` | — |
| HR 活跃 | 正则匹配"在线/3日内活跃/本周活跃"等 | `unknown` |

#### 4.3.3 条件筛选

`filterJob(job, config)` 对接配置中的筛选条件：

```typescript
export function filterJob(job: JobCardInfo, config: AssistantConfig): JobFilterResult {
  // 1. 关键词匹配：职位名/公司/原文中包含任一关键词
  // 2. 城市匹配：地点包含任一目标城市
  // 3. HR 活跃匹配：活跃等级 >= 筛选等级
  // 全部通过 → accepted: true
}
```

筛选结果是**独立可解释的**——每个被跳过的岗位都有明确的 `reasons` 数组，如 `"地点不匹配：期望 杭州，实际 北京"`。

---

### 4.4 半自动化投递

#### 4.4.1 整体流程

```
用户点击"开始"
  → 扫描当前页面岗位 → 筛选候选
  → 循环处理每个候选:
      ├─ 防重复检查（本地记录 + 本轮 seenIds）
      ├─ 每日上限检查
      ├─ deliverToJob(): 点击卡片 → 等详情面板 → 点击"立即沟通"
      │    → 处理"离开此页/留在此页"弹窗 → 关闭详情面板
      └─ 记录结果（成功/重复/失败）
  → 当前批次处理完、remaining > 0
      → scrollAndWaitForNewJobs(): 模拟人工逐步翻页
      → 重新扫描 → 继续新批次
  → remaining = 0 或无新岗位 → 结束
```

#### 4.4.2 核心投递动作

`deliverToJob()` 是整个流程中最精密的函数，涉及多个 DOM 交互步骤：

```typescript
async function deliverToJob(item, _config, run) {
  // 1. 滚动卡片到视野
  item.job.element.scrollIntoView({ behavior: "smooth", block: "center" });

  // 2. 点击卡片（阻止 a 标签默认跳转）
  clickJobCard(item);   // 先 addEventListener("click", preventDefault)
  await delay(800);

  // 3. 等待详情面板渲染，轮询检查按钮类型
  const result = await waitForElement(() => {
    const communicated = findVisibleButtonByText(["继续沟通", "已沟通", ...]);
    if (communicated) return { type: "communicated" };
    const communicate = findVisibleButtonByText(["立即沟通"]);
    if (communicate) return { type: "communicate" };
    return null;
  }, 5000);

  // 4. "继续沟通" → 跳过；"立即沟通" → 点击
  if (result.type === "communicated") return "already-communicated";
  result.element.click();

  // 5. 处理"离开此页 / 留在此页"弹窗
  const stayButton = findVisibleButtonByText(["留在此页", "留在当前页"]);
  if (stayButton) stayButton.click();

  // 6. 关闭详情面板
  closeDetailPanel();
  return "sent";
}
```

**关键保护**：

- **防止页面跳转**：`clickJobCard` 在点击前注册 `preventDefault` 监听器，防止 `<a>` 标签导航到新页面
- **按钮轮询而非固定延迟**：`waitForElement` 每 200ms 检查一次，最长等 5 秒，先出现哪种按钮就按哪种处理
- **页面守卫**：每处理完一个岗位检查 `detectBossPage()`，一旦页面跳走就立刻终止
- **暂停支持**：每个 `await delay()` 之后都调用 `waitWhilePaused(run)`，用户暂停时流程挂起

#### 4.4.3 翻页加载

`scrollAndWaitForNewJobs()` 模拟人工逐步滚动，每次下滚 400px 并等待 800ms，触发 BOSS 的懒加载：

```typescript
async function scrollAndWaitForNewJobs() {
  for (let i = 0; i < 15; i++) {
    window.scrollTo({ top: currentBottom + 400, behavior: "smooth" });
    await delay(800);
    if (新卡片出现) return true;
    if (到底且连续 3 次无新) break;
  }
}
```

#### 4.4.4 每日上限

```
remaining = dailyLimit - countTodayApplications()  // 启动时计算
每成功投递 1 次 → remaining -= 1
remaining = 0 → 停止
失败/重复/已沟通 → 不影响 remaining
```

`countTodayApplications()` 从 `chrome.storage.local` 中读取所有记录，按 `appliedAt.toISOString().slice(0, 10)` 过滤当天、`status === "success"` 的条目。

---

### 4.5 防重复机制

三层防重复体系：

**第一层：本地存储**（`applications.ts`）

```typescript
export function createJobKey(job): string {
  const source = job.detailUrl || `${job.title}-${job.company}-${job.location}`;
  return source.trim().toLowerCase();
}
```

以详情链接或"职位名-公司-地点"生成唯一 key，存入 `chrome.storage.local` 的 `bossassistant/applications` 键下。每次投递前查 `hasSuccessfulApplication(job)`。

**第二层：本轮去重**

```typescript
const seenIds = new Set<string>();  // 本轮已处理的 job.id
```

翻页加载后重新扫描可能导致同一岗位再次出现，`seenIds` 确保同一次任务内不重复处理。

**第三层：页面状态识别**

详情面板中如果出现"继续沟通"按钮，说明之前已经和该 HR 沟通过。这类岗位立即补记本地记录并跳过。

---

### 4.6 AI 回复草稿引擎

**核心设计：纯本地、纯规则、零外部依赖。**

不需要调用任何大语言模型 API，不需要联网，不需要 API Key。所有逻辑在浏览器本地执行。

```typescript
export function generateReplyDraft(question, config): ReplyDraft {
  const normalizedQuestion = normalizeQuestion(question);
  const resumeFacts = pickResumeFacts(normalizedQuestion, config);  // 匹配简历
  const category = detectCategory(normalizedQuestion);              // 问题分类
  const draft = buildDraft(normalizedQuestion, category, resumeFacts, config);  // 拼模板
  // ...
}
```

#### 4.6.1 问题分类（detectCategory）

用 6 组正则匹配 HR 问题的意图：

```typescript
const CATEGORY_RULES = [
  { category: "薪资期望", pattern: /薪资|工资|待遇|期望|多少钱|预算|offer/i },
  { category: "到岗时间", pattern: /到岗|入职|什么时候|多久|离职|在职|最快/i },
  { category: "项目经验", pattern: /项目|案例|作品|经验|做过|负责|亮点/i },
  { category: "技术能力", pattern: /技术|框架|Vue|React|TypeScript|JavaScript/i },
  { category: "自我介绍", pattern: /介绍|了解一下|说说你|简单聊|方便聊/i },
  { category: "地点意向", pattern: /地点|城市|通勤|到公司|base|办公/i },
];
// 都不匹配 → "通用问题"
```

#### 4.6.2 简历匹配（pickResumeFacts）

将用户简历资料逐行与 HR 问题做**关键词交叉打分**：

```
HR 问题分词 [薪资, 期望, 范围, 前端]
简历第1行: "张三，3年前端开发经验"        → 匹配"前端"              → 得分 1
简历第2行: "熟悉 Vue、React、TypeScript"  → 匹配"前端"(不相关)       → 得分 0
简历第3行: "期望前端开发岗位，可尽快到岗"   → 匹配"前端"+"期望"        → 得分 2
```

得分最高的前 4 行作为回复素材。

#### 4.6.3 草稿生成（buildDraft）

根据问题类型和回复风格，用模板拼接回复：

```typescript
if (category === "薪资期望") {
  return `${prefix}薪资这块我会结合岗位职责、团队情况和整体 package 综合考虑。${factSentence}如果岗位匹配度比较高，我这边也比较愿意深入沟通。`;
}
if (category === "到岗时间") {
  return `${prefix}${availability}。${ending}`;
}
// ... 每种类型一个模板
```

三个回复风格对应不同语气：
- **专业稳重**：`"您好，"` + 正式结尾
- **自然亲和**：`"您好呀，"` + 轻松结尾
- **简洁直接**：简短结尾，少修饰

#### 4.6.4 聊天页自动触发

使用 `MutationObserver` 监听聊天消息区的 DOM 变化。当检测到消息指纹（前 3 条 HR 消息的文本 hash）发生变化时，自动生成新的草稿：

```typescript
const chatObserver = new MutationObserver(() => {
  const fingerprint = getChatFingerprint();  // 前3条消息前40字符拼接
  if (fingerprint === lastChatFingerprint) return;

  replyDrafts = [];  // 立即清除旧草稿
  lastChatFingerprint = fingerprint;
  renderPanel();

  // 800ms 防抖后重新生成
  setTimeout(async () => {
    const questions = extractAllHrQuestions();
    replyDrafts = questions.map(q => generateReplyDraft(q, config));
  }, 800);
});

chatObserver.observe(document.body, { childList: true, subtree: true });
```

HR 消息识别使用**方向判断**而非文本分析：检查每条消息的 DOM 结构中是否有头像图片、发送者名称，以及 CSS 对齐方向（右对齐 = 用户自己的消息，排除）。

---

### 4.7 可视化控制面板

#### 4.7.1 Shadow DOM 隔离

控制面板使用 Shadow DOM 注入，与 BOSS 页面的样式完全隔离：

```typescript
function ensurePanel() {
  let host = document.getElementById(PANEL_ID);
  if (!host) {
    host = document.createElement("div");
    host.id = PANEL_ID;
    document.body.appendChild(host);
  }
  panelRoot = host.attachShadow({ mode: "open" });
  renderPanel();
}
```

所有 CSS 都写在 `<style>` 标签内嵌在 Shadow DOM 中，不会受 BOSS 页面样式影响，也不会污染 BOSS 的样式。

#### 4.7.2 状态显示

面板实时展示四维统计：

| 统计项 | 职位列表页含义 | 聊天页含义 |
|--------|--------------|-----------|
| processed | 已处理岗位数 | 提取到的问题数 |
| success | 成功投递数 | 生成的草稿数 |
| skipped | 跳过数（重复/不匹配） | — |
| failed | 失败数 | — |

#### 4.7.3 任务状态机

```
idle ──start──▶ running ──pause──▶ paused
  ▲                │       ◀──resume──┘
  │                │ stop
  │                ▼
  └──────────── stopped
                   ▲
error ────stop─────┘
```

状态转换由 `task.ts` 中的 `TaskState` 管理，通过 `chrome.runtime.sendMessage` 同步到 Background 和 Popup。

#### 4.7.4 拖拽支持

面板使用事件委托实现拖拽：

```typescript
root.addEventListener("mousedown", (ev) => {
  if (!target.closest(".head")) return;  // 只在标题栏触发
  // 记录初始位置，切换到 left/top 定位
});
document.addEventListener("mousemove", ...);  // 跟随鼠标
document.addEventListener("mouseup", ...);    // 停止
```

拖拽时约束在视口内，防止面板移出屏幕。面板内容刷新不会影响拖拽能力（事件委托在 Shadow Root 上，不随 innerHTML 重建设置而丢失）。

#### 4.7.5 聊天草稿卡片

聊天页的多草稿展示使用 Flex 布局：

```
┌── .panel (max-height: 100vh-40px) ────┐
│ .head (固定)                            │
├── .body (flex: 1, overflow-y: auto) ──┤
│ stats + actions (固定)                  │
│ ┌── .draft-list (flex: 1, 可滚动) ──┐  │
│ │ #1 薪资期望   [复制] [填入]        │  │
│ │ #2 到岗时间   [复制] [填入]        │  │
│ └───────────────────────────────────┘  │
│ ┌── .logs (max-height: 130px) ──────┐  │
│ │ 日志...                            │  │
│ └───────────────────────────────────┘  │
└────────────────────────────────────────┘
```

---

## 5. 设计决策与权衡

### ADR-0001：浏览器扩展而非桌面应用

BOSS 直聘的核心交互发生在网页端——读取 DOM、模拟点击、注入 UI。浏览器扩展是唯一能直接操作页面 DOM 的形态。桌面应用（如 Electron）需要额外维护 WebView 和登录态同步，MVP 阶段得不偿失。

### ADR-0002：本地存储，不做云端同步

`chrome.storage.local` 零配置、零延迟、隐私友好。课程展示和个人使用场景下，跨设备同步不是刚需。后续可通过导出/导入 JSON 文件实现简单迁移。

### ADR-0003：AI 草稿，不自动发送

自动发送的风险远大于收益——薪资、到岗等敏感话题一句话说错可能失去机会。MVP 把发送权完全交给用户，工具只做建议。

### ADR-0004：不绕过平台风控

这是最重要的边界。遇到验证码就停、频率过高就减速、不隐藏自动化痕迹。工具的目的是提效，不是破坏平台规则。

### 其他关键权衡

| 决策 | 选择了 | 放弃了 | 理由 |
|------|--------|--------|------|
| 岗位识别 | CSS 选择器 + 正则兜底 | 机器学习/视觉识别 | 够用、快、不依赖外部服务 |
| 回复生成 | 本地规则引擎 | 真实 LLM API | 零成本、零延迟、零隐私风险 |
| 翻页加载 | 逐步滚动 400px/次 | 一步跳到底部 | 触发 BOSS 的懒加载需要滚动事件 |
| 消息去重 | DOM 容器 + 文本包含检测 | 简单的文本截断比较 | 同一消息可能被多个嵌套元素包含 |

---

## 6. 已知限制与未来展望

### 当前限制

1. **DOM 选择器脆弱**：BOSS 页面改版会导致提取失效，需要维护选择器适配层
2. **无真实 AI 能力**：回复草稿基于模板拼接，无法处理复杂/开放式问题
3. **单平台**：仅支持 BOSS 直聘，不支持拉勾、猎聘等
4. **无导出分析**：投递数据无法汇总统计和可视化

### 未来方向

- **接入 LLM API**：在用户授权下，将简历和问题发送到 LLM 生成更自然的回复
- **投递数据分析**：统计投递转化率、HR 回复率、各城市/关键词效果对比
- **多平台适配**：抽象页面检测和岗位提取为适配器模式，支持更多招聘网站
- **配置文件云端同步**：通过 GitHub Gist 或 WebDAV 实现跨设备配置同步
- **自动更新选择器**：通过社区维护或定时爬取检测 DOM 变化

---

> 项目源码、完整文档和测试清单请参见仓库。欢迎 Star、Issue 和 PR。
