import { countTodayApplications, hasSuccessfulApplication, saveJobApplication } from "../shared/applications";
import { generateReplyDraft, type ReplyDraft } from "../shared/aiReply";
import {
  HR_ACTIVE_OPTIONS,
  REPLY_TONE_OPTIONS,
  splitCities,
  splitIntroLines,
  splitKeywords,
  splitResumeLines,
  validateConfig,
  validateReplyConfig,
  type AssistantConfig
} from "../shared/config";
import { scanVisibleJobs, type JobScanSummary, type ScannedJob } from "../shared/jobs";
import { MESSAGE_TYPES, type ExtensionMessage } from "../shared/messages";
import { detectBossPage } from "../shared/page";
import { nowBeijingTimestamp } from "../shared/time";
import {
  DEFAULT_TASK_STATE,
  appendLog,
  createLog,
  getTaskStatusLabel,
  type TaskCommand,
  type TaskState
} from "../shared/task";
import { copyText, delay, escapeHtml, findVisibleButtonByText, isVisible, normalizeText, waitForElement } from "./dom";
import { buildInitialResults, buildScanLogs, createDeliveryViewItem, renderResultItem, type DeliveryViewItem } from "./deliveryView";
import {
  COMMUNICATED_BUTTON_TEXTS,
  COMMUNICATE_BUTTON_TEXTS,
  DETAIL_SCOPE_SELECTORS,
  JOB_CARD_SCOPE_SELECTOR,
  STAY_ON_PAGE_BUTTON_TEXTS
} from "./selectors";

const PANEL_ID = "bossassistant-panel-host";
const DETAIL_WAIT_MS = 1800;
const INPUT_WAIT_MS = 2200;
const MESSAGE_INTERVAL_MS = 850;

type RunControl = {
  id: string;
  paused: boolean;
  stopRequested: boolean;
};


type CommunicationAction =
  | { type: "already-communicated"; element: HTMLElement }
  | { type: "communicate"; element: HTMLElement };


type QuotaReminderDialog = {
  button: HTMLElement;
  text: string;
};
type PostCommunicateOutcome =
  | { type: "stay-on-page"; element: HTMLElement }
  | { type: "already-communicated" }
  | { type: "chat-page" }
  | { type: "jobs-page" };

let currentPageStatus = detectBossPage(window.location.href);
let taskState: TaskState = {
  ...DEFAULT_TASK_STATE,
  stats: { ...DEFAULT_TASK_STATE.stats },
  logs: [createLog("info", "控制面板已就绪")],
  updatedAt: nowBeijingTimestamp()
};
let configSnapshot: AssistantConfig | null = null;
let latestScan: JobScanSummary | null = null;
let deliveryResults: DeliveryViewItem[] = [];
let replyDrafts: ReplyDraft[] = [];
let activeRun: RunControl | null = null;
let deliveryNavigationInProgress = false;
let panelRoot: ShadowRoot | null = null;
let panelDragInitialized = false;

function sendRuntimeMessage<T>(message: ExtensionMessage): Promise<T> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => resolve(response as T));
  });
}


function publishPageStatus() {
  currentPageStatus = detectBossPage(window.location.href);
  chrome.runtime.sendMessage({ type: MESSAGE_TYPES.PAGE_STATUS_CHANGED, payload: currentPageStatus });

  if (currentPageStatus.supported) {
    ensurePanel();
  } else {
    removePanel();
  }
}

async function refreshConfig() {
  configSnapshot = await sendRuntimeMessage<AssistantConfig>({ type: MESSAGE_TYPES.GET_CONFIG });
  renderPanel();
}

function publishTaskState() {
  chrome.runtime.sendMessage({ type: MESSAGE_TYPES.TASK_STATE_CHANGED, payload: taskState });
}

function setTaskState(nextState: TaskState) {
  taskState = nextState;
  renderPanel();
  publishTaskState();
}

function updateTask(patch: Partial<TaskState>) {
  setTaskState({
    ...taskState,
    ...patch,
    stats: patch.stats ?? taskState.stats,
    logs: patch.logs ?? taskState.logs,
    updatedAt: nowBeijingTimestamp()
  });
}

function addLog(level: Parameters<typeof createLog>[0], message: string) {
  setTaskState(appendLog(taskState, createLog(level, message)));
}

function logAndSet(status: TaskState["status"], level: Parameters<typeof createLog>[0], message: string) {
  setTaskState(appendLog({ ...taskState, status }, createLog(level, message)));
}


function setDeliveryResult(item: ScannedJob, status: DeliveryViewItem["status"], reason: string) {
  deliveryResults = [createDeliveryViewItem(item, status, reason), ...deliveryResults].slice(0, 12);
  renderPanel();
}


