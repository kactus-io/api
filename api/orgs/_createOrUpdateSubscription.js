const { PLANS } = require('../../constants')

function createNewSubscription (stripe, {org, enterprise, coupon, members, duration}) {
  // create a new subscription
  return stripe.subscriptions.create({
    customer: org.stripeId,
    items: [{
      plan: PLANS[enterprise ? 'enterprise' : 'premium'][duration || 'month'],
      quantity: members
    }],
    coupon: coupon || undefined
  })
}
module.exports.createNewSubscription = createNewSubscription

function updateSubscription (stripe, {org, fromPlan, toPlan, coupon, members, duration, triggerInvoice}) {
  // need to update the existing subscription
  return Promise.all([
    stripe.subscriptions.list({
      customer: org.stripeId,
      plan: PLANS[fromPlan || 'premium'].month,
      limit: 100
    }),
    stripe.subscriptions.list({
      customer: org.stripeId,
      plan: PLANS[fromPlan || 'premium'].year,
      limit: 100
    })
  ]).then(([monthlySubscriptions, yearlySubscriptions]) => {
    const subscriptionToUpdate = monthlySubscriptions.data.find(s => s.status === 'active') || yearlySubscriptions.data.find(s => s.status === 'active')
    if (!subscriptionToUpdate) {
      return createNewSubscription(stripe, {org, enterprise: toPlan === 'enterprise', coupon, members, duration})
    }
    if (toPlan !== fromPlan) {
      return stripe.subscriptions.update(subscriptionToUpdate.id, {
        items: [{
          plan: PLANS[fromPlan || 'premium'][duration || 'month'],
          quantity: members
        }],
        coupon: coupon || undefined
      })
    }
    return stripe.subscriptionItems.update(subscriptionToUpdate.items.data[0].id, {
      quantity: members,
      prorate: true
    })
  }).then(() => {
    if (triggerInvoice) {
      return stripe.invoice.create({
        customer: org.stripeId,
        description: 'One-off invoice when adding a member'
      })
    }
  })
}
module.exports.updateSubscription = updateSubscription
