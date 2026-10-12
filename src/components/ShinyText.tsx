// React Bits · ShinyText (https://reactbits.dev) — TypeScript port
import { useState, useCallback, useEffect, useRef } from "react"
import {
  motion,
  useMotionValue,
  useAnimationFrame,
  useTransform,
  useReducedMotion,
} from "motion/react"
import "./ShinyText.css"

type ShinyTextProps = {
  text: string
  disabled?: boolean
  speed?: number
  className?: string
  color?: string
  shineColor?: string
  spread?: number
  yoyo?: boolean
  pauseOnHover?: boolean
  direction?: "left" | "right"
  delay?: number
}

export default function ShinyText({
  text,
  disabled = false,
  speed = 2,
  className = "",
  color = "#b5b5b5",
  shineColor = "#ffffff",
  spread = 120,
  yoyo = false,
  pauseOnHover = false,
  direction = "left",
  delay = 0,
}: ShinyTextProps) {
  const reduce = useReducedMotion()
  const [isPaused, setIsPaused] = useState(false)
  const progress = useMotionValue(0)
  const elapsedRef = useRef(0)
  const lastTimeRef = useRef<number | null>(null)
  const directionRef = useRef(direction === "left" ? 1 : -1)

  const animationDuration = speed * 1000
  const delayDuration = delay * 1000

  useAnimationFrame((time) => {
    if (disabled || isPaused || reduce) {
      lastTimeRef.current = null
      return
    }
    if (lastTimeRef.current === null) {
      lastTimeRef.current = time
      return
    }
    elapsedRef.current += time - lastTimeRef.current
    lastTimeRef.current = time
    const dir = directionRef.current

    if (yoyo) {
      const cycleDuration = animationDuration + delayDuration
      const cycleTime = elapsedRef.current % (cycleDuration * 2)
      if (cycleTime < animationDuration) {
        const p = (cycleTime / animationDuration) * 100
        progress.set(dir === 1 ? p : 100 - p)
      } else if (cycleTime < cycleDuration) {
        progress.set(dir === 1 ? 100 : 0)
      } else if (cycleTime < cycleDuration + animationDuration) {
        const p = 100 - ((cycleTime - cycleDuration) / animationDuration) * 100
        progress.set(dir === 1 ? p : 100 - p)
      } else {
        progress.set(dir === 1 ? 0 : 100)
      }
    } else {
      const cycleTime = elapsedRef.current % (animationDuration + delayDuration)
      if (cycleTime < animationDuration) {
        const p = (cycleTime / animationDuration) * 100
        progress.set(dir === 1 ? p : 100 - p)
      } else {
        progress.set(dir === 1 ? 100 : 0)
      }
    }
  })

  useEffect(() => {
    directionRef.current = direction === "left" ? 1 : -1
    elapsedRef.current = 0
    progress.set(0)
  }, [direction, progress])

  // p=0 -> 150% (shine off right), p=100 -> -50% (shine off left)
  const backgroundPosition = useTransform(
    progress,
    (p) => `${150 - p * 2}% center`,
  )

  const handleMouseEnter = useCallback(() => {
    if (pauseOnHover) setIsPaused(true)
  }, [pauseOnHover])
  const handleMouseLeave = useCallback(() => {
    if (pauseOnHover) setIsPaused(false)
  }, [pauseOnHover])

  return (
    <motion.span
      className={`shiny-text ${className}`}
      style={{
        backgroundImage: `linear-gradient(${spread}deg, ${color} 0%, ${color} 35%, ${shineColor} 50%, ${color} 65%, ${color} 100%)`,
        backgroundSize: "200% auto",
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        WebkitTextFillColor: "transparent",
        backgroundPosition,
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {text}
    </motion.span>
  )
}
