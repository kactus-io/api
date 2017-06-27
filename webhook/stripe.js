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
      return storage.update({
        githubId: customer.metadata.githubId,
        valid: false
      })
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
