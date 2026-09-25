import { decode } from 'base64-arraybuffer';
import { supabase } from '../../lib/supabase';
import {
  ownedPhoto,
  photoBucket,
  photoSchema,
  type PhotoDraft,
  type PhotoType,
  type ProgressPhoto,
} from './model';

function client() {
  if (!supabase) throw new Error('Photos are not configured.');
  return supabase;
}
async function assertAccount(userId: string) {
  const { data, error } = await client().auth.getSession();
  if (error) throw error;
  if (data.session?.user.id !== userId) throw { code: 'account_changed' };
}
const columns =
  'id,user_id,client_id,photo_type,storage_path,recorded_at,status';
export const photoPageSize = 12;
export type PhotoCursor = Pick<ProgressPhoto, 'id' | 'recorded_at'> | null;
export const photoService = {
  async upload(userId: string, draft: PhotoDraft) {
    await assertAccount(userId);
    const db = client();
    const prepared = await db.rpc('prepare_progress_photo', {
      p_user_id: userId,
      p_client_id: draft.clientId,
      p_photo_type: draft.photoType,
      p_recorded_at: draft.recordedAt,
      p_content_type: draft.asset.contentType,
      p_byte_size: draft.asset.byteSize,
    });
    if (prepared.error) throw prepared.error;
    const photo = ownedPhoto(prepared.data, userId);
    if (photo.status === 'ready') return photo;
    await assertAccount(userId);
    const uploaded = await db.storage
      .from(photoBucket)
      .upload(photo.storage_path, decode(draft.asset.base64), {
        contentType: draft.asset.contentType,
        cacheControl: '300',
        upsert: false,
      });
    // A timeout/duplicate may mean the bytes already arrived. The RPC verifies
    // an owned Storage object exists before making its metadata visible.
    await assertAccount(userId);
    const finished = await db.rpc('finish_progress_photo', {
      p_user_id: userId,
      p_client_id: draft.clientId,
    });
    if (finished.error) throw uploaded.error ?? finished.error;
    return ownedPhoto(finished.data, userId);
  },
  async timeline(
    userId: string,
    type: PhotoType | 'all',
    cursor: PhotoCursor,
    signal: AbortSignal,
  ) {
    let query = client()
      .from('progress_photos')
      .select(columns)
      .eq('user_id', userId)
      .eq('status', 'ready');
    if (type !== 'all') query = query.eq('photo_type', type);
    if (cursor) {
      // Parse values before embedding them into a PostgREST filter.
      const id = photoSchema.shape.id.parse(cursor.id);
      const date = photoSchema.shape.recorded_at.parse(cursor.recorded_at);
      query = query.or(
        `recorded_at.lt.${date},and(recorded_at.eq.${date},id.lt.${id})`,
      );
    }
    const { data, error } = await query
      .order('recorded_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(photoPageSize + 1)
      .abortSignal(signal);
    if (error) throw error;
    const rows = (data ?? []).map(row => ownedPhoto(row, userId));
    const entries = rows.slice(0, photoPageSize);
    return {
      entries,
      next: rows.length > photoPageSize ? entries[entries.length - 1] : null,
    };
  },
  async signedUrl(userId: string, photo: ProgressPhoto) {
    const owned = ownedPhoto(photo, userId);
    await assertAccount(userId);
    const { data, error } = await client()
      .storage.from(photoBucket)
      .createSignedUrl(owned.storage_path, 300);
    if (error) throw error;
    if (!data?.signedUrl) throw new Error('Photo link unavailable.');
    return data.signedUrl;
  },
};
