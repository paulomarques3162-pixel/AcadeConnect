import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '10s', target: 25 },
    { duration: '30s', target: 25 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<2000'],
  },
};

export default function () {
  const res = http.get('https://acadeconnect-backend.onrender.com/api/events');

  check(res, {
    'status 200': (r) => r.status === 200,
  });

  sleep(1);
}
