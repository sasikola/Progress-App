import { useRef, useState, type PropsWithChildren } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { AppText } from '../../components/common/AppText';
import { TextInput } from '../../components/inputs/TextInput';
import { Button } from '../../components/buttons/Button';
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '../../components/feedback/States';
import {
  progressService,
  type HistoryCursor,
} from '../../services/progress/progressService';
import {
  chartData,
  changeLabel,
  convert,
  localDay,
  parseEntry,
  progressError,
  type EntryInput,
  type EntryKind,
  type EntryUnit,
  type ProgressEntry,
} from '../../services/progress/model';
import { localId } from '../../services/workout/model';
import { colors, radius, spacing } from '../../theme';

export const progressStyles = StyleSheet.create({
  section: { gap: spacing.lg },
  choiceLabel: { flexShrink: 1 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  card: {
    backgroundColor: colors.secondarySurface,
    padding: spacing.xl,
    borderRadius: radius.lg,
    gap: spacing.md,
  },
  choice: {
    maxWidth: '100%',
    minHeight: 56,
    justifyContent: 'center',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  selected: { borderColor: colors.accent, backgroundColor: colors.elevated },
  history: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.xs,
  },
  plot: {
    height: 150,
    position: 'relative',
    borderBottomWidth: 1,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  line: { position: 'absolute', height: 2, backgroundColor: colors.accent },
  point: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
});
export function Card({ children }: PropsWithChildren) {
  return <View style={progressStyles.card}>{children}</View>;
}
export function Choices<T extends string>({
  options,
  value,
  onChange,
  disabled = false,
  accessibilityLabel,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <View
      style={progressStyles.row}
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
    >
      {options.map(option => (
        <Pressable
          key={option.value}
          accessibilityRole="radio"
          accessibilityLabel={option.label}
          accessibilityState={{
            selected: option.value === value,
            checked: option.value === value,
            disabled,
          }}
          disabled={disabled}
          onPress={() => onChange(option.value)}
          style={[
            progressStyles.choice,
            option.value === value && progressStyles.selected,
          ]}
        >
          <AppText
            variant="label"
            style={progressStyles.choiceLabel}
            tone={option.value === value ? 'accent' : 'primary'}
          >
            {option.value === value ? '✓ ' : ''}
            {option.label}
          </AppText>
        </Pressable>
      ))}
    </View>
  );
}
export function dateLabel(value: string) {
  return new Date(value).toLocaleDateString();
}

export function WeightSummary({
  entries,
  unit,
}: {
  entries: ProgressEntry[];
  unit: EntryUnit;
}) {
  const latest = entries[0];
  if (!latest)
    return (
      <AppText tone="secondary">
        No entries yet. Record your starting point below.
      </AppText>
    );
  return (
    <>
      <AppText variant="title">
        {convert(latest.value, latest.unit, unit).toFixed(1)} {unit}
      </AppText>
      <AppText tone="secondary">
        Latest • {dateLabel(latest.recorded_at)}
      </AppText>
      {entries[1] && (
        <AppText tone="secondary">
          Previous:{' '}
          {convert(entries[1].value, entries[1].unit, unit).toFixed(1)} {unit} •{' '}
          {dateLabel(entries[1].recorded_at)}
        </AppText>
      )}
      <AppText variant="label">{changeLabel(entries, unit)}</AppText>
    </>
  );
}

export function TrendChart({
  entries,
  unit,
}: {
  entries: ProgressEntry[];
  unit: EntryUnit;
}) {
  const [width, setWidth] = useState(260);
  const chart = chartData(entries, unit, width);
  if (!chart || chart.points.length < 2)
    return (
      <AppText tone="secondary">
        A trend chart appears after two entries.
      </AppText>
    );
  return (
    <View style={progressStyles.section}>
      <AppText variant="heading">Recent trend</AppText>
      <AppText variant="caption" tone="secondary">
        Latest {chart.points.length} loaded entries • {unit} • vertical axis is
        zoomed, not zero-based
      </AppText>
      <AppText variant="caption">
        {chart.high.toFixed(1)} {unit}
      </AppText>
      <View
        style={progressStyles.plot}
        onLayout={event =>
          setWidth(Math.max(10, event.nativeEvent.layout.width))
        }
        accessible
        accessibilityRole="image"
        accessibilityLabel={`Trend for ${
          chart.points.length
        } entries, ${dateLabel(chart.sorted[0].recorded_at)} to ${dateLabel(
          chart.sorted[chart.sorted.length - 1].recorded_at,
        )}. Values range from ${chart.low.toFixed(1)} to ${chart.high.toFixed(
          1,
        )} ${unit}. Exact values are in the history below.`}
      >
        {chart.points.slice(1).map((point, index) => {
          const previous = chart.points[index];
          const length = Math.hypot(point.x - previous.x, point.y - previous.y);
          return (
            <View
              key={`line-${index}`}
              style={[
                progressStyles.line,
                {
                  width: length,
                  left: (point.x + previous.x - length) / 2,
                  top: (point.y + previous.y) / 2 - 1,
                  transform: [
                    {
                      rotate: `${Math.atan2(
                        point.y - previous.y,
                        point.x - previous.x,
                      )}rad`,
                    },
                  ],
                },
              ]}
            />
          );
        })}
        {chart.points.map((point, index) => (
          <View
            key={index}
            style={[
              progressStyles.point,
              { left: point.x - 3, top: point.y - 3 },
            ]}
          />
        ))}
      </View>
      <AppText variant="caption">
        {chart.low.toFixed(1)} {unit}
      </AppText>
      <AppText variant="caption" tone="secondary">
        {dateLabel(chart.sorted[0].recorded_at)} →{' '}
        {dateLabel(chart.sorted[chart.sorted.length - 1].recorded_at)}
      </AppText>
    </View>
  );
}

export function EntryForm({
  userId,
  kind,
  unit,
  setUnit,
}: {
  userId: string;
  kind: EntryKind;
  unit: EntryUnit;
  setUnit: (unit: EntryUnit) => void;
}) {
  const [value, setValue] = useState('');
  const [day, setDay] = useState(localDay());
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<{ fingerprint: string; input: EntryInput } | null>(
    null,
  );
  const busy = useRef(false);
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (input: EntryInput) => progressService.save(userId, input),
    retry: false,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['progress', userId] });
      queryClient.invalidateQueries({ queryKey: ['home', userId, 'weights'] });
    },
  });
  async function save() {
    if (busy.current) return;
    setMessage(null);
    setError(null);
    let input: EntryInput;
    try {
      const parsed = parseEntry(kind, value, unit, day);
      const fingerprint = JSON.stringify([
        userId,
        kind,
        parsed.value,
        unit,
        day,
      ]);
      if (request.current?.fingerprint !== fingerprint)
        request.current = {
          fingerprint,
          input: { ...parsed, clientId: localId() },
        };
      input = request.current.input;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Check your entry.');
      return;
    }
    busy.current = true;
    try {
      await mutation.mutateAsync(input);
      request.current = null;
      setValue('');
      setMessage('Entry saved.');
    } catch (cause) {
      setError(progressError(cause));
    } finally {
      busy.current = false;
    }
  }
  const units: EntryUnit[] = kind === 'weight' ? ['kg', 'lb'] : ['cm', 'in'];
  return (
    <Card>
      <AppText variant="heading">
        {kind === 'weight' ? 'Log weight' : 'Log measurement'}
      </AppText>
      <TextInput
        label={`Value (${unit})`}
        value={value}
        onChangeText={setValue}
        keyboardType="decimal-pad"
        editable={!mutation.isPending}
      />
      <Choices
        options={units.map(item => ({ value: item, label: item }))}
        value={unit}
        onChange={setUnit}
        disabled={mutation.isPending}
      />
      <TextInput
        label="Date (YYYY-MM-DD)"
        value={day}
        onChangeText={setDay}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!mutation.isPending}
      />
      <AppText variant="caption" tone="secondary">
        Use your local date. Past dates are recorded at noon; today uses the
        save time. Changing units does not convert the number you typed.
      </AppText>
      {error && (
        <AppText tone="error" accessibilityRole="alert">
          {error}
        </AppText>
      )}
      {message && (
        <AppText tone="accent" accessibilityLiveRegion="polite">
          {message}
        </AppText>
      )}
      <Button label="Save entry" onPress={save} loading={mutation.isPending} />
    </Card>
  );
}

