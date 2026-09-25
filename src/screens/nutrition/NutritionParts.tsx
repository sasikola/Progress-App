import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { AppText } from '../../components/common/AppText';
import { TextInput } from '../../components/inputs/TextInput';
import { OptionList } from '../../components/inputs/OptionList';
import { Button } from '../../components/buttons/Button';
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '../../components/feedback/States';
import { Card, Choices } from '../progress/ProgressParts';
import {
  calculateDailyNutrition,
  calculateNutritionForQuantity,
  calculateNutritionForServing,
  calculateRemaining,
  estimateCalorieTarget,
  estimateMacroTargets,
  activityLevelOptions,
  nutritionGoalOptions,
  type ActivityLevel,
  type NutritionGoal,
  type NutritionValues,
  type Sex,
} from '../../services/nutrition/calculations';
import {
  barcodePattern,
  customFoodSchema,
  entryNutrition,
  foodBasisUnit,
  foodNutritionBasis,
  mealTypeOptions,
  nutritionError,
  type CustomFoodInput,
  type Food,
  type FoodEntry,
  type MealType,
  type QuantityUnit,
} from '../../services/nutrition/model';
import {
  useFavoriteFoods,
  useFoodSearch,
  useLookupBarcode,
  useMyCustomFoods,
  useRecentFoods,
  useToggleFavorite,
} from '../../services/nutrition/useNutrition';
import { colors, motion, radius, spacing } from '../../theme';

export const nutritionStyles = StyleSheet.create({
  section: { gap: spacing.lg },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.secondarySurface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  actions: { flexDirection: 'row', gap: spacing.lg },
  entryInfo: { flex: 1, gap: spacing.xs },
  track: {
    height: 10,
    borderRadius: radius.sm,
    backgroundColor: colors.elevated,
    overflow: 'hidden',
  },
  fill: { height: '100%', backgroundColor: colors.accent },
});

// Accepts a comma as the decimal separator, matching every other numeric
// entry field in the app (see progress/model.ts's parseEntry).
function toNumber(text: string): number {
  return Number(text.trim().replace(',', '.'));
}

function clampPercent(consumed: number, target: number) {
  if (!(target > 0)) return 0;
  return Math.max(0, Math.min(1, consumed / target));
}

export function ProgressBar({
  consumed,
  target,
  label,
}: {
  consumed: number;
  target: number;
  label: string;
}) {
  const percent = clampPercent(consumed, target);
  const reduced = useReducedMotion();
  const width = useRef(new Animated.Value(percent)).current;
  useEffect(() => {
    if (reduced) {
      width.setValue(percent);
      return;
    }
    Animated.timing(width, {
      toValue: percent,
      duration: motion.enter,
      useNativeDriver: false, // width is a layout property; native driver can't animate it.
    }).start();
  }, [percent, reduced, width]);
  return (
    <View
      style={nutritionStyles.track}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: target, now: Math.min(consumed, target) }}
    >
      <Animated.View
        style={[
          nutritionStyles.fill,
          { width: width.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
        ]}
      />
    </View>
  );
}

export function MacroBar({
  label,
  consumed,
  target,
}: {
  label: string;
  consumed: number;
  target: number;
}) {
  return (
    <View style={nutritionStyles.section}>
      <View style={nutritionStyles.row}>
        <AppText variant="label">{label}</AppText>
        <AppText tone="secondary">
          {consumed} / {target} g
        </AppText>
      </View>
      <ProgressBar
        consumed={consumed}
        target={target}
        label={`${label}: ${consumed} of ${target} grams`}
      />
    </View>
  );
}

export function NutritionSummaryCard({
  target,
  consumed,
}: {
  target: { calories: number; proteinG: number; carbsG: number; fatG: number };
  consumed: { calories: number; proteinG: number; carbsG: number; fatG: number };
}) {
  const remaining = calculateRemaining(target, consumed);
  return (
    <Card>
      <AppText variant="eyebrow" tone="accent">
        TODAY&apos;S INTAKE
      </AppText>
      <AppText variant="title">
        {consumed.calories} / {target.calories} kcal
      </AppText>
      <ProgressBar
        consumed={consumed.calories}
        target={target.calories}
        label={`${consumed.calories} of ${target.calories} calories`}
      />
      <AppText tone={remaining.status === 'over' ? 'error' : 'secondary'}>
        {remaining.status === 'over'
          ? `${Math.abs(remaining.calories)} kcal over target`
          : `${remaining.calories} kcal remaining`}
      </AppText>
      <View style={nutritionStyles.section}>
        <MacroBar label="Protein" consumed={consumed.proteinG} target={target.proteinG} />
        <MacroBar label="Carbs" consumed={consumed.carbsG} target={target.carbsG} />
        <MacroBar label="Fat" consumed={consumed.fatG} target={target.fatG} />
      </View>
      <AppText variant="caption" tone="secondary">
        Targets are goals you set, not medical prescriptions.
      </AppText>
    </Card>
  );
}

