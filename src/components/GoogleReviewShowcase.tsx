// src/components/GoogleReviewShowcase.tsx
// IT HUB — Google Maps Customer Reviews Animated Showcase
// Seamless continuous marquee of authentic reviews: two opposing rows on desktop, one on phones,
// and a static grid for reduced motion. Pauses on hover, focus, touch and via a visible control.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FocusEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { ArrowUpRight, Pause, Play, Star } from "lucide-react";
import {
  googleReviews,
  GOOGLE_MAPS_REVIEW_URL,
  type GoogleCustomerReview,
} from "../data/googleReviews";
import { Modal } from "./ui";
import "./GoogleReviewShowcase.css";

const TOUCH_DRAG_THRESHOLD_PX = 6;
const TOUCH_RESUME_DELAY_MS = 1500;

interface GoogleReviewShowcaseProps {
  reviews?: GoogleCustomerReview[];
  className?: string;
}

function useMediaQuery(query: string) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mediaQuery = window.matchMedia(query);
      mediaQuery.addEventListener("change", onChange);
      return () => mediaQuery.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches);
}

/** Moves a track's content sideways by seeking its CSS animation, so the loop stays seamless. */
function seekTrack(track: HTMLElement, deltaPx: number) {
  const animation = track.getAnimations()[0];
  const timing = animation?.effect?.getComputedTiming();
  const duration = Number(timing?.duration);
  const halfWidth = track.getBoundingClientRect().width / 2;
  if (!animation || !duration || !halfWidth) return;

  // A forward row moves left as time advances, so moving its content right means rewinding.
  const direction = timing?.direction === "reverse" ? 1 : -1;
  const next = Number(animation.currentTime ?? 0) + (deltaPx / halfWidth) * duration * direction;
  animation.currentTime = ((next % duration) + duration) % duration;
}