async function handleTaskCommand(command: TaskCommand): Promise<{ ok: boolean; error?: string }> {
  if (!currentPageStatus.supported) {
    logAndSet("error", "error", "当前页面不支持控制面板操作");
    return { ok: false, error: "当前页面不支持控制面板操作" };
  }

  if (command === "start") {
    if (activeRun && !activeRun.stopRequested) {
      return { ok: false, error: "任务正在运行" };
    }

    const config = await sendRuntimeMessage<AssistantConfig>({ type: MESSAGE_TYPES.GET_CONFIG });
    configSnapshot = config;

    if (currentPageStatus.kind === "chat") {
      return handleGenerateReplyDraft(config);
    }

    const errors = validateConfig(config);
    if (errors.length > 0) {
      logAndSet("error", "error", errors[0]);
      return { ok: false, error: errors[0] };
    }

    if (currentPageStatus.kind !== "jobs") {
      logAndSet("error", "error", "请进入职位列表页后再开始投递");
      return { ok: false, error: "请进入职位列表页后再开始投递" };
    }

    latestScan = scanVisibleJobs(document, config);
    deliveryResults = latestScan ? buildInitialResults(latestScan) : [];
    replyDrafts = [];

    if (latestScan.processed === 0) {
      setTaskState({
        status: "error",
        stats: { processed: 0, success: 0, skipped: 0, failed: 0 },
        logs: [createLog("error", "未识别到职位卡片，请确认职位列表已加载"), createLog("info", "可尝试滚动页面加载更多岗位后再次开始")],
        updatedAt: nowBeijingTimestamp()
      });
      return { ok: false, error: "未识别到职位卡片" };
    }

    const run: RunControl = { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, paused: false, stopRequested: false };
    activeRun = run;

    setTaskState({
      status: "running",
      stats: { processed: 0, success: 0, skipped: latestScan.skipped, failed: latestScan.failed },
      logs: buildScanLogs(latestScan),
      updatedAt: nowBeijingTimestamp()
    });

    void runDelivery(config, latestScan, run);
    return { ok: true };
  }

  if (command === "pause") {
    if (!activeRun || taskState.status !== "running") {
      logAndSet(taskState.status, "warning", "当前没有正在运行的任务");
      return { ok: false, error: "当前没有正在运行的任务" };
    }

    activeRun.paused = true;
    logAndSet("paused", "info", "任务已暂停");
    return { ok: true };
  }

  if (command === "resume") {
    if (!activeRun || taskState.status !== "paused") {
      logAndSet(taskState.status, "warning", "只有暂停中的任务可以继续");
      return { ok: false, error: "只有暂停中的任务可以继续" };
    }

    activeRun.paused = false;
    logAndSet("running", "success", "任务已继续");
    return { ok: true };
  }

  if (command === "stop") {
    if (!activeRun && taskState.status !== "error") {
      logAndSet(taskState.status, "warning", "当前没有需要停止的任务");
      return { ok: false, error: "当前没有需要停止的任务" };
    }

    if (activeRun) {
      activeRun.stopRequested = true;
      activeRun.paused = false;
    }
    logAndSet("stopped", "info", "任务已停止");
    return { ok: true };
  }

  return { ok: false, error: "未知命令" };
}

async function handleGenerateReplyDraft(config: AssistantConfig): Promise<{ ok: boolean; error?: string }> {
  const errors = validateReplyConfig(config);
  if (errors.length > 0) {
    logAndSet("error", "error", errors[0]);
    return { ok: false, error: errors[0] };
  }

  const questions = extractAllHrQuestions();
  if (questions.length === 0) {
    replyDrafts = [];
    logAndSet("error", "error", "未识别到 HR 消息，已清除旧草稿");
    return { ok: false, error: "未识别到 HR 消息" };
  }

  replyDrafts = questions.map((question) => generateReplyDraft(question, config));
  deliveryResults = [];
  setTaskState({
    status: "stopped",
    stats: { processed: questions.length, success: replyDrafts.length, skipped: 0, failed: 0 },
    logs: [
      createLog("success", `已为 ${replyDrafts.length} 条消息生成回复草稿`),
      createLog("info", "草稿不会自动发送，请逐条确认后复制、填入或发送")
    ],
    updatedAt: nowBeijingTimestamp()
  });
  return { ok: true };
}

async function scrollAndWaitForNewJobs(_currentCount: number): Promise<boolean> {
  const cardSelector = ".job-card-wrapper, .job-card-box, .job-card-body, .job-primary, li[class*='job-card'], div[class*='job-card']";
  const beforeCount = document.querySelectorAll<HTMLElement>(cardSelector).length;

  // 模拟人工逐步滚动，触发 BOSS 的懒加载
  const scrollStep = 400;
  const maxScrolls = 15;
  let noNewCount = 0;

  for (let i = 0; i < maxScrolls; i++) {
    const currentBottom = window.scrollY + window.innerHeight;
    const target = Math.min(currentBottom + scrollStep, document.body.scrollHeight);

    window.scrollTo({ top: target - window.innerHeight, behavior: "smooth" });
    await delay(800);

    const nowCount = document.querySelectorAll<HTMLElement>(cardSelector).length;
    if (nowCount > beforeCount) {
      // 有新卡片了，等渲染稳定
      await delay(600);
      return true;
    }

    if (currentBottom >= document.body.scrollHeight - 100) {
      noNewCount++;
      if (noNewCount >= 3) break;
    }
  }

  return document.querySelectorAll<HTMLElement>(cardSelector).length > beforeCount;
}

