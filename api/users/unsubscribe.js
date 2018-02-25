const stripe = require('stripe')(process.env.STRIPE_SECRET)
const storage = require('../../storage')()
const cleanBody = require('./_cleanBody')
const handleError = require('../_handleError')
const makeCallback = require('../_makeCallback')

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
    parsedBody = JSON.parse(event.body || '{}') || {}
  } catch (e) {
    makeCallback(callback, 'Could not parse the body', 400)
    return
  }

  const body = cleanBody(parsedBody)
  if (!body.githubId) {
    makeCallback(callback, 'Missing github ID', 400)
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
      makeCallback(callback, {
        ok: true,
        message: 'Subscription canceled'
      })
    })
    .catch(handleError(callback))
}
