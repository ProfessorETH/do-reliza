// Run with stock k6; target only the local preview or the game's own server.
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: Number(__ENV.VUS || 30), duration: __ENV.DURATION || '30s',
  thresholds: { http_req_failed: ['rate<0.01'], checks: ['rate>0.99'], http_req_duration: ['p(95)<1000'] },
  discardResponseBodies: true,
};
const base = (__ENV.BASE_URL || 'http://127.0.0.1:5193').replace(/\/$/, '');
const files = ['/', '/app.js', '/style.css', '/office.css', '/assets/agents.webp', '/assets/office.webp',
  '/vendor/three/three.module.js', '/vendor/three/three.core.js',
  '/assets/models/office.glb', '/assets/models/office-cozy.glb', '/assets/models/office-dressing.glb',
  '/assets/models/mira.glb', '/assets/models/iskra.glb', '/assets/models/echo.glb'];
export default function () {
  const responses = http.batch(files.map(path => ['GET', base + path, null, { headers: { 'Accept-Encoding': 'gzip' } }]));
  for (const response of responses) check(response, { 'asset delivered': r => r.status === 200 });
  sleep(2);
}
