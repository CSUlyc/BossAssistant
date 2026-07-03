import { AlertCircle, CheckCircle2, ExternalLink, Pause, Play, RotateCcw, Settings, Square } from "lucide-react";
import { useEffect, useState } from "react";
import { HR_ACTIVE_OPTIONS, splitCities, splitIntroLines, splitKeywords, type AssistantConfig } from "../shared/config";
import { MESSAGE_TYPES } from "../shared/messages";
import type { BossPageStatus } from "../shared/page";
import { DEFAULT_TASK_STATE, getTaskStatusLabel, type TaskCommand, type TaskState } from "../shared/task";

function sendMessage<T>(message: unknown): Promise<T> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => resolve(response as T));
  });
}

type PopupState = {
  loading: boolean;
  pageStatus: BossPageStatus | null;
  config: AssistantConfig | null;
  taskState: TaskState;
  error: string;
};

export function Popup() {
  const [state, setState] = useState<PopupState>({
    loading: true,
    pageStatus: null,
    config: null,
    taskState: DEFAULT_TASK_STATE,
    error: ""
  });

  async function refresh() {
    const [pageStatus, config, taskState] = await Promise.all([
      sendMessage<BossPageStatus | null>({ type: MESSAGE_TYPES.GET_ACTIVE_PAGE_STATUS }),
      sendMessage<AssistantConfig>({ type: MESSAGE_TYPES.GET_CONFIG }),
      sendMessage<TaskState>({ type: MESSAGE_TYPES.GET_ACTIVE_TASK_STATE })
    ]);

    setState((current) => ({
      ...current,
      loading: false,
      pageStatus: pageStatus ?? null,
      config,
      taskState: taskState ?? DEFAULT_TASK_STATE
    }));
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function sendTaskCommand(command: TaskCommand) {
    setState((current) => ({ ...current, error: "" }));
    const response = await sendMessage<{ ok: boolean; error?: string }>({
      type: MESSAGE_TYPES.TASK_COMMAND,
      payload: { command }
    });

    if (!response?.ok) {
      setState((current) => ({ ...current, error: response?.error ?? "操作失败" }));
    }

    await refresh();
  }

  const pageStatus = state.pageStatus;
  const isReady = pageStatus?.supported === true;
  const taskStatus = state.taskState.status;
  const activeLabel = HR_ACTIVE_OPTIONS.find((option) => option.value === state.config?.hrActiveFilter)?.label ?? "未设置";
  const introCount = state.config ? splitIntroLines(state.config.introText).length : 0;
  const keywordCount = state.config ? splitKeywords(state.config.keywords).length : 0;
  const citiesText = state.config ? splitCities(state.config.cities).join("、") : "未设置";

  return (
    <main className="popup-shell">
      <header className="popup-header">
        <div>
          <p className="eyebrow">BossAssistant</p>
          <h1>投递助手</h1>
        </div>
        <button
          className="icon-button"
          type="button"
          title="打开设置"
          onClick={() => chrome.runtime.openOptionsPage()}
        >
          <Settings size={18} />
        </button>
      </header>

      <section className={isReady ? "status status-ready" : "status"}>
        {isReady ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
        <div>
          <strong>{state.loading ? "正在识别当前页面" : pageStatus?.label ?? "未检测到可用页面"}</strong>
          <span>{state.loading ? "请稍候" : pageStatus?.reason ?? `任务状态：${getTaskStatusLabel(taskStatus)}`}</span>
        </div>
      </section>

      <section className="config-card" aria-label="当前配置">
        <div>
          <span>自我介绍</span>
          <strong>{introCount} 句</strong>
        </div>
        <div>
          <span>关键词</span>
          <strong>{keywordCount} 个</strong>
        </div>
        <div>
          <span>城市</span>
          <strong>{citiesText}</strong>
        </div>
        <div>
          <span>HR 活跃</span>
          <strong>{activeLabel}</strong>
        </div>
      </section>

      <section className="control-grid" aria-label="任务控制">
        <button type="button" className="primary" disabled={!isReady || taskStatus === "running"} onClick={() => void sendTaskCommand("start")} title="开始处理当前已加载岗位">
          <Play size={15} />
          开始
        </button>
        <button type="button" disabled={!isReady || taskStatus !== "running"} onClick={() => void sendTaskCommand("pause")} title="暂停任务">
          <Pause size={15} />
          暂停
        </button>
        <button type="button" disabled={!isReady || taskStatus !== "paused"} onClick={() => void sendTaskCommand("resume")} title="继续任务">
          <RotateCcw size={15} />
          继续
        </button>
        <button type="button" disabled={!isReady || !["running", "paused", "error"].includes(taskStatus)} onClick={() => void sendTaskCommand("stop")} title="停止任务">
          <Square size={15} />
          停止
        </button>
      </section>

      {state.error && <p className="error-text">{state.error}</p>}

      <div className="route-list" aria-label="支持页面">
        <a href="https://www.zhipin.com/web/geek/jobs" target="_blank" rel="noreferrer">
          职位列表页
          <ExternalLink size={15} />
        </a>
        <a href="https://www.zhipin.com/web/geek/chat" target="_blank" rel="noreferrer">
          沟通聊天页
          <ExternalLink size={15} />
        </a>
      </div>
    </main>
  );
}