function nutrientText(label: string, value: number | null, unit: string) {
  return `${label}: ${value === null ? 'unavailable' : `${value}${unit}`}`;
}

export function NutritionPreview({ nutrition }: { nutrition: NutritionValues }) {
  return (
    <Card>
      <AppText variant="heading">{nutrition.calories} kcal</AppText>
      <AppText tone="secondary">
        {nutrition.proteinG}g protein · {nutrition.carbsG}g carbs · {nutrition.fatG}g fat
      </AppText>
      <AppText variant="caption" tone="secondary">
        {nutrientText('Fiber', nutrition.fiberG, 'g')} · {nutrientText('Sugar', nutrition.sugarG, 'g')} ·{' '}
        {nutrientText('Sodium', nutrition.sodiumMg, 'mg')}
      </AppText>
    </Card>
  );
}

function FoodResultRow({
  food,
  favorited,
  onToggleFavorite,
  onSelect,
}: {
  food: Food;
  favorited: boolean;
  onToggleFavorite: () => void;
  onSelect: () => void;
}) {
  const perBasis = foodBasisUnit(food) === 'serving' ? 'serving' : '100 g';
  return (
    <Pressable
      onPress={onSelect}
      style={nutritionStyles.card}
      accessibilityRole="button"
      accessibilityLabel={`Add ${food.name}`}
    >
      <View style={nutritionStyles.row}>
        <View style={nutritionStyles.entryInfo}>
          <AppText variant="heading">{food.name}</AppText>
          {food.brand && (
            <AppText variant="caption" tone="secondary">
              {food.brand}
            </AppText>
          )}
        </View>
        <Pressable
          onPress={onToggleFavorite}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityState={{ selected: favorited }}
          accessibilityLabel={
            favorited
              ? `Remove ${food.name} from favorites`
              : `Add ${food.name} to favorites`
          }
        >
          <AppText tone={favorited ? 'accent' : 'secondary'} variant="heading">
            {favorited ? '★' : '☆'}
          </AppText>
        </Pressable>
      </View>
      <AppText tone="secondary">
        {Math.round(food.calories)} kcal · {food.proteinG.toFixed(1)}g protein ·{' '}
        {food.carbsG.toFixed(1)}g carbs · {food.fatG.toFixed(1)}g fat per {perBasis}
      </AppText>
    </Pressable>
  );
}

function FoodResultSection({
  title,
  foods,
  favoriteIds,
  onToggleFavorite,
  onSelect,
  emptyLabel,
}: {
  title: string;
  foods: Food[];
  favoriteIds: Set<string>;
  onToggleFavorite: (food: Food) => void;
  onSelect: (food: Food) => void;
  emptyLabel?: string;
}) {
  if (!foods.length && !emptyLabel) return null;
  return (
    <View style={nutritionStyles.section}>
      <AppText variant="label">{title}</AppText>
      {foods.length === 0 && emptyLabel ? (
        <AppText tone="secondary" variant="caption">
          {emptyLabel}
        </AppText>
      ) : (
        foods.map(food => (
          <FoodResultRow
            key={food.id}
            food={food}
            favorited={favoriteIds.has(food.id)}
            onToggleFavorite={() => onToggleFavorite(food)}
            onSelect={() => onSelect(food)}
          />
        ))
      )}
    </View>
  );
}

