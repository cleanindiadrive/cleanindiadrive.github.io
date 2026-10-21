export const LABEL_FIELDS={heading:60,recipient:200,address:300,apartment:150,city:100,state:100,postalCode:6,phone:16,country:60,handling:100,qrHeading:60,message:180};
export const TEMPLATE_FIELDS={heading:60,country:60,handling:100,qrHeading:60,message:180,deliverTo:40,postalLabel:30,phoneLabel:30,locationHint:100,postageNote:100};
export const DEFAULT_LABEL_TEMPLATE={heading:'DELIVERY ADDRESS',country:'IN · INDIA',handling:'Handle with care',qrHeading:'SCAN FOR EXACT PIN',message:'SILLY SENSEI',deliverTo:'DELIVER TO',postalLabel:'PIN CODE',phoneLabel:'CONTACT',locationHint:'Customer-confirmed delivery location',postageNote:'Address label only · No postage purchased'};
export function normalizeTemplate(value={}){return Object.fromEntries(Object.entries(TEMPLATE_FIELDS).map(([key,max])=>[key,typeof value[key]==='string'?value[key].trim().slice(0,max):DEFAULT_LABEL_TEMPLATE[key]]));}
export function labelForRequest(request,template={}){return {...defaultLabel(request),...normalizeTemplate(template)};}
export function defaultLabel(request) {
  const c=request.customer;
  return {heading:'DELIVERY ADDRESS',recipient:`${c.firstName} ${c.lastName}`,address:c.address,apartment:c.apartment||'',city:c.city,state:c.state,postalCode:c.postalCode,phone:c.phone,country:'IN · INDIA',handling:'Handle with care',qrHeading:'SCAN FOR EXACT PIN',message:'SILLY SENSEI'};
}
export function normalizeLabel(request,value={}) {
  const defaults=defaultLabel(request);
  return Object.fromEntries(Object.entries(LABEL_FIELDS).map(([key,max])=>[key,typeof value[key]==='string'?value[key].trim().slice(0,max):defaults[key]]));
}
export function validateLabel(value) {
  if(!value.recipient?.trim()||!value.address?.trim()||!value.city?.trim()||!value.state?.trim())return 'Complete the recipient and delivery address.';
  if(!/^[1-9]\d{5}$/.test(value.postalCode||''))return 'Enter a valid 6-digit PIN code.';
  if(!/^[+\d ()-]{10,16}$/.test(value.phone||''))return 'Enter a valid contact number.';
  for(const [key,max] of Object.entries(LABEL_FIELDS))if(typeof value[key]!=='string'||value[key].length>max)return 'Please shorten the label text.';
  return '';
}
