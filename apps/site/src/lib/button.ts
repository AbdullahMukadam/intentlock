const BASE =
  "inline-flex items-center justify-center gap-2 rounded-[5px] border font-medium whitespace-nowrap transition-[background,box-shadow] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const LARGE = "h-11 px-5 text-[15px]";

const PRIMARY = `${BASE} border-primary bg-[linear-gradient(180deg,color-mix(in_oklch,var(--primary),var(--background)_18%),var(--primary))] text-primary-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.18),0_1px_2px_rgb(0_0_0/0.25)] hover:brightness-110`;

const OUTLINE = `${BASE} border-input bg-card text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.07)] hover:bg-muted`;

export const PRIMARY_BUTTON = `${PRIMARY} ${LARGE}`;

export const OUTLINE_BUTTON = `${OUTLINE} ${LARGE}`;

export const OUTLINE_BUTTON_SMALL = `${OUTLINE} h-8 px-3 text-[13px]`;