export function FoodSearchPanel({
  userId,
  onSelect,
  onCreateCustomFood,
  onScanBarcode,
}: {
  userId: string;
  onSelect: (food: Food) => void;
  onCreateCustomFood: () => void;
  onScanBarcode: () => void;
}) {
  const [query, setQuery] = useState('');
  const [barcode, setBarcode] = useState('');
  const [barcodeNotFound, setBarcodeNotFound] = useState(false);
  const trimmed = query.trim();
  const search = useFoodSearch(query);
  const recent = useRecentFoods(userId);
  const favorites = useFavoriteFoods(userId);
  const customFoods = useMyCustomFoods(userId);
  const toggleFavorite = useToggleFavorite(userId);
  const lookupBarcode = useLookupBarcode();
  const favoriteIds = new Set((favorites.data ?? []).map(food => food.id));

  function handleToggleFavorite(food: Food) {
    toggleFavorite.mutate({ foodId: food.id, favorited: favoriteIds.has(food.id) });
  }
  async function lookupNow() {
    setBarcodeNotFound(false);
    try {
      const found = await lookupBarcode.mutateAsync(barcode.trim());
      if (found) onSelect(found);
      else setBarcodeNotFound(true);
    } catch {
      // Surfaced to the user via lookupBarcode.isError/.error below; caught
      // here only so the rejection isn't reported as unhandled.
    }
  }

  const matchingCustomFoods =
    trimmed.length >= 2
      ? (customFoods.data ?? []).filter(food =>
          food.name.toLowerCase().includes(trimmed.toLowerCase()),
        )
      : [];

  return (
    <View style={nutritionStyles.section}>
      <TextInput
        label="Search foods"
        placeholder="e.g. chicken breast"
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
        autoFocus
      />
      <Card>
        <AppText variant="label">Have a barcode?</AppText>
        <Button label="Scan barcode" variant="secondary" onPress={onScanBarcode} />
        <AppText tone="secondary" variant="caption">
          Or enter it manually:
        </AppText>
        <TextInput
          label="Barcode number"
          value={barcode}
          onChangeText={text => {
            setBarcode(text);
            setBarcodeNotFound(false);
          }}
          keyboardType="number-pad"
        />
        {barcodeNotFound && (
          <AppText tone="secondary">No product found for that barcode.</AppText>
        )}
        {lookupBarcode.isError && (
          <AppText tone="error" accessibilityRole="alert">
            {lookupBarcode.error instanceof Error
              ? lookupBarcode.error.message
              : "We couldn't look up that barcode. Try again."}
          </AppText>
        )}
        <Button
          label="Look up barcode"
          variant="secondary"
          loading={lookupBarcode.isPending}
          disabled={!barcodePattern.test(barcode.trim())}
          onPress={lookupNow}
        />
      </Card>
      {trimmed.length === 0 && (
        <>
          <FoodResultSection
            title="Recent"
            foods={recent.data ?? []}
            favoriteIds={favoriteIds}
            onToggleFavorite={handleToggleFavorite}
            onSelect={onSelect}
            emptyLabel={
              recent.isPending
                ? undefined
                : 'Foods you log will show up here for quick re-adding.'
            }
          />
          <FoodResultSection
            title="Favorites"
            foods={favorites.data ?? []}
            favoriteIds={favoriteIds}
            onToggleFavorite={handleToggleFavorite}
            onSelect={onSelect}
          />
        </>
      )}
      {trimmed.length > 0 && trimmed.length < 2 && (
        <AppText tone="secondary" variant="caption">
          Keep typing to search.
        </AppText>
      )}
      {trimmed.length >= 2 && (
        <FoodResultSection
          title="Your custom foods"
          foods={matchingCustomFoods}
          favoriteIds={favoriteIds}
          onToggleFavorite={handleToggleFavorite}
          onSelect={onSelect}
        />
      )}
      {trimmed.length >= 2 && search.isPending && (
        <LoadingState label="Searching foods…" />
      )}
      {trimmed.length >= 2 && search.isError && (
        <ErrorState
          description={
            search.error instanceof Error
              ? search.error.message
              : nutritionError(search.error)
          }
          action={{ label: 'Retry search', onPress: () => search.refetch() }}
        />
      )}
      {trimmed.length >= 2 &&
        !search.isPending &&
        !search.isError &&
        search.data?.length === 0 &&
        matchingCustomFoods.length === 0 && (
          <EmptyState
            title="No foods found"
            description="Try a different search term, or create a custom food."
          />
        )}
      {trimmed.length >= 2 &&
        search.data?.map(food => (
          <FoodResultRow
            key={food.id}
            food={food}
            favorited={favoriteIds.has(food.id)}
            onToggleFavorite={() => handleToggleFavorite(food)}
            onSelect={() => onSelect(food)}
          />
        ))}
      <Button
        label="Create a custom food"
        variant="secondary"
        onPress={onCreateCustomFood}
      />
    </View>
  );
}

