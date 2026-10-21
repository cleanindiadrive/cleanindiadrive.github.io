import {callBackend} from './store.js';
import {loadScript} from './browser-library.js';
export async function payRequest(id,purpose='items'){
  const order=await callBackend('createRazorpayOrder',{requestId:id,purpose});
  await loadScript('https://checkout.razorpay.com/v1/checkout.js');
  return new Promise((resolve,reject)=>{
    const checkout=new window.Razorpay({key:order.keyId,order_id:order.orderId,amount:order.amount,currency:'INR',name:'Silly Sensei',description:'Studio order',theme:{color:'#176b3a'},prefill:order.prefill,
      modal:{ondismiss:()=>reject(new Error('Payment window closed. You can try again from your requests.'))},
      handler:async response=>{try{const result=await callBackend('verifyRazorpayPayment',{requestId:id,purpose,paymentId:response.razorpay_payment_id,signature:response.razorpay_signature});if(!result.paid)throw new Error('Payment is being verified. Refresh your requests shortly; do not pay again.');resolve(result);}catch(error){reject(error);}}
    });checkout.open();
  });
}
