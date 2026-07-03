import type { JobCardInfo } from "./jobs";
import { formatBeijingDateTime, getBeijingDateKey, nowBeijingTimestamp } from "./time";

export type ApplicationStatus = "success" | "communicated" | "skipped" | "failed";

export type ApplicationRecord = {
  id: string;
  jobId: string;
  title: string;
  company: string;
  location: string;
  detailUrl: string;
  hrActiveText: string;
  status: ApplicationStatus;
  reason: string;
  appliedAt: string;
};

export type ApplicationStore = {
  records: Record<string, ApplicationRecord>;
};

const APPLICATIONS_KEY = "bossassistant/applications";
const LEGACY_COMMUNICATED_REASON = "页面显示已沟通";

function normalizeDetailUrl(detailUrl: string): string {
  if (!detailUrl) {
    return "";
  }

  try {
    const url = new URL(detailUrl);
    return `${url.origin}${url.pathname}`.toLowerCase();
  } catch {
    return detailUrl.trim().toLowerCase();
  }
}

function createLegacyJobKey(job: Pick<JobCardInfo, "id" | "title" | "company" | "location" | "detailUrl">): string {
  const source = job.detailUrl || job.id || `${job.title}-${job.company}-${job.location}`;
  return source.trim().toLowerCase();
}

export function createJobKey(job: Pick<JobCardInfo, "id" | "title" | "company" | "location" | "detailUrl">): string {
  const source = normalizeDetailUrl(job.detailUrl) || normalizeDetailUrl(job.id) || `${job.title}-${job.company}-${job.location}`;
  return source.trim().toLowerCase();
}

function findRecordForJob(store: ApplicationStore, job: JobCardInfo): ApplicationRecord | undefined {
  return store.records[createJobKey(job)] ?? store.records[createLegacyJobKey(job)];
}

export function isActualSentRecord(record: ApplicationRecord): boolean {
  return record.status === "success" && !record.reason.startsWith(LEGACY_COMMUNICATED_REASON);
}

export function isCommunicatedRecord(record: ApplicationRecord): boolean {
  return record.status === "communicated" || (record.status === "success" && record.reason.startsWith(LEGACY_COMMUNICATED_REASON));
}

export function getApplicationRecordDateKey(record: ApplicationRecord): string {
  return getBeijingDateKey(record.appliedAt);
}

export async function getApplicationStore(): Promise<ApplicationStore> {
  const result = await chrome.storage.local.get(APPLICATIONS_KEY);
  const stored = result[APPLICATIONS_KEY] as ApplicationStore | undefined;
  return {
    records: stored?.records ?? {}
  };
}

export async function getApplicationRecords(): Promise<ApplicationRecord[]> {
  const store = await getApplicationStore();
  return Object.values(store.records).sort((a, b) => new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime());
}

export async function hasApplicationRecord(job: JobCardInfo): Promise<boolean> {
  const store = await getApplicationStore();
  return Boolean(findRecordForJob(store, job));
}

export async function hasSuccessfulApplication(job: JobCardInfo): Promise<boolean> {
  const store = await getApplicationStore();
  const record = findRecordForJob(store, job);
  return record?.status === "success" || record?.status === "communicated";
}

export async function saveApplicationRecord(record: ApplicationRecord): Promise<void> {
  const store = await getApplicationStore();
  await chrome.storage.local.set({
    [APPLICATIONS_KEY]: {
      records: {
        ...store.records,
        [record.id]: record
      }
    }
  });
}

export async function saveJobApplication(job: JobCardInfo, status: ApplicationStatus, reason: string): Promise<ApplicationRecord> {
  const store = await getApplicationStore();
  const existing = findRecordForJob(store, job);
  const record: ApplicationRecord = {
    id: existing?.id ?? createJobKey(job),
    jobId: job.id,
    title: job.title,
    company: job.company,
    location: job.location,
    detailUrl: job.detailUrl,
    hrActiveText: job.hrActiveText,
    status,
    reason,
    appliedAt: nowBeijingTimestamp()
  };

  await saveApplicationRecord(record);
  return record;
}

export async function countTodayApplications(): Promise<number> {
  const today = getBeijingDateKey();
  const records = await getApplicationRecords();
  return records.filter((record) => isActualSentRecord(record) && getApplicationRecordDateKey(record) === today).length;
}

export async function deleteApplicationRecord(key: string): Promise<void> {
  const store = await getApplicationStore();
  delete store.records[key];
  await chrome.storage.local.set({
    [APPLICATIONS_KEY]: { records: store.records }
  });
}

export async function clearAllApplications(): Promise<void> {
  await chrome.storage.local.set({
    [APPLICATIONS_KEY]: { records: {} }
  });
}

export function exportRecordsAsCSV(records: ApplicationRecord[]): string {
  const header = "投递时间,职位,公司,地点,状态,原因";
  const rows = records.map((r) =>
    [
      formatBeijingDateTime(r.appliedAt),
      `"${r.title.replace(/"/g, '""')}"`,
      `"${r.company.replace(/"/g, '""')}"`,
      r.location,
      isActualSentRecord(r) ? "新投递" : isCommunicatedRecord(r) ? "已沟通" : r.status === "failed" ? "失败" : "跳过",
      `"${r.reason.replace(/"/g, '""')}"`
    ].join(",")
  );
  return [header, ...rows].join("\n");
}