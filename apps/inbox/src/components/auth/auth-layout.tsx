import { BrandMark } from "@/components/brand-mark";
import { FrameCorners } from "@/components/frame-corners";

function HatchBand() {
  return (
    <div aria-hidden="true" className="relative h-8 border-y bg-hatch">
      <FrameCorners />
      <FrameCorners bottom />
    </div>
  );
}

export function AuthLayout({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="min-h-svh bg-hatch">
      <div className="mx-auto flex min-h-svh w-full max-w-[460px] flex-col border-x bg-background">
        <header className="relative flex h-14 items-center justify-center gap-2.5 border-b">
          <BrandMark className="size-7" />
          <span className="text-[17px] font-semibold tracking-tight">Intentlock</span>
          <FrameCorners bottom />
        </header>
        <div className="flex flex-1 flex-col justify-center py-10">
          <HatchBand />
          <section className="px-6 py-8 sm:px-10">
            <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
            {description && (
              <p className="mt-1.5 text-[13px] text-muted-foreground">{description}</p>
            )}
            <div className="mt-6">{children}</div>
          </section>
          <HatchBand />
          {footer && (
            <div className="px-6 pt-5 text-center text-[13px] text-muted-foreground sm:px-10">
              {footer}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