async function runDelivery(config: AssistantConfig, initialScan: JobScanSummary, run: RunControl) {
  let todayCount = await countTodayApplications();
  let remaining = Math.max(0, config.dailyLimit - todayCount);

  if (remaining <= 0) {
    addLog("warning", `今日新增投递已达上限 ${config.dailyLimit} 个`);
    updateTask({ status: "stopped" });
    activeRun = null;
    return;
  }

  addLog("info", `今日新增投递 ${todayCount} 个，最多再投 ${remaining} 个`);

  const seenIds = new Set<string>();
  let currentScan: JobScanSummary | null = initialScan;

  while (remaining > 0 && !run.stopRequested) {
    if (!currentScan) break;

    // 当前批次中尚未处理的候选
    const batch = currentScan.jobs.filter(
      (item) => item.filter.accepted && !seenIds.has(item.job.id)
    );

    if (batch.length === 0) {
      // 当前批次无新候选，尝试翻页加载
      const loaded = await scrollAndWaitForNewJobs(seenIds.size);
      if (!loaded) {
        addLog("info", "未发现新的岗位，投递结束");
        break;
      }
      currentScan = scanVisibleJobs(document, config);
      continue;
    }

    for (const item of batch) {
      seenIds.add(item.job.id);

      if (run.stopRequested) {
        addLog("warning", "任务已按用户要求停止");
        break;
      }

      await waitWhilePaused(run);

      if (run.stopRequested) break;

      if (remaining <= 0) {
        addLog("warning", `已达到每日上限 ${config.dailyLimit} 个`);
        break;
      }

      if (await hasSuccessfulApplication(item.job)) {
        updateTask({ stats: { ...taskState.stats, processed: taskState.stats.processed + 1, skipped: taskState.stats.skipped + 1 } });
        setDeliveryResult(item, "重复", "本地记录显示已成功投递，自动跳过");
        addLog("warning", `重复跳过：${item.job.title} · ${item.job.company}`);
        continue;
      }

      try {
        addLog("info", `开始处理：${item.job.title} · ${item.job.company}`);
        const outcome = await deliverToJob(item, config, run);

        if (outcome === "already-communicated") {
          await saveJobApplication(item.job, "communicated", "页面显示已沟通，补记为已沟通");
          updateTask({ stats: { ...taskState.stats, processed: taskState.stats.processed + 1, skipped: taskState.stats.skipped + 1 } });
          setDeliveryResult(item, "重复", "页面显示已沟通，已补记为已沟通");
          addLog("warning", `已沟通跳过：${item.job.title} · ${item.job.company}`);
          continue;
        }

        await saveJobApplication(item.job, "success", "已发送沟通请求");
        todayCount += 1;
        remaining -= 1;
        updateTask({ stats: { ...taskState.stats, processed: taskState.stats.processed + 1, success: taskState.stats.success + 1 } });
        setDeliveryResult(item, "已投递", "已发送沟通请求");
        addLog("success", `沟通请求已发送：${item.job.title} · ${item.job.company}`);
      } catch (error) {
        const reason = error instanceof Error ? error.message : "未知错误";
        await saveJobApplication(item.job, "failed", reason);
        updateTask({ stats: { ...taskState.stats, processed: taskState.stats.processed + 1, failed: taskState.stats.failed + 1 } });
        setDeliveryResult(item, "失败", reason);
        addLog("error", `处理失败：${item.job.title} · ${reason}`);
      }

      await delay(MESSAGE_INTERVAL_MS);

      // 防止误点击导致页面跳走：如果不再在职位列表页，立刻终止
      const currentPage = detectBossPage(window.location.href);
      if (currentPage.kind !== "jobs") {
        addLog("error", "页面已离开职位列表，任务终止");
        run.stopRequested = true;
        break;
      }
    }

    // 当前批次处理完，如果还没到上限且没被停止，翻页加载更多
    if (remaining > 0 && !run.stopRequested) {
      const loaded = await scrollAndWaitForNewJobs(seenIds.size);
      if (!loaded) {
        addLog("info", "未发现新的岗位，投递结束");
        break;
      }
      currentScan = scanVisibleJobs(document, config);
    }
  }

  if (activeRun?.id === run.id) {
    activeRun = null;
  }

  if (taskState.status === "running" || taskState.status === "paused") {
    updateTask({ status: "stopped" });
    addLog("info", "投递结束");
  }
}

async function deliverToJob(item: ScannedJob, _config: AssistantConfig, run: RunControl): Promise<"sent" | "already-communicated"> {
  item.job.element.scrollIntoView({ behavior: "smooth", block: "center" });
  await delay(600);
  await waitWhilePaused(run);

  clickJobCard(item);
  await delay(800);
  await waitWhilePaused(run);

  const action = await waitForCommunicationAction(item);
  if (!action) {
    throw new Error("详情面板未找到沟通按钮");
  }

  if (action.type === "already-communicated") {
    closeDetailPanel();
    await delay(500);
    return "already-communicated";
  }

  deliveryNavigationInProgress = true;
  try {
    action.element.click();
    await settleAfterCommunicateClick(item, run);
  } finally {
    deliveryNavigationInProgress = false;
  }

  closeDetailPanel();
  await delay(500);

  return "sent";
}

async function waitForCommunicationAction(item: ScannedJob): Promise<CommunicationAction | null> {
  return waitForElement(() => readCommunicationAction(item), 5000);
}

function readCommunicationAction(item?: ScannedJob): CommunicationAction | null {
  const scope = item ? findJobDetailScope(item) : null;
  const root = scope ?? document;
  const ignoreListButton = scope ? undefined : isInsideJobCard;
  const communicated = findVisibleButtonByText(COMMUNICATED_BUTTON_TEXTS, root, ignoreListButton);
  if (communicated) {
    return { type: "already-communicated", element: communicated };
  }

  const communicate = findVisibleButtonByText(COMMUNICATE_BUTTON_TEXTS, root, ignoreListButton);
  if (communicate) {
    return { type: "communicate", element: communicate };
  }

  return null;
}

function findJobDetailScope(item: ScannedJob): HTMLElement | null {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(DETAIL_SCOPE_SELECTORS.join(",")))
    .filter((element) => isVisible(element) && !item.job.element.contains(element));

  let best: { element: HTMLElement; score: number; area: number } | null = null;

  for (const element of candidates) {
    const rect = element.getBoundingClientRect();
    if (rect.width < 260 || rect.height < 160) continue;

    const text = normalizeText(element.innerText || element.textContent || "");
    const hasAction = Boolean(findVisibleButtonByText([...COMMUNICATED_BUTTON_TEXTS, ...COMMUNICATE_BUTTON_TEXTS], element));
    const titleMatched = item.job.title && text.includes(item.job.title);
    const companyMatched = item.job.company && text.includes(item.job.company);
    const score = (hasAction ? 4 : 0) + (titleMatched ? 2 : 0) + (companyMatched ? 1 : 0) + (rect.left > window.innerWidth * 0.35 ? 1 : 0);

    if (score < 4) continue;

    const area = rect.width * rect.height;
    if (!best || score > best.score || (score === best.score && area < best.area)) {
      best = { element, score, area };
    }
  }

  return best?.element ?? null;
}

