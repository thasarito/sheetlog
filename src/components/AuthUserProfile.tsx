import { useAuth } from "./providers";

type AuthUserProfileProps = {
  /** Show only the avatar, hide name */
  compact?: boolean;
};

export function AuthUserProfile({ compact = false }: AuthUserProfileProps) {
  const { userProfile, isInitialized, accessToken } = useAuth();

  if (!isInitialized || !accessToken || !userProfile) {
    return null;
  }

  const fallbackInitial =
    userProfile.name.trim().charAt(0).toUpperCase() || "U";

  if (compact) {
    return (
      <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-border bg-surface-2">
        {userProfile.picture ? (
          <img
            alt={`${userProfile.name} profile`}
            className="h-full w-full object-cover"
            src={userProfile.picture}
          />
        ) : (
          <span className="text-[11px] text-muted-foreground">
            {fallbackInitial}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex max-w-md mx-auto items-center gap-2 px-3 py-2 text-xs font-semibold text-foreground">
      <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-border bg-surface-2">
        {userProfile.picture ? (
          <img
            alt={`${userProfile.name} profile`}
            className="h-full w-full object-cover"
            src={userProfile.picture}
          />
        ) : (
          <span className="text-[11px] text-muted-foreground">
            {fallbackInitial}
          </span>
        )}
      </div>
      <span className="max-w-[140px] truncate">{userProfile.name}</span>
    </div>
  );
}
