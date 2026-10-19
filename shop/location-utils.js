export function validCoordinates(lat, lng) {
  return typeof lat === 'number' && Number.isFinite(lat) && lat >= -90 && lat <= 90 && typeof lng === 'number' && Number.isFinite(lng) && lng >= -180 && lng <= 180;
}
export function validLocation(point) {
  return !!point && validCoordinates(point.latitude,point.longitude) && point.confirmed === true && ['search','pin','device'].includes(point.source) && typeof point.formattedAddress === 'string' && point.formattedAddress.length <= 1000 && Number.isFinite(point.accuracy) && point.accuracy >= 0 && point.accuracy <= 1000000;
}
export function featureAddress(feature) {
  const p = feature?.properties || {};
  const address = [p.housenumber,p.street || p.name].filter(Boolean).join(' ');
  const city = p.city || p.town || p.village || p.district || '';
  return {address:address.slice(0,300),city:city.slice(0,100),state:String(p.state || '').slice(0,100),postalCode:/^[1-9]\d{5}$/.test(p.postcode || '')?p.postcode:'',country:p.countrycode?.toUpperCase()==='IN'?'India':''};
}
export function featureLabel(feature) {
  const p = feature?.properties || {};
  return [...new Set([[p.housenumber,p.street].filter(Boolean).join(' '),p.name,p.district,p.city,p.state,p.postcode,p.country].filter(Boolean))].join(', ').slice(0,1000);
}
export function addressText(customer) {
  return [customer.address,customer.apartment,customer.city,customer.state,customer.postalCode,customer.country].filter(Boolean).join(', ');
}
export function locationLink(customer) {
  const p = customer.location;
  return validLocation(p) ? `https://www.openstreetmap.org/?mlat=${p.latitude.toFixed(6)}&mlon=${p.longitude.toFixed(6)}#map=18/${p.latitude.toFixed(6)}/${p.longitude.toFixed(6)}` : `https://www.openstreetmap.org/search?query=${encodeURIComponent(addressText(customer))}`;
}
