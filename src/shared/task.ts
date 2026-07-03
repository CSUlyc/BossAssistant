import { formatBeijingTime, nowBeijingTimestamp } from "./time";

export type TaskStatus = "idle" | "running" | "paused" | "stopped" | "error";

export type TaskStats = {
  processed: number;
  success: number;
  skipped: number;
  failed: number;
};

export type TaskLogItem = {
  id: string;
  time: string;
  level: "info" | "success" | "warning" | "error";
  message: string;
};

export type TaskState = {
  status: TaskStatus;
  stats: TaskStats;
  logs: TaskLogItem[];
  updatedAt: string;
};

export type TaskCommand = "start" | "pause" | "resume" | "stop";

export const DEFAULT_TASK_STATE: TaskState = {
  status: "idle",
  stats: {
    processed: 0,
    success: 0,
    skipped: 0,
    failed: 0
  },
  logs: [],
  updatedAt: "1970-01-01T08:00:00+08:00"
};

export function createLog(level: TaskLogItem["level"], message: string): TaskLogItem {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    time: formatBeijingTime(),
    level,
    message
  };
}

export function appendLog(state: TaskState, log: TaskLogItem): TaskState {
  return {
    ...state,
    logs: [log, ...state.logs].slice(0, 20),
    updatedAt: nowBeijingTimestamp()
  };
}

export function getTaskStatusLabel(status: TaskStatus): string {
  const labels: Record<TaskStatus, string> = {
    idle: "未开始",
    running: "运行中",
    paused: "已暂停",
    stopped: "已停止",
    error: "异常"
  };

  return labels[status];
}
