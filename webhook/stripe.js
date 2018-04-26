const stripe = require('stripe')(process.env.STRIPE_SECRET)
const storage = require('../storage')()

function callbackWithMessage (callback, message, code) {
  callback(null, {
    statusCode: code || 200,
    headers: {
      'Access-Control-Allow-Origin': '*', // Required for CORS support to work
      'Access-Control-Allow-Credentials': true // Required for cookies, authorization headers with HTTPS
    },
    body: JSON.stringify({ok: true, message: message})
  })
}

function handleDeletedSubscription (subscription, callback) {
  let orgId = false
  if (subscription.object === 'subscription' && subscription.status !== 'active') {
    stripe.customers.retrieve(subscription.customer).then((customer) => {
      if (customer.metadata.orgId) {
        orgId = customer.metadata.orgId
        return storage.findOneOrg(orgId)
      }

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
      if (orgId) {
        return storage.updateOrg(user)
      }
      return storage.update(user)
    }).then(() => {
      callbackWithMessage(callback, 'locked')
    }).catch(callback)
  } else {
    callbackWithMessage(callback, 'nothing to do')
  }
}

module.exports.handler = (event, context, callback) => {
  let sig = event.headers['Stripe-Signature']
  let stripeEvent

  try {
    stripeEvent = stripe.webhooks.constructEvent(event.body, sig, process.env.STRIPE_ENDPOINT_SECRET)
  } catch (err) {
    return callbackWithMessage(callback, err.message)
  }

  switch (stripeEvent.type) {
    case 'customer.subscription.deleted':
      return handleDeletedSubscription(stripeEvent.data.object, callback)
    default:
      return callbackWithMessage(callback, 'I am not handling that')
  }
}
