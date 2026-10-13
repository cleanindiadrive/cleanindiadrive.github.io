// Keep gift recipients separate from the person funding the subscription.
const text = value => String(value ?? "").trim();
const truthyFlag = value => value === true || value === "true";
const first = (...values) => values.map(text).find(Boolean) || "";
const escape = value => text(value).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;");
export const subscriptionId = r => first(r?.subscriptionId,r?.subscription_id);
export const isGiftRecord = r => Boolean(r && (/gift/i.test(first(r.type,r.membershipType)) || truthyFlag(r.isGift) || truthyFlag(r.is_gift) || r.recipientName || r.recipient_name || r.gift_recipient_name));
export const isLifecycleRecord = r => truthyFlag(r?.isCancellation) || /cancellation|subscription[-_ ]?(?:cancelled|completed)|completion/i.test(text(r?.type));
export const normalizeStatus = r => first(r?.status,r?.paymentStatus,r?.subscriptionStatus,"unknown").toLowerCase();
export const subscriptionStatus = r => first(r?.subscriptionStatus,r?.status,"unknown").toLowerCase();
export const statusGroup = s => ["paid","captured","completed","success"].includes(s) ? "paid" : ["pending","authorized","created"].includes(s) ? "pending" : ["failed","cancelled","refunded"].includes(s) ? s : "other";
export const isConfirmed = r => !isLifecycleRecord(r) && statusGroup(normalizeStatus(r)) === "paid";

export function recordOwner(r) {
  const gift=isGiftRecord(r), storedSubscription=/^subscribers/.test(text(r?.__source));
  // Gift subscriber name/email/phone belong to the receiver in the backend schema.
  const recipientIdentity=gift && (storedSubscription || r?.giftRole==="receiver" || (!r?.paymentId && !r?.payment_id && Boolean(r?.giver_id || r?.giver_email)));
  return {
    uid:first(gift?r?.giver_id:"",gift?r?.giverId:"",gift?r?.donor_id:"",gift?r?.donorId:"",r?.userId,r?.user_id,r?.__nestedUserId),
    name:first(gift?r?.giver_name:"",gift?r?.donor_name:"",!recipientIdentity?r?.name:"",!recipientIdentity?r?.customer_name:"","Supporter"),
    email:first(gift?r?.giver_email:"",gift?r?.giverEmail:"",gift?r?.donor_email:"",gift?r?.donorEmail:"",!recipientIdentity?r?.email:"",!recipientIdentity?r?.user_email:"").toLowerCase(),
    phone:first(gift?r?.giver_phone:"",gift?r?.giverPhone:"",gift?r?.donor_phone:"",!recipientIdentity?r?.phone:"",!recipientIdentity?r?.phoneNumber:"")
  };
}

export function giftRecipient(record,subscriptions=[],people=new Map()) {
  const id=subscriptionId(record);
  const linked=id?subscriptions.find(r=>subscriptionId(r)===id || text(r.id)===id):null;
  const isSubscription=/^subscribers/.test(text(record?.__source));
  const source=linked || (isSubscription?record:null);
  const uid=first(record.recipient_user_id,record.recipientUserId,source?.recipient_user_id,source?.recipientUserId);
  const person=people.get(uid);
  const name=first(record.recipientName,record.recipient_name,record.gift_recipient_name,source?.recipientName,source?.recipient_name,source?.gift_recipient_name,source?.name,person?.name);
  const email=first(record.recipientEmail,record.recipient_email,record.gift_recipient_email,source?.recipientEmail,source?.recipient_email,source?.gift_recipient_email,source?.email,person?.email);
  const phone=first(record.recipientPhone,record.recipient_phone,record.gift_recipient_phone,source?.recipientPhone,source?.recipient_phone,source?.gift_recipient_phone,source?.phone,person?.phone);
  return {uid,name,email,phone,known:Boolean(uid||name||email||phone)};
}

