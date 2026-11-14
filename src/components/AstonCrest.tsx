import React from 'react';

interface AstonCrestProps {
  width?: number;
  className?: string;
}

/**
 * Architectural precision vector emblem inspired by the iconic Aston Martin Gaydon wings.
 */
export const AstonCrest: React.FC<AstonCrestProps> = ({ width = 88, className }) => {
  return (
    <svg
      width={width}
      height={Math.round(width * 0.28)}
      viewBox="0 0 220 62"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Aston Martin Emblem"
    >
      {/* Outer wing silhouette */}
      <path
        d="M8 10L68 10L86 6L110 4L134 6L152 10L212 10L192 24L168 38L136 52L110 56L84 52L52 38L28 24L8 10Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      {/* Left wing feather lines */}
      <path d="M22 17H78" stroke="currentColor" strokeWidth="1.1" strokeOpacity="0.85" />
      <path d="M35 24H82" stroke="currentColor" strokeWidth="1.1" strokeOpacity="0.75" />
      <path d="M50 31H85" stroke="currentColor" strokeWidth="1.1" strokeOpacity="0.65" />
      <path d="M66 38H88" stroke="currentColor" strokeWidth="1.1" strokeOpacity="0.55" />
      {/* Right wing feather lines */}
      <path d="M142 17H198" stroke="currentColor" strokeWidth="1.1" strokeOpacity="0.85" />
      <path d="M138 24H185" stroke="currentColor" strokeWidth="1.1" strokeOpacity="0.75" />
      <path d="M135 31H170" stroke="currentColor" strokeWidth="1.1" strokeOpacity="0.65" />
      <path d="M132 38H154" stroke="currentColor" strokeWidth="1.1" strokeOpacity="0.55" />
      {/* Center Aston badge shield */}
      <path
        d="M84 12H136L131 40L110 50L89 40L84 12Z"
        fill="#00482B"
        stroke="#C8A96E"
        strokeWidth="1.3"
      />
      <text
        x="110"
        y="29"
        textAnchor="middle"
        fill="#F2F3F0"
        fontSize="7.2"
        fontFamily="Syne, sans-serif"
        letterSpacing="2.2"
        fontWeight="600"
      >
        ASTON
      </text>
      <text
        x="110"
        y="38"
        textAnchor="middle"
        fill="#C8A96E"
        fontSize="5.4"
        fontFamily="JetBrains Mono, monospace"
        letterSpacing="1.6"
      >
        GAYDON
      </text>
    </svg>
  );
};
