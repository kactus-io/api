import * as Stripe from 'stripe'
import { PLANS } from '../constants'

const stripe = new Stripe(process.env.STRIPE_SECRET)

export async function findSubscriptions(
  user: { stripeId: string },
  options: {
    plan: 'premium' | 'enterprise'
  }
) {
  const [monthlySubscriptions, yearlySubscriptions] = await Promise.all([
    stripe.subscriptions.list({
      customer: user.stripeId,
      plan: PLANS[options.plan || 'premium'].month,
      limit: 100,
    }),
    stripe.subscriptions.list({
      customer: user.stripeId,
      plan: PLANS[options.plan || 'premium'].year,
      limit: 100,
    }),
  ])
  return monthlySubscriptions.data.concat(yearlySubscriptions.data)
}

function isInvoice(invoice: any): invoice is Stripe.invoices.IInvoice {
  return !!invoice.payment_intent
}

export async function createNewSubscription(
  user: { stripeId: string },
  options: {
    plan: 'premium' | 'enterprise'
    coupon?: string
    members?: number
    duration?: 'month' | 'year'
  }
) {
  // create a new subscription
  const subscription = await stripe.subscriptions.create({
    customer: user.stripeId,
    items: [
      {
        plan: PLANS[options.plan][options.duration || 'month'],
        quantity: options.members || 1,
      },
    ],
    coupon: options.coupon || undefined,
    expand: ['latest_invoice.payment_intent'],
  })

  if (subscription.status === 'active' || subscription.status === 'trialing') {
    return { ok: true }
  }

  if (!isInvoice(subscription.latest_invoice)) {
    throw new Error('missing invoice')
  }

  if (
    subscription.latest_invoice.payment_intent.status ===
    'requires_payment_method'
  ) {
    try {
      await stripe.subscriptions.del(subscription.id)
    } catch (err) {}
    throw new Error('Require other payment method')
  }

  if (subscription.latest_invoice.payment_intent.status === 'requires_action') {
    return {
      ok: false,
      paymentIntentSecret:
        subscription.latest_invoice.payment_intent.client_secret,
    }
  }

  console.log(subscription)
  console.log(subscription.latest_invoice.payment_intent)
  try {
    await stripe.subscriptions.del(subscription.id)
  } catch (err) {}
  throw new Error(
    'Could not create the subscription. Please contact us at mathieu@kactus.io'
  )
}

export async function createOrUpdateSubscription(
  user: { stripeId: string; valid: boolean; validEnterprise: boolean },
  {
    plan,
    coupon,
    members,
    duration,
    triggerInvoice,
  }: {
    plan: 'premium' | 'enterprise'
    coupon?: string
    members: number
    duration?: 'month' | 'year'
    triggerInvoice?: boolean
  }
) {
  if (!user.valid && !user.validEnterprise) {
    return createNewSubscription(user, {
      plan,
      coupon,
      members,
      duration,
    })
  }

  const fromPlan = user.valid ? 'premium' : 'enterprise'

  // need to update the existing subscription
  const existingSubscriptions = await findSubscriptions(user, {
    plan: fromPlan,
  })
  const subscriptionToUpdate = existingSubscriptions.find(
    s => s.status === 'active'
  )
  if (!subscriptionToUpdate) {
    return createNewSubscription(user, {
      plan,
      coupon,
      members,
      duration,
    })
  }

  if (plan !== fromPlan) {
    await stripe.subscriptions.update(subscriptionToUpdate.id, {
      items: [
        {
          plan: PLANS[plan || 'premium'][duration || 'month'],
          quantity: members,
        },
      ],
      coupon: coupon || undefined,
    })
  } else if (subscriptionToUpdate.items.data[0].quantity !== members) {
    await stripe.subscriptionItems.update(
      subscriptionToUpdate.items.data[0].id,
      {
        quantity: members,
        prorate: true,
      }
    )
  }

  if (triggerInvoice) {
    await stripe.invoices
      .create({
        customer: user.stripeId,
        description: 'One-off invoice when adding a member',
      })
      .catch(() => {})
  }

  return { ok: true }
}