async function settleAfterCommunicateClick(item: ScannedJob, run: RunControl): Promise<void> {
  const outcome = await waitForPostCommunicateOutcome(item, run);

  if (outcome.type === "stay-on-page") {
    outcome.element.click();
    await delay(800);
    await waitWhilePaused(run);
    addLog("info", `已发送沟通请求：${item.job.title} · ${item.job.company}`);
  } else if (outcome.type === "already-communicated") {
    addLog("info", `页面已进入继续沟通状态：${item.job.title} · ${item.job.company}`);
  } else if (outcome.type === "chat-page") {
    await returnToJobsPageAfterCommunicate(run);
  } else {
    addLog("info", `已点击立即沟通：${item.job.title} · ${item.job.company}`);
  }

  const finalPage = detectBossPage(window.location.href);
  if (finalPage.kind !== "jobs") {
    throw new Error("点击沟通后页面未停留在职位列表");
  }
}

function findQuotaReminderDialog(): QuotaReminderDialog | null {
  const buttons = Array.from(document.querySelectorAll<HTMLElement>("button,a,[role='button'],.btn,.boss-btn,[class*='btn']"));

  for (const button of buttons) {
    const buttonText = normalizeText(button.innerText || button.textContent || "");
    if (!isVisible(button) || buttonText !== "好") continue;

    let scope: HTMLElement | null = button;
    for (let depth = 0; scope && depth < 8; depth++) {
      const text = normalizeText(scope.innerText || scope.textContent || "");
      const isQuotaReminder = /今天已与\d+位BOSS沟通/.test(text) && /还剩\d+次沟通机会/.test(text);
      if (isQuotaReminder) {
        return { button, text };
      }
      scope = scope.parentElement;
    }
  }

  return null;
}

async function dismissQuotaReminderIfPresent(): Promise<boolean> {
  const dialog = findQuotaReminderDialog();
  if (!dialog) {
    return false;
  }

  const used = dialog.text.match(/今天已与(\d+)位BOSS沟通/)?.[1];
  const remaining = dialog.text.match(/还剩(\d+)次沟通机会/)?.[1];
  dialog.button.click();
  await delay(600);
  addLog("warning", `BOSS 沟通次数提醒已确认${used && remaining ? `：已沟通 ${used} 位，还剩 ${remaining} 次` : ""}`);
  return true;
}
async function waitForPostCommunicateOutcome(item: ScannedJob, run: RunControl): Promise<PostCommunicateOutcome> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 6000) {
    await waitWhilePaused(run);

    if (await dismissQuotaReminderIfPresent()) {
      continue;
    }

    const currentPage = detectBossPage(window.location.href);
    if (currentPage.kind === "chat") {
      return { type: "chat-page" };
    }
    if (currentPage.kind !== "jobs") {
      throw new Error("点击沟通后页面离开职位列表");
    }

    const stayButton = findVisibleButtonByText(STAY_ON_PAGE_BUTTON_TEXTS);
    if (stayButton) {
      return { type: "stay-on-page", element: stayButton };
    }

    if (readCommunicationAction(item)?.type === "already-communicated") {
      return { type: "already-communicated" };
    }

    await delay(250);
  }

  return { type: "jobs-page" };
}

async function returnToJobsPageAfterCommunicate(run: RunControl): Promise<void> {
  addLog("warning", "已进入沟通页，正在返回职位列表继续投递");
  window.history.back();

  const restored = await waitForElement(() => {
    return detectBossPage(window.location.href).kind === "jobs" ? document.body : null;
  }, 6000);

  await waitWhilePaused(run);

  if (!restored) {
    throw new Error("点击沟通后进入沟通页，且无法自动返回职位列表");
  }

  publishPageStatus();
  await delay(800);
}

async function fillAndSendMessage(text: string) {
  const input = await waitForElement(findMessageInput, 4500);
  if (!input) {
    throw new Error("未找到聊天输入框");
  }

  fillMessageInput(input, text);
  await delay(220);

  const sendButton = findVisibleButtonByText(["发送"]);
  if (!sendButton) {
    throw new Error("未找到发送按钮");
  }

  sendButton.click();
  await delay(800);

  // 验证消息是否真的发出：用同一个输入框引用检查，而不是重新查找
  const currentValue = input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement
    ? input.value
    : input.textContent ?? "";
  const trimmed = (currentValue || "").trim();
  if (trimmed.length > 0 && trimmed === text.trim()) {
    throw new Error("消息未成功发送，输入框内容仍在");
  }
}

async function handleReplyAction(action: string | undefined, draftIndex: number) {
  const draft = replyDrafts[draftIndex];
  if (!draft) {
    addLog("warning", "请先生成回复草稿");
    return;
  }

  if (action === "copy") {
    await copyText(draft.draft);
    addLog("success", `已复制草稿 #${draftIndex + 1}`);
    return;
  }

  if (action === "fill") {
    const input = findMessageInput();
    if (!input) {
      addLog("error", "未找到聊天输入框");
      return;
    }

    fillMessageInput(input, draft.draft);
    addLog("success", `已填入草稿 #${draftIndex + 1}`);
  }
}

