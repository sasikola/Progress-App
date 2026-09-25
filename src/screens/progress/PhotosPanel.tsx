import { useRef, useState } from 'react';
import {
  Alert,
  Image,
  Linking,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppText } from '../../components/common/AppText';
import { TextInput } from '../../components/inputs/TextInput';
import { Button } from '../../components/buttons/Button';
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '../../components/feedback/States';
import { localDay, recordedAtForDay } from '../../services/progress/model';
import { localId } from '../../services/workout/model';
import {
  comparison,
  photoError,
  photoOptions,
  type PhotoDraft,
  type PhotoType,
  type ProgressPhoto,
  type SelectedPhoto,
} from '../../services/photos/model';
import {
  pickPhoto,
  PhotoPermissionError,
} from '../../services/photos/photoPicker';
import {
  photoService,
  type PhotoCursor,
} from '../../services/photos/photoService';
import { Card, Choices, dateLabel, progressStyles } from './ProgressParts';
import { colors, radius, spacing } from '../../theme';

export function PrivatePhoto({
  userId,
  photo,
  active = true,
}: {
  userId: string;
  photo: ProgressPhoto;
  active?: boolean;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['progress', userId, 'photo-link', photo.id],
    queryFn: () => photoService.signedUrl(userId, photo),
    staleTime: 240000,
    enabled: active,
    refetchInterval: active ? 240000 : false,
    gcTime: 0,
    retry: false,
  });
  if (!active) return null;
  if (query.isPending)
    return (
      <View style={styles.imageFrame}>
        <LoadingState label="Loading private photo…" />
      </View>
    );
  if (query.isError || (query.data && failedUrl === query.data))
    return (
      <ErrorState
        description="This private photo couldn’t load. Refresh its link to try again."
        action={{
          label: 'Reload photo',
          onPress: () => {
            setFailedUrl(null);
            query.refetch();
          },
        }}
      />
    );
  return (
    <View style={styles.imageFrame}>
      <Image
        key={query.data}
        source={{ uri: query.data, cache: 'reload' }}
        style={styles.image}
        resizeMode="contain"
        accessibilityLabel={`${photo.photo_type} progress photo, ${dateLabel(
          photo.recorded_at,
        )}`}
        onError={() => setFailedUrl(query.data ?? null)}
        onLoad={() => setLoadedUrl(query.data ?? null)}
      />
      {loadedUrl !== query.data && (
        <View style={styles.imageLoading} pointerEvents="none">
          <LoadingState label="Loading image…" />
        </View>
      )}
    </View>
  );
}

