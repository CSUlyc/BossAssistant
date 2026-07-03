export type BossPageKind = "jobs" | "chat" | "zhipin-other" | "unsupported";

export type BossPageStatus = {
  kind: BossPageKind;
  supported: boolean;
  label: string;
  href: string;
  reason?: string;
};

const BOSS_HOST = "www.zhipin.com";

export function detectBossPage(href: string): BossPageStatus {
  let url: URL;

  try {
    url = new URL(href);
  } catch {
    return {
      kind: "unsupported",
      supported: false,
      label: "无法识别页面",
      href,
      reason: "当前地址不是有效 URL"
    };
  }

  if (url.hostname !== BOSS_HOST) {
    return {
      kind: "unsupported",
      supported: false,
      label: "非 BOSS 直聘页面",
      href,
      reason: "请打开 BOSS 直聘网页版"
    };
  }

  if (url.pathname.startsWith("/web/geek/jobs")) {
    return {
      kind: "jobs",
      supported: true,
      label: "职位列表页",
      href
    };
  }

  if (url.pathname.startsWith("/web/geek/chat")) {
    return {
      kind: "chat",
      supported: true,
      label: "沟通聊天页",
      href
    };
  }

  return {
    kind: "zhipin-other",
    supported: false,
    label: "BOSS 直聘其他页面",
    href,
    reason: "请进入职位列表页或沟通聊天页"
  };
}