function clickJobCard(item: ScannedJob) {
  const link = item.job.element.querySelector<HTMLAnchorElement>("a[href*='/job_detail/']");
  const target = link ?? item.job.element;

  // 阻止页面跳转：BOSS 正常情况用 JS 拦截点击出侧边栏，兜底阻止 a 标签的默认导航
  const preventer = (e: Event) => e.preventDefault();
  target.addEventListener("click", preventer, { once: true });

  target.click();
}

function findChatMessageArea(): HTMLElement | null {
  // 聊天消息区候选容器：找 DOM 中消息元素最密集的区域
  const candidates = [
    "[class*='message-list']",
    "[class*='chat-list']",
    "[class*='msg-list']",
    "[class*='conversation']",
    "[class*='chat-content']",
    "[class*='chat-main']",
    "[class*='dialog'] [class*='body']"
  ];

  let best: HTMLElement | null = null;
  let bestCount = 0;

  for (const selector of candidates) {
    const containers = document.querySelectorAll<HTMLElement>(selector);
    for (const container of containers) {
      if (!isVisible(container)) continue;
      const msgElements = container.querySelectorAll<HTMLElement>(
        ".message-content, .chat-message, .message-text, .bubble, .msg-content, [class*='message-item'], [class*='msg-item']"
      );
      const count = Array.from(msgElements).filter(isVisible).length;
      if (count > bestCount) {
        bestCount = count;
        best = container;
      }
    }
  }

  return best;
}

function looksLikeHrMessage(element: HTMLElement): boolean {
  // 系统消息特征：居中、无头像、无发送者名称
  const style = window.getComputedStyle(element);
  const isCentered =
    style.textAlign === "center" ||
    style.marginLeft === "auto" && style.marginRight === "auto" ||
    element.className.includes("system") ||
    element.className.includes("notice") ||
    element.className.includes("tips");

  const hasAvatar = Boolean(element.querySelector("img, [class*='avatar']"));
  // 检查发送者名称，排除平台账号
  const senderEl = element.querySelector("[class*='name'], [class*='sender'], [class*='nickname']");
  const senderText = normalizeText(senderEl?.textContent || "");
  const isPlatformSender = /BOSS直聘|助手|系统|通知|客服|安全|小秘书|管理员/.test(senderText);
  const hasSenderName = Boolean(senderEl) && !isPlatformSender;

  // 系统消息：居中 + 无头像 + 无名称 → 跳过
  if (isCentered && !hasAvatar && !hasSenderName) return false;

  // 右对齐 → 用户自己的消息 → 跳过
  const parent = element.parentElement;
  const parentStyle = parent ? window.getComputedStyle(parent) : null;

  const isRightAligned =
    style.textAlign === "right" ||
    style.textAlign === "end" ||
    style.justifyContent === "flex-end" ||
    style.alignSelf === "flex-end" ||
    (parentStyle?.justifyContent === "flex-end") ||
    (parentStyle?.textAlign === "right");

  if (isRightAligned) return false;

  // 必须有头像或发送者名称才认定为 HR 消息，去掉宽松兜底
  return hasAvatar || hasSenderName;
}

function extractAllHrQuestions(): string[] {
  const chatArea = findChatMessageArea();
  if (!chatArea) return [];

  // 先找消息容器（每条消息一个），再从中提取文本，避免嵌套重复
  const containerSelectors = "[class*='message-item'], [class*='msg-item'], li.message, .chat-message";
  const allContainers = Array.from(chatArea.querySelectorAll<HTMLElement>(containerSelectors));
  // 过滤嵌套：只保留最内层（不包含其他匹配容器的），这样列表容器被排除
  const containers = allContainers.filter((el) =>
    !allContainers.some((other) => other !== el && el.contains(other))
  );

  const texts: string[] = [];

  containers.forEach((container) => {
    if (!isVisible(container)) return;

    // 排除聊天输入区及其周边 UI 组件
    if (
      container.closest("textarea, input, [contenteditable='true'], .chat-input, .input-area, .chat-footer, .chat-toolbar, [class*='input-area'], [class*='chat-footer'], [class*='editor'], [class*='toolbar']")
    ) return;

    if (!looksLikeHrMessage(container)) return;

    const text = normalizeText(container.innerText || container.textContent || "");
    if (text.length < 6 || text.length > 600) return;

    // 过滤聊天输入区的 UI 提示文字
    if (
      /^(按Enter|按Ctrl|发送简历|换电话|换微信|发简历|发图片|常用语|表情|发送|请输入|输入消息)/.test(text.trim())
    ) return;
    if (
      /发简历|换电话|换微信/.test(text) && text.length < 30
    ) return;

    // 过滤系统消息、平台通知
    if (
      /^(今天|昨天|\d{1,2}:\d{2}|系统消息|以上为打招呼|打招呼内容|表情)$/.test(text.trim())
    ) return;
    if (
      /竞争者PK|共\d+人投递|超过竞争者|优秀竞争者|查看详细分析|已读|对方正在输入|消息已发出|BOSS直聘小助手|安全提示|系统通知|温馨提示/.test(text)
    ) return;
    // 平台自动消息
    if (/BOSS直聘/.test(text) && text.length < 40) return;
    // 简历附件、文件上传等系统提示
    if (/\.pdf|\.doc|\.docx|点击预览|附件简历|附件作品|上传.*简历|简历.*上传|已发送简历|对方已收到|简历已|投递成功|交换微信|交换电话|已向.*发送|已发出/.test(text)) return;
    // 系统状态标签（短文本）
    if (/^(已投递|已沟通|已读|已发送|已送达|已接收|沟通中)$/.test(text.trim())) return;

    // 去重：检查是否已被已有文本覆盖（包含关系即判重）
    const isDup = texts.some((existing) => {
      const shorter = existing.length < text.length ? existing : text;
      const longer = existing.length < text.length ? text : existing;
      return longer.includes(shorter) && shorter.length / longer.length > 0.6;
    });
    if (isDup) return;

    texts.push(text);
  });

  return texts;
}


