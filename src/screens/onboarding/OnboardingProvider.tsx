import {
  createContext,
  useCallback,
  useContext,
  useState,
  type PropsWithChildren,
} from 'react';
import { useAuth } from '../../services/auth/AuthProvider';
import { useCompleteOnboarding } from '../../services/profile/useCompleteOnboarding';
import { profileErrorMessage } from '../../services/profile/errors';
import type { Goal, WeightUnit } from '../../services/profile/validation';

type OnboardingDraft = {
  name: string;
  goal: Goal | null;
  weightValue: string;
  weightUnit: WeightUnit;
};

type OnboardingContextValue = {
  draft: OnboardingDraft;
  setName: (name: string) => void;
  setGoal: (goal: Goal) => void;
  setWeight: (weightValue: string, weightUnit: WeightUnit) => void;
  submit: () => Promise<void>;
  isSubmitting: boolean;
  error: string | null;
};

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: PropsWithChildren) {
  const { session } = useAuth();
  const [draft, setDraft] = useState<OnboardingDraft>({
    name: '',
    goal: null,
    weightValue: '',
    weightUnit: 'kg',
  });
  const [error, setError] = useState<string | null>(null);
  const mutation = useCompleteOnboarding();

  const setName = useCallback(
    (name: string) => setDraft(current => ({ ...current, name })),
    [],
  );
  const setGoal = useCallback(
    (goal: Goal) => setDraft(current => ({ ...current, goal })),
    [],
  );
  const setWeight = useCallback(
    (weightValue: string, weightUnit: WeightUnit) =>
      setDraft(current => ({ ...current, weightValue, weightUnit })),
    [],
  );
  const submit = useCallback(async () => {
    if (!session || !draft.goal) return;
    setError(null);
    try {
      await mutation.mutateAsync({
        userId: session.user.id,
        name: draft.name,
        goal: draft.goal,
        weight: draft.weightValue
          ? { value: Number(draft.weightValue), unit: draft.weightUnit }
          : undefined,
      });
    } catch (cause) {
      setError(profileErrorMessage(cause));
    }
  }, [session, draft, mutation]);

  return (
    <OnboardingContext.Provider
      value={{
        draft,
        setName,
        setGoal,
        setWeight,
        submit,
        isSubmitting: mutation.isPending,
        error,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const value = useContext(OnboardingContext);
  if (!value)
    throw new Error('useOnboarding must be used inside OnboardingProvider.');
  return value;
}
