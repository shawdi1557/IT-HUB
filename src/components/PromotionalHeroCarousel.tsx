// src/components/PromotionalHeroCarousel.tsx
// IT HUB Homepage Dedicated Promotional Campaign Showcase
// Production-grade, animated, touch-enabled promotional showcase featuring React Bits Counter countdowns.

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router";
import { ChevronLeft, ChevronRight, ArrowRight, Sparkles, Clock } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import type { PromotionalCampaign } from "../lib/realtime/contentSync";
import { useCampaignCountdown } from "../lib/countdown";
import Counter from "./Counter";

interface PromotionalHeroCarouselProps {
  campaigns: PromotionalCampaign[];
  autoPlayIntervalMs?: number;
}

// Subcomponent for individual slide countdown to isolate re-render ticks to the countdown widget
function CampaignCountdownDisplay({
  endsAt,
  heading = "ENDS IN",
}: {
  endsAt?: string | null;
  heading?: string | null;
}) {
  const { days, hours, minutes, seconds, isExpired } = useCampaignCountdown(endsAt);

  if (isExpired) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-xl border border-red-400/40 bg-red-950/80 px-3.5 py-1.5 text-xs font-bold text-red-200 backdrop-blur-md shadow-sm">
        <Clock size={13} className="text-red-400" />
        <span>Offer Concluded</span>
      </div>
    );
  }

  const numDays = parseInt(days, 10);

  return (
    <div className="flex flex-col items-start gap-1">
      {heading && (
        <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.2em] text-blue-200/90 drop-shadow-sm">
          {heading}
        </span>
      )}
      <div className="inline-flex items-center gap-1.5 sm:gap-2.5 rounded-2xl border border-white/20 bg-black/50 px-3 py-1.5 sm:px-4 sm:py-2 text-white backdrop-blur-md shadow-lg">
        {numDays > 0 && (
          <>
            <div className="flex flex-col items-center">
              <Counter
                value={days}
                className="text-sm sm:text-lg font-black text-amber-300 font-mono"
              />
              <span className="text-[8px] sm:text-[9px] font-bold uppercase tracking-wider text-white/70">
                Days
              </span>
            </div>
            <span className="text-xs sm:text-sm font-bold text-white/40 pb-2.5">:</span>
          </>
        )}
        <div className="flex flex-col items-center">
          <Counter value={hours} className="text-sm sm:text-lg font-black text-white font-mono" />
          <span className="text-[8px] sm:text-[9px] font-bold uppercase tracking-wider text-white/70">
            Hrs
          </span>
        </div>
        <span className="text-xs sm:text-sm font-bold text-white/40 pb-2.5">:</span>
        <div className="flex flex-col items-center">
          <Counter value={minutes} className="text-sm sm:text-lg font-black text-white font-mono" />
          <span className="text-[8px] sm:text-[9px] font-bold uppercase tracking-wider text-white/70">
            Min
          </span>
        </div>
        <span className="text-xs sm:text-sm font-bold text-white/40 pb-2.5">:</span>
        <div className="flex flex-col items-center">
          <Counter
            value={seconds}
            className="text-sm sm:text-lg font-black text-emerald-400 font-mono"
          />
          <span className="text-[8px] sm:text-[9px] font-bold uppercase tracking-wider text-white/70">
            Sec
          </span>
        </div>
      </div>
    </div>
  );
}