function isInsideJobCard(element: HTMLElement): boolean {
  return Boolean(element.closest(JOB_CARD_SCOPE_SELECTOR));
}

function closeDetailPanel() {
  // 尝试多种关闭详情面板的方式
  const closeSelectors = [
    ".dialog-close",
    ".job-detail-close",
    ".detail-close",
    ".panel-close",
    ".close-btn",
    "[class*='close']",
    "svg[class*='close']",
    ".boss-icon-close"
  ];

  for (const selector of closeSelectors) {
    const btn = document.querySelector<HTMLElement>(selector);
    if (btn && isVisible(btn)) {
      btn.click();
      return;
    }
  }

  // 备用方案：查找包含 X 或 关闭 文字的按钮
  const closeByText = findVisibleButtonByText(["关闭", "×", "✕"]);
  if (closeByText) {
    closeByText.click();
  }
}

function findMessageInput(): HTMLElement | null {
  const selectors = [
    "textarea",
    "[contenteditable='true']",
    ".chat-input textarea",
    ".input-area textarea",
    ".chat-editor",
    "[class*='input'][contenteditable='true']",
    "[class*='editor'][contenteditable='true']"
  ];

  for (const selector of selectors) {
    const elements = Array.from(document.querySelectorAll<HTMLElement>(selector)).filter(isVisible);
    const target = elements.at(-1);
    if (target) {
      return target;
    }
  }

  return null;
}

function fillMessageInput(input: HTMLElement, text: string) {
  input.focus();

  if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
    input.value = text;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }

  input.textContent = text;
  input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
}

function findMessageInChat(text: string): boolean {
  const chatSelectors = [
    ".message-content",
    ".chat-message",
    ".message-text",
    ".im-text",
    "[class*='message-body']",
    "[class*='chat-msg']",
    "[class*='msg-content']"
  ];

  const searchText = text.slice(0, 20).trim();
  if (!searchText) return false;

  for (const selector of chatSelectors) {
    const elements = document.querySelectorAll(selector);
    for (const el of elements) {
      if (el.textContent?.includes(searchText)) {
        return true;
      }
    }
  }

  return false;
}


async function waitWhilePaused(run: RunControl) {
  while (run.paused && !run.stopRequested) {
    await delay(300);
  }
}


function initPanelDrag(root: ShadowRoot) {
  panelDragInitialized = true;

  let dragging = false;
  let startX = 0;
  let startY = 0;
  let panelLeft = 0;
  let panelTop = 0;
  let panel: HTMLElement | null = null;

  // 事件委托：在 shadow root 上监听 mousedown，判断是否点在标题栏
  root.addEventListener("mousedown", (ev) => {
    const e = ev as MouseEvent;
    const target = e.target as HTMLElement;
    if (!target.closest(".head")) return;

    panel = root.querySelector<HTMLElement>(".panel");
    if (!panel) return;

    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    const rect = panel.getBoundingClientRect();
    panelLeft = rect.left;
    panelTop = rect.top;
    panel.style.right = "auto";
    panel.style.bottom = "auto";
    panel.style.left = `${panelLeft}px`;
    panel.style.top = `${panelTop}px`;
    e.preventDefault();
  });

  document.addEventListener("mousemove", (ev) => {
    const e = ev as MouseEvent;
    if (!dragging || !panel) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    let left = panelLeft + dx;
    let top = panelTop + dy;
    left = Math.max(0, Math.min(left, window.innerWidth - panel.offsetWidth));
    top = Math.max(0, Math.min(top, window.innerHeight - 40));
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  });

  document.addEventListener("mouseup", () => {
    dragging = false;
  });
}

function ensurePanel() {
  if (panelRoot) {
    renderPanel();
    return;
  }

  const host = document.createElement("div");
  host.id = PANEL_ID;
  panelRoot = host.attachShadow({ mode: "open" });
  document.documentElement.appendChild(host);
  renderPanel();
  void refreshConfig();
  publishTaskState();
}

function removePanel() {
  document.getElementById(PANEL_ID)?.remove();
  panelRoot = null;
}

function getConfigSummary(): string {
  if (!configSnapshot) {
    return "正在读取配置";
  }

  if (currentPageStatus.kind === "chat") {
    const resumeCount = splitResumeLines(configSnapshot.resumeText).length;
    const toneLabel = REPLY_TONE_OPTIONS.find((option) => option.value === configSnapshot?.replyTone)?.label ?? "专业稳重";
    return `${resumeCount} 条简历资料 · ${toneLabel}`;
  }

  const introCount = splitIntroLines(configSnapshot.introText).length;
  const keywordCount = splitKeywords(configSnapshot.keywords).length;
  const activeLabel = HR_ACTIVE_OPTIONS.find((option) => option.value === configSnapshot?.hrActiveFilter)?.label ?? "未设置";
  return `${introCount} 句介绍 · ${keywordCount} 个关键词 · ${splitCities(configSnapshot.cities).join("、") || "未设置城市"} · ${activeLabel}`;
}