export function CustomFoodForm({
  submitting,
  error,
  onSubmit,
}: {
  submitting: boolean;
  error: string | null;
  onSubmit: (input: CustomFoodInput) => void;
}) {
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [fiber, setFiber] = useState('');
  const [sugar, setSugar] = useState('');
  const [sodium, setSodium] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const parsedCalories = toNumber(calories);
  const parsedProtein = toNumber(protein);
  const parsedCarbs = toNumber(carbs);
  const parsedFat = toNumber(fat);
  const requiredFilled =
    name.trim().length > 0 &&
    [calories, protein, carbs, fat].every(text => text.trim().length > 0);
  const numbersValid = [parsedCalories, parsedProtein, parsedCarbs, parsedFat].every(
    value => Number.isFinite(value) && value >= 0,
  );
  const valid = requiredFilled && numbersValid;

  function submit() {
    setValidationError(null);
    const parsed = customFoodSchema.safeParse({
      name,
      brand: brand.trim() || null,
      calories: parsedCalories,
      proteinG: parsedProtein,
      carbsG: parsedCarbs,
      fatG: parsedFat,
      fiberG: fiber.trim() ? toNumber(fiber) : null,
      sugarG: sugar.trim() ? toNumber(sugar) : null,
      sodiumMg: sodium.trim() ? toNumber(sodium) : null,
    });
    if (!parsed.success) {
      setValidationError(parsed.error.issues[0]?.message ?? 'Check your entries.');
      return;
    }
    onSubmit(parsed.data);
  }

  return (
    <View style={nutritionStyles.section}>
      <AppText variant="heading" accessibilityRole="header">
        Create a custom food
      </AppText>
      <AppText tone="secondary">
        Values are per 100 g. This food is private to your account.
      </AppText>
      <TextInput label="Name" value={name} onChangeText={setName} editable={!submitting} />
      <TextInput
        label="Brand (optional)"
        value={brand}
        onChangeText={setBrand}
        editable={!submitting}
      />
      <TextInput
        label="Calories (kcal, per 100 g)"
        value={calories}
        onChangeText={setCalories}
        keyboardType="decimal-pad"
        editable={!submitting}
      />
      <TextInput
        label="Protein (g, per 100 g)"
        value={protein}
        onChangeText={setProtein}
        keyboardType="decimal-pad"
        editable={!submitting}
      />
      <TextInput
        label="Carbs (g, per 100 g)"
        value={carbs}
        onChangeText={setCarbs}
        keyboardType="decimal-pad"
        editable={!submitting}
      />
      <TextInput
        label="Fat (g, per 100 g)"
        value={fat}
        onChangeText={setFat}
        keyboardType="decimal-pad"
        editable={!submitting}
      />
      <TextInput
        label="Fiber (g, optional)"
        value={fiber}
        onChangeText={setFiber}
        keyboardType="decimal-pad"
        editable={!submitting}
      />
      <TextInput
        label="Sugar (g, optional)"
        value={sugar}
        onChangeText={setSugar}
        keyboardType="decimal-pad"
        editable={!submitting}
      />
      <TextInput
        label="Sodium (mg, optional)"
        value={sodium}
        onChangeText={setSodium}
        keyboardType="decimal-pad"
        editable={!submitting}
      />
      {(validationError || error) && (
        <AppText tone="error" accessibilityRole="alert">
          {validationError ?? error}
        </AppText>
      )}
      <Button
        label="Create food"
        loading={submitting}
        disabled={!valid}
        onPress={submit}
      />
    </View>
  );
}

