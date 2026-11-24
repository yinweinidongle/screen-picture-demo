/* SPDX-License-Identifier: MIT */
// Illustrative station telemetry. Coordinates approximate the named city centers.
export const stations = [
  {
    code: 'SHA',
    name: '上海',
    latitude: 31.23,
    longitude: 121.47,
    rtt: 28,
    trend: [4.2, 4.8, 4.5, 5.9, 5.1, 6.6, 7.9, 6.8, 9.2, 8.4, 10.1, 7.8, 8.42],
  },
  {
    code: 'SIN',
    name: '新加坡',
    latitude: 1.35,
    longitude: 103.82,
    rtt: 36,
    trend: [4.1, 3.7, 4.6, 4.2, 5.8, 5.4, 7.3, 7.8, 6.6, 6.1, 7.4, 5.8, 6.83],
  },
  {
    code: 'SYD',
    name: '悉尼',
    latitude: -33.87,
    longitude: 151.21,
    rtt: 52,
    trend: [3.1, 2.6, 3.4, 4.5, 4.1, 5.2, 6.8, 6.4, 5.9, 6.4, 5.7, 4.3, 4.81],
  },
  {
    code: 'DXB',
    name: '迪拜',
    latitude: 25.2,
    longitude: 55.27,
    rtt: 61,
    trend: [2.9, 3.9, 3.2, 3.1, 4.6, 5.3, 4.9, 5.8, 6.7, 5.9, 6.6, 6.1, 5.76],
  },
  {
    code: 'FRA',
    name: '法兰克福',
    latitude: 50.11,
    longitude: 8.68,
    rtt: 77,
    trend: [6.1, 5.6, 6.5, 7.8, 7.2, 8.5, 10.3, 9.6, 8.8, 9.2, 8, 7.6, 7.34],
  },
  {
    code: 'LAX',
    name: '洛杉矶',
    latitude: 34.05,
    longitude: -118.24,
    rtt: 96,
    trend: [7.2, 8.3, 7.8, 9.4, 10.6, 9.6, 11.1, 10.7, 9.8, 8.4, 8.9, 8, 9.15],
  },
];

export const links = [
  { from: 'SHA', to: 'SIN', rtt: 46 },
  { from: 'SHA', to: 'SYD', rtt: 122 },
  { from: 'SHA', to: 'LAX', rtt: 148 },
  { from: 'SIN', to: 'DXB', rtt: 118 },
  { from: 'SIN', to: 'SYD', rtt: 106 },
  { from: 'DXB', to: 'FRA', rtt: 88 },
  { from: 'DXB', to: 'LAX', rtt: 179 },
  { from: 'FRA', to: 'LAX', rtt: 139 },
];

export function coordinates(latitude, longitude, precision = 2) {
  const north = Math.abs(latitude).toFixed(precision) + (latitude < 0 ? '°S' : '°N');
  const east = Math.abs(longitude).toFixed(precision) + (longitude < 0 ? '°W' : '°E');
  return north + ' / ' + east;
}
