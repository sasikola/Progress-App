import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { StyleSheet, View } from 'react-native';
import { AppText } from '../../components/common/AppText';
import { Screen } from '../../components/common/Screen';
import { Entrance } from '../../components/common/Entrance';
import { Button } from '../../components/buttons/Button';
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '../../components/feedback/States';
import { useAuth } from '../../services/auth/AuthProvider';
import { useProfile } from '../../services/profile/useProfile';
import { goalOptions } from '../../services/profile/validation';
import { useHome } from '../../services/home/useHome';
import { weightChange } from '../../services/home/homeService';
import { calculateDailyNutrition } from '../../services/nutrition/calculations';
import {
  entryNutrition,
  isNutritionSetupMissing,
  localDay,
} from '../../services/nutrition/model';
import { useDailyNutrition } from '../../services/nutrition/useNutrition';
import { colors, radius, spacing } from '../../theme';
import type { MainTabParamList } from '../../navigation/types';

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : date.toLocaleDateString();
}

export function HomeScreen({
  navigation,
}: BottomTabScreenProps<MainTabParamList, 'Home'>) {
  const { session } = useAuth();
  const profile = useProfile(session?.user.id);
  const { weights, recentWorkout } = useHome(session?.user.id);
  const today = localDay();
  const { entries: nutritionEntries, target: nutritionTarget } =
    useDailyNutrition(session?.user.id, today);
  const [refreshing, setRefreshing] = useState(false);
  const { refetch: refreshProfile } = profile;
  const { refetch: refreshWeights } = weights;
  const { refetch: refreshWorkout } = recentWorkout;
  const { refetch: refreshNutritionEntries } = nutritionEntries;
  const { refetch: refreshNutritionTarget } = nutritionTarget;
  useFocusEffect(
    useCallback(() => {
      if (!session?.user.id) return;
      refreshWeights();
      refreshWorkout();
      refreshNutritionEntries();
      refreshNutritionTarget();
    }, [
      session?.user.id,
      refreshWeights,
      refreshWorkout,
      refreshNutritionEntries,
      refreshNutritionTarget,
    ]),
  );
  async function refresh() {
    setRefreshing(true);
    try {
      await Promise.all([
        refreshProfile(),
        refreshWeights(),
        refreshWorkout(),
        refreshNutritionEntries(),
        refreshNutritionTarget(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }
  const latestWeight = weights.data?.[0];
  const change = weightChange(weights.data ?? []);
  const workout = recentWorkout.data?.workout;
  const goal = goalOptions.find(
    option => option.value === profile.data?.goal,
  )?.label;
  const nutritionSetupMissing =
    isNutritionSetupMissing(nutritionEntries.error) ||
    isNutritionSetupMissing(nutritionTarget.error);
  const nutritionConsumed = nutritionEntries.data
    ? calculateDailyNutrition(nutritionEntries.data.map(entryNutrition))
    : null;
  return (
    <Screen onRefresh={refresh} refreshing={refreshing}>
      <Entrance>
        <View style={styles.hero}>
          <AppText variant="eyebrow" tone="accent">
            YOUR DAILY PROGRESS
          </AppText>
          <AppText variant="title" accessibilityRole="header">
            {profile.data?.name ? `Hi, ${profile.data.name}.` : 'Welcome back.'}
          </AppText>
          <AppText tone="secondary">A little stronger. Every day.</AppText>
        </View>
      </Entrance>
      <View style={styles.card}>
        <AppText variant="label">Your goal</AppText>
        {profile.isLoading ? (
          <LoadingState label="Loading your goal…" />
        ) : profile.isError ? (
          <ErrorState
            description="Your goal couldn’t be refreshed."
            action={{ label: 'Retry profile', onPress: () => refreshProfile() }}
          />
        ) : (
          <AppText variant="heading">{goal ?? 'No goal selected yet'}</AppText>
        )}
      </View>
      <View style={styles.hero}>
        <Button
          label="Start Workout"
          onPress={() => navigation.navigate('Workout', { start: true })}
        />
        <AppText variant="caption" tone="secondary">
          Start a session, or resume your saved workout.
        </AppText>
      </View>
      <View style={styles.card}>
        <AppText variant="heading" accessibilityRole="header">
          Nutrition
        </AppText>
        {nutritionEntries.isLoading || nutritionTarget.isLoading ? (
          <LoadingState label="Loading nutrition…" />
        ) : nutritionSetupMissing ? (
          <EmptyState
            title="Nutrition setup needed"
            description="Apply the Phase 9 SQL migration to start tracking meals."
          />
        ) : nutritionEntries.isError || nutritionTarget.isError ? (
          <ErrorState
            description="We couldn’t load today’s nutrition."
            action={{
              label: 'Retry nutrition',
              onPress: () => {
                refreshNutritionEntries();
                refreshNutritionTarget();
              },
            }}
          />
        ) : !nutritionTarget.data ? (
          <EmptyState
            title="No nutrition target set"
            description="Set a daily calorie target to start tracking what you eat."
            action={{
              label: 'Go to Nutrition',
              onPress: () => navigation.navigate('Nutrition'),
            }}
          />
        ) : (
          nutritionConsumed && (
            <>
              <AppText variant="title">
                {nutritionConsumed.calories} / {nutritionTarget.data.calories} kcal
              </AppText>
              <AppText tone="secondary">
                {nutritionConsumed.proteinG} / {nutritionTarget.data.protein_g} g
                protein
              </AppText>
            </>
          )
        )}
      </View>
      <View style={styles.card}>
        <AppText variant="heading" accessibilityRole="header">
          Latest weight
        </AppText>
        {weights.isLoading ? (
          <LoadingState label="Loading weight…" />
        ) : weights.isError ? (
          <ErrorState
            description="We couldn’t refresh your weight. Check your connection and try again."
            action={{ label: 'Retry weight', onPress: () => refreshWeights() }}
          />
        ) : latestWeight ? (
          <>
            <AppText variant="title">
              {latestWeight.weight} {latestWeight.unit}
            </AppText>
            <AppText variant="caption" tone="secondary">
              Recorded {dateLabel(latestWeight.recorded_at)}
            </AppText>
          </>
        ) : (
          <EmptyState
            title="No weight recorded"
            description="Record your body weight in the Progress tab to start tracking changes."
          />
        )}
      </View>
      <View style={styles.card}>
        <AppText variant="heading" accessibilityRole="header">
          Recent workout
        </AppText>
        {recentWorkout.isLoading ? (
          <LoadingState label="Loading recent workout…" />
        ) : recentWorkout.isError ? (
          <ErrorState
            description="We couldn’t load your recent workout."
            action={{
              label: 'Retry workouts',
              onPress: () => refreshWorkout(),
            }}
          />
        ) : workout ? (
          <>
            <AppText variant="label">
              Completed {dateLabel(workout.completed_at)}
            </AppText>
            <AppText tone="secondary">
              {workout.duration_seconds == null
                ? 'Duration not recorded'
                : `${Math.max(
                    0,
                    Math.round(workout.duration_seconds / 60),
                  )} min of training`}
            </AppText>
          </>
        ) : (
          <EmptyState
            title={
              recentWorkout.data?.available === false
                ? 'Workout database setup needed'
                : 'No completed workouts yet'
            }
            description="Finish a workout to see it here. If setup is needed, apply the Phase 4 SQL migration first."
          />
        )}
      </View>
      <View style={styles.card}>
        <AppText variant="heading" accessibilityRole="header">
          Progress highlights
        </AppText>
        <AppText variant="label">
          {change && !weights.isError
            ? `${change.value > 0 ? '+' : ''}${change.value.toFixed(1)} ${
                change.unit
              } since your previous entry`
            : 'Your starting point matters'}
        </AppText>
        <AppText tone="secondary">
          {weights.isLoading
            ? 'Loading your weight history…'
            : weights.isError
            ? 'Weight highlights are unavailable until your weight refreshes.'
            : change
            ? 'Based on your two most recent weight entries. Changes are shown without judging them as good or bad.'
            : latestWeight
            ? 'Your first weight is recorded. A second entry will make a comparison possible.'
            : 'Weight changes will appear after you have recorded at least two entries.'}
        </AppText>
        <AppText variant="caption" tone="secondary">
          Load records appear in each completed workout’s summary.
        </AppText>
      </View>
    </Screen>
  );
}
const styles = StyleSheet.create({
  hero: { gap: spacing.lg },
  card: {
    backgroundColor: colors.secondarySurface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.md,
  },
});
