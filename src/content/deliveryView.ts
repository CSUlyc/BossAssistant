import { createLog, type TaskState } from "../shared/task";
import type { JobScanSummary, ScannedJob } from "../shared/jobs";
import { escapeHtml, sanitizeFontFamily } from "./dom";

export type DeliveryViewItem = {
  title: string;
  meta: string;
  metaHtml: string;
  status: "候选" | "已投递" | "重复" | "跳过" | "失败";
  reason: string;
};

export function createDeliveryViewItem(item: ScannedJob, status: DeliveryViewItem["status"], reason: string): DeliveryViewItem {
  const salary = item.job.salary || "薪资未显示";
  const salaryFontFamily = sanitizeFontFamily(item.job.salaryFontFamily);
  const salaryHtml = salaryFontFamily
    ? `<span class="salary-text" style="font-family: ${escapeHtml(salaryFontFamily)};">${escapeHtml(salary)}</span>`
    : escapeHtml(salary);
  const metaParts = [item.job.company, item.job.location, salary].filter(Boolean);
  const metaHtmlParts = [item.job.company, item.job.location].filter(Boolean).map(escapeHtml);
  metaHtmlParts.push(salaryHtml);

  return {
    title: item.job.title || "未命名岗位",
    meta: metaParts.join(" · ") || "信息不足",
    metaHtml: metaHtmlParts.join(" · ") || "信息不足",
    status,
    reason
  };
}

export function buildInitialResults(summary: JobScanSummary): DeliveryViewItem[] {
  return [
    ...summary.jobs.filter((item) => item.filter.accepted).map((item) => createDeliveryViewItem(item, "候选", "等待防重复检查")),
    ...summary.jobs.filter((item) => !item.filter.accepted).map((item) => createDeliveryViewItem(item, "跳过", item.filter.reasons.join("；") || "不符合筛选条件"))
  ].slice(0, 12);
}

export function buildScanLogs(summary: JobScanSummary): TaskState["logs"] {
  const logs = [
    createLog(summary.matched > 0 ? "success" : "warning", `扫描完成：处理 ${summary.processed} 个，候选 ${summary.matched} 个，跳过 ${summary.skipped} 个，失败 ${summary.failed} 个`),
    createLog("info", "将对候选岗位执行防重复、上限检查和受控投递")
  ];

  summary.jobs.slice(0, 8).forEach((item) => {
    if (item.filter.accepted) {
      logs.push(createLog("success", `候选：${item.job.title} · ${item.job.company}`));
      return;
    }

    logs.push(createLog("warning", `跳过：${item.job.title || "未命名岗位"} · ${item.filter.reasons[0] ?? "不符合筛选条件"}`));
  });

  summary.errors.slice(0, 3).forEach((error) => logs.push(createLog("error", error)));
  return logs.slice(0, 20);
}

export function renderResultItem(item: DeliveryViewItem): string {
  const statusClass = item.status === "已投递" ? "result-ok" : item.status === "失败" ? "result-fail" : "result-skip";
  return `
    <li class="${statusClass}">
      <div><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.status)}</span></div>
      <p>${item.metaHtml}</p>
      <small>${escapeHtml(item.reason)}</small>
    </li>
  `;
}