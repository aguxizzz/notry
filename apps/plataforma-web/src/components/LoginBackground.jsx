import { memo } from 'react';

const LoginBackground = memo(function LoginBackground() {
  return (
    <svg
      className="login-territory-map"
      viewBox="0 0 900 900"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <filter id="login-paper-noise">
          <feTurbulence
            type="fractalNoise"
            baseFrequency=".75"
            numOctaves="2"
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncA type="table" tableValues="0 .045" />
          </feComponentTransfer>
        </filter>
      </defs>

      <rect width="900" height="900" fill="#e9e0d1" />
      <rect
        width="900"
        height="900"
        filter="url(#login-paper-noise)"
        opacity=".55"
      />

      <g
        transform="translate(-92 32) rotate(-11 450 450)"
        fill="none"
        stroke="#5c5348"
        strokeWidth="1.2"
      >
        <path d="M70 120 272 86 298 238 101 271Z" />
        <path d="M272 86 476 52 501 205 298 238Z" />
        <path d="M476 52 680 18 707 171 501 205Z" />
        <path d="M680 18 883 -16 909 138 707 171Z" />
        <path d="M101 271 298 238 324 390 128 425Z" />
        <path d="M298 238 501 205 527 357 324 390Z" />
        <path d="M501 205 707 171 733 324 527 357Z" />
        <path d="M707 171 909 138 936 290 733 324Z" />
        <path d="M128 425 324 390 351 544 153 579Z" />
        <path d="M324 390 527 357 553 510 351 544Z" />
        <path d="M527 357 733 324 759 477 553 510Z" />
        <path d="M733 324 936 290 962 444 759 477Z" />
        <path d="M183 723 377 684 408 840 213 880Z" />
        <path d="M377 684 579 643 609 799 408 840Z" />
        <path d="M579 643 783 600 815 757 609 799Z" />
        <path d="M783 600 985 556 1018 713 815 757Z" />
      </g>

      <g
        transform="translate(-92 32) rotate(-11 450 450)"
        fill="#c5a059"
        opacity=".28"
      >
        <path d="M501 205 707 171 733 324 527 357Z" />
        <path d="M183 723 377 684 408 840 213 880Z" />
      </g>

      <path
        d="M-30 650C212 525 404 570 544 502c163-79 235-225 412-298"
        fill="none"
        stroke="#f7f1e8"
        strokeWidth="58"
      />
      <path
        d="M-30 650C212 525 404 570 544 502c163-79 235-225 412-298"
        fill="none"
        stroke="#6e665c"
        strokeWidth="1.4"
        strokeDasharray="7 6"
      />

      <g transform="translate(-92 32) rotate(-11 450 450)">
        <circle cx="617" cy="265" r="13" fill="#1f1d22" />
        <circle cx="617" cy="265" r="4" fill="#d7b66f" />
        <text x="639" y="262" fill="#39343a" fontSize="11">
          LOS AROMOS
        </text>
        <text x="639" y="279" fill="#766e65" fontSize="9">
          142 LOTES
        </text>
      </g>
    </svg>
  );
});

export default LoginBackground;
