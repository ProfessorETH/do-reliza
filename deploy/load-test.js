// Run with stock k6; target only the local preview or the game's own server.
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: Number(__ENV.VUS || 30), duration: __ENV.DURATION || '30s',
  thresholds: { http_req_failed: ['rate<0.01'], checks: ['rate>0.99'], http_req_duration: ['p(95)<1000'] },
  discardResponseBodies: true,
};
const base = (__ENV.BASE_URL || 'http://127.0.0.1:5193').replace(/\/$/, '');
const manifest = JSON.parse(open('../dist/build-manifest.json'));
// Full cold 3D visit, including the lazy renderer chunk and portrait/background.
// k6 has no browser cache; use browser probes separately for repeat visits.
const scripts=Object.keys(manifest.outputs).filter(path=>path.endsWith('.js')).map(path=>manifest.prefix+path.split('/').pop());
const files = [__ENV.PAGE_PATH || '/', ...[...scripts,manifest.css,manifest.images[__ENV.PROFILE==='mobile'?'mobile':'desktop'],manifest.images.agents].map(path=>'/'+path),
  ...['office','office-cozy','office-dressing','mira','iskra','echo','office-shell','office-upgrades'].map(name=>'/'+manifest.prefix+'assets/models/'+name+'.glb')];
export default function () {
  const responses = http.batch(files.map(path => ['GET', base + path, null, { headers: { 'Accept-Encoding': 'gzip' } }]));
  for (const response of responses) check(response, { 'asset delivered': r => r.status === 200 });
  sleep(2);
}
