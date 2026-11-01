// src/components/Counter.tsx
// React Bits Animated Odometer Counter Component
// Rolls digits smoothly into place while preserving screen-reader accessibility and reduced-motion preferences.

import React from "react";
import "./Counter.css";

export interface CounterProps {
  value: string | number;
  className?: string;
  style?: React.CSSProperties;
  ariaLabel?: string;
}

export function Counter({ value, className = "", style = {}, ariaLabel }: CounterProps) {
  const stringValue = String(value);

  return (
    <div
      className={`react-bits-counter ${className}`}
      style={style}
      aria-label={ariaLabel || stringValue}
    >
      {/* Accessible screen reader announcement */}
      <span className="sr-only">{ariaLabel || stringValue}</span>

      {/* Visual rolling digit display */}
      <span aria-hidden="true" className="inline-flex items-center">
        {stringValue.split("").map((char, index) => {
          // Non-digit characters (colons, spaces, separators) render statically
          if (isNaN(Number(char)) || char === " ") {
            return (
              <span key={`char-${index}`} className="counter-char">
                {char === " " ? "\u00A0" : char}
              </span>
            );
          }

          const digit = parseInt(char, 10);

          return (
            <div key={`digit-col-${index}`} className="counter-column-container">
              <div
                className="counter-column"
                style={{
                  transform: `translateY(-${digit * 10}%)`,
                }}
              >
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                  <span key={num} className="counter-digit">
                    {num}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </span>
    </div>
  );
}

export default Counter;
