const { PLANS } = require('../../constants')

function findSubscriptions (stripe, org, plan) {
  return Promise.all([
    stripe.subscriptions.list({
      customer: org.stripeId,
      plan: PLANS[plan || 'premium'].month,
      limit: 100
    }),
    stripe.subscriptions.list({
      customer: org.stripeId,
      plan: PLANS[plan || 'premium'].year,
      limit: 100
    })
  ]).then(([monthlySubscriptions, yearlySubscriptions]) => {
    return monthlySubscriptions.data.concat(yearlySubscriptions.data)
  })
}

function createNewSubscription (stripe, {org, plan, coupon, members, duration}) {
  // create a new subscription
  return stripe.subscriptions.create({
    customer: org.stripeId,
    items: [{
      plan: PLANS[plan][duration || 'month'],
      quantity: members
    }],
    coupon: coupon || undefined
  })
}
module.exports.createNewSubscription = createNewSubscription

function updateSubscription (stripe, {org, fromPlan, toPlan, coupon, members, duration, triggerInvoice}) {
  // need to update the existing subscription
  return findSubscriptions(stripe, org, fromPlan).then(existingSubscriptions => {
    const subscriptionToUpdate = existingSubscriptions.find(s => s.status === 'active')
    if (!subscriptionToUpdate) {
      return createNewSubscription(stripe, {
        org,
        plan: toPlan,
        coupon,
        members,
        duration
      })
    }
    if (toPlan !== fromPlan) {
      return stripe.subscriptions.update(subscriptionToUpdate.id, {
        items: [{
          plan: PLANS[toPlan || 'premium'][duration || 'month'],
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
      return stripe.invoices.create({
        customer: org.stripeId,
        description: 'One-off invoice when adding a member'
      }).catch(() => {})
    }
  })
}
module.exports.updateSubscription = updateSubscription
