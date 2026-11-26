import assert from 'node:assert/strict';
import test from 'node:test';
import { districts, services, snapshot, reports } from '../src/screens/civic-pulse/data.js';

test('municipal service and district slices reconcile with the 24-hour ledger', () => {
  const sum = (series) => series.reduce((a, b) => a + b, 0);
  const city = snapshot();
  assert.equal(sum(city.byDistrict), city.total);
  assert.equal(sum(city.byService), city.total);
  assert.equal(new Set(reports.map((r) => r.id)).size, reports.length);
  for (let d = -1; d < districts.length; d++) {
    for (let s = -1; s < services.length; s++) {
      const row = snapshot(d, s);
      assert.equal(row.queued + row.active + row.done, row.total);
      assert.equal(sum(row.inFlow), row.total);
      assert.equal(sum(row.outFlow), row.done);
      assert.ok(row.onTime <= row.done && row.online <= row.terminals);
      if (s >= 0) assert.equal(row.total, snapshot(d).byService[s]);
      if (d >= 0) assert.equal(row.total, snapshot(-1, s).byDistrict[d]);
      assert.ok(reports.some((r) => (d < 0 || d === r.d) && (s < 0 || s === r.s)));
    }
  }
});
