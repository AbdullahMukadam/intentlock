"use client";

import { Input } from "@intentlock/ui/components/input";
import { useState } from "react";

export function LooseInput<T>({
  value,
  toText,
  fromText,
  onValue,
  ...props
}: Omit<React.ComponentProps<typeof Input>, "value" | "onChange"> & {
  value: T;
  toText: (value: T) => string;
  fromText: (text: string) => T;
  onValue: (value: T) => void;
}) {
  const [text, setText] = useState(() => toText(value));
  const shown = toText(fromText(text)) === toText(value) ? text : toText(value);
  return (
    <Input
      {...props}
      value={shown}
      onChange={(e) => {
        setText(e.target.value);
        onValue(fromText(e.target.value));
      }}
    />
  );
}
