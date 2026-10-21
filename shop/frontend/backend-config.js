// Public API URLs only. Never put server credentials in this file.
// Set this to your actual Render service URL before deploying the frontend.
export const PRODUCTION_API_URL = '';
export function backendURL(hostname=globalThis.location?.hostname) {
  if(['localhost','127.0.0.1','[::1]'].includes(hostname))return 'http://localhost:3000';
  if(!PRODUCTION_API_URL)throw new Error('The studio service is not configured yet. Please contact the studio.');
  const url=new URL(PRODUCTION_API_URL);
  if(url.protocol!=='https:')throw new Error('The production service must use HTTPS.');
  return url.origin;
}
