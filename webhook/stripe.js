const stripe = require('stripe')(process.env.STRIPE_SECRET)
const storage = require('../storage')()

module.exports.handler = (event, context, callback) => {
  let sig = event.stripeSignature
  let stripeEvent

  try {
    stripeEvent = stripe.webhooks.constructEvent(event.body, sig, process.env.STRIPE_ENDPOINT_SECRET)
  } catch (err) {
    return callback(err)
  }

  const subscription = stripeEvent.data.object
  if (subscription.object === 'subscription' && subscription.status !== 'active') {
    stripe.customers.retrieve(subscription.customer).then((customer) => {
      return storage.findOne(customer.metadata.githubId)
    }).then(user => {
      if (!user) {
        return
      }
      if (subscription.plan.id === 'kactus-enterprise-1-month') {
        user.validEnterprise = false
      } else if (subscription.plan.id === 'kactus-1-month') {
        user.valid = false
      }
      return storage.update(user)
    }).then(() => {
      callback(null, {
        ok: true,
        message: 'locked'
      })
    }).catch(callback)
  } else {
    callback(null, {
      ok: true,
      message: 'nothing to do'
    })
  }
}
