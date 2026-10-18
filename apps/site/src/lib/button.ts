const BASE =
  "inline-flex h-11 items-center justify-center gap-2 rounded-[5px] border px-5 text-[15px] font-medium whitespace-nowrap transition-[background,box-shadow] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export const PRIMARY_BUTTON = `${BASE} border-primary bg-[linear-gradient(180deg,color-mix(in_oklch,var(--primary),var(--background)_18%),var(--primary))] text-primary-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.18),0_1px_2px_rgb(0_0_0/0.25)] hover:brightness-110`;

export const OUTLINE_BUTTON = `${BASE} border-input bg-card text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.07)] hover:bg-muted`;
