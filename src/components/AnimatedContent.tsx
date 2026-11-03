// src/components/AnimatedContent.tsx
// React Bits — AnimatedContent component (GSAP + ScrollTrigger)
// Smooth entrance and reveal animation with direction, distance, blur, and stagger control.

import React, { useEffect, useRef, type ReactNode } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

export interface AnimatedContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  distance?: number;
  direction?: "vertical" | "horizontal";
  reverse?: boolean;
  duration?: number;
  ease?: string;
  initialOpacity?: number;
  animateOpacity?: boolean;
  scale?: number;
  blur?: number;
  threshold?: number;
  delay?: number;
  trigger?: "scroll" | "mount";
  once?: boolean;
  container?: React.RefObject<HTMLElement | null>;
  className?: string;
}

export default function AnimatedContent({
  children,
  distance = 100,
  direction = "vertical",
  reverse = false,
  duration = 0.8,
  ease = "power3.out",
  initialOpacity = 0,
  animateOpacity = true,
  scale = 1,
  blur = 0,
  threshold = 0.1,
  delay = 0,
  trigger = "mount",
  once = true,
  container,
  className = "",
  style,
  ...props
}: AnimatedContentProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // 1. Accessibility: Respect prefers-reduced-motion
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion) {
      el.style.opacity = "1";
      el.style.visibility = "visible";
      el.style.transform = "none";
      el.style.filter = "none";
      return;
    }

    const axis = direction === "horizontal" ? "x" : "y";
    const offset = reverse ? -distance : distance;

    // Use gsap.context for React Strict Mode and unmount cleanup
    const ctx = gsap.context(() => {
      try {
        const fromVars: gsap.TweenVars = {
          [axis]: offset,
          scale,
          opacity: animateOpacity ? initialOpacity : 1,
          visibility: "visible",
        };

        if (blur > 0) {
          fromVars.filter = `blur(${blur}px)`;
        }

        gsap.set(el, fromVars);

        const toVars: gsap.TweenVars = {
          [axis]: 0,
          scale: 1,
          opacity: 1,
          duration,
          ease,
          delay,
          clearProps: "transform,filter",
        };

        if (blur > 0) {
          toVars.filter = "blur(0px)";
        }

        if (trigger === "mount") {
          gsap.to(el, toVars);
        } else {
          ScrollTrigger.create({
            trigger: el,
            scroller: container?.current || window,
            start: `top -=${threshold * 100}%`,
            once,
            onEnter: () => {
              gsap.to(el, toVars);
            },
          });
        }
      } catch (err) {
        // Fallback: Ensure element remains fully visible if GSAP throws
        console.warn("AnimatedContent GSAP error, falling back to visible:", err);
        el.style.opacity = "1";
        el.style.visibility = "visible";
        el.style.transform = "none";
        el.style.filter = "none";
      }
    }, ref);

    return () => {
      ctx.revert();
    };
  }, [
    distance,
    direction,
    reverse,
    duration,
    ease,
    initialOpacity,
    animateOpacity,
    scale,
    blur,
    threshold,
    delay,
    trigger,
    once,
    container,
  ]);

  return (
    <div
      ref={ref}
      className={`animated-content ${className}`}
      style={{
        willChange: "opacity, transform, filter",
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}
