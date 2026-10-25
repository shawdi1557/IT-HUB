// Lightweight ports of React Bits components (reactbits.dev), dependency-free.
import { useEffect, useRef, useState, type ReactNode } from "react";
import GlareHover from "./GlareHover";

function useInView<T extends Element>(threshold = 0.15) {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return [ref, seen] as const;
}

/** React Bits · SplitText — word-by-word blur/rise reveal */
export function SplitText({
  text,
  className = "",
  delay = 60,
}: {
  text: string;
  className?: string;
  delay?: number;
}) {
  const [ref, seen] = useInView<HTMLSpanElement>();
  return (
    <span ref={ref} className={className} aria-label={text}>
      {text.split(" ").map((word, i) => (
        <span
          key={i}
          aria-hidden
          className="rb-split-word"
          data-on={seen}
          style={{ transitionDelay: `${i * delay}ms` }}
        >
          {word}&nbsp;
        </span>
      ))}
    </span>
  );
}

/** React Bits · GradientText */
export function GradientText({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <span className={`rb-gradient-text ${className}`}>{children}</span>;
}

/** React Bits · FadeContent / AnimatedContent */
export function FadeContent({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const [ref, seen] = useInView<HTMLDivElement>(0.1);
  return (
    <div
      ref={ref}
      className={`rb-fade ${className}`}
      data-on={seen}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

/** Card hover — React Bits · GlareHover sweep (kept as SpotlightCard for existing call sites) */
export function SpotlightCard({
  children,
  className = "",
  color = "var(--glare-tint)",
}: {
  children: ReactNode;
  className?: string;
  color?: string;
}) {
  return (
    <GlareHover
      width="auto"
      height="auto"
      background="var(--card)"
      borderRadius="1rem"
      borderColor="var(--border)"
      glareColor={color}
      glareAngle={-30}
      glareSize={300}
      transitionDuration={800}
      className={`transition duration-500 hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/10 ${className}`}
    >
      {children}
    </GlareHover>
  );
}

/** React Bits · CountUp */
export function CountUp({
  to,
  decimals = 0,
  suffix = "",
  duration = 1600,
}: {
  to: number;
  decimals?: number;
  suffix?: string;
  duration?: number;
}) {
  const [ref, seen] = useInView<HTMLSpanElement>();
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!seen) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      setValue(to * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [seen, to, duration]);
  return (
    <span ref={ref}>
      {value.toFixed(decimals)}
      {suffix}
    </span>
  );
}

/** React Bits · Aurora (CSS rendition) */
export function Aurora({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden className={`rb-aurora ${className}`}>
      <span />
      <span />
      <span />
    </div>
  );
}

/** React Bits · ScrollVelocity / marquee */
export function ScrollVelocity({ items, className = "" }: { items: string[]; className?: string }) {
  const row = [...items, ...items];
  return (
    <div className={`overflow-hidden ${className}`} aria-hidden>
      <div className="rb-marquee">
        {row.map((item, i) => (
          <span key={i} className="flex items-center gap-10 px-5">
            {item}
            <span className="h-2 w-2 rotate-45 bg-primary" />
          </span>
        ))}
      </div>
    </div>
  );
}