export function EntryPanel({
  userId,
  kind,
  initialUnit,
}: {
  userId: string;
  kind: EntryKind;
  initialUnit: EntryUnit;
}) {
  const [unit, setUnit] = useState(initialUnit);
  const history = useInfiniteQuery({
    queryKey: ['progress', userId, 'history', kind],
    initialPageParam: null as HistoryCursor,
    queryFn: ({ pageParam, signal }) =>
      progressService.history(kind, pageParam, signal),
    getNextPageParam: page => page.next ?? undefined,
  });
  const entries = history.data?.pages.flatMap(page => page.entries) ?? [];
  return (
    <View style={progressStyles.section}>
      {history.isPending ? (
        <LoadingState label="Loading history…" />
      ) : history.isError && !history.isFetchNextPageError ? (
        <ErrorState
          description={progressError(history.error)}
          action={{ label: 'Retry history', onPress: () => history.refetch() }}
        />
      ) : (
        <Card>
          <WeightSummary entries={entries} unit={unit} />
        </Card>
      )}
      <EntryForm userId={userId} kind={kind} unit={unit} setUnit={setUnit} />
      {entries.length > 0 && (
        <Card>
          <TrendChart entries={entries} unit={unit} />
        </Card>
      )}
      <Card>
        <AppText variant="heading">History</AppText>
        <AppText variant="caption" tone="secondary">
          Newest first. Values below use the units originally recorded.
        </AppText>
        {entries.map(entry => (
          <View key={entry.id} style={progressStyles.history}>
            <AppText variant="label">
              {entry.value} {entry.unit}
            </AppText>
            <AppText variant="caption" tone="secondary">
              {new Date(entry.recorded_at).toLocaleString()}
            </AppText>
          </View>
        ))}
        {!history.isPending && !history.isError && !entries.length && (
          <EmptyState
            title="No entries yet"
            description="Save an entry above to start your history."
          />
        )}
        {history.isFetchNextPageError && (
          <AppText tone="error" accessibilityRole="alert">
            {progressError(history.error)}
          </AppText>
        )}
        {history.hasNextPage && (
          <Button
            label={
              history.isFetchNextPageError
                ? 'Retry older entries'
                : 'Load older entries'
            }
            variant="secondary"
            loading={history.isFetchingNextPage}
            disabled={history.isFetching && !history.isFetchingNextPage}
            onPress={() => history.fetchNextPage()}
          />
        )}
      </Card>
      <AppText variant="caption" tone="secondary">
        Trends describe recorded changes, not medical conclusions. Unsubmitted
        entries are not kept when you leave this form.
      </AppText>
    </View>
  );
}

