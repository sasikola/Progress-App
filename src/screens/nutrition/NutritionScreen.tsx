import { useCallback, useState } from 'react';
import { Alert, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { Screen } from '../../components/common/Screen';
import { AppText } from '../../components/common/AppText';
import { Button } from '../../components/buttons/Button';
import {
  ErrorState,
  LoadingState,
  EmptyState,
} from '../../components/feedback/States';
import { useAuth } from '../../services/auth/AuthProvider';
import { localId } from '../../services/workout/model';
import { calculateDailyNutrition } from '../../services/nutrition/calculations';
import {
  entryNutrition,
  localDay,
  mealTypes,
  nutritionError,
  type CustomFoodInput,
  type Food,
  type FoodEntry,
  type MealType,
} from '../../services/nutrition/model';
import {
  useCreateCustomFood,
  useDailyNutrition,
  useDeleteFoodEntry,
  useFood,
  useLogFoodEntry,
  useSetNutritionTarget,
  useUpdateFoodEntry,
} from '../../services/nutrition/useNutrition';
import {
  CustomFoodForm,
  FoodDetailPanel,
  FoodSearchPanel,
  MealSection,
  NutritionSummaryCard,
  TargetForm,
  nutritionStyles,
} from './NutritionParts';
import { ScanBarcodePanel } from './BarcodeScanner';

type ViewName =
  | 'home'
  | 'search'
  | 'detail'
  | 'targets'
  | 'customFood'
  | 'scan';

function NutritionHome({
  userId,
  goToSearch,
  goToTargets,
  onEdit,
  onDelete,
}: {
  userId: string;
  goToSearch: (mealType: MealType) => void;
  goToTargets: () => void;
  onEdit: (entry: FoodEntry) => void;
  onDelete: (entry: FoodEntry) => void;
}) {
  const today = localDay();
  const { entries, target } = useDailyNutrition(userId, today);
  if (entries.isPending || target.isPending) {
    return <LoadingState label="Loading today's nutrition…" />;
  }
  if (entries.isError || target.isError) {
    return (
      <ErrorState
        description={nutritionError(entries.error ?? target.error)}
        action={{
          label: 'Retry',
          onPress: () => {
            entries.refetch();
            target.refetch();
          },
        }}
      />
    );
  }
  if (!target.data) {
    return (
      <EmptyState
        title="Set your daily nutrition target"
        description="Set a calorie and macro target to start tracking your intake."
        action={{ label: 'Set target', onPress: goToTargets }}
      />
    );
  }
  const consumed = calculateDailyNutrition(entries.data.map(entryNutrition));
  const goalTarget = {
    calories: target.data.calories,
    proteinG: target.data.protein_g,
    carbsG: target.data.carbs_g,
    fatG: target.data.fat_g,
  };
  return (
    <View style={nutritionStyles.section}>
      <NutritionSummaryCard target={goalTarget} consumed={consumed} />
      <Button label="Edit target" variant="secondary" onPress={goToTargets} />
      {mealTypes.map(mealType => (
        <MealSection
          key={mealType}
          mealType={mealType}
          entries={entries.data.filter(entry => entry.meal_type === mealType)}
          onAddFood={() => goToSearch(mealType)}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </View>
  );
}

function EditEntryPanel({
  userId,
  entry,
  onDone,
}: {
  userId: string;
  entry: FoodEntry;
  onDone: () => void;
}) {
  const food = useFood(entry.food_id);
  const update = useUpdateFoodEntry(userId, entry.local_date);
  const [error, setError] = useState<string | null>(null);
  if (food.isPending) return <LoadingState label="Loading food…" />;
  if (food.isError || !food.data) {
    return (
      <ErrorState
        description={nutritionError(food.error)}
        action={{ label: 'Retry', onPress: () => food.refetch() }}
      />
    );
  }
  return (
    <FoodDetailPanel
      food={food.data}
      mode="edit"
      initialQuantity={entry.quantity}
      initialMealType={entry.meal_type}
      submitting={update.isPending}
      submitLabel="Save changes"
      error={error}
      onSubmit={async ({ quantity, unit, nutrition }) => {
        setError(null);
        try {
          await update.mutateAsync({ entryId: entry.id, quantity, unit, nutrition });
          onDone();
        } catch (cause) {
          setError(nutritionError(cause));
        }
      }}
    />
  );
}

function AddEntryPanel({
  userId,
  food,
  mealType,
  onDone,
}: {
  userId: string;
  food: Food;
  mealType: MealType;
  onDone: () => void;
}) {
  const today = localDay();
  const log = useLogFoodEntry(userId);
  const [error, setError] = useState<string | null>(null);
  return (
    <FoodDetailPanel
      food={food}
      mode="add"
      initialQuantity={food.servingSize ? 1 : 100}
      initialMealType={mealType}
      submitting={log.isPending}
      submitLabel="Add to meal"
      error={error}
      onSubmit={async ({ quantity, unit, mealType: selectedMeal, nutrition }) => {
        setError(null);
        try {
          await log.mutateAsync({
            clientId: localId(),
            foodId: food.id,
            mealType: selectedMeal,
            consumedAt: new Date().toISOString(),
            localDate: today,
            quantity,
            unit,
            nutrition,
          });
          onDone();
        } catch (cause) {
          setError(nutritionError(cause));
        }
      }}
    />
  );
}

function CreateCustomFoodPanel({
  userId,
  onCreated,
}: {
  userId: string;
  onCreated: (food: Food) => void;
}) {
  const create = useCreateCustomFood(userId);
  const [error, setError] = useState<string | null>(null);
  return (
    <CustomFoodForm
      submitting={create.isPending}
      error={error}
      onSubmit={async (input: CustomFoodInput) => {
        setError(null);
        try {
          const food = await create.mutateAsync(input);
          onCreated(food);
        } catch (cause) {
          setError(nutritionError(cause));
        }
      }}
    />
  );
}

function NutritionArea({ userId }: { userId: string }) {
  const [view, setView] = useState<ViewName>('home');
  const [pendingMeal, setPendingMeal] = useState<MealType>('breakfast');
  const [selectedFood, setSelectedFood] = useState<Food | null>(null);
  const [editingEntry, setEditingEntry] = useState<FoodEntry | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [targetError, setTargetError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const setTarget = useSetNutritionTarget(userId);
  const deleteEntry = useDeleteFoodEntry(userId, localDay());
  const target = useDailyNutrition(userId, localDay()).target;

  useFocusEffect(
    useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ['nutrition', userId] });
    }, [queryClient, userId]),
  );

  function goHome() {
    setSelectedFood(null);
    setEditingEntry(null);
    setView('home');
  }
  function confirmDelete(entry: FoodEntry) {
    Alert.alert(
      'Delete entry?',
      `Remove ${entry.foods?.name ?? 'this food'} from your log?`,
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteEntry.mutate(entry.id),
        },
      ],
    );
  }
  async function refresh() {
    setRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ['nutrition', userId] });
    } finally {
      setRefreshing(false);
    }
  }

  // The camera preview needs the full screen, not the padded/scrollable
  // Screen wrapper every other view uses.
  if (view === 'scan') {
    return (
      <ScanBarcodePanel
        onFound={food => {
          setSelectedFood(food);
          setView('detail');
        }}
        onCancel={() => setView('search')}
      />
    );
  }

  return (
    <Screen onRefresh={view === 'home' ? refresh : undefined} refreshing={refreshing}>
      <AppText variant="eyebrow" tone="accent">
        EAT · COMPARE · UNDERSTAND
      </AppText>
      <AppText variant="title" accessibilityRole="header">
        {view === 'search'
          ? 'Add food'
          : view === 'detail'
          ? editingEntry
            ? 'Edit entry'
            : 'Add to meal'
          : view === 'targets'
          ? 'Nutrition target'
          : view === 'customFood'
          ? 'Create a custom food'
          : 'Nutrition'}
      </AppText>
      {view === 'home' && (
        <NutritionHome
          userId={userId}
          goToSearch={mealType => {
            setPendingMeal(mealType);
            setView('search');
          }}
          goToTargets={() => setView('targets')}
          onEdit={entry => {
            setEditingEntry(entry);
            setView('detail');
          }}
          onDelete={confirmDelete}
        />
      )}
      {view === 'search' && (
        <View style={nutritionStyles.section}>
          <FoodSearchPanel
            userId={userId}
            onSelect={food => {
              setSelectedFood(food);
              setView('detail');
            }}
            onCreateCustomFood={() => setView('customFood')}
            onScanBarcode={() => setView('scan')}
          />
          <Button label="Back to Nutrition" variant="secondary" onPress={goHome} />
        </View>
      )}
      {view === 'customFood' && (
        <View style={nutritionStyles.section}>
          <CreateCustomFoodPanel
            userId={userId}
            onCreated={food => {
              setSelectedFood(food);
              setView('detail');
            }}
          />
          <Button
            label="Back to search"
            variant="secondary"
            onPress={() => setView('search')}
          />
        </View>
      )}
      {view === 'detail' && editingEntry && (
        <View style={nutritionStyles.section}>
          <EditEntryPanel userId={userId} entry={editingEntry} onDone={goHome} />
          <Button label="Cancel" variant="secondary" onPress={goHome} />
        </View>
      )}
      {view === 'detail' && !editingEntry && selectedFood && (
        <View style={nutritionStyles.section}>
          <AddEntryPanel
            userId={userId}
            food={selectedFood}
            mealType={pendingMeal}
            onDone={goHome}
          />
          <Button label="Back to search" variant="secondary" onPress={() => setView('search')} />
        </View>
      )}
      {view === 'targets' && (
        <View style={nutritionStyles.section}>
          <TargetForm
            initial={
              target.data
                ? {
                    calories: target.data.calories,
                    proteinG: target.data.protein_g,
                    carbsG: target.data.carbs_g,
                    fatG: target.data.fat_g,
                  }
                : null
            }
            submitting={setTarget.isPending}
            error={targetError}
            onSubmit={async input => {
              setTargetError(null);
              try {
                await setTarget.mutateAsync({
                  clientId: localId(),
                  ...input,
                  effectiveFrom: localDay(),
                });
                goHome();
              } catch (cause) {
                setTargetError(nutritionError(cause));
              }
            }}
          />
          <Button label="Back to Nutrition" variant="secondary" onPress={goHome} />
        </View>
      )}
    </Screen>
  );
}

export function NutritionScreen() {
  const { session } = useAuth();
  return session ? (
    <NutritionArea key={session.user.id} userId={session.user.id} />
  ) : null;
}
