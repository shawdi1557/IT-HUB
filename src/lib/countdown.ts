// src/lib/countdown.ts
// Robust campaign countdown calculation engine
// Handles time parsing, timezone safety (UTC storage / local display), zero-padding, and tab visibility recovery.

import { useEffect, useState } from "react";

export interface TimeRemaining {
  days: string;
  hours: string;
  minutes: string;
  seconds: string;
  totalSeconds: number;
  isExpired: boolean;
  formatted: string;
}

/**
 * Calculates remaining time until target date in UTC/local time.
 * Never produces negative numbers. Returns all zeros and isExpired = true when past.
 */
export function calculateTimeRemaining(
  target: string | Date | null | undefined,
  nowMs: number = Date.now(),
): TimeRemaining {
  if (!target) {
    return {
      days: "00",
      hours: "00",
      minutes: "00",
      seconds: "00",
      totalSeconds: 0,
      isExpired: true,
      formatted: "Expired",
    };
  }

  const targetMs = typeof target === "string" ? new Date(target).getTime() : target.getTime();

  if (isNaN(targetMs)) {
    return {
      days: "00",
      hours: "00",
      minutes: "00",
      seconds: "00",
      totalSeconds: 0,
      isExpired: true,
      formatted: "Expired",
    };
  }

  const diffMs = targetMs - nowMs;

  if (diffMs <= 0) {
    return {
      days: "00",
      hours: "00",
      minutes: "00",
      seconds: "00",
      totalSeconds: 0,
      isExpired: true,
      formatted: "Expired",
    };
  }

  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / (3600 * 24));
  const hours = Math.floor((totalSeconds % (3600 * 24)) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n: number) => String(n).padStart(2, "0");

  const formatted =
    days > 0
      ? `${pad(days)}d ${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`
      : `${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;

  return {
    days: pad(days),
    hours: pad(hours),
    minutes: pad(minutes),
    seconds: pad(seconds),
    totalSeconds,
    isExpired: false,
    formatted,
  };
}

/**
 * React hook to drive a live countdown timer.
 * Automatically recalculates every second and re-syncs when the user returns to the tab.
 */
export function useCampaignCountdown(endsAt?: string | null): TimeRemaining {
  const [timeLeft, setTimeLeft] = useState<TimeRemaining>(() => calculateTimeRemaining(endsAt));

  useEffect(() => {
    if (!endsAt) {
      setTimeLeft(calculateTimeRemaining(null));
      return;
    }

    // Immediate initial sync
    setTimeLeft(calculateTimeRemaining(endsAt));

    const interval = setInterval(() => {
      const updated = calculateTimeRemaining(endsAt);
      setTimeLeft(updated);

      if (updated.isExpired) {
        clearInterval(interval);
      }
    }, 1000);

    const doc = typeof globalThis !== "undefined" ? (globalThis as any).document : undefined;

    // Re-sync immediately when tab becomes visible again
    const handleVisibilityChange = () => {
      if (doc && doc.visibilityState === "visible") {
        setTimeLeft(calculateTimeRemaining(endsAt));
      }
    };

    if (doc) {
      doc.addEventListener("visibilitychange", handleVisibilityChange);
    }

    return () => {
      clearInterval(interval);
      if (doc) {
        doc.removeEventListener("visibilitychange", handleVisibilityChange);
      }
    };
  }, [endsAt]);

  return timeLeft;
}