export function FoodDetailPanel({
  food,
  mode,
  initialQuantity,
  initialMealType,
  submitting,
  submitLabel,
  error,
  onSubmit,
}: {
  food: Food;
  mode: 'add' | 'edit';
  initialQuantity: number;
  initialMealType: MealType;
  submitting: boolean;
  submitLabel: string;
  error: string | null;
  onSubmit: (input: {
    quantity: number;
    unit: QuantityUnit;
    mealType: MealType;
    nutrition: NutritionValues;
  }) => void;
}) {
  const basisUnit = foodBasisUnit(food);
  const [quantityText, setQuantityText] = useState(String(initialQuantity));
  const [mealType, setMealType] = useState<MealType>(initialMealType);
  const trimmed = quantityText.trim().replace(',', '.');
  const quantity = Number(trimmed);
  const valid = /^\d+(?:\.\d+)?$/.test(trimmed) && quantity > 0;
  let nutrition: NutritionValues | null = null;
  if (valid) {
    try {
      const basis = foodNutritionBasis(food);
      nutrition =
        basisUnit === 'serving'
          ? calculateNutritionForServing(basis, quantity)
          : calculateNutritionForQuantity(basis, quantity);
    } catch {
      nutrition = null;
    }
  }
  return (
    <View style={nutritionStyles.section}>
      <AppText variant="heading" accessibilityRole="header">
        {food.name}
      </AppText>
      {food.brand && (
        <AppText tone="secondary" variant="caption">
          {food.brand}
        </AppText>
      )}
      <TextInput
        label={basisUnit === 'serving' ? 'Servings' : `Quantity (${basisUnit})`}
        value={quantityText}
        onChangeText={setQuantityText}
        keyboardType="decimal-pad"
        editable={!submitting}
      />
      {!valid && quantityText.length > 0 && (
        <AppText tone="error" accessibilityRole="alert">
          Enter a quantity greater than 0.
        </AppText>
      )}
      {mode === 'add' && (
        <View style={nutritionStyles.section}>
          <AppText variant="label">Meal</AppText>
          <Choices
            options={mealTypeOptions}
            value={mealType}
            onChange={setMealType}
            disabled={submitting}
            accessibilityLabel="Meal"
          />
        </View>
      )}
      {nutrition && <NutritionPreview nutrition={nutrition} />}
      {error && (
        <AppText tone="error" accessibilityRole="alert">
          {error}
        </AppText>
      )}
      <Button
        label={submitLabel}
        loading={submitting}
        disabled={!nutrition}
        onPress={() =>
          nutrition &&
          onSubmit({ quantity, unit: basisUnit, mealType, nutrition })
        }
      />
    </View>
  );
}

const mealLabels: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snacks',
};

export function MealSection({
  mealType,
  entries,
  onAddFood,
  onEdit,
  onDelete,
}: {
  mealType: MealType;
  entries: FoodEntry[];
  onAddFood: () => void;
  onEdit: (entry: FoodEntry) => void;
  onDelete: (entry: FoodEntry) => void;
}) {
  const totals = calculateDailyNutrition(entries.map(entryNutrition));
  const label = mealLabels[mealType];
  return (
    <Card>
      <View style={nutritionStyles.row}>
        <AppText variant="heading">{label}</AppText>
        <AppText tone="secondary">
          {entries.length ? `${totals.calories} kcal` : '—'}
        </AppText>
      </View>
      {entries.map(entry => (
        <View key={entry.id} style={nutritionStyles.entryRow}>
          <View style={nutritionStyles.entryInfo}>
            <AppText variant="label">{entry.foods?.name ?? 'Food'}</AppText>
            <AppText variant="caption" tone="secondary">
              {entry.quantity}
              {entry.unit === 'serving'
                ? entry.quantity === 1
                  ? ' serving'
                  : ' servings'
                : ` ${entry.unit}`}{' '}
              · {entry.calories} kcal
            </AppText>
          </View>
          <View style={nutritionStyles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Edit ${entry.foods?.name ?? 'food'} entry`}
              onPress={() => onEdit(entry)}
            >
              <AppText tone="accent" variant="label">
                Edit
              </AppText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Delete ${entry.foods?.name ?? 'food'} entry`}
              onPress={() => onDelete(entry)}
            >
              <AppText tone="error" variant="label">
                Delete
              </AppText>
            </Pressable>
          </View>
        </View>
      ))}
      {entries.length === 0 && (
        <AppText tone="secondary">No food logged yet.</AppText>
      )}
      <Button
        label={`Add food to ${label.toLowerCase()}`}
        variant="secondary"
        onPress={onAddFood}
      />
    </Card>
  );
}

