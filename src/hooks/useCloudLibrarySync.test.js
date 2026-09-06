import { describe, expect, it, vi } from 'vitest';
import { loadCloudLibraryRows } from './useCloudLibrarySync.js';

const createClient = ({ length, pageLimit = 1000, missingRpc = false, pageError = null, count = length }) => {
  const allRows = Array.from({ length }, (_, id) => ({ payload: { id: id + 1, mediaType: 'movie' } }));
  const ranges = [];
  const selects = [];
  let active = 0;
  let maxActive = 0;
  const query = (isRpc, includeCount) => ({
    select: (fields, options) => {
      selects.push({ fields, options });
      return query(false, options?.count === 'exact');
    },
    eq: () => query(isRpc, includeCount),
    order: () => query(isRpc, includeCount),
    range: async (from, to) => {
      ranges.push({ isRpc, from, to });
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active -= 1;
      if (isRpc && missingRpc) return { data: null, error: { code: 'PGRST202' } };
      if (pageError && from > 0) return { data: null, error: pageError };
      return {
        data: allRows.slice(from, Math.min(to + 1, from + pageLimit)),
        count: includeCount ? count : null,
        error: null,
      };
    },
  });
  return {
    client: {
      rpc: vi.fn((_name, _args, options) => query(true, options?.count === 'exact')),
      from: vi.fn(() => query(false, false)),
    },
    ranges,
    selects,
    getMaxActive: () => maxActive,
  };
};

describe('loadCloudLibraryRows', () => {
  it('loads beyond the RPC row cap and keeps page requests bounded', async () => {
    const mock = createClient({ length: 3500 });
    const rows = await loadCloudLibraryRows({ supabaseClient: mock.client, currentUserId: 'user' });
    expect(rows).toHaveLength(3500);
    expect(rows.at(-1).payload.id).toBe(3500);
    expect(mock.client.rpc).toHaveBeenCalledWith('get_library_payloads', {}, { count: 'exact' });
    expect(mock.getMaxActive()).toBe(2);
    expect(mock.client.from).not.toHaveBeenCalled();
  });

  it('does not skip rows when the server limit is lower than the requested page size', async () => {
    const mock = createClient({ length: 11, pageLimit: 3 });
    const rows = await loadCloudLibraryRows({ supabaseClient: mock.client, currentUserId: 'user' });
    expect(rows.map((row) => row.payload.id)).toEqual(Array.from({ length: 11 }, (_, i) => i + 1));
    expect(mock.ranges.map(({ from }) => from)).toEqual([0, 3, 6, 9]);
  });

  it('fetches the first table page and count together when the RPC is unavailable', async () => {
    const mock = createClient({ length: 532, missingRpc: true });
    const rows = await loadCloudLibraryRows({ supabaseClient: mock.client, currentUserId: 'user' });
    expect(rows).toHaveLength(532);
    expect(mock.client.from).toHaveBeenCalledTimes(1);
    expect(mock.selects).toEqual([{ fields: 'payload', options: { count: 'exact' } }]);
  });

  it('continues pagination when the endpoint omits its count', async () => {
    const mock = createClient({ length: 8, pageLimit: 3, count: null });
    const rows = await loadCloudLibraryRows({ supabaseClient: mock.client, currentUserId: 'user' });
    expect(rows).toHaveLength(8);
  });

  it('fails instead of replacing the library with a partial result', async () => {
    const error = { message: 'Network unavailable' };
    const mock = createClient({ length: 1200, pageError: error });
    await expect(loadCloudLibraryRows({ supabaseClient: mock.client, currentUserId: 'user' })).rejects.toEqual(error);
  });
});
