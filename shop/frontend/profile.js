import {validLocation} from './location-utils.js';

export const PROFILE_FIELDS=['firstName','lastName','phone','address','apartment','city','state','postalCode'];
export function checkoutDefaults(profile={},user=null,requests=[]){
  const saved=profile&&typeof profile==='object'?profile:{};
  const mostRecent=(Array.isArray(requests)?requests:[]).find(request=>request?.customer&&typeof request.customer==='object')?.customer||{};
  const recentPin=(Array.isArray(requests)?requests:[]).map(request=>request?.customer?.location).find(validLocation);
  const name=(user?.displayName||'').trim().split(/\s+/).filter(Boolean);
  const defaults={};
  for(const key of [...PROFILE_FIELDS,'country'])defaults[key]=String(saved[key]||mostRecent[key]||'').trim();
  defaults.email=user?.email||mostRecent.email||saved.email||'';
  defaults.firstName=saved.firstName||mostRecent.firstName||name[0]||'';
  defaults.lastName=saved.lastName||mostRecent.lastName||name.slice(1).join(' ');
  if(validLocation(saved.location))defaults.location={...saved.location};
  else if(recentPin)defaults.location={...recentPin};
  return defaults;
}
export function normalizeProfile(value={}) {
  const profile=Object.fromEntries(PROFILE_FIELDS.map(key=>[key,String(value[key]||'').trim()]));
  if(Object.hasOwn(value,'location')){
    const point=value.location;
    profile.location=validLocation(point)?{
      latitude:point.latitude,
      longitude:point.longitude,
      source:point.source,
      accuracy:point.accuracy,
      formattedAddress:point.formattedAddress,
      confirmed:true,
    }:point;
  }
  return profile;
}
export function validateProfile(value) {
  if (!value.firstName || !value.lastName) return 'Enter your first and last name.';
  if (value.phone && !/^(?:\+91[ -]?)?[6-9]\d{9}$/.test(value.phone.replace(/\s/g,''))) return 'Enter a valid Indian mobile number.';
  if (value.postalCode && !/^[1-9]\d{5}$/.test(value.postalCode)) return 'Enter a valid 6-digit PIN code.';
  if (value.location!==undefined && value.location!==null && !validLocation(value.location)) return 'Choose and confirm a valid delivery pin.';
  if (['firstName','lastName','city','state'].some(k=>value[k].length>100) || value.phone.length>16 || value.address.length>300 || value.apartment.length>150) return 'Please shorten these details.';
  return '';
}