export function TargetForm({
  initial,
  submitting,
  error,
  onSubmit,
}: {
  initial: { calories: number; proteinG: number; carbsG: number; fatG: number } | null;
  submitting: boolean;
  error: string | null;
  onSubmit: (input: {
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  }) => void;
}) {
  const [calories, setCalories] = useState(
    initial ? String(initial.calories) : '',
  );
  const [protein, setProtein] = useState(
    initial ? String(initial.proteinG) : '',
  );
  const [carbs, setCarbs] = useState(initial ? String(initial.carbsG) : '');
  const [fat, setFat] = useState(initial ? String(initial.fatG) : '');
  const [showEstimator, setShowEstimator] = useState(!initial);
  const [sex, setSex] = useState<Sex>('female');
  const [age, setAge] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>('moderate');
  const [goal, setGoal] = useState<NutritionGoal>('maintain_weight');
  const [estimateError, setEstimateError] = useState<string | null>(null);

  function applyEstimate() {
    setEstimateError(null);
    try {
      const target = estimateCalorieTarget({
        sex,
        ageYears: toNumber(age),
        heightCm: toNumber(height),
        weightKg: toNumber(weight),
        activityLevel,
        goal,
      });
      const macros = estimateMacroTargets(target);
      setCalories(String(target));
      setProtein(String(macros.proteinG));
      setCarbs(String(macros.carbsG));
      setFat(String(macros.fatG));
    } catch (cause) {
      setEstimateError(
        cause instanceof Error ? cause.message : 'Check your entries.',
      );
    }
  }

  const parsedCalories = toNumber(calories);
  const parsedProtein = toNumber(protein);
  const parsedCarbs = toNumber(carbs);
  const parsedFat = toNumber(fat);
  const valid =
    calories.trim().length > 0 &&
    Number.isFinite(parsedCalories) &&
    parsedCalories > 0 &&
    [parsedProtein, parsedCarbs, parsedFat].every(
      value => Number.isFinite(value) && value >= 0,
    );

  return (
    <View style={nutritionStyles.section}>
      <AppText variant="heading" accessibilityRole="header">
        Daily nutrition target
      </AppText>
      <AppText tone="secondary">
        This is an estimate based on your profile. You can adjust it anytime.
      </AppText>
      <Button
        label={showEstimator ? 'Hide estimate helper' : 'Estimate for me'}
        variant="secondary"
        onPress={() => setShowEstimator(value => !value)}
      />
      {showEstimator && (
        <Card>
          <OptionList
            options={[
              { value: 'female', label: 'Female' },
              { value: 'male', label: 'Male' },
            ]}
            value={sex}
            onChange={setSex}
            accessibilityLabel="Sex"
          />
          <TextInput
            label="Age (years)"
            value={age}
            onChangeText={setAge}
            keyboardType="number-pad"
          />
          <TextInput
            label="Height (cm)"
            value={height}
            onChangeText={setHeight}
            keyboardType="decimal-pad"
          />
          <TextInput
            label="Weight (kg)"
            value={weight}
            onChangeText={setWeight}
            keyboardType="decimal-pad"
          />
          <OptionList
            options={activityLevelOptions}
            value={activityLevel}
            onChange={setActivityLevel}
            accessibilityLabel="Activity level"
          />
          <OptionList
            options={nutritionGoalOptions}
            value={goal}
            onChange={setGoal}
            accessibilityLabel="Goal"
          />
          {estimateError && (
            <AppText tone="error" accessibilityRole="alert">
              {estimateError}
            </AppText>
          )}
          <Button label="Calculate estimate" variant="secondary" onPress={applyEstimate} />
          <AppText variant="caption" tone="secondary">
            An estimate based on your profile, not medical advice.
          </AppText>
        </Card>
      )}
      <TextInput
        label="Calories (kcal)"
        value={calories}
        onChangeText={setCalories}
        keyboardType="decimal-pad"
      />
      <TextInput
        label="Protein (g)"
        value={protein}
        onChangeText={setProtein}
        keyboardType="decimal-pad"
      />
      <TextInput
        label="Carbs (g)"
        value={carbs}
        onChangeText={setCarbs}
        keyboardType="decimal-pad"
      />
      <TextInput
        label="Fat (g)"
        value={fat}
        onChangeText={setFat}
        keyboardType="decimal-pad"
      />
      {error && (
        <AppText tone="error" accessibilityRole="alert">
          {error}
        </AppText>
      )}
      <Button
        label="Save target"
        loading={submitting}
        disabled={!valid}
        onPress={() =>
          onSubmit({
            calories: parsedCalories,
            proteinG: parsedProtein,
            carbsG: parsedCarbs,
            fatG: parsedFat,
          })
        }
      />
    </View>
  );
}
