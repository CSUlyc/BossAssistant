import type { AssistantConfig } from "./config";
import type { BossPageStatus } from "./page";
import type { TaskCommand, TaskState } from "./task";

export const MESSAGE_TYPES = {
  PAGE_STATUS_CHANGED: "bossassistant/page-status-changed",
  GET_ACTIVE_PAGE_STATUS: "bossassistant/get-active-page-status",
  GET_CONFIG: "bossassistant/get-config",
  SAVE_CONFIG: "bossassistant/save-config",
  GET_ACTIVE_TASK_STATE: "bossassistant/get-active-task-state",
  TASK_COMMAND: "bossassistant/task-command",
  TASK_STATE_CHANGED: "bossassistant/task-state-changed"
} as const;

export type PageStatusChangedMessage = {
  type: typeof MESSAGE_TYPES.PAGE_STATUS_CHANGED;
  payload: BossPageStatus;
};

export type GetActivePageStatusMessage = {
  type: typeof MESSAGE_TYPES.GET_ACTIVE_PAGE_STATUS;
};

export type GetConfigMessage = {
  type: typeof MESSAGE_TYPES.GET_CONFIG;
};

export type SaveConfigMessage = {
  type: typeof MESSAGE_TYPES.SAVE_CONFIG;
  payload: AssistantConfig;
};

export type GetActiveTaskStateMessage = {
  type: typeof MESSAGE_TYPES.GET_ACTIVE_TASK_STATE;
};

export type TaskCommandMessage = {
  type: typeof MESSAGE_TYPES.TASK_COMMAND;
  payload: {
    command: TaskCommand;
  };
};

export type TaskStateChangedMessage = {
  type: typeof MESSAGE_TYPES.TASK_STATE_CHANGED;
  payload: TaskState;
};

export type ExtensionMessage =
  | PageStatusChangedMessage
  | GetActivePageStatusMessage
  | GetConfigMessage
  | SaveConfigMessage
  | GetActiveTaskStateMessage
  | TaskCommandMessage
  | TaskStateChangedMessage;
