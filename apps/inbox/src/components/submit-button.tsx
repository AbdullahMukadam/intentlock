"use client";

import { Button } from "@intentlock/ui/components/button";
import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";

export function SubmitButton(props: Omit<ComponentProps<typeof Button>, "type" | "loading">) {
  const { pending } = useFormStatus();
  return <Button type="submit" loading={pending} {...props} />;
}
