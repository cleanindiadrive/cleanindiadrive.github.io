// Shared order rules keep the admin controls aligned with server validation.
export const ORDER_STATUSES = [
  ['details_received','Details received'],['reviewed','Reviewed'],['contacted','Contacted'],
  ['processing','Preparing'],['packed','Packed'],['shipped','Shipped'],['out_for_delivery','Out for delivery'],['delivered','Delivered'],
  ['cancel_requested','Cancellation requested'],['cancelled','Cancelled'],['closed','Closed']
];
const transitions={details_received:['reviewed','contacted','closed'],reviewed:['contacted','closed'],contacted:['reviewed','closed','processing'],processing:['packed'],packed:['shipped'],shipped:['out_for_delivery'],out_for_delivery:['delivered'],delivered:['closed']};
export function canTransition(order,next){
  return (transitions[order.status]||[]).includes(next)
    &&(!['processing','packed','shipped','out_for_delivery','delivered'].includes(next)||order.paymentStatus==='captured')
    &&!(next==='closed'&&order.inventoryReserved===true);
}
export const availableStatuses=order=>ORDER_STATUSES.filter(([status])=>status===order.status||canTransition(order,status));
export function statusChangeError(order,next){
  if(['cancelled','closed'].includes(order.status))return 'This request is '+order.status+' and cannot be reopened.';
  if(order.status==='cancel_requested')return 'Approve or decline the cancellation using the cancellation controls.';
  if(['cancelled','cancel_requested'].includes(next))return 'Use the cancellation controls so reserved stock and refunds are handled correctly.';
  if(['processing','packed','shipped','out_for_delivery','delivered'].includes(next)&&order.paymentStatus!=='captured')return 'A verified payment is required before preparing or shipping this order. Confirm the quote and let the customer pay first.';
  if(next==='closed'&&order.inventoryReserved===true)return 'This order still has reserved stock. Use Cancel order & release stock instead.';
  return 'This order changed or the selected step is unavailable. Refresh and choose an available status.';
}
export function statusHelp(order){
  if(['cancelled','closed'].includes(order.status))return 'This request is '+order.status+'. No further status changes are available.';
  if(order.status==='cancel_requested')return 'Use the controls below to approve or decline cancellation.';
  if(order.paymentStatus==='refunded')return 'Payment was refunded. Fulfilment is unavailable; resolve any outstanding cancellation below.';
  if(order.paymentStatus!=='captured')return order.quote?'Awaiting verified customer payment before preparation and shipping.':'Confirm the total and reserve stock, then wait for verified payment before preparation and shipping.';
  return '';
}
