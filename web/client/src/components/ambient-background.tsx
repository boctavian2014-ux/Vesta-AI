import { useEffect, useMemo, useState } from "react";
import { AMBIENT_WHISPERS } from "@/lib/ambient-messages";
import { useUiLocale } from "@/lib/ui-locale";

const ROTATE_MS = 11_000;
const FADE_MS = 900;

function AmbientWhispers() {
  const { locale } = useUiLocale();
  const messages = AMBIENT_WHISPERS[locale];
  const [i, setI] = useState(0);
  const [opaque, setOpaque] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(false);

  const text = useMemo(() => messages[i % messages.length], [messages, i]);

  useEffect(() => {
    setI(0);
    setOpaque(true);
  }, [locale]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduceMotion(mq.matches);
    const onPrefChange = () => setReduceMotion(mq.matches);
    mq.addEventListener("change", onPrefChange);
    return () => mq.removeEventListener("change", onPrefChange);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");

    const tick = () => {
      if (mq.matches) {
        setI((n) => (n + 1) % messages.length);
        return;
      }
      setOpaque(false);
      window.setTimeout(() => {
        setI((n) => (n + 1) % messages.length);
        setOpaque(true);
      }, FADE_MS);
    };

    const id = window.setInterval(tick, ROTATE_MS);
    return () => window.clearInterval(id);
  }, [messages.length]);

  return (
    <p
      className="app-ambient__whisper"
      style={{
        opacity: reduceMotion ? 1 : opaque ? 1 : 0,
        transitionDuration: reduceMotion ? "0ms" : `${FADE_MS}ms`,
      }}
      aria-hidden
    >
      <span className="app-ambient__whisper-inner">
        <span className="app-ambient__whisper-glow">{text}</span>
        <span className="app-ambient__whisper-face">{text}</span>
      </span>
    </p>
  );
}

/** Fixed decorative layer behind the app; whispers sit outside .app-ambient so nothing clips them. */
export function AmbientBackground() {
  return (
    <>
      <div className="app-ambient">
        <div className="app-ambient__base" aria-hidden />
        <div className="app-ambient__blob app-ambient__blob--a" aria-hidden />
        <div className="app-ambient__blob app-ambient__blob--b" aria-hidden />
        <div className="app-ambient__blob app-ambient__blob--c" aria-hidden />
      </div>
      <AmbientWhispers />
    </>
  );
}
