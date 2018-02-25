function createNewSubscription (stripe, {org, enterprise, coupon, members}) {
  // create a new subscription
  return stripe.subscriptions.create({
    customer: org.stripeId,
    items: [{
      plan: enterprise ? 'kactus-enterprise-1-month' : 'kactus-1-month',
      quantity: members
    }],
    coupon: coupon || undefined
  })
}
module.exports.createNewSubscription = createNewSubscription

function updateSubscription (stripe, {org, fromPlan, toPlan, coupon, members}) {
  // need to update the existing subscription
  return stripe.subscriptions.list({
    customer: org.stripeId,
    plan: fromPlan === 'enterprise' ? 'kactus-enterprise-1-month' : 'kactus-1-month',
    limit: 100
  }).then((subscriptions) => {
    const subscriptionToUpdate = subscriptions.data.find(s => s.status === 'active')
    if (!subscriptionToUpdate) {
      return createNewSubscription(stripe, {org, enterprise: toPlan === 'enterprise', coupon, members})
    }
    if (toPlan !== fromPlan) {
      return stripe.subscriptions.update(subscriptionToUpdate.id, {
        items: [{
          plan: toPlan === 'enterprise' ? 'kactus-enterprise-1-month' : 'kactus-1-month',
          quantity: members
        }],
        coupon: coupon || undefined
      })
    }
    return stripe.subscriptionItems.update(subscriptionToUpdate.items.data[0].id, {
      quantity: members,
      prorate: true
    })
  })
}
module.exports.updateSubscription = updateSubscription
