export type MainTabParamList = {
  Home: undefined;
  Workout: { start?: boolean } | undefined;
  Nutrition: undefined;
  Progress: undefined;
  You: undefined;
};
export type RootStackParamList = {
  Main: undefined;
  Auth: undefined;
  Onboarding: undefined;
  ResetPassword: undefined;
};
export type AuthStackParamList = {
  Welcome: undefined;
  SignIn: undefined;
  SignUp: undefined;
  ForgotPassword: undefined;
};
export type OnboardingStackParamList = {
  Profile: undefined;
  Goal: undefined;
  Weight: undefined;
  Complete: undefined;
};
