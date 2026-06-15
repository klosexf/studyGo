import clsx from "clsx";
import type { HTMLAttributes } from "react";

export type CardTone = "ivory" | "sage" | "yellow" | "lavender";

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  tone?: CardTone;
};

export function Card({
  className,
  tone = "ivory",
  ...props
}: CardProps) {
  return (
    <div
      className={clsx("ui-card", `ui-card--${tone}`, className)}
      {...props}
    />
  );
}
