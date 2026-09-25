import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useHome } from '../src/services/home/useHome';
import { homeService } from '../src/services/home/homeService';

jest.mock('../src/services/home/homeService', () => ({
  homeService: {
    getWeights: jest.fn().mockResolvedValue([]),
    getRecentWorkout: jest
      .fn()
      .mockResolvedValue({ available: true, workout: null }),
  },
}));
beforeEach(() => jest.clearAllMocks());
test.each([undefined, 'user-1'])(
  'home queries are enabled only for a signed-in user (%s)',
  async userId => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    function Probe() {
      useHome(userId);
      return null;
    }
    let view!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      view = ReactTestRenderer.create(
        <QueryClientProvider client={client}>
          <Probe />
        </QueryClientProvider>,
      );
    });
    if (userId) {
      expect(homeService.getWeights).toHaveBeenCalledWith(
        userId,
        expect.anything(),
      );
      expect(homeService.getRecentWorkout).toHaveBeenCalledWith(
        userId,
        expect.anything(),
      );
      expect(client.getQueryData(['home', userId, 'weights'])).toEqual([]);
      expect(client.getQueryData(['home', userId, 'recent-workout'])).toEqual({
        available: true,
        workout: null,
      });
    } else {
      expect(homeService.getWeights).not.toHaveBeenCalled();
      expect(homeService.getRecentWorkout).not.toHaveBeenCalled();
    }
    await act(async () => view.unmount());
    client.clear();
  },
);
