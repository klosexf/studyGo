import { Card } from "@/components/ui/card";

export function LoadingCard({ label }: { label: string }) {
  return (
    <Card className="loading-card" role="status" aria-live="polite">
      <span className="loading-dot" aria-hidden="true" />
      <p>{label}</p>
    </Card>
  );
}
