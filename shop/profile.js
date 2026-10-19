export const PROFILE_FIELDS=['firstName','lastName','phone','address','apartment','city','state','postalCode'];
export function normalizeProfile(value={}) {
  return Object.fromEntries(PROFILE_FIELDS.map(key=>[key,String(value[key]||'').trim()]));
}
export function validateProfile(value) {
  if (!value.firstName || !value.lastName) return 'Enter your first and last name.';
  if (value.phone && !/^(?:\+91[ -]?)?[6-9]\d{9}$/.test(value.phone.replace(/\s/g,''))) return 'Enter a valid Indian mobile number.';
  if (value.postalCode && !/^[1-9]\d{5}$/.test(value.postalCode)) return 'Enter a valid 6-digit PIN code.';
  if (['firstName','lastName','city','state'].some(k=>value[k].length>100) || value.phone.length>16 || value.address.length>300 || value.apartment.length>150) return 'Please shorten these details.';
  return '';
}
