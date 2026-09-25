import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Screen } from '../../components/common/Screen';
import { AppText } from '../../components/common/AppText';
import { Button } from '../../components/buttons/Button';
import { ErrorState, LoadingState } from '../../components/feedback/States';
import { useAuth } from '../../services/auth/AuthProvider';
import { useProfile } from '../../services/profile/useProfile';
import { progressService } from '../../services/progress/progressService';
import { PhotosPanel } from './PhotosPanel';
import {
  measurementOptions,
  progressError,
  type MeasurementKind,
} from '../../services/progress/model';
import {
  Card,
  Choices,
  EntryPanel,
  RecordsPanel,
  WeightSummary,
  progressStyles,
} from './ProgressParts';

const tabs = [
  { value: 'overview', label: 'Overview' },
  { value: 'weight', label: 'Weight' },
  { value: 'measurements', label: 'Measurements' },
  { value: 'records', label: 'Records' },
  { value: 'photos', label: 'Photos' },
] as const;
type Tab = (typeof tabs)[number]['value'];

function Overview({
  userId,
  openWeight,
}: {
  userId: string;
  openWeight: () => void;
}) {
  const query = useQuery({
    queryKey: ['progress', userId, 'overview'],
    queryFn: ({ signal }) => progressService.overview(signal),
  });
  if (query.isPending) return <LoadingState label="Loading progress…" />;
  if (query.isError)
    return (
      <ErrorState
        description={progressError(query.error)}
        action={{ label: 'Retry overview', onPress: () => query.refetch() }}
      />
    );
  const data = query.data;
  return (
    <View style={progressStyles.section}>
      <Card>
        <AppText variant="eyebrow" tone="accent">
          YOUR TRAINING • ALL TIME
        </AppText>
        <AppText variant="title">{data.workout_count} workouts</AppText>
        <AppText variant="heading">{data.set_count} completed sets</AppText>
        <AppText tone="secondary">
          {data.volume_kg.toLocaleString(undefined, {
            maximumFractionDigits: 1,
          })}{' '}
          kg total volume
        </AppText>
        <AppText variant="caption" tone="secondary">
          Volume = load × reps, converted to kg. Older workouts without logged
          sets contribute no set or volume data.
        </AppText>
      </Card>
      <Card>
        <AppText variant="heading">Body weight</AppText>
        <WeightSummary
          entries={data.weights}
          unit={data.weights[0]?.unit ?? 'kg'}
        />
        <Button label="Log weight or view trend" onPress={openWeight} />
      </Card>
      <AppText tone="secondary">
        Explore Measurements for body-size history and Records for your best
        completed lifts. Use Photos for your private visual timeline.
      </AppText>
    </View>
  );
}

function ProgressContent({ userId }: { userId: string }) {
  const focused = useIsFocused();
  const [tab, setTab] = useState<Tab>('overview');
  const [kind, setKind] = useState<MeasurementKind>('waist');
  const [refreshing, setRefreshing] = useState(false);
  const profile = useProfile(userId);
  const client = useQueryClient();
  useFocusEffect(
    useCallback(() => {
      client.invalidateQueries({ queryKey: ['progress', userId] });
    }, [client, userId]),
  );
  async function refresh() {
    setRefreshing(true);
    try {
      await client.invalidateQueries({ queryKey: ['progress', userId] });
    } finally {
      setRefreshing(false);
    }
  }
  return (
    <Screen onRefresh={refresh} refreshing={refreshing}>
      <View style={progressStyles.section}>
        <AppText variant="eyebrow" tone="accent">
          THE BIGGER PICTURE
        </AppText>
        <AppText variant="title" accessibilityRole="header">
          Progress
        </AppText>
        <AppText tone="secondary">Your work, over time.</AppText>
      </View>
      <Choices
        options={tabs}
        value={tab}
        onChange={setTab}
        accessibilityLabel="Progress sections"
      />
      {tab === 'overview' && (
        <Overview userId={userId} openWeight={() => setTab('weight')} />
      )}
      {tab === 'weight' && (
        <EntryPanel
          key="weight"
          userId={userId}
          kind="weight"
          initialUnit={profile.data?.weight_unit ?? 'kg'}
        />
      )}
      {tab === 'measurements' && (
        <View style={progressStyles.section}>
          <AppText variant="heading">Body measurements</AppText>
          <Choices
            options={measurementOptions}
            value={kind}
            onChange={setKind}
          />
          <AppText tone="secondary">
            Use the same measuring position each time. Values are tracked
            separately for each body area.
          </AppText>
          <EntryPanel key={kind} userId={userId} kind={kind} initialUnit="cm" />
        </View>
      )}
      {tab === 'records' && <RecordsPanel userId={userId} />}
      {tab === 'photos' && <PhotosPanel userId={userId} active={focused} />}
    </Screen>
  );
}

export function ProgressScreen() {
  const { session } = useAuth();
  return session ? (
    <ProgressContent key={session.user.id} userId={session.user.id} />
  ) : null;
}
