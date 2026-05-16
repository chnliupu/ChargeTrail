import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  changeCurrentPassword,
  getCurrentSession,
  getSetupStatus,
  signInWithEmail,
  signOutSession,
  setupFirstAdmin,
  updateCurrentUser,
  type ChangeCurrentPasswordInput,
  type SetupAdminInput,
  type SignedInUser,
  type UpdateCurrentUserInput,
} from '../api/auth';
import { AuthContext, type AuthContextValue } from './AuthContext';

type AuthProviderProps = {
  children: ReactNode;
};

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<SignedInUser | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function bootstrapSession() {
      try {
        const [sessionResult, setupResult] = await Promise.allSettled([
          getCurrentSession(),
          getSetupStatus(),
        ]);

        if (cancelled) return;

        const sessionUser =
          sessionResult.status === 'fulfilled'
            ? sessionResult.value.user
            : null;
        const setupNeeded =
          setupResult.status === 'fulfilled'
            ? setupResult.value.noAdmin
            : false;

        setUser(sessionUser);
        // A setup-status failure should not block normal login.
        setNeedsSetup(Boolean(setupNeeded && !sessionUser));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void bootstrapSession();

    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(
    async (input: { email: string; password: string }) => {
      const result = await signInWithEmail(input);
      setUser(result.user);
      setNeedsSetup(false);
      return result.user;
    },
    [],
  );

  const setupAdmin = useCallback(async (input: SetupAdminInput) => {
    const result = await setupFirstAdmin(input);
    setUser(result.user);
    setNeedsSetup(false);
    return result.user;
  }, []);

  const signOut = useCallback(async () => {
    try {
      await signOutSession();
    } finally {
      setUser(null);
    }
  }, []);

  const updateProfile = useCallback(async (input: UpdateCurrentUserInput) => {
    const updated = await updateCurrentUser(input);
    setUser(updated);
    return updated;
  }, []);

  const changePassword = useCallback(
    async (input: ChangeCurrentPasswordInput) => {
      await changeCurrentPassword(input);
    },
    [],
  );

  const value = useMemo<AuthContextValue>(() => {
    return {
      isLoading,
      needsSetup,
      user,
      signIn,
      setupAdmin,
      signOut,
      updateProfile,
      changePassword,
    };
  }, [
    isLoading,
    needsSetup,
    user,
    signIn,
    setupAdmin,
    signOut,
    updateProfile,
    changePassword,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
