import { supabase } from '../../lib/supabase';
import {
  entrySchema,
  overviewSchema,
  recordSchema,
  type EntryInput,
  type EntryKind,
  type ProgressEntry,
} from './model';

function client() {
  if (!supabase) throw new Error('Progress access is not configured.');
  return supabase;
}
export const progressPageSize = 20;
export type HistoryCursor = Pick<ProgressEntry, 'id' | 'recorded_at'> | null;
export const progressService = {
  async save(userId: string, input: EntryInput): Promise<string> {
    const { data, error } = await client().rpc('log_progress_entry', {
      p_user_id: userId,
      p_client_id: input.clientId,
      p_kind: input.kind,
      p_value: input.value,
      p_unit: input.unit,
      p_recorded_at: input.recordedAt,
    });
    if (error) throw error;
    if (typeof data !== 'string') throw new Error('Unexpected entry response.');
    return data;
  },
  async history(kind: EntryKind, cursor: HistoryCursor, signal: AbortSignal) {
    const { data, error } = await client()
      .rpc('progress_history', {
        p_kind: kind,
        p_before_at: cursor?.recorded_at ?? null,
        p_before_id: cursor?.id ?? null,
        p_limit: progressPageSize + 1,
      })
      .abortSignal(signal);
    if (error) throw error;
    const rows = entrySchema.array().parse(data ?? []);
    const entries = rows.slice(0, progressPageSize);
    return {
      entries,
      next: rows.length > progressPageSize ? entries[entries.length - 1] : null,
    };
  },
  async overview(signal: AbortSignal) {
    const { data, error } = await client()
      .rpc('progress_overview')
      .abortSignal(signal);
    if (error) throw error;
    return overviewSchema.parse(data);
  },
  async records(page: number, signal: AbortSignal) {
    const { data, error } = await client()
      .rpc('progress_records', {
        p_offset: page * progressPageSize,
        p_limit: progressPageSize + 1,
      })
      .abortSignal(signal);
    if (error) throw error;
    const rows = recordSchema.array().parse(data ?? []);
    return {
      entries: rows.slice(0, progressPageSize),
      next: rows.length > progressPageSize ? page + 1 : null,
    };
  },
};
