import { cn } from "@intentlock/ui/lib/utils";
import Image from "next/image";

export function BrandMark({ className }: { className?: string }) {
  return (
    <Image
      src="/apple-touch-icon.png"
      alt=""
      width={32}
      height={32}
      unoptimized
      className={cn(
        "size-8 shrink-0 object-contain mix-blend-multiply dark:mix-blend-screen dark:invert",
        className,
      )}
    />
  );
}
