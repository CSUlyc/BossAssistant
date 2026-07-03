import { Download, RefreshCw, RotateCcw, Save, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_CONFIG,
  HR_ACTIVE_OPTIONS,
  REPLY_TONE_OPTIONS,
  clampDailyLimit,
  splitCities,
  splitIntroLines,
  splitKeywords,
  splitResumeLines,
  validateConfig,
  type AssistantConfig,
  type HrActiveFilter,
  type ReplyTone
} from "../shared/config";
import { MESSAGE_TYPES } from "../shared/messages";
import {
  clearAllApplications,
  deleteApplicationRecord,
  exportRecordsAsCSV,
  getApplicationRecordDateKey,
  getApplicationRecords,
  isActualSentRecord,
  isCommunicatedRecord,
  type ApplicationRecord
} from "../shared/applications";
import { formatBeijingShortDateTime, getBeijingDateKey } from "../shared/time";

function sendMessage<T>(message: unknown): Promise<T> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => resolve(response as T));
  });
}

type TabKey = "settings" | "records";

const AUTO_REFRESH_OPTIONS = [
  { value: 0, label: "关闭" },
  { value: 5000, label: "5 秒" },
  { value: 10000, label: "10 秒" },
  { value: 30000, label: "30 秒" },
  { value: 60000, label: "60 秒" }
] as const;

const RECORD_STATUS_LABEL = {
  success: "新投递",
  communicated: "已沟通",
  skipped: "跳过",
  failed: "失败"
} as const;

const RECORD_STATUS_CLASS = {
  success: "badge-ok",
  communicated: "badge-skip",
  skipped: "badge-skip",
  failed: "badge-fail"
} as const;

function getTodayKey(): string {
  return getBeijingDateKey();
}

function filterRecordsByDate(records: ApplicationRecord[], date: string): ApplicationRecord[] {
  return date ? records.filter((record) => getApplicationRecordDateKey(record) === date) : records;
}