export function PromotionalHeroCarousel({
  campaigns,
  autoPlayIntervalMs = 6500,
}: PromotionalHeroCarouselProps) {
  const reduce = useReducedMotion();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchEndX, setTouchEndX] = useState<number | null>(null);

  // Filter to active unexpired campaigns
  const activeCampaigns = useMemo(() => {
    const now = Date.now();
    return campaigns.filter((c) => {
      if (c.status !== "published") return false;
      if (c.starts_at && new Date(c.starts_at).getTime() > now) return false;
      if (c.ends_at && new Date(c.ends_at).getTime() <= now) return false;
      return true;
    });
  }, [campaigns]);

  const count = activeCampaigns.length;

  // Keep index within bounds if active list shrinks
  useEffect(() => {
    if (currentIndex >= count && count > 0) {
      setCurrentIndex(0);
    }
  }, [currentIndex, count]);

  const nextSlide = useCallback(() => {
    if (count <= 1) return;
    setCurrentIndex((prev) => (prev + 1) % count);
  }, [count]);

  const prevSlide = useCallback(() => {
    if (count <= 1) return;
    setCurrentIndex((prev) => (prev - 1 + count) % count);
  }, [count]);

  // Autoplay timer
  useEffect(() => {
    if (count <= 1 || isHovered) return;

    const timer = setInterval(() => {
      nextSlide();
    }, autoPlayIntervalMs);

    return () => clearInterval(timer);
  }, [count, isHovered, autoPlayIntervalMs, nextSlide]);

  // Touch swipe support
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.targetTouches[0].clientX);
    setTouchEndX(null);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEndX(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (touchStartX === null || touchEndX === null) return;
    const distance = touchStartX - touchEndX;
    const minSwipeDistance = 45;

    if (distance > minSwipeDistance) {
      nextSlide();
    } else if (distance < -minSwipeDistance) {
      prevSlide();
    }
    setTouchStartX(null);
    setTouchEndX(null);
  };

  // If no campaigns are active, render nothing (zero layout shift)
  if (count === 0) {
    return null;
  }

  const current = activeCampaigns[currentIndex] || activeCampaigns[0];

  return (
    <div
      className="relative w-full max-w-[1520px] mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-6 touch-pan-y"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setIsHovered(true)}
      onBlur={() => setIsHovered(false)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      role="region"
      aria-roledescription="carousel"
      aria-label="Promotional Showcase"
    >
      <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl lg:rounded-[2rem] border border-slate-200/80 bg-slate-950 shadow-2xl">
        <AnimatePresence mode="wait">
          <motion.div
            key={current.id}
            initial={reduce ? { opacity: 1 } : { opacity: 0, scale: 0.99 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 1.01 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="relative"
          >
            <Link
              to={current.destination_url}
              className="group block relative w-full h-[340px] min-[400px]:h-[380px] sm:h-[440px] md:h-auto md:aspect-[16/9] md:max-h-[760px] lg:max-h-[820px] overflow-hidden text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              aria-label={`${current.title} — ${current.cta_label || "Explore Now"}`}
            >
              {/* Background Promotional Image: Responsive Desktop / Mobile Assets */}
              <div className="absolute inset-0">
                {current.mobile_image_url ? (
                  <>
                    <img
                      src={current.mobile_image_url}
                      alt=""
                      aria-hidden="true"
                      className="md:hidden h-full w-full object-cover object-center transition-transform duration-700 ease-out group-hover:scale-[1.02]"
                    />
                    <img
                      src={current.image_url}
                      alt=""
                      aria-hidden="true"
                      className="hidden md:block h-full w-full object-cover object-center transition-transform duration-700 ease-out group-hover:scale-[1.02]"
                    />
                  </>
                ) : (
                  <img
                    src={current.image_url}
                    alt=""
                    aria-hidden="true"
                    className="h-full w-full object-cover object-center transition-transform duration-700 ease-out group-hover:scale-[1.02]"
                  />
                )}

                {/* Subtle Contrast Gradient Overlays (Preserves artwork clarity on right, guarantees text contrast on left/bottom) */}
                {/* Desktop Left-to-Right Gradient */}
                <div className="hidden md:block absolute inset-y-0 left-0 w-3/5 lg:w-1/2 bg-gradient-to-r from-slate-950/90 via-slate-950/65 to-transparent pointer-events-none" />
                {/* Mobile Bottom-to-Top Gradient */}
                <div className="md:hidden absolute inset-0 bg-gradient-to-t from-slate-950/95 via-slate-950/60 to-slate-950/15 pointer-events-none" />
                {/* Subtle Bottom Vignette for Controls Readability */}
                <div className="absolute inset-x-0 bottom-0 h-16 sm:h-20 bg-gradient-to-t from-slate-950/50 to-transparent pointer-events-none" />
              </div>

              {/* Foreground Showcase Content */}
              <div className="relative z-10 flex flex-col justify-between h-full p-5 sm:p-8 md:p-10 lg:p-12">
                {/* Upper Content: Badge, Title & Description */}
                <div className="max-w-xl lg:max-w-2xl space-y-2 sm:space-y-3">
                  {/* Badge */}
                  {current.badge && (
                    <div className="inline-flex items-center gap-1.5 rounded-full border border-blue-400/40 bg-blue-600/35 px-3.5 py-1 text-[11px] sm:text-xs font-black uppercase tracking-wider text-blue-100 backdrop-blur-md shadow-sm">
                      <Sparkles size={12} className="text-blue-300" />
                      <span>{current.badge}</span>
                    </div>
                  )}

                  {/* Campaign Title */}
                  <h3 className="text-xl min-[400px]:text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black tracking-tight text-white drop-shadow-md leading-[1.12] line-clamp-2">
                    {current.title}
                  </h3>

                  {/* Supporting Description */}
                  {current.description && (
                    <p className="text-xs sm:text-sm md:text-base lg:text-lg font-medium text-slate-200 line-clamp-2 md:line-clamp-3 leading-relaxed drop-shadow-sm max-w-lg lg:max-w-xl">
                      {current.description}
                    </p>
                  )}
                </div>

                {/* Lower Content: Countdown Timer & CTA */}
                <div className="mt-4 flex flex-col min-[480px]:flex-row min-[480px]:items-end justify-between gap-4">
                  {/* React Bits Countdown Display */}
                  {current.show_countdown && current.ends_at ? (
                    <CampaignCountdownDisplay
                      endsAt={current.ends_at}
                      heading={current.countdown_heading}
                    />
                  ) : (
                    <div />
                  )}

                  {/* High-Impact CTA Button */}
                  <div className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-2.5 sm:px-6 sm:py-3.5 text-xs sm:text-sm md:text-base font-bold text-slate-950 shadow-xl transition-all duration-300 ease-out group-hover:bg-primary group-hover:text-white group-hover:shadow-2xl group-hover:-translate-y-0.5 active:bg-[#071f5c] active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 shrink-0 self-start min-[480px]:self-auto motion-reduce:transition-none motion-reduce:group-hover:translate-y-0">
                    <span>{current.cta_label || "Explore Now"}</span>
                    <ArrowRight
                      size={16}
                      className="transition-transform duration-300 ease-out group-hover:translate-x-1 motion-reduce:group-hover:translate-x-0"
                    />
                  </div>
                </div>
              </div>
            </Link>
          </motion.div>
        </AnimatePresence>

        {/* Carousel Controls (Previous / Next Buttons) */}
        {count > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                prevSlide();
              }}
              aria-label="Previous promotional campaign"
              className="absolute left-3 sm:left-5 top-1/2 -translate-y-1/2 z-20 flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-slate-950/60 text-white backdrop-blur-md border border-white/25 shadow-xl transition hover:bg-slate-900/90 hover:scale-110 active:scale-95 focus:outline-none"
            >
              <ChevronLeft size={22} />
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                nextSlide();
              }}
              aria-label="Next promotional campaign"
              className="absolute right-3 sm:right-5 top-1/2 -translate-y-1/2 z-20 flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-slate-950/60 text-white backdrop-blur-md border border-white/25 shadow-xl transition hover:bg-slate-900/90 hover:scale-110 active:scale-95 focus:outline-none"
            >
              <ChevronRight size={22} />
            </button>

            {/* Pagination Indicators */}
            <div className="absolute bottom-3 sm:bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 rounded-full bg-black/40 px-3 py-1.5 backdrop-blur-md border border-white/10">
              {activeCampaigns.map((_, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    setCurrentIndex(index);
                  }}
                  aria-label={`Go to promotional slide ${index + 1}`}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    index === currentIndex
                      ? "w-6 bg-white shadow-xs"
                      : "w-2 bg-white/40 hover:bg-white/70"
                  }`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default PromotionalHeroCarousel;
