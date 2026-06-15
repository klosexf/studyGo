import clsx from "clsx";
import { forwardRef, type ButtonHTMLAttributes } from "react";

export type ButtonVariant =
  | "primary"
  | "sage"
  | "yellow"
  | "lavender"
  | "secondary"
  | "danger"
  | "ghost";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { className, type = "button", variant = "secondary", ...props },
    ref,
  ) {
    return (
      <button
        ref={ref}
        className={clsx("ui-button", `ui-button--${variant}`, className)}
        type={type}
        {...props}
      />
    );
  },
);
