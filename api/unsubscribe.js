const stripe = require('stripe')(process.env.STRIPE_SECRET)
const storage = require('../storage')()
const cleanBody = require('./_cleanBody')

function refundCharges (charges, amount) {
  if (amount <= 0 || !charges.length) {
    return Promise.resolve()
  }
  const chargeToRefund = charges.shift()

  const refundAmountForCharge = Math.min(amount, chargeToRefund.amount)

  return stripe.refunds.create({
    charge: chargeToRefund.id,
    amount: refundAmountForCharge
  }).then(
    () => refundCharges(charges, amount - refundAmountForCharge)
  )
}

function cancelSubscriptions (subscriptions, refund) {
  if (refund) {
    return Promise.all(subscriptions.map(
      subscription => stripe.subscriptions.del(subscription.id)
    ))
  }
  return Promise.all(subscriptions.map(
    subscription => stripe.subscriptions.del(subscription.id, { at_period_end: true })
  ))
}

module.exports.handler = (event, context, callback) => {
  let parsedBody
  try {
    parsedBody = JSON.parse(event.body || {})
  } catch (e) {
    callback(new Error('[400] Could not parse the body'))
    return
  }

  const body = cleanBody(parsedBody)
  if (!body.githubId) {
    callback(new Error('[400] Missing github ID'))
    return
  }

  const refund = !!parsedBody.refound || !!parsedBody.refund // handle typo -_-'
  let bailout = false
  const prorationDate = Math.floor(Date.now() / 1000)

  storage
    .findOne(body.githubId)
    .then(found => {
      if (!found || !found.stripeId) {
        bailout = true
        return
      }
      body.stripeId = found.stripeId
    })
    .then(() => {
      if (bailout) { return }
      // find the existing subscription
      return Promise.all([
        stripe.subscriptions.list({
          customer: body.stripeId,
          limit: 100
        }),
        stripe.charges.list({customer: body.stripeId,
          limit: 100
        })
      ])
    })
    .then(([subscriptions, charges]) => {
      if (bailout) { return }
      if (!refund) {
        return cancelSubscriptions(subscriptions.data, refund)
      }
      return Promise.all(
        subscriptions.data.map(subscription => {
          return stripe.invoices.retrieveUpcoming(
            body.stripeId,
            {
              subscription: subscription.id,
              subscription_items: [{
                id: subscription.items.data[0].id,
                plan: subscription.items.data[0].plan.id,
                quantity: 0
              }],
              subscription_prorate: true,
              subscription_proration_date: prorationDate
            }
          ).then(invoice => {
            const invoiceItem = invoice.lines.data.filter(d => d.type === 'invoiceitem')
            return -invoiceItem[0].amount // amount is negative
          })
        })
      ).then(refundAmounts => {
        const totalRefundAmount = refundAmounts.reduce((prev, a) => prev + a, 0)

        return refundCharges(charges.data, totalRefundAmount)
      }).then(() => {
        return cancelSubscriptions(subscriptions.data, refund)
      })
    })
    .then(res => {
      if (bailout) { return }
      callback(null, {
        ok: true,
        message: 'Subscription canceled'
      })
    })
    .catch((err) => {
      console.error(err)
      if (!err.type) {
        callback(new Error(`[500] ${err}`))
        return
      }
      switch (err.type) {
        case 'StripeCardError':
          // A declined card error
          const message = err.message // => e.g. "Your card's expiration year is invalid."
          callback(new Error(`[400] ${message}`))
          break
        case 'RateLimitError':
          // Too many requests made to the API too quickly
          callback(new Error(`[503] Server is a bit overloaded, try again in a bit`))
          break
        case 'StripeInvalidRequestError':
          // Invalid parameters were supplied to Stripe's API
          callback(new Error(`[400] Bad request`))
          break
        case 'StripeAPIError':
          // An error occurred internally with Stripe's API
          callback(new Error(`[500] Stripe failed, sorry about that`))
          break
        case 'StripeConnectionError':
          // Some kind of error occurred during the HTTPS communication
          callback(new Error(`[500] Stripe is down, sorry about that`))
          break
        case 'StripeAuthenticationError':
          // You probably used an incorrect API key
          callback(new Error(`[500] How did that happen!?`))
          break
        default:
          // Handle any other types of unexpected errors
          callback(new Error(`[500] ${err.message}`))
          break
      }
    })
}