function renderReplyDraft(): string {
  if (replyDrafts.length === 0) {
    return '<p class="empty-results">点击生成后，会根据 HR 所有消息逐一生成回复草稿</p>';
  }

  const items = replyDrafts
    .map(
      (draft, index) => `
    <div class="draft-box">
      <div class="draft-header">
        <span class="draft-index">#${index + 1}</span>
        <span class="draft-category">${escapeHtml(draft.category)}</span>
      </div>
      <p class="question"><strong>HR：</strong>${escapeHtml(draft.question)}</p>
      <p class="draft">${escapeHtml(draft.draft)}</p>
      <div class="reply-actions">
        <button data-reply-action="copy" data-draft-index="${index}">复制</button>
        <button data-reply-action="fill" data-draft-index="${index}">填入</button>
      </div>
    </div>
  `
    )
    .join("");

  return `<div class="draft-list">${items}</div>`;
}

function renderResults(): string {
  if (currentPageStatus.kind === "chat") {
    return renderReplyDraft();
  }

  if (deliveryResults.length === 0) {
    return '<p class="empty-results">点击开始后扫描并处理当前已加载岗位</p>';
  }

  return `<ul class="results">${deliveryResults.slice(0, 8).map(renderResultItem).join("")}</ul>`;
}

function renderPanel() {
  if (!panelRoot) {
    return;
  }

  const isChat = currentPageStatus.kind === "chat";
  const canStart = taskState.status !== "running" && taskState.status !== "paused";
  const canPause = !isChat && taskState.status === "running";
  const canResume = !isChat && taskState.status === "paused";
  const canStop = !isChat && (taskState.status === "running" || taskState.status === "paused" || taskState.status === "error");
  const logs = taskState.logs.length === 0 ? '<li class="empty-log">暂无日志</li>' : taskState.logs
    .map((log) => `<li class="log-${log.level}"><span>${escapeHtml(log.time)}</span>${escapeHtml(log.message)}</li>`)
    .join("");

  panelRoot.innerHTML = `
    <style>
      :host { all: initial; }
      .panel { position: fixed; right: 18px; bottom: 18px; z-index: 2147483647; width: 370px; max-height: calc(100vh - 40px); box-sizing: border-box; display: flex; flex-direction: column; border: 1px solid #d7ded9; border-radius: 8px; background: #fbfcfa; box-shadow: 0 18px 40px rgba(17, 24, 21, 0.18); color: #18201f; font-family: Inter, "PingFang SC", "Microsoft YaHei", system-ui, sans-serif; }
      .head { flex: 0 0 auto; display: flex; justify-content: space-between; gap: 12px; padding: 14px 14px 10px; border-bottom: 1px solid #e7ebe6; cursor: move; user-select: none; }
      .eyebrow { margin: 0 0 3px; color: #61706b; font-size: 11px; }
      h2 { margin: 0; font-size: 16px; line-height: 1.2; }
      .badge { align-self: start; padding: 4px 8px; border-radius: 999px; color: #1f6845; background: #edf8f2; font-size: 12px; white-space: nowrap; }
      .body { flex: 1 1 auto; padding: 12px 14px 14px; overflow-y: auto; display: flex; flex-direction: column; min-height: 0; }
      .summary { margin: 0 0 10px; color: #4e5d59; font-size: 12px; line-height: 1.5; }
      .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 10px; }
      .stat { min-width: 0; padding: 8px 6px; border: 1px solid #e2e7e2; border-radius: 8px; background: #fff; text-align: center; }
      .stat strong { display: block; font-size: 16px; line-height: 1.2; }
      .stat span { display: block; margin-top: 2px; color: #61706b; font-size: 11px; }
      .actions, .reply-actions { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 10px; }
      .reply-actions { grid-template-columns: repeat(2, 1fr); margin: 8px 0 0; }
      .draft-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
      .draft-index { display: inline-flex; width: 22px; height: 22px; align-items: center; justify-content: center; border-radius: 999px; color: #fff; background: #227351; font-size: 11px; font-weight: 700; }
      .draft-category { padding: 2px 7px; border-radius: 999px; color: #4e5d59; background: #edf2ef; font-size: 11px; }
      .draft-box + .draft-box { margin-top: 10px; }
      .draft-list { flex: 1 1 auto; overflow-y: auto; scroll-behavior: smooth; min-height: 0; }
      .draft-list .draft-box:last-child { margin-bottom: 2px; }
      .summary, .stats, .actions, .section-title { flex: 0 0 auto; }
      button { min-height: 32px; border: 1px solid #cbd6d0; border-radius: 8px; color: #22312d; background: #fff; font: inherit; font-size: 12px; cursor: pointer; }
      button:hover:not(:disabled) { border-color: #88a89b; background: #f1f6f3; }
      button:disabled { opacity: 0.45; cursor: not-allowed; }
      .primary { color: #fff; border-color: #227351; background: #227351; }
      .primary:hover:not(:disabled) { background: #1d6547; }
      .section-title { display: block; margin: 12px 0 6px; color: #61706b; font-size: 11px; font-weight: 700; }
      .results { display: grid; gap: 6px; max-height: 190px; overflow: auto; margin: 0; padding: 0; list-style: none; }
      .results li, .draft-box { padding: 8px; border: 1px solid #e2e7e2; border-radius: 8px; background: #fff; }
      .results div { display: flex; justify-content: space-between; gap: 8px; align-items: center; }
      .results strong { overflow: hidden; color: #22312d; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
      .results span { flex: 0 0 auto; padding: 2px 6px; border-radius: 999px; font-size: 11px; }
      .result-ok span { color: #1f6845; background: #edf8f2; }
      .result-skip span { color: #8a5b10; background: #fff8ea; }
      .result-fail span { color: #b3332f; background: #fff1f0; }
      .results p, .results small, .draft-box p { display: block; margin: 4px 0 0; color: #4e5d59; font-size: 11px; line-height: 1.45; }
      .draft-box .draft { color: #22312d; font-size: 13px; line-height: 1.6; white-space: pre-wrap; }
      .facts { margin: 8px 0 0; padding-left: 18px; color: #7a8883; font-size: 11px; line-height: 1.5; }
      .empty-results { margin: 0; padding: 10px; border: 1px dashed #d7ded9; border-radius: 8px; color: #7a8883; font-size: 12px; text-align: center; }
      .logs { flex: 0 0 auto; max-height: 130px; overflow: auto; margin: 0; padding: 0; list-style: none; }
      .logs li { display: grid; grid-template-columns: 54px 1fr; gap: 6px; padding: 6px 0; border-top: 1px solid #eef1ee; color: #34413d; font-size: 12px; line-height: 1.4; }
      .logs span { color: #7a8883; }
      .log-success { color: #1f6845; }
      .log-warning { color: #8a5b10; }
      .log-error { color: #b3332f; }
      .empty-log { display: block !important; color: #7a8883; }
    </style>
    <section class="panel" aria-label="BossAssistant 控制面板">
      <header class="head">
        <div>
          <p class="eyebrow">BossAssistant</p>
          <h2>${isChat ? "回复助手" : "投递控制台"}</h2>
        </div>
        <span class="badge">${escapeHtml(getTaskStatusLabel(taskState.status))}</span>
      </header>
      <div class="body">
        <p class="summary">${escapeHtml(currentPageStatus.label)} · ${escapeHtml(getConfigSummary())}</p>
        <div class="stats" aria-label="任务统计">
          <div class="stat"><strong>${taskState.stats.processed}</strong><span>${isChat ? "问题" : "处理"}</span></div>
          <div class="stat"><strong>${taskState.stats.success}</strong><span>${isChat ? "草稿" : "新投递"}</span></div>
          <div class="stat"><strong>${taskState.stats.skipped}</strong><span>跳过</span></div>
          <div class="stat"><strong>${taskState.stats.failed}</strong><span>失败</span></div>
        </div>
        <div class="actions">
          <button class="primary" data-command="start" ${canStart ? "" : "disabled"}>${isChat ? "生成" : "开始"}</button>
          <button data-command="pause" ${canPause ? "" : "disabled"}>暂停</button>
          <button data-command="resume" ${canResume ? "" : "disabled"}>继续</button>
          <button data-command="stop" ${canStop ? "" : "disabled"}>停止</button>
        </div>
        <span class="section-title">${isChat ? "回复草稿" : "岗位结果"}</span>
        ${renderResults()}
        <span class="section-title">操作日志</span>
        <ul class="logs">${logs}</ul>
      </div>
    </section>
  `;

  panelRoot.querySelectorAll<HTMLButtonElement>("button[data-command]").forEach((button) => {
    button.addEventListener("click", () => {
      const command = button.dataset.command as TaskCommand;
      void handleTaskCommand(command);
    });
  });

  panelRoot.querySelectorAll<HTMLButtonElement>("button[data-reply-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const draftIndex = Number(button.dataset.draftIndex) || 0;
      void handleReplyAction(button.dataset.replyAction, draftIndex);
    });
  });

  // 初始化拖拽（只绑定一次）
  if (!panelDragInitialized) {
    initPanelDrag(panelRoot);
  }
}

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.type === MESSAGE_TYPES.TASK_COMMAND) {
    void handleTaskCommand(message.payload.command).then(sendResponse);
    return true;
  }

  return false;
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes["bossassistant/config"]) {
    void refreshConfig();
  }
});

