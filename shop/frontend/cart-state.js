// Catalogue refreshes must never silently delete a customer's selected items.
export function selectedCartLines(cart,products,remembered=[]){
  return cart.map(item=>{
    const product=products.find(p=>p.id===item.id)||remembered.find(p=>p.id===item.id)||{id:item.id,title:'Unavailable product',category:'paintings',price:0,stock:0,visible:false,images:[]};
    return {product,quantity:item.quantity,total:Math.round(product.price*100)*item.quantity/100};
  });
}
export function cartIssues(cart,products,displayedProducts=[]){
  return cart.flatMap(item=>{
    const product=products.find(p=>p.id===item.id),shown=displayedProducts.find(p=>p.id===item.id),name=product?.title||shown?.title||'An item';
    if(!product||!product.visible||product.archived)return [`${name} is currently unavailable. Your cart is saved; retry or remove the item.`];
    if(product.stock<item.quantity)return [`${name}: ${product.stock} available, ${item.quantity} selected. Adjust the quantity or remove the item.`];
    if(shown&&product.price!==shown.price)return [`The price of ${name} changed. Review the updated cart before saving.`];
    return [];
  });
}
