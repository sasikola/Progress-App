import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { HomeScreen } from '../screens/home/HomeScreen';
import { WorkoutScreen } from '../screens/workout/WorkoutScreen';
import { NutritionScreen } from '../screens/nutrition/NutritionScreen';
import { ProgressScreen } from '../screens/progress/ProgressScreen';
import { ProfileScreen } from '../screens/profile/ProfileScreen';
import { colors, typography } from '../theme';
import { TabIcon } from './TabIcon';
import type { MainTabParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();
const icons = {
  Home: ({ color }: { color: string }) => <TabIcon name="Home" color={color} />,
  Workout: ({ color }: { color: string }) => (
    <TabIcon name="Workout" color={color} />
  ),
  Nutrition: ({ color }: { color: string }) => (
    <TabIcon name="Nutrition" color={color} />
  ),
  Progress: ({ color }: { color: string }) => (
    <TabIcon name="Progress" color={color} />
  ),
  You: ({ color }: { color: string }) => <TabIcon name="You" color={color} />,
};
export function MainTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.secondaryText,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
        tabBarLabelStyle: { ...typography.caption, fontWeight: '600' },
        tabBarItemStyle: { paddingTop: 4 },
        tabBarHideOnKeyboard: true,
        tabBarIcon: icons[route.name],
        tabBarButtonTestID: `tab-${route.name.toLowerCase()}`,
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Workout" component={WorkoutScreen} />
      <Tab.Screen name="Nutrition" component={NutritionScreen} />
      <Tab.Screen name="Progress" component={ProgressScreen} />
      <Tab.Screen name="You" component={ProfileScreen} />
    </Tab.Navigator>
  );
}