export function PhotoUploader({ userId }: { userId: string }) {
  const [type, setType] = useState<PhotoType>('front');
  const [day, setDay] = useState(localDay());
  const [asset, setAsset] = useState<SelectedPhoto | null>(null);
  const [draft, setDraft] = useState<PhotoDraft | null>(null);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const busy = useRef(false);
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (value: PhotoDraft) => photoService.upload(userId, value),
    gcTime: 0,
    retry: false,
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['progress', userId, 'photos'] });
    },
  });
  async function choose(source: 'camera' | 'library') {
    if (busy.current || draft) return;
    busy.current = true;
    setPicking(true);
    setError(null);
    setPermissionDenied(false);
    setMessage(null);
    try {
      const chosen = await pickPhoto(source);
      if (chosen) setAsset(chosen);
    } catch (cause) {
      setPermissionDenied(cause instanceof PhotoPermissionError);
      setError(
        cause instanceof Error ? cause.message : 'Could not select a photo.',
      );
    } finally {
      busy.current = false;
      setPicking(false);
    }
  }
  async function upload() {
    if (busy.current || !asset) return;
    setError(null);
    setMessage(null);
    let request: PhotoDraft;
    try {
      request = draft ?? {
        asset,
        clientId: localId(),
        photoType: type,
        recordedAt: recordedAtForDay(day),
      };
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Check the photo date.',
      );
      return;
    }
    setDraft(request);
    busy.current = true;
    try {
      await mutation.mutateAsync(request);
      setDraft(null);
      setAsset(null);
      setMessage('Photo saved privately.');
      mutation.reset();
    } catch (cause) {
      setError(photoError(cause));
    } finally {
      busy.current = false;
    }
  }
  function discard() {
    Alert.alert(
      'Discard this preview?',
      'This clears the local preview. If an upload already reached Storage, its private pending record is retained. Retry first if you are unsure.',
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Discard preview',
          style: 'destructive',
          onPress: () => {
            setAsset(null);
            setDraft(null);
            setError(null);
          },
        },
      ],
    );
  }
  return (
    <Card>
      <AppText variant="heading">Add a progress photo</AppText>
      <Choices
        options={photoOptions}
        value={type}
        onChange={setType}
        disabled={Boolean(draft) || picking}
        accessibilityLabel="Photo category"
      />
      <TextInput
        label="Photo date (YYYY-MM-DD)"
        value={day}
        onChangeText={setDay}
        editable={!draft && !picking}
        autoCorrect={false}
        autoCapitalize="none"
      />
      <Button
        label="Take photo"
        onPress={() => choose('camera')}
        disabled={Boolean(draft) || picking}
        variant="secondary"
      />
      <Button
        label="Choose from library"
        onPress={() => choose('library')}
        disabled={Boolean(draft) || picking}
        variant="secondary"
      />
      {picking && <LoadingState label="Opening photo picker…" />}
      {asset && (
        <>
          <Image
            source={{ uri: asset.uri }}
            resizeMode="contain"
            style={styles.image}
            accessibilityLabel="Selected photo preview"
          />
          <AppText variant="caption" tone="secondary">
            {(asset.byteSize / 1024 / 1024).toFixed(1)} MB • {type} • {day}
          </AppText>
          <Button
            label={draft ? 'Retry upload' : 'Upload privately'}
            onPress={upload}
            loading={mutation.isPending}
          />
          <Button
            label="Discard preview"
            onPress={discard}
            disabled={mutation.isPending}
            variant="secondary"
          />
        </>
      )}
      {error && (
        <AppText tone="error" accessibilityRole="alert">
          {error}
        </AppText>
      )}
      {permissionDenied && (
        <Button
          label="Open Settings"
          variant="secondary"
          onPress={() => {
            Linking.openSettings().catch(() =>
              setError(
                'Open your device Settings and allow photo access for Progress.',
              ),
            );
          }}
        />
      )}
      {message && (
        <AppText tone="accent" accessibilityLiveRegion="polite">
          {message}
        </AppText>
      )}
      <AppText variant="caption" tone="secondary">
        Private to your account. One JPEG or PNG, up to 5 MB; photos are resized
        where supported. Camera shots are not automatically saved to your photo
        library. Preview and retry state stay only while this form is open.
      </AppText>
    </Card>
  );
}