export function RecordsPanel({ userId }: { userId: string }) {
  const query = useInfiniteQuery({
    queryKey: ['progress', userId, 'records'],
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) =>
      progressService.records(pageParam, signal),
    getNextPageParam: page => page.next ?? undefined,
  });
  const records = query.data?.pages.flatMap(page => page.entries) ?? [];
  return (
    <View style={progressStyles.section}>
      <AppText variant="heading">Best recorded sets</AppText>
      <AppText tone="secondary">
        Heaviest completed load for each exercise; most reps breaks a tie. First
        performances establish a baseline, not a new PR. Bodyweight exercises
        show added load only.
      </AppText>
      {query.isPending && <LoadingState label="Loading records…" />}
      {query.isError && (
        <ErrorState
          description={progressError(query.error)}
          action={{
            label: 'Retry records',
            onPress: () =>
              query.isFetchNextPageError
                ? query.fetchNextPage()
                : query.refetch(),
          }}
        />
      )}
      {!query.isPending && !query.isError && !records.length && (
        <EmptyState
          title="Your records start here"
          description="Finish a workout with completed sets to see your best lifts."
        />
      )}
      {records.map(record => (
        <Card key={record.exercise_id}>
          <AppText variant="heading">{record.name}</AppText>
          <AppText variant="title">
            {record.weight} {record.weight_unit} × {record.reps}
          </AppText>
          <AppText tone="secondary">
            Recorded {dateLabel(record.completed_at)}
          </AppText>
        </Card>
      ))}
      {query.hasNextPage && (
        <Button
          label="Load more records"
          variant="secondary"
          loading={query.isFetchingNextPage}
          disabled={query.isFetching && !query.isFetchingNextPage}
          onPress={() => query.fetchNextPage()}
        />
      )}
    </View>
  );
}