export function paymentExplanation(record) {
  if(isLifecycleRecord(record)) return "Subscription activity receipt, not a charge or refund. Excluded from payment charts and contribution totals.";
  const status=normalizeStatus(record);
  if(status==="cancelled") return "This payment record is marked cancelled. It is not counted as a successful contribution. Check the linked subscription separately; earlier paid charges remain paid.";
  if(status==="completed") return "This payment record is marked completed and is included in successful contributions. This is different from a subscription reaching its completed state.";
  if(isConfirmed(record)) return "Confirmed payment, included in contribution totals for its payment date. Ending the subscription does not reverse this charge.";
  if(status==="refunded") return "This record is marked refunded and is excluded from confirmed contribution totals.";
  return "Stored payment status: "+status+". This record is not counted as a successful contribution.";
}

export function renderRecordPanels({people,payments,subscriptions},helpers) {
  const {formatAmount,formatDate,recordTimestamp}=helpers;
  const field=(label,value)=>'<div><dt>'+escape(label)+'</dt><dd>'+escape(value||"Not recorded")+'</dd></div>';
  const date=value=>value ? formatDate(value) : "Not recorded";
  const identity=(p)=>[p.name,p.email,p.phone].filter(Boolean).join(" · ") || "Not recorded";
  const paymentRef=r=>first(r.paymentId,r.payment_id,r.orderId,r.reference,r.id,"Not recorded");
  const statusBadge=(status)=>'<span class="status status-'+escape(status)+'">'+escape(status)+'</span>';
  const linkedPayments=id=>id ? payments.filter(p=>subscriptionId(p)===id && !isLifecycleRecord(p)):[];
  const history=rows=>rows.length?'<div class="table-wrap"><table class="record-payments"><thead><tr><th>Date</th><th>Amount</th><th>Status</th><th>Payment / order ID</th></tr></thead><tbody>'+rows.map(p=>'<tr><td>'+escape(formatDate(recordTimestamp(p)))+'</td><td>'+escape(formatAmount(p.amount))+'</td><td>'+statusBadge(normalizeStatus(p))+'</td><td class="reference-cell">'+escape(paymentRef(p))+'</td></tr>').join("")+'</tbody></table></div>':'<p class="empty-state">No linked payment records in this snapshot.</p>';
  const planDetails=r=>{
    const id=subscriptionId(r)||r.id, owner=recordOwner(r), person=people.get(r.__personKey), recipient=giftRecipient(r,subscriptions,people), linked=linkedPayments(id), status=subscriptionStatus(r);
    return '<dl class="record-fields">'+field("Funded by",identity(person||owner))+(isGiftRecord(r)?field("Gifted to",identity(recipient))+field("Recipient user ID",recipient.uid):"")+field("Subscription ID",id)+field("Plan amount",formatAmount(r.amount))+field("Started",date(r.createdAt||r.subscribedAt||r.date))+field(status==="completed"?"Completed / ended":status==="cancelled"?"Cancelled / ended":"Ended",date(r.endedAt||r.completedAt||r.cancelledAt))+field("Last payment",date(r.lastPaymentAt || recordTimestamp(linked.find(isConfirmed)||{})))+field("Confirmed paid",formatAmount(linked.filter(isConfirmed).reduce((sum,p)=>sum+Number(p.amount||0),0)))+field("Stored status",status)+field("Reason",r.cancellationReason||r.cancelReason||r.reason)+field("Recorded note",r.note)+'</dl><h4>Linked payment history</h4>'+history(linked);
  };
  const gifts=subscriptions.filter(isGiftRecord);
  const orphanGifts=payments.filter(isGiftRecord).filter(p=>!subscriptions.some(s=>(subscriptionId(s)||s.id)===subscriptionId(p)));
  const uniqueOrphans=[...new Map(orphanGifts.map(p=>[subscriptionId(p)||paymentRef(p),p])).values()];
  document.getElementById("gift-count").textContent=gifts.length+" plans"+(uniqueOrphans.length?" · "+uniqueOrphans.length+" payment-only records":"");
  document.getElementById("gift-records").innerHTML=[...gifts,...uniqueOrphans].map(r=>{
    const recipient=giftRecipient(r,subscriptions,people), owner=people.get(r.__personKey)||recordOwner(r), stored=gifts.includes(r), status=stored?subscriptionStatus(r):normalizeStatus(r);
    return '<details class="record-detail"><summary><span class="record-title"><strong>'+escape(owner.name||"Giver not recorded")+' <span aria-hidden="true">→</span> '+escape(recipient.name||recipient.email||"Recipient not recorded")+'</strong><small>'+escape(subscriptionId(r)||r.id||"No subscription ID")+(stored?"":" · Payment only; plan state unavailable")+'</small></span>'+statusBadge(status)+'<span class="detail-prompt">Details</span></summary><div class="record-content">'+(stored?planDetails(r):'<dl class="record-fields">'+field("Funded by",identity(owner))+field("Gifted to",identity(recipient))+field("Recipient user ID",recipient.uid)+field("Payment ID",paymentRef(r))+field("Subscription ID",subscriptionId(r))+'</dl>'+history(subscriptionId(r)?linkedPayments(subscriptionId(r)):[r]))+'</div></details>';
  }).join("") || '<p class="empty-state">No gift subscriptions or gift payments in this snapshot.</p>';

  const selected=document.getElementById("plan-status-filter").value;
  const ended=subscriptions.filter(s=>["cancelled","completed"].includes(subscriptionStatus(s)));
  const activity=payments.filter(p=>["cancelled","completed"].includes(normalizeStatus(p)));
  const cancelledCount=ended.filter(s=>subscriptionStatus(s)==="cancelled").length, completedCount=ended.length-cancelledCount;
  document.getElementById("status-counts").textContent=cancelledCount+" cancelled plans · "+completedCount+" completed plans · "+activity.length+" matching payment / activity records";
  const plans=ended.filter(r=>selected==="all"||subscriptionStatus(r)===selected);
  const records=activity.filter(r=>selected==="all"||normalizeStatus(r)===selected);
  document.getElementById("plan-status-records").innerHTML='<h3>Subscription records</h3>'+(plans.map(r=>'<details class="record-detail"><summary><span class="record-title"><strong>'+escape((people.get(r.__personKey)||recordOwner(r)).name)+'</strong><small>'+escape(subscriptionId(r)||r.id)+'</small></span>'+statusBadge(subscriptionStatus(r))+'<span class="detail-prompt">Details</span></summary><div class="record-content"><p class="record-explanation">'+(subscriptionStatus(r)==="completed"?"This plan reached the end of its subscription lifecycle. Completed does not mean refunded or cancelled.":"This plan is recorded as cancelled. It is separate from the status of payments already collected.")+'</p>'+planDetails(r)+'</div></details>').join("") || '<p class="empty-state">No matching subscriptions in this snapshot.</p>')+'<h3>Payment &amp; activity records</h3>'+ (records.map(r=>'<details class="record-detail"><summary><span class="record-title"><strong>'+escape((people.get(r.__personKey)||recordOwner(r)).name)+' · '+escape(isLifecycleRecord(r)?"Activity only — no charge":formatAmount(r.amount))+'</strong><small>'+escape(paymentRef(r))+'</small></span>'+statusBadge(normalizeStatus(r))+'<span class="detail-prompt">Details</span></summary><div class="record-content"><p class="record-explanation">'+escape(paymentExplanation(r))+'</p><dl class="record-fields">'+field("Recorded date",formatDate(recordTimestamp(r)))+field("Type",r.type)+field("Payment / activity ID",paymentRef(r))+field("Subscription ID",subscriptionId(r))+field("Note",r.note)+field("Reason",r.cancellationReason||r.cancelReason||r.reason)+'</dl></div></details>').join("") || '<p class="empty-state">No matching payment or activity records in this snapshot.</p>');
}