function PhotoTimeline({
  userId,
  type,
  active,
}: {
  userId: string;
  type: PhotoType | 'all';
  active: boolean;
}) {
  const { width, fontScale } = useWindowDimensions();
  const stackComparison = width < 360 || fontScale > 1.4;
  const [cursors, setCursors] = useState<PhotoCursor[]>([null]);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<ProgressPhoto[]>([]);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['progress', userId, 'photos', type, cursors[page]],
    enabled: active,
    queryFn: ({ signal }) =>
      photoService.timeline(userId, type, cursors[page], signal),
  });
  const photos = query.data?.entries ?? [];
  const pair = comparison(selected);
  function select(photo: ProgressPhoto) {
    setSelectionError(null);
    if (selected.some(item => item.id === photo.id)) {
      setSelected(current => current.filter(item => item.id !== photo.id));
      return;
    }
    if (selected.length === 2) {
      setSelectionError('Deselect a photo before choosing another.');
      return;
    }
    if (selected[0] && selected[0].photo_type !== photo.photo_type) {
      setSelectionError(
        'Choose two photos from the same category for comparison.',
      );
      return;
    }
    setSelected(current => [...current, photo]);
  }
  return (
    <View style={progressStyles.section}>
      <AppText variant="heading">Photo timeline</AppText>
      <AppText tone="secondary">
        Select two photos of the same view to compare. {selected.length}/2
        selected.
      </AppText>
      {selectionError && (
        <AppText tone="error" accessibilityRole="alert">
          {selectionError}
        </AppText>
      )}
      {selected.length > 0 && (
        <Button
          label="Clear comparison"
          variant="secondary"
          onPress={() => {
            setSelected([]);
            setSelectionError(null);
          }}
        />
      )}
      {pair && (
        <Card>
          <AppText variant="heading">Before / After</AppText>
          <View style={[styles.comparison, stackComparison && styles.stacked]}>
            {pair.map((photo, index) => (
              <View
                key={photo.id}
                style={[styles.half, stackComparison && styles.full]}
              >
                <AppText variant="label">
                  {pair[0].recorded_at === pair[1].recorded_at
                    ? `Photo ${index + 1}`
                    : index === 0
                    ? 'Before'
                    : 'After'}
                </AppText>
                <PrivatePhoto userId={userId} photo={photo} active={active} />
                <AppText variant="caption" tone="secondary">
                  {dateLabel(photo.recorded_at)}
                </AppText>
              </View>
            ))}
          </View>
          <AppText variant="caption" tone="secondary">
            Shown without cropping. Lighting, posture and camera distance can
            change appearance.
          </AppText>
        </Card>
      )}
      {query.isPending && <LoadingState label="Loading photo timeline…" />}
      {query.isError && (
        <ErrorState
          description={photoError(query.error)}
          action={{
            label: 'Retry timeline',
            onPress: () => query.refetch(),
          }}
        />
      )}
      {!query.isPending && !query.isError && !photos.length && (
        <EmptyState
          title="Your photo journey starts here"
          description="Choose a photo above, preview it, then upload it privately."
        />
      )}
      {photos.map(photo => (
        <Card key={photo.id}>
          <AppText variant="heading">
            {photo.photo_type[0].toUpperCase() + photo.photo_type.slice(1)}
          </AppText>
          <AppText tone="secondary">{dateLabel(photo.recorded_at)}</AppText>
          <PrivatePhoto userId={userId} photo={photo} active={active} />
          <Button
            label={
              selected.some(item => item.id === photo.id)
                ? 'Deselect photo'
                : 'Select for comparison'
            }
            variant="secondary"
            selected={selected.some(item => item.id === photo.id)}
            accessibilityLabel={`${
              selected.some(item => item.id === photo.id)
                ? 'Deselect'
                : 'Select'
            } ${photo.photo_type} photo from ${dateLabel(
              photo.recorded_at,
            )} for comparison`}
            onPress={() => select(photo)}
          />
        </Card>
      ))}
      <AppText
        variant="caption"
        tone="secondary"
        accessibilityLiveRegion="polite"
      >
        Page {page + 1} • Up to 12 photos per page
      </AppText>
      {page > 0 && (
        <Button
          label="Newer photos"
          variant="secondary"
          onPress={() => setPage(current => current - 1)}
        />
      )}
      {query.data?.next && (
        <Button
          label="Older photos"
          onPress={() => {
            if (query.data.next) {
              setCursors(current => [
                ...current.slice(0, page + 1),
                query.data.next,
              ]);
              setPage(current => current + 1);
            }
          }}
          disabled={query.isFetching}
          variant="secondary"
        />
      )}
    </View>
  );
}

export function PhotosPanel({
  userId,
  active = true,
}: {
  userId: string;
  active?: boolean;
}) {
  const [type, setType] = useState<PhotoType | 'all'>('all');
  return (
    <View style={progressStyles.section}>
      <PhotoUploader key={userId} userId={userId} />
      <Choices
        options={[{ value: 'all', label: 'All photos' }, ...photoOptions]}
        value={type}
        onChange={setType}
        accessibilityLabel="Filter photo timeline"
      />
      <PhotoTimeline
        key={`${userId}-${type}`}
        userId={userId}
        type={type}
        active={active}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  imageFrame: {
    minHeight: 240,
    position: 'relative',
    justifyContent: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.md,
  },
  imageLoading: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  stacked: { flexDirection: 'column' },
  full: { flex: 0 },
  image: {
    width: '100%',
    height: 240,
    backgroundColor: colors.background,
    borderRadius: radius.md,
  },
  comparison: { flexDirection: 'row', gap: spacing.sm },
  half: { flex: 1, minWidth: 0, gap: spacing.sm },
});
