import { BrandMark } from "@/components/brand-mark";

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
    <main className="flex min-h-svh flex-col items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-[400px]">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <BrandMark />
          <span className="text-lg font-semibold tracking-tight">Intentlock</span>
        </div>
        <div className="bg-hatch rounded-2xl border bg-panel p-1.5">
          <div className="rounded-xl border bg-card p-6 shadow-xs sm:p-7">
            <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
            {description && (
              <p className="mt-1.5 text-[13px] text-muted-foreground">{description}</p>
            )}
            <div className="mt-6">{children}</div>
          </div>
        </div>
        {footer && (
          <div className="mt-5 text-center text-[13px] text-muted-foreground">{footer}</div>
        )}
      </div>
    </main>
  );
}
