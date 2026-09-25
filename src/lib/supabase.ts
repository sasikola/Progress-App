import 'react-native-url-polyfill/auto';
import Config from 'react-native-config';
import { createClient } from '@supabase/supabase-js';
import { readEnvironment } from './environment';
import { secureStorage } from './secureStorage';

export const environment = readEnvironment(Config);

export const recoveryStorageKey = `recovery.${
  environment.status === 'ready'
    ? new URL(environment.url).hostname
    : 'unconfigured'
}`;
export const supabase =
  environment.status === 'ready'
    ? createClient(environment.url, environment.anonKey, {
        auth: {
          storage: secureStorage,
          persistSession: true,
          autoRefreshToken: false,
          detectSessionInUrl: false,
          flowType: 'implicit',
        },
      })
    : null;
