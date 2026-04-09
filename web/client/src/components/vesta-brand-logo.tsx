import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

/** Bump when replacing files in `public/` so clients bypass stale caches. Keep `client/index.html` favicon `href` in sync. */
export const VESTA_BRAND_ASSET_QUERY = "?v=5";

/** Official Vesta AI brand assets from `public/`. */
function sanitizeBaseUrl(rawBaseUrl: string | undefined): string {
  const raw = String(rawBaseUrl ?? "").trim();
  if (!raw) return "/";
  if (/^https?:\/\//i.test(raw)) {
    return raw.endsWith("/") ? raw : `${raw}/`;
  }
  const withForwardSlashes = raw.replace(/\\/g, "/");
  const withLeadingSlash = withForwardSlashes.startsWith("/")
    ? withForwardSlashes
    : `/${withForwardSlashes}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
}

function buildAssetCandidates(fileName: string): string[] {
  const normalizedName = String(fileName).trim().replace(/^\/+/, "");
  if (!normalizedName) return [];
  const baseUrl = sanitizeBaseUrl(import.meta.env.BASE_URL as string | undefined);
  const q = VESTA_BRAND_ASSET_QUERY;
  const candidates = [`${baseUrl}${normalizedName}${q}`, `/${normalizedName}${q}`, `${normalizedName}${q}`];
  return Array.from(new Set(candidates));
}

const LOGO_CANDIDATES = buildAssetCandidates("vesta-logo.png");
const FALLBACK_CANDIDATES = buildAssetCandidates("favicon.png");
const ALL_CANDIDATES = [...LOGO_CANDIDATES, ...FALLBACK_CANDIDATES];
/** Wider / marketing lockup for sidebar only; falls back to default logo. */
const SIDEBAR_LOGO_CANDIDATES = [
  ...buildAssetCandidates("vesta-logo-sidebar.png"),
  ...ALL_CANDIDATES,
];

function VestaBrandLogoImage({
  width,
  height,
  className,
  candidates = ALL_CANDIDATES,
}: {
  width: number;
  height: number;
  className: string;
  candidates?: string[];
}) {
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [showTextFallback, setShowTextFallback] = useState(false);
  const src = candidates[candidateIndex] ?? "";
  const attempted = useMemo(
    () => candidates.slice(0, candidateIndex + 1),
    [candidateIndex, candidates],
  );

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.info("[Vesta logo] candidates:", candidates);
  }, [candidates]);

  if (!src || showTextFallback) {
    return (
      <div className="inline-flex items-center rounded-md border border-border/60 px-2 py-1 text-xs font-semibold text-foreground">
        Vesta AI
      </div>
    );
  }

  return (
    <img
      key={src}
      src={src}
      alt="Vesta AI"
      width={width}
      height={height}
      className={className}
      decoding="async"
      onLoad={() => {
        if (!import.meta.env.DEV) return;
        console.info("[Vesta logo] loaded:", src);
      }}
      onError={() => {
        const nextIndex = candidateIndex + 1;
        console.warn("[Vesta logo] failed:", src, "attempted:", attempted);
        if (nextIndex < candidates.length) {
          setCandidateIndex(nextIndex);
          return;
        }
        console.warn("[Vesta logo] all candidates failed; using text fallback");
        setShowTextFallback(true);
      }}
    />
  );
}

export function VestaBrandLogoSidebar() {
  return (
    <div className="w-full min-w-0 px-0 py-1 group-data-[collapsible=icon]:py-0">
      {/* Same width + glass treatment as SidebarMenuButton nav cards */}
      <div className="w-full rounded-md border border-white/15 bg-white/10 p-2 backdrop-blur-md group-data-[collapsible=icon]:border-0 group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:px-1 group-data-[collapsible=icon]:py-1">
        <div className="flex w-full min-w-0 items-center justify-center group-data-[collapsible=icon]:justify-center">
          <VestaBrandLogoImage
            width={640}
            height={360}
            candidates={SIDEBAR_LOGO_CANDIDATES}
            className="block h-auto w-full max-h-[min(14rem,42vh)] object-contain object-center group-data-[collapsible=icon]:max-h-9 group-data-[collapsible=icon]:max-w-[2.75rem] group-data-[collapsible=icon]:object-center"
          />
        </div>
      </div>
    </div>
  );
}

export function VestaBrandLogoAuth() {
  return (
    <div className="flex flex-col items-center gap-3 mb-8">
      <VestaBrandLogoImage
        width={200}
        height={120}
        className="h-auto w-full max-w-[200px] object-contain"
      />
      <p className="text-sm text-muted-foreground text-center">
        Real estate intelligence for Spain
      </p>
    </div>
  );
}

/** Compact mark for inline use (headers, KPI tiles, list rows) — same asset as full logo. */
export function VestaBrandLogoMark({
  className,
  imgClassName,
}: {
  className?: string;
  imgClassName?: string;
}) {
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center leading-none", className)}>
      <VestaBrandLogoImage
        width={96}
        height={32}
        className={cn("block h-4 w-auto max-h-4 object-contain object-left", imgClassName)}
      />
    </span>
  );
}