publishPageStatus();

let lastHref = window.location.href;

setInterval(() => {
  if (window.location.href === lastHref) {
    return;
  }

  lastHref = window.location.href;
  if (activeRun && deliveryNavigationInProgress) {
    publishPageStatus();
    return;
  }

  latestScan = null;
  deliveryResults = [];
  replyDrafts = [];
  lastChatFingerprint = "";
  if (activeRun) {
    activeRun.stopRequested = true;
  }
  publishPageStatus();
}, 1000);

// 聊天页自动检测：监视消息区域变化，自动生成回复草稿
let chatDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastChatFingerprint = "";

function getChatFingerprint(): string {
  const questions = extractAllHrQuestions();
  // 用前 3 条消息的前 40 个字符生成指纹
  return questions
    .slice(0, 3)
    .map((q) => q.slice(0, 40))
    .join("|");
}

const chatObserver = new MutationObserver(() => {
  if (currentPageStatus.kind !== "chat") return;
  if (activeRun) return;

  const fingerprint = getChatFingerprint();
  if (!fingerprint || fingerprint === lastChatFingerprint) return;

  // 立即清除上一个聊天的草稿
  replyDrafts = [];
  lastChatFingerprint = fingerprint;
  renderPanel();

  if (chatDebounceTimer) clearTimeout(chatDebounceTimer);
  chatDebounceTimer = setTimeout(async () => {
    const config = await sendRuntimeMessage<AssistantConfig>({ type: MESSAGE_TYPES.GET_CONFIG });
    configSnapshot = config;
    const errors = validateReplyConfig(config);
    if (errors.length > 0) return;

    const questions = extractAllHrQuestions();
    if (questions.length === 0) return;

    replyDrafts = questions.map((question) => generateReplyDraft(question, config));
    lastChatFingerprint = getChatFingerprint();
    deliveryResults = [];
    setTaskState({
      status: "stopped",
      stats: { processed: questions.length, success: replyDrafts.length, skipped: 0, failed: 0 },
      logs: [
        createLog("success", `已为 ${replyDrafts.length} 条 HR 消息生成草稿`),
        createLog("info", "切换聊天自动更新，草稿仅来自当前对话")
      ],
      updatedAt: nowBeijingTimestamp()
    });
  }, 800);
});

chatObserver.observe(document.body, { childList: true, subtree: true });