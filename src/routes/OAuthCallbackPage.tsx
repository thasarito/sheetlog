import { useEffect } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

type OAuthSearchParams = {
  code?: string;
  error?: string;
};

export function OAuthCallbackPage() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as OAuthSearchParams;

  useEffect(() => {
    if (search.code || search.error) {
      return;
    }
    navigate({ to: "/app", replace: true, search: {} });
  }, [navigate, search.code, search.error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">Redirecting...</p>
    </div>
  );
}

