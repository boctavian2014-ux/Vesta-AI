import type { MessageInstance } from "antd/es/message/interface";

export type VestaMessageVariant = "destructive" | "success" | "warning";

/** Maps legacy shadcn-style toasts to antd `message`. `duration` in ms → seconds. */
export function showVestaMessage(
  api: MessageInstance,
  opts: {
    title: string;
    description?: string;
    variant?: VestaMessageVariant;
    duration?: number;
  },
) {
  const text = opts.description ? `${opts.title} — ${opts.description}` : opts.title;
  const seconds = opts.duration != null ? opts.duration / 1000 : undefined;
  const v = opts.variant;

  if (v === "destructive") {
    api.error({ content: text, duration: seconds });
    return;
  }
  if (v === "success") {
    api.success({ content: text, duration: seconds ?? 4 });
    return;
  }
  if (v === "warning") {
    api.warning({ content: text, duration: seconds ?? 5 });
    return;
  }
  api.info({ content: text, duration: seconds ?? 4 });
}
