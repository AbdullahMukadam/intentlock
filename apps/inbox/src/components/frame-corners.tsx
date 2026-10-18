const MARK = "pointer-events-none absolute z-10 size-2 border border-input bg-background";

export function FrameCorners({ bottom = false }: { bottom?: boolean }) {
  const edge = bottom ? "-bottom-[4.5px]" : "-top-[4.5px]";
  return (
    <>
      <span aria-hidden="true" className={`${MARK} ${edge} -left-[4.5px]`} />
      <span aria-hidden="true" className={`${MARK} ${edge} -right-[4.5px]`} />
    </>
  );
}
