import { createContext } from 'react';
import type {
  ChangeCurrentPasswordInput,
  SetupAdminInput,
  SignedInUser,
  UpdateCurrentUserInput,
} from '../api/auth';

export type AuthContextValue = {
  isLoading: boolean;
  needsSetup: boolean;
  user: SignedInUser | null;
  signIn: (input: { email: string; password: string }) => Promise<SignedInUser>;
  setupAdmin: (input: SetupAdminInput) => Promise<SignedInUser>;
  signOut: () => Promise<void>;
  updateProfile: (input: UpdateCurrentUserInput) => Promise<SignedInUser>;
  changePassword: (input: ChangeCurrentPasswordInput) => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);
