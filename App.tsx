/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */


// SUPABASE_URL=https://yebzllwwkzhytnxtvopg.supabase.co
// SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InllYnpsbHd3a3poeXRueHR2b3BnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk5OTA3NjgsImV4cCI6MjEwNTU2Njc2OH0.x_1zAJd5m68IS9YOMZZ1cRuy7Ppy6Z_smla8VSulPm4

import { StatusBar } from 'react-native';
import { AppProviders } from './src/lib/AppProviders';
import { RootNavigator } from './src/navigation/RootNavigator';

function App() {
  return (
    <AppProviders>
      <StatusBar barStyle="light-content" />
      <RootNavigator />
    </AppProviders>
  );
}

export default App;
