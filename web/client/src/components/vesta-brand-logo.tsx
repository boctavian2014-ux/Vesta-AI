/** Official Vesta AI brand asset — `public/vesta-logo.png` */
const LOGO_SRC = "/vesta-logo.png";

export function VestaBrandLogoSidebar() {
  return (
    <div className="flex items-center px-2 py-1.5 min-h-10">
      <img
        src={LOGO_SRC}
        alt="Vesta AI"
        width={132}
        height={40}
        className="h-9 w-auto max-w-[min(140px,100%)] object-contain object-left"
        decoding="async"
      />
    </div>
  );
}

export function VestaBrandLogoAuth() {
  return (
    <div className="flex flex-col items-center gap-3 mb-8">
      <img
        src={LOGO_SRC}
        alt="Vesta AI"
        width={200}
        height={120}
        className="h-auto w-full max-w-[200px] object-contain"
        decoding="async"
      />
      <p className="text-sm text-muted-foreground text-center">
        Real estate intelligence for Spain
      </p>
    </div>
  );
}
