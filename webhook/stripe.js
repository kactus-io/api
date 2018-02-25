const stripe = require('stripe')(process.env.STRIPE_SECRET)
const storage = require('../storage')()

module.exports.handler = (event, context, callback) => {
  let sig = event.headers['Stripe-Signature']
  let stripeEvent

  try {
    stripeEvent = stripe.webhooks.constructEvent(event.body, sig, process.env.STRIPE_ENDPOINT_SECRET)
  } catch (err) {
    return callback(null, {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*', // Required for CORS support to work
        'Access-Control-Allow-Credentials': true // Required for cookies, authorization headers with HTTPS
      },
      body: err.message
    })
  }

  const subscription = stripeEvent.data.object
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
      callback(null, {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*', // Required for CORS support to work
          'Access-Control-Allow-Credentials': true // Required for cookies, authorization headers with HTTPS
        },
        body: '{"ok": true, "message": "locked"}'
      })
    }).catch(callback)
  } else {
    callback(null, {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*', // Required for CORS support to work
        'Access-Control-Allow-Credentials': true // Required for cookies, authorization headers with HTTPS
      },
      body: '{"ok": true, "message": "nothing to do"}'
    })
  }
}