export function GoogleLogo({ className = "size-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  );
}

function RatingStars({ rating, size = 13 }: { rating: number; size?: number }) {
  return (
    <div
      role="img"
      className="inline-flex items-center gap-0.5 text-amber-400"
      aria-label={`${rating} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          size={size}
          className={
            star <= rating ? "fill-amber-400 text-amber-400" : "fill-slate-200 text-slate-200"
          }
        />
      ))}
    </div>
  );
}

function ReviewCard({
  review,
  isDuplicate = false,
  onReadMore,
}: {
  review: GoogleCustomerReview;
  isDuplicate?: boolean;
  onReadMore: (review: GoogleCustomerReview) => void;
}) {
  const initials = review.authorName
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const textRef = useRef<HTMLParagraphElement>(null);
  const [isClamped, setIsClamped] = useState(false);

  // Measured, not guessed from length, so clipped text always has a way to be read in full.
  useEffect(() => {
    const text = textRef.current;
    if (!text) return;
    const observer = new ResizeObserver(() =>
      setIsClamped(text.scrollHeight > text.clientHeight + 1),
    );
    observer.observe(text);
    return () => observer.disconnect();
  }, []);

  return (
    <article
      className="google-review-card"
      aria-label={isDuplicate ? undefined : `Review by ${review.authorName}`}
    >
      <div className="flex items-center justify-between gap-3">
        <RatingStars rating={review.rating} size={15} />
        <span title="Google Maps review" className="shrink-0">
          <GoogleLogo className="size-[18px]" />
        </span>
      </div>

      <p ref={textRef} className="google-review-card__text">
        &ldquo;{review.text}&rdquo;
      </p>

      {(isClamped || review.isTruncated) && (
        <button
          type="button"
          tabIndex={isDuplicate ? -1 : undefined}
          onClick={() => onReadMore(review)}
          className="mt-2 self-start rounded text-xs font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          aria-label={isDuplicate ? undefined : `Read full review from ${review.authorName}`}
        >
          Read more
        </button>
      )}

      <footer className="mt-auto flex items-center gap-3 pt-4">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#ecf1ff] text-xs font-bold text-[#0c2f8a]">
          {initials || "C"}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{review.authorName}</p>
          <p className="text-xs text-muted-foreground">
            {review.relativeTimeDescription} · Google Maps
          </p>
        </div>
      </footer>
    </article>
  );
}

function MarqueeRow({
  reviews,
  reverse = false,
  onReadMore,
}: {
  reviews: GoogleCustomerReview[];
  reverse?: boolean;
  onReadMore: (review: GoogleCustomerReview) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragX = useRef<number | null>(null);
  const didDrag = useRef(false);
  const resumeTimer = useRef<number | undefined>(undefined);
  const [isHeld, setIsHeld] = useState(false);

  useEffect(() => () => window.clearTimeout(resumeTimer.current), []);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse") return;
    window.clearTimeout(resumeTimer.current);
    dragX.current = event.clientX;
    didDrag.current = false;
    setIsHeld(true);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (dragX.current === null || !trackRef.current) return;
    const deltaPx = event.clientX - dragX.current;
    if (!didDrag.current && Math.abs(deltaPx) < TOUCH_DRAG_THRESHOLD_PX) return;
    didDrag.current = true;
    dragX.current = event.clientX;
    seekTrack(trackRef.current, deltaPx);
  };

  // Also runs on pointercancel, which fires when the browser takes a swipe for page scrolling.
  const handlePointerEnd = () => {
    if (dragX.current === null) return;
    dragX.current = null;
    resumeTimer.current = window.setTimeout(() => setIsHeld(false), TOUCH_RESUME_DELAY_MS);
  };

  const handleClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    if (!didDrag.current) return;
    didDrag.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  // overflow: clip stops the browser scrolling to a focused card, so bring it into view here.
  const handleFocus = (event: FocusEvent<HTMLDivElement>) => {
    const card = event.target.closest("article");
    if (!card || !trackRef.current || !event.target.matches(":focus-visible")) return;
    const row = event.currentTarget.getBoundingClientRect();
    const box = card.getBoundingClientRect();
    const track = trackRef.current.getBoundingClientRect();
    const toCentre = row.left + (row.width - box.width) / 2 - box.left;
    // Stop just short of the track's start: going past it would wrap to the card's hidden duplicate.
    seekTrack(trackRef.current, Math.min(toCentre, row.left - track.left - 1));
  };

  return (
    <div
      className={`google-reviews-row ${reverse ? "google-reviews-row--reverse" : ""}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onClickCapture={handleClickCapture}
      onFocus={handleFocus}
    >
      <div ref={trackRef} className={`google-reviews-marquee-track ${isHeld ? "is-held" : ""}`}>
        {reviews.map((review) => (
          <div key={review.id} className="google-reviews-item">
            <ReviewCard review={review} onReadMore={onReadMore} />
          </div>
        ))}

        {/* Second half of the seamless loop: hidden from screen readers and the tab order. */}
        {reviews.map((review) => (
          <div
            key={`duplicate-${review.id}`}
            aria-hidden="true"
            className="google-reviews-item google-reviews-marquee-duplicate"
          >
            <ReviewCard review={review} isDuplicate onReadMore={onReadMore} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function GoogleReviewShowcase({
  reviews = googleReviews,
  className = "",
}: GoogleReviewShowcaseProps) {
  const hasReviews = Array.isArray(reviews) && reviews.length > 0;
  const [activeReviewModal, setActiveReviewModal] = useState<GoogleCustomerReview | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const isWide = useMediaQuery("(min-width: 768px)");
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

  const rows =
    isWide && !reduceMotion
      ? [reviews.filter((_, i) => i % 2 === 0), reviews.filter((_, i) => i % 2 === 1)]
      : [reviews];

  const closeReviewModal = () => {
    setActiveReviewModal(null);
    // The dialog returns focus to the Read more button. After a mouse click that focus isn't
    // visible and would hold the :focus-within pause, so release it. Keyboard users keep it.
    window.setTimeout(() => {
      const focused = document.activeElement;
      if (
        focused instanceof HTMLElement &&
        focused.closest(".google-reviews-container") &&
        !focused.matches(":focus-visible")
      ) {
        focused.blur();
      }
    }, 50);
  };

  return (
    <div className={`mt-8 pt-8 border-t border-border/70 ${className}`}>
      <div className="text-center">
        <h4 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">
          What Our Customers Say
        </h4>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Authentic feedback from verified Google Maps visitors
        </p>
      </div>

      {!hasReviews ? (
        // Empty state fallback if review dataset is unavailable
        <div className="mt-6 mx-auto max-w-lg rounded-2xl border border-border/80 bg-background/95 p-6 text-center shadow-xs">
          <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-secondary border border-border">
            <GoogleLogo className="size-5" />
          </div>
          <h5 className="text-sm font-bold text-foreground">Verified Google Reviews</h5>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            We are proud to maintain a 4.8-star rating on Google Maps from our local community. Read
            authentic customer reviews or share your experience with IT HUB Kothamangalam.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <a
              href={GOOGLE_MAPS_REVIEW_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-[#0c2f8a] px-4 py-2 text-xs font-semibold text-white shadow-2xs transition hover:bg-[#092570]"
              title="Read authentic Google customer reviews for IT HUB"
            >
              Read Google Reviews <ArrowUpRight size={13} />
            </a>
            <a
              href={GOOGLE_MAPS_REVIEW_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-border/90 bg-background px-4 py-2 text-xs font-semibold text-foreground shadow-2xs transition hover:bg-secondary"
              title="Leave a review on Google Maps"
            >
              Write a Review
            </a>
          </div>
        </div>
      ) : (
        <>
          <div
            role="group"
            aria-label="Customer reviews from Google Maps"
            className={`google-reviews-container mt-6 ${
              isPaused || activeReviewModal ? "is-paused" : ""
            }`}
          >
            {rows.map((rowReviews, index) => (
              <MarqueeRow
                key={rows.length === 1 ? "all" : index}
                reviews={rowReviews}
                reverse={index === 1}
                onReadMore={setActiveReviewModal}
              />
            ))}
          </div>

          {/* Outside the marquee, so focusing these controls doesn't hold the pause on. */}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
            {!reduceMotion && (
              <button
                type="button"
                onClick={() => setIsPaused((paused) => !paused)}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-4 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                {isPaused ? <Play size={13} /> : <Pause size={13} />}
                {isPaused ? "Play reviews" : "Pause reviews"}
              </button>
            )}
            <a
              href={GOOGLE_MAPS_REVIEW_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-[#0c2f8a] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#092570] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Read all reviews on Google <ArrowUpRight size={13} />
            </a>
          </div>
        </>
      )}

      {/* Accessible Read More Modal for long customer reviews */}
      {activeReviewModal && (
        <Modal
          open={Boolean(activeReviewModal)}
          onOpenChange={(open) => {
            if (!open) closeReviewModal();
          }}
          title={activeReviewModal.authorName}
          description={`Verified customer review · ${activeReviewModal.relativeTimeDescription}`}
          size="max-w-lg"
        >
          <div className="mt-4 space-y-4">
            <div className="flex items-center justify-between">
              <RatingStars rating={activeReviewModal.rating} size={16} />
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <GoogleLogo className="size-3.5" /> Google Maps Review
              </span>
            </div>

            <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-line font-normal">
              "{activeReviewModal.text}"
            </p>

            {activeReviewModal.isTruncated && (
              <p className="text-xs text-muted-foreground italic">
                * Note: Review snippet captured from Google Maps listing preview.
              </p>
            )}

            <div className="pt-4 border-t border-border flex items-center justify-end gap-3">
              <a
                href={GOOGLE_MAPS_REVIEW_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full bg-[#0c2f8a] px-4 py-2 text-xs font-semibold text-white shadow-2xs transition hover:bg-[#092570]"
              >
                View on Google Maps <ArrowUpRight size={13} />
              </a>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
