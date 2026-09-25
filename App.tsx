/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

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