export function Options() {
  const [config, setConfig] = useState<AssistantConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [savedText, setSavedText] = useState("");
  const [tab, setTab] = useState<TabKey>("settings");
  const [records, setRecords] = useState<ApplicationRecord[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [recordsMessage, setRecordsMessage] = useState("");
  const [recordDate, setRecordDate] = useState(getTodayKey);
  const [recordsAutoRefreshMs, setRecordsAutoRefreshMs] = useState(10000);
  const [recordsRefreshedAt, setRecordsRefreshedAt] = useState("");

  useEffect(() => {
    void sendMessage<AssistantConfig>({ type: MESSAGE_TYPES.GET_CONFIG }).then((storedConfig) => {
      setConfig(storedConfig);
      setLoading(false);
    });
  }, []);

  const loadRecords = useCallback(async (showLoading = true) => {
    if (showLoading) {
      setRecordsLoading(true);
    }
    const data = await getApplicationRecords();
    setRecords(data);
    setRecordsRefreshedAt(new Date().toLocaleTimeString("zh-CN", { hour12: false, timeZone: "Asia/Shanghai" }));
    setRecordsLoading(false);
  }, []);

  useEffect(() => {
    if (tab === "records") {
      void loadRecords();
    }
  }, [tab, loadRecords]);
  useEffect(() => {
    if (tab !== "records" || recordsAutoRefreshMs <= 0) {
      return;
    }

    const timer = window.setInterval(() => {
      void loadRecords(false);
    }, recordsAutoRefreshMs);

    return () => window.clearInterval(timer);
  }, [tab, recordsAutoRefreshMs, loadRecords]);

  const introLines = useMemo(() => splitIntroLines(config.introText), [config.introText]);
  const keywords = useMemo(() => splitKeywords(config.keywords), [config.keywords]);
  const cities = useMemo(() => splitCities(config.cities), [config.cities]);
  const resumeLines = useMemo(() => splitResumeLines(config.resumeText), [config.resumeText]);
  const errors = useMemo(() => validateConfig(config), [config]);
  const filteredRecords = useMemo(() => filterRecordsByDate(records, recordDate), [records, recordDate]);
  const filteredSentCount = useMemo(() => filteredRecords.filter(isActualSentRecord).length, [filteredRecords]);
  const filteredCommunicatedCount = useMemo(() => filteredRecords.filter(isCommunicatedRecord).length, [filteredRecords]);

  function updateConfig<K extends keyof AssistantConfig>(key: K, value: AssistantConfig[K]) {
    setSavedText("");
    setConfig((current) => ({ ...current, [key]: value }));
  }

  async function saveCurrentConfig() {
    const normalizedConfig = {
      ...config,
      dailyLimit: clampDailyLimit(config.dailyLimit)
    };

    const saved = await sendMessage<AssistantConfig>({
      type: MESSAGE_TYPES.SAVE_CONFIG,
      payload: normalizedConfig
    });
    setConfig(saved);
    setSavedText("已保存配置");
  }

  async function resetToDefault() {
    const saved = await sendMessage<AssistantConfig>({
      type: MESSAGE_TYPES.SAVE_CONFIG,
      payload: DEFAULT_CONFIG
    });
    setConfig(saved);
    setSavedText("已恢复示例配置");
  }

  async function handleDeleteRecord(key: string) {
    await deleteApplicationRecord(key);
    setRecordsMessage("已删除一条记录");
    await loadRecords();
  }

  async function handleClearAll() {
    if (!window.confirm("确认清空全部投递记录？此操作不可恢复。")) {
      return;
    }
    await clearAllApplications();
    setRecordsMessage("已清空全部记录");
    await loadRecords();
  }

  function handleExportCSV() {
    const csv = exportRecordsAsCSV(filteredRecords);
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `投递记录_${recordDate || "全部"}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setRecordsMessage("已导出当前筛选的 CSV 文件");
  }


  return (
    <main className="options-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">BossAssistant</p>
          <h1>设置中心</h1>
        </div>
        <div className="header-actions">
          <button type="button" className={`tab-button ${tab === "settings" ? "active" : ""}`} onClick={() => setTab("settings")}>
            配置
          </button>
          <button type="button" className={`tab-button ${tab === "records" ? "active" : ""}`} onClick={() => setTab("records")}>
            投递记录
          </button>
        </div>
      </header>

      {tab === "settings" && (
        <>
          <section className="settings-layout">
            <div className="form-panel">
              <label className="field field-full">
                <span>自我介绍</span>
                <textarea
                  value={config.introText}
                  rows={8}
                  placeholder="每行一句，发送时会按句拆分"
                  onChange={(event) => updateConfig("introText", event.target.value)}
                />
              </label>

              <label className="field">
                <span>职位关键词</span>
                <input
                  value={config.keywords}
                  placeholder="前端,React,Vue"
                  onChange={(event) => updateConfig("keywords", event.target.value)}
                />
              </label>

              <label className="field">
                <span>目标城市</span>
                <input value={config.cities} placeholder="杭州,北京,上海" onChange={(event) => updateConfig("cities", event.target.value)} />
              </label>

              <label className="field">
                <span>HR 活跃时间</span>
                <select value={config.hrActiveFilter} onChange={(event) => updateConfig("hrActiveFilter", event.target.value as HrActiveFilter)}>
                  {HR_ACTIVE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>每日投递上限</span>
                <input
                  type="number"
                  min="1"
                  max="150"
                  value={config.dailyLimit}
                  onChange={(event) => updateConfig("dailyLimit", Number(event.target.value))}
                />
              </label>

              <label className="field field-full">
                <span>简历资料</span>
                <textarea
                  value={config.resumeText}
                  rows={8}
                  placeholder="每行一条经历、技能、项目或求职偏好，用于生成 HR 回复草稿"
                  onChange={(event) => updateConfig("resumeText", event.target.value)}
                />
              </label>

              <label className="field">
                <span>回复风格</span>
                <select value={config.replyTone} onChange={(event) => updateConfig("replyTone", event.target.value as ReplyTone)}>
                  {REPLY_TONE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="feedback" aria-live="polite">
                {errors.length > 0 ? <p className="error-text">{errors[0]}</p> : <p className="success-text">{savedText || "配置有效，可保存"}</p>}
              </div>
            </div>

            <aside className="preview-panel" aria-label="配置预览">
              <div className="preview-section">
                <span className="preview-label">自我介绍预览</span>
                {introLines.length > 0 ? (
                  <ol className="intro-preview">
                    {introLines.map((line, index) => (
                      <li key={`${line}-${index}`}>{line}</li>
                    ))}
                  </ol>
                ) : (
                  <p className="empty-state">暂无可发送句子</p>
                )}
              </div>

              <div className="preview-section">
                <span className="preview-label">筛选摘要</span>
                <div className="chips">
                  {keywords.map((keyword) => (
                    <span key={keyword}>{keyword}</span>
                  ))}
                  {cities.map((city) => (
                    <span key={city}>{city}</span>
                  ))}
                  <span>{HR_ACTIVE_OPTIONS.find((option) => option.value === config.hrActiveFilter)?.label}</span>
                  <span>每日 {clampDailyLimit(config.dailyLimit)} 个</span>
                </div>
              </div>

              <div className="preview-section">
                <span className="preview-label">AI 回复资料</span>
                {resumeLines.length > 0 ? (
                  <ol className="intro-preview">
                    {resumeLines.slice(0, 5).map((line, index) => (
                      <li key={`${line}-${index}`}>{line}</li>
                    ))}
                  </ol>
                ) : (
                  <p className="empty-state">暂无简历资料</p>
                )}
                <div className="chips">
                  <span>{REPLY_TONE_OPTIONS.find((option) => option.value === config.replyTone)?.label}</span>
                  <span>{resumeLines.length} 条资料</span>
                </div>
              </div>
            </aside>
          </section>

          <section className="actions-row">
            <button type="button" className="ghost-button" onClick={() => void resetToDefault()} title="恢复示例配置">
              <RotateCcw size={16} />
              恢复示例
            </button>
            <button type="button" className="primary-button" disabled={loading || errors.length > 0} onClick={() => void saveCurrentConfig()} title="保存配置">
              <Save size={16} />
              保存
            </button>
          </section>
        </>
      )}

      {tab === "records" && (
        <section className="records-section">
          <div className="records-toolbar">
            <div className="records-summary">
              <span className="records-count">{recordDate || "全部日期"}：{filteredRecords.length} 条记录</span>
              <span className="records-today">新投递：{filteredSentCount} 条 · 已沟通：{filteredCommunicatedCount} 条</span>
            </div>
            <div className="records-actions">
              <label className="records-date-filter">
                <span>日期</span>
                <input type="date" value={recordDate} onChange={(event) => setRecordDate(event.target.value)} />
              </label>
              <label className="records-date-filter">
                <span>自动刷新</span>
                <select value={recordsAutoRefreshMs} onChange={(event) => setRecordsAutoRefreshMs(Number(event.target.value))}>
                  {AUTO_REFRESH_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className="ghost-button" onClick={() => setRecordDate(getTodayKey())}>
                今天
              </button>
              <button type="button" className="ghost-button" onClick={() => setRecordDate("")}>
                全部
              </button>
              <button type="button" className="ghost-button" onClick={() => void loadRecords(true)} disabled={recordsLoading} title="刷新投递记录">
                <RefreshCw size={16} />
                刷新
              </button>
              <button type="button" className="ghost-button" onClick={handleExportCSV} disabled={filteredRecords.length === 0}>
                <Download size={16} />
                导出 CSV
              </button>
              <button type="button" className="ghost-button danger" onClick={() => void handleClearAll()} disabled={records.length === 0}>
                <Trash2 size={16} />
                清空记录
              </button>
            </div>
          </div>

          <div className="records-refresh-status" aria-live="polite">
            {recordsMessage || recordsRefreshedAt ? (recordsMessage || `上次刷新 ${recordsRefreshedAt}`) : ""}
          </div>

          {recordsLoading && records.length === 0 ? (
            <p className="empty-state">加载中…</p>
          ) : records.length === 0 ? (
            <p className="empty-state">暂无投递记录，运行一次投递任务后自动生成</p>
          ) : filteredRecords.length === 0 ? (
            <p className="empty-state">这一天暂无投递记录</p>
          ) : (
            <div className="records-table-wrapper">
              <table className="records-table">
                <thead>
                  <tr>
                    <th>时间</th>
                    <th>职位</th>
                    <th>公司</th>
                    <th>地点</th>
                    <th>状态</th>
                    <th>原因</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecords.map((record) => (
                    <tr key={record.id}>
                      <td className="cell-time">{formatBeijingShortDateTime(record.appliedAt)}</td>
                      <td className="cell-title" title={record.title}>{record.title}</td>
                      <td>{record.company}</td>
                      <td>{record.location}</td>
                      <td>
                        <span className={`status-badge ${RECORD_STATUS_CLASS[record.status]}`}>
                          {RECORD_STATUS_LABEL[record.status]}
                        </span>
                      </td>
                      <td className="cell-reason" title={record.reason}>{record.reason}</td>
                      <td>
                        <button type="button" className="icon-button-small" title="删除此记录" onClick={() => void handleDeleteRecord(record.id)}>
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </main>
  );
}