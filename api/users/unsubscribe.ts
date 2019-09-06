import * as Stripe from 'stripe'
import cleanBody from './_cleanBody'
import { _handler } from '../../_handler'
import { findOne } from '../../storage'
import { BadRequest, NotFound, Forbidden } from '../errors'

const stripe = new Stripe(process.env.STRIPE_SECRET)

async function refundCharges(
  charges: Stripe.charges.ICharge[],
  amount: number
) {
  if (amount <= 0 || !charges.length) {
    return
  }
  const chargeToRefund = charges.shift()

  const refundAmountForCharge = Math.min(amount, chargeToRefund.amount)

  await stripe.refunds.create({
    charge: chargeToRefund.id,
    amount: refundAmountForCharge,
  })
  await refundCharges(charges, amount - refundAmountForCharge)
}

function cancelSubscriptions(
  subscriptions: Stripe.subscriptions.ISubscription[],
  refund: boolean
) {
  if (refund) {
    return Promise.all(
      subscriptions.map(subscription =>
        stripe.subscriptions.del(subscription.id)
      )
    )
  }
  return Promise.all(
    subscriptions.map(subscription =>
      stripe.subscriptions.del(subscription.id, { at_period_end: true })
    )
  )
}

export async function cancel(user: { stripeId: string }, refund: boolean) {
  // find the existing subscription
  const [subscriptions, charges] = await Promise.all([
    stripe.subscriptions.list({
      customer: user.stripeId,
      limit: 100,
    }),
    stripe.charges.list({
      customer: user.stripeId,
      limit: 100,
    }),
  ])

  if (!refund) {
    return cancelSubscriptions(subscriptions.data, refund)
  }

  const prorationDate = Math.floor(Date.now() / 1000)

  const refundAmounts = await Promise.all(
    subscriptions.data.map(async subscription => {
      const invoice = await stripe.invoices.retrieveUpcoming(user.stripeId, {
        subscription: subscription.id,
        subscription_items: [
          {
            id: subscription.items.data[0].id,
            plan: subscription.items.data[0].plan.id,
            quantity: 0,
          },
        ],
        subscription_prorate: true,
        subscription_proration_date: prorationDate,
      })
      const invoiceItem = invoice.lines.data.filter(
        d => d.type === 'invoiceitem'
      )
      return -invoiceItem[0].amount // amount is negative
    })
  )
  const totalRefundAmount = refundAmounts.reduce((prev, a) => prev + a, 0)
  refundCharges(charges.data, totalRefundAmount)
  return cancelSubscriptions(subscriptions.data, refund)
}

export const handler = _handler(async event => {
  let parsedBody = JSON.parse(event.body || '{}')

  const body = cleanBody(parsedBody)
  if (!body.githubId) {
    throw new BadRequest('Missing github ID')
  }

  const refund = !!parsedBody.refound || !!parsedBody.refund // handle typo -_-'

  const user = await findOne(body.githubId)

  if (!user) {
    throw new NotFound('Trying to unsubscribe a user that does not exist')
  }

  if (!user.stripeId) {
    throw new Forbidden('Trying to unsubscribe a user that is not subscribed')
  }

  await cancel({ stripeId: user.stripeId }, refund)

  return {
    ok: true,
    message: 'Subscription canceled',
  }
})
