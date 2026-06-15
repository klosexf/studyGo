import { Button } from "@/components/ui/button";

export function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="error-banner" role="alert" aria-live="assertive">
      <span>{message}</span>
      {onRetry ? (
        <Button variant="danger" onClick={onRetry}>
          重试
        </Button>
      ) : null}
    </div>
  );
}
