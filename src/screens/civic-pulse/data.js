/* SPDX-License-Identifier: MIT */
export const services = [
  {
    id: 'water',
    name: '排水管网',
    color: '#58dce6',
    icon: 'water',
    team: '排水设施养护组',
    reports: ['雨水口清疏', '排水井盖巡修', '泵站液位复核'],
  },
  {
    id: 'roads',
    name: '道路桥梁',
    color: '#75adff',
    icon: 'road',
    team: '道路巡养组',
    reports: ['路面沉降巡查', '桥梁伸缩缝养护', '人行道铺装修补'],
  },
  {
    id: 'lights',
    name: '公共照明',
    color: '#ffc67a',
    icon: 'light',
    team: '照明运维组',
    reports: ['路灯回路检修', '桥下照明巡查', '单灯终端复核'],
  },
  {
    id: 'clean',
    name: '市容环卫',
    color: '#8be1ac',
    icon: 'leaf',
    team: '环境作业组',
    reports: ['滨水步道清扫', '转运点设施维护', '巷道保洁复查'],
  },
];

export const districts = [
  { name: '鼓楼区', place: '西湖片区', tickets: [186, 254, 124, 221], sensors: 1540 },
  { name: '台江区', place: '上下杭片区', tickets: [203, 189, 136, 194], sensors: 1264 },
  { name: '仓山区', place: '南台片区', tickets: [266, 279, 182, 215], sensors: 1876 },
  { name: '晋安区', place: '东湖片区', tickets: [187, 228, 143, 192], sensors: 1568 },
  { name: '马尾区', place: '江滨片区', tickets: [124, 158, 85, 126], sensors: 1084 },
  { name: '长乐区', place: '吴航片区', tickets: [173, 211, 132, 168], sensors: 1328 },
];

// Fixed replay from 17:00 on the previous day through 16:00 on November 26.
const hourly = [
  1.24, 1.15, 1.06, 0.87, 0.73, 0.55, 0.41, 0.32, 0.26, 0.24, 0.31, 0.43, 0.67, 1.02, 1.47, 1.72,
  2.14, 1.85, 1.51, 1.29, 1.46, 1.68, 1.94, 1.59,
];
export const hourAt = (i) => String((17 + i) % 24).padStart(2, '0') + ':00';
const sum = (numbers) => numbers.reduce((total, n) => total + n, 0);

function allocate(total, weights) {
  const weight = sum(weights);
  const exact = weights.map((n) => (total * n) / weight),
    counts = exact.map(Math.floor);
  const order = counts
    .map((_, i) => i)
    .sort((a, b) => exact[b] - counts[b] - (exact[a] - counts[a]));
  const remainder = total - sum(counts);
  for (let i = 0; i < remainder; i++) counts[order[i]]++;
  return counts;
}

const records = districts.flatMap((district, d) => {
  const terminals = allocate(district.sensors, [0.34, 0.21, 0.33, 0.12]);
  return district.tickets.map((total, s) => {
    const queued = Math.round(total * (0.016 + ((d + s) % 3) * 0.005));
    const active = Math.round(total * (0.049 + ((d * 3 + s) % 5) * 0.006));
    const done = total - queued - active;
    const online = terminals[s] - Math.round(terminals[s] * (0.009 + ((d + s) % 4) * 0.004));
    const onTime = done - Math.round(done * (0.016 + ((d + 2 * s) % 5) * 0.004));
    const weights = hourly.map((h, i) => h * (1 + 0.21 * Math.sin(i * 0.8 + s * 1.2 + d * 0.55)));
    const inFlow = allocate(total, weights),
      outFlow = allocate(
        done,
        weights.map((h, i) => 0.54 * h + 0.46 * weights[(i + 23) % 24]),
      );
    return {
      d,
      s,
      total,
      queued,
      active,
      done,
      onTime,
      terminals: terminals[s],
      online,
      inFlow,
      outFlow,
    };
  });
});

export function snapshot(district = -1, service = -1) {
  const inDistrict = records.filter((row) => district < 0 || row.d === district);
  const current = inDistrict.filter((row) => service < 0 || row.s === service);
  const totals = { total: 0, queued: 0, active: 0, done: 0, onTime: 0, terminals: 0, online: 0 };
  const inFlow = Array(24).fill(0),
    outFlow = Array(24).fill(0);
  for (const row of current) {
    for (const key of Object.keys(totals)) totals[key] += row[key];
    for (let i = 0; i < 24; i++) {
      inFlow[i] += row.inFlow[i];
      outFlow[i] += row.outFlow[i];
    }
  }
  const byService = services.map((_, s) =>
    sum(inDistrict.filter((row) => row.s === s).map((row) => row.total)),
  );
  const byDistrict = districts.map((_, d) =>
    sum(
      records
        .filter((row) => row.d === d && (service < 0 || row.s === service))
        .map((row) => row.total),
    ),
  );
  const timely = (100 * totals.onTime) / totals.done,
    availability = (100 * totals.online) / totals.terminals;
  return {
    ...totals,
    health: 0.6 * availability + 0.4 * timely,
    timely,
    availability,
    byService,
    byDistrict,
    inFlow,
    outFlow,
  };
}

export const states = ['待派单', '处置中', '已办结'];
export function clock(minutes) {
  return (
    String(Math.floor(minutes / 60)).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0')
  );
}
// A small set of example work orders, drawn from the snapshot and ordered by latest update.
export const reports = records
  .flatMap(({ d, s }) =>
    Array.from({ length: 3 }, (_, i) => {
      const serial = d * 12 + s * 3 + i;
      const status = (d + s + i) % 3;
      const position = ((d - s + districts.length) % districts.length) * services.length + s;
      const minute = 15 * 60 + 59 - i * 48 - position * (3 + i);
      const stages = [minute - (status > 0 ? 9 : 0) - (status === 2 ? 28 : 0)];
      if (status > 0) stages.push(stages[0] + 9);
      if (status === 2) stages.push(minute);
      return {
        id: 'MZ-1126-' + String(1001 + serial),
        d,
        s,
        status,
        minute,
        stages,
        title: services[s].reports[(d + i) % 3],
      };
    }),
  )
  .sort((a, b) => b.minute - a.minute);
