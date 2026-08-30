import { describe, expect, it } from 'vitest';
import { apiRequestSchema } from './contracts';

describe('dashboard timezone contracts', () => {
  it.each(['Europe/Berlin', 'America/New_York', 'UTC'])(
    'accepts the IANA timezone %s',
    (timezone) => {
      expect(
        apiRequestSchema.safeParse({
          action: 'createDashboard',
          name: 'Performance',
          timezone,
        }).success,
      ).toBe(true);
    },
  );

  it.each([
    { action: 'createDashboard', name: 'Performance', timezone: 'Berlin' },
    { action: 'createDashboard', name: 'Performance', timezone: '+01:00' },
    { action: 'createDashboard', name: 'Performance', timezone: '+0100' },
    { action: 'createDashboard', name: 'Performance', timezone: '-05:30' },
    { action: 'createDashboard', name: 'Performance', timezone: '-0530' },
    { action: 'updateDashboard', dashboardId: 'dashboard-1', timezone: 'Not/A_Timezone' },
  ])('rejects an invalid timezone for $action', (request) => {
    expect(apiRequestSchema.safeParse(request).success).toBe(false);
  });
});
