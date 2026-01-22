import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

export function OAuthCallbackPage() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate({ to: "/", replace: true, search: {} });
  }, [navigate]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">Redirecting...</p>
    </div>
  );
}
